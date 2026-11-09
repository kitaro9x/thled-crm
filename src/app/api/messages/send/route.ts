import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fbSendMessage } from "@/lib/crm/facebook";

/**
 * Gửi tin từ inbox. fb_page → Graph API ngay; zalo_personal → crm_outbox để worker gửi.
 * body: { conversation_id, text?, attachments?, scheduled_at? }
 */
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { conversation_id, text: text0, attachments = [], scheduled_at, reply_to, retry_of } = await req.json();
  const db = supabaseAdmin();
  // gửi lại 1 tin lỗi: xoá bản ghi lỗi cũ (chỉ khi nó thật sự là tin lỗi) để không hiện 2 bong bóng
  const dropFailed = async () => { if (retry_of) await db.from("crm_messages").delete().eq("id", retry_of).eq("status", "failed"); };
  let text: string = text0;
  // trích dẫn (trả lời 1 tin): lấy tin gốc → quote cho Zalo (worker gửi quote thật), FB không có quote → chèn dòng «…» vào đầu
  let quote: any = null;
  if (reply_to) {
    const { data: orig } = await db.from("crm_messages").select("id,text,attachments,direction,external_msg_id,raw,sender_name,sender_member_id,sent_at").eq("id", reply_to).maybeSingle();
    if (orig) {
      const a0 = (orig.attachments as any[])?.[0];
      const r: any = orig.raw || {};
      quote = { msg: orig.text || "", thumb: a0?.type === "image" ? a0.url : null, kind: a0 ? a0.type : "text", name: a0?.name || null, from: orig.direction === "out" ? "Mình" : (orig.sender_name || null), msg_id: orig.external_msg_id || null,
        zq: r.zq || null, z_content: r.content ?? null, z_msgType: r.msgType ?? null }; // zq/z_*: dữ liệu Zalo cần để gửi quote thật
    }
  }

  const { data: conv } = await db.from("crm_v_conversations").select("*").eq("id", conversation_id).single();
  if (!conv) return NextResponse.json({ error: "conversation not found" }, { status: 404 });
  const { data: channel } = await db.from("crm_channels").select("*").eq("id", conv.channel_id).single();

  if (scheduled_at) {
    await db.from("crm_conversations").update({ scheduled_message: { text, send_at: scheduled_at } }).eq("id", conversation_id);
    await db.from("crm_outbox").insert({ conversation_id, channel_id: conv.channel_id, external_id: conv.external_id, text, attachments, scheduled_at, sent_by: user.id, source: "manual" });
    return NextResponse.json({ ok: true, scheduled: true });
  }

  if (quote && channel?.type === "fb_page") text = `↩ «${(quote.msg || (quote.kind === "image" ? "Hình ảnh" : "Tệp")).slice(0, 80)}»\n${text || ""}`;
  if (channel?.type === "fb_page") {
    try {
      const token = channel.credentials?.page_access_token;
      let lastId: string | undefined;
      const sendOnce = async (t?: string, url?: string, type?: any) => fbSendMessage(token, conv.external_id, t, url, undefined, type);
      const sendRetry = async (t?: string, url?: string, type?: any) => {
        try { return await sendOnce(t, url, type); }
        catch (e: any) {
          if (!/thread control|2018300|not the thread owner|standby/i.test(String(e?.message))) throw e;
          // app khác (Business Suite / AI Meta) đang giữ hội thoại → giành/xin quyền rồi gửi lại
          const G = "https://graph.facebook.com/v21.0";
          for (const ep of ["take_thread_control", "request_thread_control"]) {
            const rr = await fetch(`${G}/me/${ep}?access_token=${encodeURIComponent(token)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recipient: { id: conv.external_id }, metadata: "THLED CRM nhân viên trả lời" }) });
            if (rr.ok) break;
          }
          await db.from("crm_conversations").update({ meta: { ...(conv.meta || {}), ai_meta: { ...((conv.meta || {}).ai_meta || {}), taken_over: true, standby: false, handover_at: new Date().toISOString() } } }).eq("id", conversation_id);
          return await sendOnce(t, url, type);
        }
      };
      if (text) { const res = await sendRetry(text); lastId = res.message_id; }
      for (const a of attachments as { type: string; url: string; name?: string }[]) {
        const res = await sendRetry(undefined, a.url, (["image", "video", "audio"].includes(a.type) ? a.type : "file") as any);
        lastId = res.message_id;
      }
      await dropFailed();
      await db.from("crm_messages").insert({ conversation_id, direction: "out", type: attachments.length ? attachments[0].type : "text", text: text || null, attachments, external_msg_id: lastId, sender_member_id: user.id, status: "sent", raw: quote ? { quote: { msg: quote.msg, thumb: quote.thumb, kind: quote.kind, name: quote.name, from: quote.from, msg_id: quote.msg_id } } : null });
      return NextResponse.json({ ok: true });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
  }

  // Zalo cá nhân: worker phải đang đăng nhập — phiên hết hạn / worker tắt thì báo lỗi ngay thay vì xếp hàng rồi "đang gửi" mãi
  if (channel?.type === "zalo_personal") {
    const { data: w } = await db.from("crm_zalo_worker").select("state,heartbeat_at,last_error").eq("id", 1).maybeSingle();
    const stale = !w?.heartbeat_at || Date.now() - new Date(w.heartbeat_at).getTime() > 3 * 60000;
    if (w?.state !== "online" || stale) {
      const why = w?.state === "need_qr" || w?.state === "qr_ready" ? "Zalo chưa đăng nhập — vào Cài đặt → Kết nối kênh → quét mã QR bằng điện thoại Zalo của shop" : stale ? `Worker Zalo không phản hồi (lần cuối ${w?.heartbeat_at ? new Date(w.heartbeat_at).toLocaleString("vi-VN") : "chưa có"}) — kiểm tra VPS (pm2 status zalo)` : `Worker Zalo đang ${w?.state || "offline"}`;
      return NextResponse.json({ error: why + (w?.last_error ? ` · ${w.last_error}` : "") }, { status: 409 });
    }
  }
  // Zalo cá nhân / kênh khác: xếp hàng, worker gửi và ghi crm_messages
  const { error: qErr } = await db.from("crm_outbox").insert({ conversation_id, channel_id: conv.channel_id, external_id: conv.external_id, text: text || "", attachments, sent_by: user.id, source: "manual", quote });
  if (qErr) return NextResponse.json({ error: "Không xếp hàng gửi được: " + qErr.message }, { status: 400 });
  await dropFailed();
  await db.from("crm_messages").insert({ conversation_id, direction: "out", type: attachments.length ? attachments[0].type : "text", text: text || null, attachments, sender_member_id: user.id, status: "queued", raw: quote ? { quote: { msg: quote.msg, thumb: quote.thumb, kind: quote.kind, name: quote.name, from: quote.from, msg_id: quote.msg_id } } : null });
  return NextResponse.json({ ok: true, queued: true });
}
