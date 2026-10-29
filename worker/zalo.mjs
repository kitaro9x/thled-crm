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
// Thành viên nhóm → crm_conversations.meta.members (CRM gợi ý khi gõ @)
const groupMembers = new Map(); // groupId -> [{id,name}]
async function saveGroupMembers(api, gid, g) {
  try {
    let mems = (g?.currentMems || []).map((m) => ({ id: String(m.id), name: m.zaloName || m.dName, avatar: m.avatar || null }));
    if (!mems.length) {
      // Zalo thường trả memberIds rỗng, danh sách nằm ở memVerList dạng "uid_version"
      let ids = (g?.memberIds?.length ? g.memberIds : (g?.memVerList || []).map((x) => String(x).split("_")[0])).map(String).filter(Boolean);
      ids = Array.from(new Set(ids)).slice(0, 60);
      for (let i = 0; i < ids.length; i += 15) {
        const chunk = ids.slice(i, i + 15);
        try {
          const info = await api.getUserInfo(chunk);
          for (const [k, u] of Object.entries({ ...(info?.unchanged_profiles || {}), ...(info?.changed_profiles || {}) })) {
            const name = u?.zaloName || u?.displayName || u?.dName; if (name) mems.push({ id: String(u?.userId || k), name, avatar: u?.avatar || null });
          }
        } catch (e) { console.log("getUserInfo lỗi", e.message); }
        await sleep(rnd(300, 700));
      }
      if (!mems.length) console.log("saveGroupMembers: memberIds=", (g?.memberIds || []).length, "memVerList=", (g?.memVerList || []).length, "sample=", JSON.stringify((g?.memVerList || [])[0]));
    }
    mems = mems.filter((m) => m.id && m.name);
    if (!mems.length) { console.log("saveGroupMembers: không lấy được thành viên", gid); return; }
    groupMembers.set(gid, mems);
    const { data: ident } = await sb.from("crm_identities").select("id").eq("channel", "zalo_personal").eq("external_id", String(gid)).limit(1).maybeSingle();
    if (!ident) { console.log("saveGroupMembers: chưa có identity nhóm", gid); return; }
    { // giữ các khoá meta khác (vd alias = tên nhóm đặt trong CRM)
      const { data: cv } = await sb.from("crm_conversations").select("id,meta").eq("identity_id", ident.id).eq("kind", "group").maybeSingle();
      if (cv) await sb.from("crm_conversations").update({ meta: { ...(cv.meta || {}), members: mems, members_at: new Date().toISOString() } }).eq("id", cv.id);
    }
  } catch (e) { console.error("saveGroupMembers", e.message); }
}
/** "@Tên" trong text → mentions zca-js [{pos,len,uid}] (khớp tên dài nhất trước) */
async function buildMentions(api, gid, text) {
  if (!text || !text.includes("@")) return [];
  let mems = groupMembers.get(gid);
  if (!mems) { const gi = await api.getGroupInfo(gid).catch(() => null); await saveGroupMembers(api, gid, gi?.gridInfoMap?.[gid]); mems = groupMembers.get(gid) || []; }
  const out = [];
  for (const m of [...mems].sort((a, b) => b.name.length - a.name.length)) {
    let from = 0; const needle = "@" + m.name;
    while (true) { const pos = text.indexOf(needle, from); if (pos < 0) break; if (!out.some((o) => pos < o.pos + o.len && o.pos < pos + needle.length)) out.push({ pos, len: needle.length, uid: m.id }); from = pos + needle.length; }
  }
  return out;
}
async function zaloSend(api, uid, text, attachments, ttype = ThreadType.User) {
  const atts = attachments || [];
  const mentions = ttype === ThreadType.Group ? await buildMentions(api, uid, text) : [];
  if (!atts.length) {
    if (mentions.length) return api.sendMessage({ msg: text, mentions }, uid, ttype);
    // có link → gửi dạng thẻ link (có ảnh/tiêu đề) như app Zalo
    const link = (text || "").match(/https?:\/\/[^\s<>"']+/i)?.[0];
    if (link) { try { return await api.sendLink({ msg: text, link }, uid, ttype); } catch (e) { console.error("sendLink fail, fallback text:", e.message); } }
    return api.sendMessage(text || "", uid, ttype);
  }
  const videos = atts.filter((a) => a.type === "video"); const others = atts.filter((a) => a.type !== "video");
  if (others.length) {
    const files = []; for (const a of others) files.push(await fetchAttachment(a));
    await api.sendMessage({ msg: text || "", attachments: files, mentions }, uid, ttype);
  } else if (text) await api.sendMessage(text, uid, ttype);
  for (const v of videos) {
    try { await api.sendVideo({ msg: "", videoUrl: v.url, thumbnailUrl: v.thumb || v.url }, uid, ttype); }
    catch (e) { // fallback: gửi như file
      const f = await fetchAttachment(v); await api.sendMessage({ msg: "", attachments: [f] }, uid, ttype);
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

/** Bóc nội dung thẻ "zinstant" của Zalo (thẻ ngân hàng, thẻ thông tin…): tải template, gom chữ + ảnh (QR) */
async function parseZinstant(c) {
  try {
    const p = typeof c.params === "string" ? JSON.parse(c.params) : c.params;
    const label = p?.customMsg?.msg?.vi || p?.customMsg?.msg?.en || "";
    const url = p?.item?.data_url || p?.pcItem?.data_url; if (!url) return { text: label, images: [] };
    const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } }); const body = await r.text();
    let data; try { data = JSON.parse(body); } catch { data = null; }
    const texts = [], images = [];
    const seen = new Set();
    const push = (t) => { const v = String(t).replace(/\s+/g, " ").trim(); if (v && v.length < 200 && !/^https?:/.test(v) && /[\p{L}\d]/u.test(v) && !seen.has(v)) { seen.add(v); texts.push(v); } };
    const walk = (o) => {
      if (!o) return;
      if (Array.isArray(o)) return o.forEach(walk);
      if (typeof o === "object") { for (const [k, v] of Object.entries(o)) { if (typeof v === "string" && /^https?:\/\/.+\.(png|jpe?g|webp)(\?.*)?$/i.test(v) || (typeof v === "string" && /qr/i.test(k) && /^https?:/.test(v))) images.push(v); else if (typeof v === "string" && /^(text|title|content|value|label|desc|description|subtitle)$/i.test(k)) push(v); else walk(v); } }
    };
    if (data) walk(data); else {
      // HTML: gom chữ trong thẻ và ảnh
      for (const m of body.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) images.push(m[1]);
      for (const m of body.matchAll(/>([^<>{}]{2,120})</g)) push(m[1]);
    }
    return { text: texts.length ? texts.join("\n") : label, images: Array.from(new Set(images)).slice(0, 2), body: body.slice(0, 4000), data };
  } catch (e) { return { text: "", images: [] }; }
}

// Tên ngân hàng → mã VietQR (để CRM tự vẽ QR chuyển khoản như thẻ Zalo)
const BANKS = [["vietcombank|vcb|ngoại thương", "VCB"], ["techcombank|tcb", "TCB"], ["vietinbank|ctg|công thương", "CTG"], ["bidv|đầu tư và phát triển", "BIDV"], ["agribank|nông nghiệp", "VBA"], ["mb ?bank|mbbank|quân đội", "MB"], ["acb|á châu", "ACB"], ["vpbank|vp bank", "VPB"], ["tpbank|tp bank|tiên phong", "TPB"], ["sacombank|stb", "STB"], ["hdbank|hd bank", "HDB"], ["vib", "VIB"], ["shb", "SHB"], ["ocb|phương đông", "OCB"], ["msb|hàng hải", "MSB"], ["seabank", "SEAB"], ["eximbank|eib", "EIB"], ["lpbank|lienvietpostbank|bưu điện liên việt", "LPB"], ["nam á|namabank", "NAB"], ["bắc á|bacabank", "BAB"], ["scb", "SCB"], ["pvcombank", "PVCB"], ["kienlongbank|kiên long", "KLB"], ["vietbank", "VIETBANK"], ["abbank|an bình", "ABB"], ["bản việt|bvbank|vietcapital", "BVB"], ["cake", "CAKE"], ["timo", "TIMO"], ["momo", "MOMO"]];
/** Rút thông tin tài khoản từ nội dung thẻ (JSON/HTML) + lời nhắn liền trước */
function parseBank(z, hint) {
  const src = [z?.text || "", JSON.stringify(z?.data || "") , z?.body || "", hint || ""].join("\n");
  const bank = BANKS.find(([re]) => new RegExp(re, "i").test(src));
  const account = (src.match(/(?<!\d)\d{8,19}(?!\d)/g) || []).filter((n) => !/^(19|20)\d{6}$/.test(n) && !/^1[6-9]\d{11}$/.test(n))[0]; // bỏ timestamp
  const holderM = src.match(/(?:chủ tài khoản|chủ tk|tên tk|account name|holder)[^\p{L}\d]*([\p{Lu}][\p{L} ]{3,40})/iu) || src.match(/\d{8,19}\s*[-–]?\s*([\p{L}][\p{L} ]{3,40}?)(?:\s*(?:ngân hàng|bank|vcb|vietcombank|$))/iu);
  if (!account && !bank) return null;
  return { bank: bank?.[1] || null, bank_name: bank ? src.match(new RegExp(bank[0], "i"))?.[0] : null, account: account || null, holder: holderM?.[1]?.trim() || null };
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

  // sửa các hội thoại bị gán nhầm tên tài khoản của mình (lỗi cũ khi mình nhắn trước)
  try {
    const { data: ch } = await sb.from("crm_channels").select("id").eq("type", "zalo_personal").eq("external_id", String(own)).single();
    const { data: bad } = await sb.from("crm_identities").select("id,external_id,customer_id").eq("channel_id", ch.id).eq("display_name", name).neq("external_id", String(own));
    for (const b of bad || []) {
      const info = await api.getUserInfo(b.external_id).catch(() => null); const p = info?.changed_profiles?.[b.external_id];
      const real = p?.zaloName || p?.displayName; if (!real) continue;
      await sb.from("crm_identities").update({ display_name: real, avatar_url: p.avatar || null }).eq("id", b.id);
      if (b.customer_id) await sb.from("crm_customers").update({ name: real, zalo: real }).eq("id", b.customer_id).eq("name", name);
      console.log("Sửa tên:", b.external_id, "→", real); await sleep(500);
    }
  } catch (e) { console.error("repair names err", e.message); }

  // Đồng bộ "Phân loại" trên Zalo → nhãn hội thoại CRM (tự tạo nhãn, gắn vào hội thoại, lưu vào identity.meta.zalo_labels)
  async function syncLabels() {
    try {
      const res = await api.getLabels(); const labels = res?.labelData || [];
      const { data: ch } = await sb.from("crm_channels").select("id").eq("type", "zalo_personal").eq("external_id", String(own)).single();
      const byUid = new Map(); const names = [];
      for (const l of labels) {
        const nm = (l.text || "").trim(); if (!nm) continue; names.push(nm);
        await sb.from("crm_labels").upsert({ name: nm, color: l.color || "#64748b", zalo_label_id: l.id, source: "zalo" }, { onConflict: "name" });
        for (const uid of l.conversations || []) { const k = String(uid); byUid.set(k, [...(byUid.get(k) || []), nm]); }
      }
      const { data: ids } = await sb.from("crm_identities").select("id,external_id,meta").eq("channel_id", ch.id);
      for (const i of ids || []) {
        const cur = Array.isArray(i.meta?.zalo_labels) ? i.meta.zalo_labels : [];
        const next = byUid.get(String(i.external_id)) || [];
        if (JSON.stringify(cur) === JSON.stringify(next)) continue;
        await sb.from("crm_identities").update({ meta: { ...(i.meta || {}), zalo_labels: next } }).eq("id", i.id);
        const { data: convs } = await sb.from("crm_conversations").select("id,labels").eq("identity_id", i.id);
        for (const c of convs || []) {
          const keep = (c.labels || []).filter((x) => !names.includes(x) && !cur.includes(x));
          await sb.from("crm_conversations").update({ labels: Array.from(new Set([...keep, ...next])) }).eq("id", c.id);
        }
      }
      console.log("Đồng bộ phân loại Zalo:", names.join(", ") || "(không có)");
    } catch (e) { console.error("syncLabels err", e.message); }
  }
  await syncLabels(); setInterval(syncLabels, 10 * 60000);
  // nạp thành viên + avatar cho mọi nhóm đã có trong CRM (khởi động + mỗi 6 giờ)
  async function syncGroups() {
    try {
      const { data: gs } = await sb.from("crm_conversations").select("id, crm_identities!inner(external_id)").eq("kind", "group").limit(300);
      for (const g of gs || []) {
        const gid = String(g.crm_identities.external_id);
        const gi = await api.getGroupInfo(gid).catch((e) => { console.log("getGroupInfo lỗi", gid, e.message); return null; });
        const info = gi?.gridInfoMap?.[gid]; if (!info) continue;
        await saveGroupMembers(api, gid, info);
        const avt = info.avt || info.fullAvt; if (avt && !/default/i.test(avt)) await sb.from("crm_identities").update({ avatar_url: avt, display_name: info.name || undefined }).eq("channel", "zalo_personal").eq("external_id", gid);
        await sleep(rnd(800, 1500));
      }
      console.log("syncGroups xong:", (gs || []).length, "nhóm");
    } catch (e) { console.error("syncGroups", e.message); }
  }
  syncGroups(); setInterval(syncGroups, 6 * 3600000);

  // 2. listener
  const groupNames = new Map();
  api.listener.on("message", async (m) => {
    try {
      const d = m.data; const isSelf = m.isSelf;
      const isGroup = m.type === ThreadType.Group;
      const uid = isGroup ? m.threadId : isSelf ? d.toUid || m.threadId : d.uidFrom || m.threadId;
      // Diễn giải nội dung theo loại tin của Zalo (giống hiển thị trên app)
      const c = d.content; const mt = d.msgType || ""; const attachments = []; let type = "text";
      let text = typeof c === "string" ? c : ""; let extraRaw = null;
      const dur = (ms) => { const s = Math.round(Number(ms || 0) / 1000); return `${Math.floor(s / 60)} phút ${s % 60} giây`; };
      if (mt === "chat.photo") { type = "image"; attachments.push({ type: "image", url: c?.href || c?.hd || c?.thumb }); text = c?.title || ""; }
      else if (mt === "chat.gif") { type = "image"; attachments.push({ type: "image", url: c?.href || c?.thumb }); text = ""; }
      else if (mt === "chat.sticker") { type = "sticker"; text = "[Sticker]"; }
      else if (mt === "chat.voice") { type = "audio"; attachments.push({ type: "audio", url: c?.href }); text = "🎤 Tin nhắn thoại"; }
      else if (mt === "chat.video.msg") { type = "video"; attachments.push({ type: "video", url: c?.href, thumb: c?.thumb }); text = c?.title || ""; }
      else if (mt === "share.file") { type = "file"; attachments.push({ type: "file", url: c?.href, name: c?.title }); text = ""; }
      else if (mt === "chat.location.new") { text = `📍 Vị trí: ${c?.title || c?.description || ""}`.trim(); }
      else if (mt === "chat.recommended") { // danh thiếp / liên hệ / link
        const t = c?.title || c?.description || ""; text = c?.action === "recommened.user" || c?.type === "recommened.user" ? `👤 Danh thiếp: ${t}` : t || "[Thẻ chia sẻ]";
      }
      else if (mt === "chat.link") { text = [c?.title, c?.href].filter(Boolean).join("\n") || "[Link]"; if (c?.thumb) attachments.push({ type: "link", url: c.href, thumb: c.thumb }); }
      else if (mt === "chat.todo") { text = `☑️ Việc cần làm: ${c?.title || c?.description || ""}`; }
      else if (mt === "chat.doodle") { type = "image"; attachments.push({ type: "image", url: c?.href }); text = "[Hình vẽ]"; }
      else if (mt === "chat.webcontent" || String(c?.action || "").startsWith("zinstant")) {
        const z = await parseZinstant(c || {});
        const isBank = /bank/i.test(String(c?.action || "")) || /ngân hàng|bank/i.test(z.text);
        let bank = null;
        if (isBank) {
          // tin liền trước trong cùng hội thoại thường ghi "số tk + tên + ngân hàng" → dùng làm gợi ý
          const { data: prev } = await sb.from("crm_messages").select("text").eq("direction", isSelf ? "out" : "in").order("sent_at", { ascending: false }).limit(3);
          bank = parseBank(z, (prev || []).map((x) => x.text || "").join("\n"));
        }
        text = (isBank ? "🏦 Tài khoản ngân hàng" : "🗂️ Thẻ thông tin") + (z.text && z.text !== "[Tài khoản ngân hàng]" ? "\n" + z.text : "") + (bank ? `\n${bank.bank_name ? bank.bank_name.toUpperCase() + " · " : ""}${bank.account || ""}${bank.holder ? " · " + bank.holder : ""}` : "");
        for (const u of z.images) attachments.push({ type: "image", url: u });
        if (attachments.length) type = "image";
        if (bank) extraRaw = { bank, zinstant_sample: (z.body || "").slice(0, 1500) };
        else if (isBank) extraRaw = { zinstant_sample: (z.body || "").slice(0, 3000) };
      }
      else if (typeof c === "object" && c) {
        // bubble đặc biệt (cuộc gọi, poll, nhắc hẹn…): c.title/description, hoặc params JSON
        let p = null; try { p = typeof c.params === "string" ? JSON.parse(c.params) : c.params; } catch {}
        const isCall = /call/i.test(mt) || /call/i.test(String(c.action || "")) || p?.callType != null || p?.duration != null || p?.callId != null;
        if (isCall) {
          const missed = p?.status === "missed" || p?.missed || (p?.duration === 0);
          const video = p?.callType === 1 || p?.callType === "video" || /video/i.test(String(c.action || ""));
          text = `${video ? "📹" : "📞"} ${isSelf ? "Cuộc gọi" + (video ? " video" : " thoại") + " đi" : "Cuộc gọi" + (video ? " video" : " thoại") + " đến"}${missed ? " (nhỡ)" : p?.duration != null ? " · " + dur(p.duration) : ""}`;
          type = "event";
        } else text = c.title || c.description || (text && text !== "sendBubbleMessage" ? text : `[${mt || "Tin nhắn đặc biệt"}]`);
      }
      if (text === "sendBubbleMessage") text = "📞 Cuộc gọi";
      // tin do chính CRM/worker vừa gửi → đã có trong crm_messages, chỉ cập nhật trạng thái, không ghi đôi
      if (isSelf) {
        const { data: conv } = await sb.from("crm_v_conversations").select("id").eq("channel_type", "zalo_personal").eq("external_id", String(uid)).limit(1).maybeSingle();
        if (conv) {
          const since = new Date(Date.now() - 2 * 60000).toISOString();
          const { data: recent } = await sb.from("crm_messages").select("id,status,text,type,external_msg_id").eq("conversation_id", conv.id).eq("direction", "out").gte("created_at", since).order("created_at", { ascending: false }).limit(10);
          const norm = (t) => (t || "").replace(/\s+/g, " ").trim();
          const dup = (recent || []).find((r) => !r.external_msg_id && (norm(r.text) === norm(text) || (r.type !== "text" && !text)));
          if (dup) { await sb.from("crm_messages").update({ status: "sent", external_msg_id: String(d.msgId) }).eq("id", dup.id); return; }
        }
      }
      let senderName = d.dName, avatar, phone;
      if (isGroup) {
        // nhóm: hội thoại = nhóm, tên người gửi ghi vào từng tin
        let gname = groupNames.get(uid);
        if (!gname) { const gi = await api.getGroupInfo(uid).catch(() => null); const g = gi?.gridInfoMap?.[uid]; gname = g?.name || "Nhóm Zalo"; avatar = g?.avt || g?.fullAvt; if (/default|group_default|avt_default/i.test(avatar || "")) avatar = null; groupNames.set(uid, gname); await saveGroupMembers(api, uid, g); }
        await ingest({ channelType: "zalo_personal", channelExternalId: String(own), senderExternalId: String(uid), senderName: gname, senderAvatar: avatar, text, type, attachments, externalMsgId: String(d.msgId), sentAt: new Date(Number(d.ts)).toISOString(), direction: isSelf ? "out" : "in", kind: "group", messageSenderName: isSelf ? null : (d.dName || null), raw: { msgType: mt, content: c, ...(extraRaw || {}) } });
        return;
      }
      // luôn tra hồ sơ của ĐỐI PHƯƠNG (khi mình gửi, d.dName là tên của mình → không dùng)
      { const info = await api.getUserInfo(uid).catch(() => null); const p = info?.changed_profiles?.[uid]; if (p) { senderName = p.zaloName || p.displayName || (isSelf ? undefined : senderName); avatar = p.avatar; phone = p.phoneNumber; } else if (isSelf) senderName = undefined; }
      await ingest({ channelType: "zalo_personal", channelExternalId: String(own), senderExternalId: String(uid), senderName, senderAvatar: avatar, senderPhone: phone, text, type, attachments, externalMsgId: String(d.msgId), sentAt: new Date(Number(d.ts)).toISOString(), direction: isSelf ? "out" : "in", raw: { msgType: mt, content: c, ...(extraRaw || {}) } });
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

      const { data: out } = await sb.from("crm_outbox").select("*, crm_channels(type), crm_conversations(kind)").eq("status", "queued").or(`scheduled_at.is.null,scheduled_at.lte.${new Date().toISOString()}`).limit(5);
      for (const o of out || []) {
        if (o.crm_channels?.type !== "zalo_personal") continue;
        try {
          await zaloSend(api, o.external_id, o.text, o.attachments, o.crm_conversations?.kind === "group" ? ThreadType.Group : ThreadType.User);
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
