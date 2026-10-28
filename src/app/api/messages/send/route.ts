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
  const { conversation_id, text, attachments = [], scheduled_at } = await req.json();
  const db = supabaseAdmin();

  const { data: conv } = await db.from("crm_v_conversations").select("*").eq("id", conversation_id).single();
  if (!conv) return NextResponse.json({ error: "conversation not found" }, { status: 404 });
  const { data: channel } = await db.from("crm_channels").select("*").eq("id", conv.channel_id).single();

  if (scheduled_at) {
    await db.from("crm_conversations").update({ scheduled_message: { text, send_at: scheduled_at } }).eq("id", conversation_id);
    await db.from("crm_outbox").insert({ conversation_id, channel_id: conv.channel_id, external_id: conv.external_id, text, attachments, scheduled_at, sent_by: user.id, source: "manual" });
    return NextResponse.json({ ok: true, scheduled: true });
  }

  if (channel?.type === "fb_page") {
    try {
      const token = channel.credentials?.page_access_token;
      let lastId: string | undefined;
      if (text) { const res = await fbSendMessage(token, conv.external_id, text); lastId = res.message_id; }
      for (const a of attachments as { type: string; url: string; name?: string }[]) {
        const res = await fbSendMessage(token, conv.external_id, undefined, a.url, undefined, (["image", "video", "audio"].includes(a.type) ? a.type : "file") as any);
        lastId = res.message_id;
      }
      await db.from("crm_messages").insert({ conversation_id, direction: "out", type: attachments.length ? attachments[0].type : "text", text: text || null, attachments, external_msg_id: lastId, sender_member_id: user.id, status: "sent" });
      return NextResponse.json({ ok: true });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
  }

  // Zalo cá nhân / kênh khác: xếp hàng, worker gửi và ghi crm_messages
  const { error: qErr } = await db.from("crm_outbox").insert({ conversation_id, channel_id: conv.channel_id, external_id: conv.external_id, text: text || "", attachments, sent_by: user.id, source: "manual" });
  if (qErr) return NextResponse.json({ error: "Không xếp hàng gửi được: " + qErr.message }, { status: 400 });
  await db.from("crm_messages").insert({ conversation_id, direction: "out", type: attachments.length ? attachments[0].type : "text", text: text || null, attachments, sender_member_id: user.id, status: "queued" });
  return NextResponse.json({ ok: true, queued: true });
}
