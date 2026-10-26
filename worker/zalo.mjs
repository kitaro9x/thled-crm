/**
 * THLED CRM — Zalo personal worker (chạy riêng trên VPS/máy local, KHÔNG deploy lên Vercel)
 *
 *  node worker/zalo.mjs
 *
 * Dùng thư viện không chính thức `zca-js` (giả lập Zalo Web). RỦI RO: Zalo có thể khoá tài khoản
 * nếu gửi quá nhiều/quá nhanh. Giữ friend_daily_limit thấp (≤15/ngày), delay ngẫu nhiên, chỉ chạy 1 tài khoản.
 *
 * Việc của worker:
 *  1. Đăng nhập bằng QR (ghi QR vào crm_zalo_worker.qr_image → hiện trên màn Cài đặt kênh)
 *  2. Lắng nghe tin nhắn đến → ingest qua /api/internal/ingest (dùng CRON_SECRET)
 *  3. Gửi crm_outbox cho kênh zalo_personal
 *  4. Gửi lời mời kết bạn từ crm_zalo_friend_tasks + tin nhắn sau khi kết bạn
 */
import { createClient } from "@supabase/supabase-js";
import { Zalo, ThreadType, LoginQRCallbackEventType } from "zca-js";
import { config } from "dotenv";
config({ path: ".env.local" }); config();

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const APP_URL = process.env.APP_URL || "http://localhost:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a));

/** Tải file từ URL (Supabase Storage) thành Buffer để zca-js upload */
async function fetchAttachment(a) {
  const r = await fetch(a.url); if (!r.ok) throw new Error("Tải đính kèm lỗi " + r.status);
  const data = Buffer.from(await r.arrayBuffer());
  const name = (a.name && /\.[a-z0-9]+$/i.test(a.name)) ? a.name.replace(/[^\w.\-]+/g, "_") : `file.${(a.url.split("?")[0].split(".").pop() || "bin")}`;
  return { data, filename: name, metadata: { totalSize: data.length } };
}
/** Gửi 1 tin kèm đính kèm qua Zalo: ảnh/file → sendMessage(attachments); video → sendVideo (cần URL public) */
async function zaloSend(api, uid, text, attachments) {
  const atts = attachments || [];
  if (!atts.length) {
    // có link → gửi dạng thẻ link (có ảnh/tiêu đề) như app Zalo
    const link = (text || "").match(/https?:\/\/[^\s<>"']+/i)?.[0];
    if (link) { try { return await api.sendLink({ msg: text, link }, uid, ThreadType.User); } catch (e) { console.error("sendLink fail, fallback text:", e.message); } }
    return api.sendMessage(text || "", uid, ThreadType.User);
  }
  const videos = atts.filter((a) => a.type === "video"); const others = atts.filter((a) => a.type !== "video");
  if (others.length) {
    const files = []; for (const a of others) files.push(await fetchAttachment(a));
    await api.sendMessage({ msg: text || "", attachments: files }, uid, ThreadType.User);
  } else if (text) await api.sendMessage(text, uid, ThreadType.User);
  for (const v of videos) {
    try { await api.sendVideo({ msg: "", videoUrl: v.url, thumbnailUrl: v.thumb || v.url }, uid, ThreadType.User); }
    catch (e) { // fallback: gửi như file
      const f = await fetchAttachment(v); await api.sendMessage({ msg: "", attachments: [f] }, uid, ThreadType.User);
    }
  }
}

async function setWorker(patch) { await sb.from("crm_zalo_worker").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", 1); }

// Gói Vercel Hobby chỉ cho cron 1 lần/ngày → worker gọi job mỗi phút thay thế
async function runCronJobs() {
  try { await fetch(`${APP_URL}/api/cron/jobs`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }); } catch (e) { console.error("cron err", e.message); }
}
setInterval(runCronJobs, 60000);

async function ingest(payload) {
  const r = await fetch(`${APP_URL}/api/internal/ingest`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${process.env.CRON_SECRET}` }, body: JSON.stringify(payload) });
  if (!r.ok) console.error("ingest fail", await r.text());
}

/** Ghi tin do worker gửi (lời chào sau kết bạn…) vào CRM để hội thoại Zalo xuất hiện và gộp với khách */
async function recordOutgoing(own, uid, name, text) {
  await ingest({ channelType: "zalo_personal", channelExternalId: String(own), senderExternalId: String(uid), senderName: name, text, type: "text", attachments: [], externalMsgId: `worker-${uid}-${Date.now()}`, sentAt: new Date().toISOString(), direction: "out" });
}

async function main() {
  const zalo = new Zalo({ selfListen: true, checkUpdate: false }); // selfListen: nhận cả tin mình gửi từ điện thoại để đồng bộ về CRM
  let api;
  const { data: w } = await sb.from("crm_zalo_worker").select("*").eq("id", 1).single();
  try {
    if (w?.session?.cookie && w.state !== "need_qr") {
      api = await zalo.login({ cookie: w.session.cookie, imei: w.session.imei, userAgent: w.session.userAgent });
    } else throw new Error("no session");
  } catch {
    console.log("Đăng nhập QR…");
    let session = null;
    api = await zalo.loginQR({}, async (ev) => {
      if (ev.type === LoginQRCallbackEventType.QRCodeGenerated) await setWorker({ state: "qr_ready", qr_image: ev.data.image.startsWith("data:") ? ev.data.image : `data:image/png;base64,${ev.data.image}` });
      if (ev.type === LoginQRCallbackEventType.QRCodeExpired) ev.actions.retry();
      if (ev.type === LoginQRCallbackEventType.GotLoginInfo) session = ev.data; // {cookie, imei, userAgent}
    });
    if (session) await setWorker({ session });
  }
  const own = api.getOwnId();
  const me = await api.fetchAccountInfo().catch(() => null);
  const name = me?.profile?.displayName || "Zalo cá nhân";
  await setWorker({ state: "online", own_uid: own, account_name: name, qr_image: null, heartbeat_at: new Date().toISOString() });
  // đảm bảo kênh tồn tại
  await sb.from("crm_channels").upsert({ type: "zalo_personal", external_id: String(own), name, status: "connected" }, { onConflict: "type,external_id" });
  console.log("Online:", name, own);

  // 2. listener
  api.listener.on("message", async (m) => {
    try {
      if (m.type !== ThreadType.User) return; // bỏ qua group
      const d = m.data; const isSelf = m.isSelf;
      const uid = isSelf ? d.toUid || m.threadId : d.uidFrom || m.threadId;
      let text = typeof d.content === "string" ? d.content : d.content?.title || d.content?.description || "";
      let type = "text"; const attachments = [];
      if (d.msgType === "chat.photo" || d.content?.href?.match(/\.(jpg|png|jpeg|webp)/)) { type = "image"; attachments.push({ type: "image", url: d.content?.href || d.content?.thumb }); text = d.content?.title || ""; }
      else if (d.msgType === "chat.sticker") { type = "sticker"; text = "[Sticker]"; }
      else if (d.msgType === "chat.voice") { type = "audio"; attachments.push({ type: "audio", url: d.content?.href }); }
      else if (d.msgType === "share.file") { type = "file"; attachments.push({ type: "file", url: d.content?.href, name: d.content?.title }); }
      let senderName = d.dName, avatar, phone;
      if (!isSelf) { const info = await api.getUserInfo(uid).catch(() => null); const p = info?.changed_profiles?.[uid]; if (p) { senderName = p.zaloName || p.displayName || senderName; avatar = p.avatar; phone = p.phoneNumber; } }
      await ingest({ channelType: "zalo_personal", channelExternalId: String(own), senderExternalId: String(uid), senderName, senderAvatar: avatar, senderPhone: phone, text, type, attachments, externalMsgId: String(d.msgId), sentAt: new Date(Number(d.ts)).toISOString(), direction: isSelf ? "out" : "in" });
    } catch (e) { console.error("msg err", e.message); }
  });
  api.listener.start();

  // Nhận tin mới trong crm_outbox tức thì qua realtime (thay vì chờ vòng quét)
  let wake = null; const kick = () => { if (wake) { const w = wake; wake = null; w(); } };
  sb.channel("worker-outbox").on("postgres_changes", { event: "INSERT", schema: "public", table: "crm_outbox" }, kick)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "crm_zalo_friend_tasks" }, kick).subscribe();
  const waitTick = (ms) => new Promise((r) => { wake = r; setTimeout(() => { if (wake === r) { wake = null; r(); } }, ms); });

  // 3+4. vòng lặp outbox & friend tasks
  while (true) {
    try {
      await setWorker({ heartbeat_at: new Date().toISOString() });
      const { data: w2 } = await sb.from("crm_zalo_worker").select("state,auto_friend,friend_daily_limit").eq("id", 1).single();
      if (w2?.state === "need_qr") { console.log("Yêu cầu đăng nhập lại"); process.exit(0); }

      const { data: out } = await sb.from("crm_outbox").select("*, crm_channels(type)").eq("status", "queued").or(`scheduled_at.is.null,scheduled_at.lte.${new Date().toISOString()}`).limit(5);
      for (const o of out || []) {
        if (o.crm_channels?.type !== "zalo_personal") continue;
        try {
          await zaloSend(api, o.external_id, o.text, o.attachments);
          await sb.from("crm_outbox").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", o.id);
          await sb.from("crm_messages").update({ status: "sent" }).eq("conversation_id", o.conversation_id).eq("status", "queued");
          if (o.source !== "manual") await sb.from("crm_messages").insert({ conversation_id: o.conversation_id, direction: "out", type: "text", text: o.text, attachments: o.attachments, status: "sent" });
          await sleep(rnd(2000, 5000));
        } catch (e) { await sb.from("crm_outbox").update({ status: "failed", error: e.message }).eq("id", o.id); }
      }

      // kết bạn — giới hạn/ngày
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const { count } = await sb.from("crm_zalo_friend_tasks").select("id", { count: "exact", head: true }).in("status", ["sent", "accepted"]).gte("done_at", today.toISOString());
      if ((count || 0) < (w2?.friend_daily_limit || 15)) {
        const { data: tasks } = await sb.from("crm_zalo_friend_tasks").select("*").eq("status", "todo").or(`scheduled_at.is.null,scheduled_at.lte.${new Date().toISOString()}`).order("created_at").limit(1);
        for (const t of tasks || []) {
          try {
            const found = await api.findUser(t.phone);
            if (!found?.uid) { await sb.from("crm_zalo_friend_tasks").update({ status: "not_found", last_error: "Không tìm thấy Zalo", attempts: t.attempts + 1 }).eq("id", t.id); continue; }
            const foundName = found.zalo_name || found.display_name;
            await sb.from("crm_zalo_friend_tasks").update({ zalo_uid: found.uid, zalo_name: foundName }).eq("id", t.id);
            if (t.customer_id && foundName) {
              const { data: cu } = await sb.from("crm_customers").select("name,zalo").eq("id", t.customer_id).single();
              const patch = {}; if (!cu?.zalo) patch.zalo = foundName;
              if (!cu?.name || /^(Khách mới|0\d{9})$/.test(cu.name)) patch.name = foundName; // chưa có tên FB → dùng tên Zalo
              if (Object.keys(patch).length) await sb.from("crm_customers").update(patch).eq("id", t.customer_id);
            }
            if (found.isFr === 1) {
              await sb.from("crm_zalo_friend_tasks").update({ status: "accepted", done_at: new Date().toISOString() }).eq("id", t.id);
            } else {
              await api.sendFriendRequest(t.greeting || "Xin chào, em bên THLED ạ.", found.uid);
              await sb.from("crm_zalo_friend_tasks").update({ status: "sent", done_at: new Date().toISOString(), attempts: t.attempts + 1 }).eq("id", t.id);
            }
            // liên kết identity ↔ customer để hội thoại sau này gắn đúng khách
            if (t.customer_id) { const { data: ch } = await sb.from("crm_channels").select("id").eq("type", "zalo_personal").eq("external_id", String(own)).single(); if (ch) await sb.from("crm_identities").upsert({ channel_id: ch.id, channel: "zalo_personal", external_id: String(found.uid), display_name: foundName, avatar_url: found.avatar, phone: t.phone, customer_id: t.customer_id }, { onConflict: "channel_id,external_id" }); }
            await sleep(rnd(20000, 60000));
          } catch (e) { await sb.from("crm_zalo_friend_tasks").update({ status: t.attempts >= 2 ? "failed" : "todo", last_error: e.message, attempts: t.attempts + 1 }).eq("id", t.id); }
        }
      }
      // kiểm tra kết bạn đã được chấp nhận → gửi tin sau khi kết bạn
      const { data: sent } = await sb.from("crm_zalo_friend_tasks").select("*").eq("status", "sent").not("zalo_uid", "is", null).limit(10);
      for (const t of sent || []) {
        const info = await api.getUserInfo(t.zalo_uid).catch(() => null); const p = info?.changed_profiles?.[t.zalo_uid];
        if (p?.isFr === 1) {
          await sb.from("crm_zalo_friend_tasks").update({ status: "accepted", accepted_at: new Date().toISOString() }).eq("id", t.id);
          console.log("Đã kết bạn:", t.phone, t.zalo_name);
          if (t.after_accept_message) {
            await api.sendMessage(t.after_accept_message, t.zalo_uid, ThreadType.User);
            await recordOutgoing(own, t.zalo_uid, t.zalo_name || p.zaloName || p.displayName, t.after_accept_message);
            await sleep(rnd(2000, 4000));
          }
        }
      }
    } catch (e) { console.error("loop err", e.message); await setWorker({ last_error: e.message }); }
    await waitTick(5000);
  }
}
main().catch(async (e) => { console.error(e); await setWorker({ state: "offline", last_error: e.message }); process.exit(1); });
