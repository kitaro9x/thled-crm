import ICAL from "ical.js";
import type { supabaseAdmin } from "@/lib/supabase/admin";
import { addDays, vnDay } from "@/lib/work-items";

/**
 * Google Calendar → Công việc (bảng tasks của /congviec, source = 'gcal').
 * Đọc "Địa chỉ bí mật ở định dạng iCal" của từng nhân sự (bảng crm_gcal_feeds), một chiều Google → CRM:
 *  - sự kiện mới → thêm việc (chủ việc = email nhân sự, gcal_event_id = UID sự kiện)
 *  - sự kiện đổi tên/giờ → cập nhật việc (không đụng trạng thái xong/chưa xong)
 *  - sự kiện bị xoá/huỷ → ẩn việc chưa làm (deleted_at)
 *  - sự kiện do chính /congviec đẩy lên Google (gcal_event_id trùng) → bỏ qua, không tạo trùng
 * Khung đọc (tính từ đầu ngày hôm nay, giờ VN — không nhập sự kiện đã qua):
 *  - sự kiện lẻ (lắp đặt, giao hàng, hẹn khách): 60 ngày tới; quá giờ chưa tick → hiện Quá hạn để nhắc
 *  - sự kiện lặp lại (họp tuần, việc định kỳ): 14 ngày tới, mã = UID#ngàygiờ; buổi đã qua chưa tick → tự ẩn
 */
type Db = ReturnType<typeof supabaseAdmin>;
export type Occurrence = { key: string; title: string; notes: string | null; due_date: string; due_time: string | null; duration_min: number | null };
export type Feed = { member_id: string; ics_url: string; list_id: string | null; last_synced_at: string | null };

const SINGLE_DAYS = 60, RECUR_DAYS = 14, MAX_OCC = 3000;
export const isRecurKey = (k: string) => k.includes("#");
const hmFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hour12: false });
const pad = (n: number) => String(n).padStart(2, "0");

/** Chỉ nhận link iCal của Google (server tự tải link này → chặn URL tuỳ ý) */
export function normalizeIcsUrl(raw: string): string | null {
  const u = String(raw || "").trim().replace(/^webcal:\/\//i, "https://");
  try {
    const x = new URL(u);
    if (x.protocol !== "https:" || x.hostname !== "calendar.google.com" || !x.pathname.startsWith("/calendar/ical/") || !x.pathname.endsWith(".ics")) return null;
    return x.toString();
  } catch { return null; }
}
export const maskIcsUrl = (u: string) => { const m = u.match(/\/ical\/([^/]+)\/(private-)?([^/]*)\//); return m ? `…/ical/${decodeURIComponent(m[1])}/${m[2] ? "private-" + "•".repeat(6) : m[3]}/…` : "…"; };

const plain = (s: string) => s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();

/** Đọc nội dung .ics → các buổi trong khung thời gian (giờ VN) */
export function parseIcs(text: string, now = new Date()): Occurrence[] {
  const root = new ICAL.Component(ICAL.parse(text));
  for (const tz of root.getAllSubcomponents("vtimezone")) ICAL.TimezoneService.register(tz);
  const today = vnDay(now);
  const from = new Date(`${today}T00:00:00+07:00`);
  const toSingle = new Date(from.getTime() + SINGLE_DAYS * 86400000), toRecur = new Date(from.getTime() + RECUR_DAYS * 86400000);

  const vevents = root.getAllSubcomponents("vevent");
  const masters = new Map<string, ICAL.Event>(); const exceptions: ICAL.Component[] = [];
  for (const v of vevents) {
    if (v.hasProperty("recurrence-id")) exceptions.push(v);
    else { const e = new ICAL.Event(v); if (e.uid) masters.set(e.uid, e); }
  }
  const orphans: ICAL.Event[] = [];
  for (const x of exceptions) {
    const e = new ICAL.Event(x); const m = masters.get(e.uid);
    if (m) m.relateException(e); else orphans.push(e); // buổi lẻ của lịch lặp không có bản gốc → coi như sự kiện thường
  }

  const out: Occurrence[] = [];
  const cancelled = (e: ICAL.Event) => String(e.component.getFirstPropertyValue("status") || "").toUpperCase() === "CANCELLED";
  const push = (e: ICAL.Event, start: ICAL.Time, end: ICAL.Time | null, key: string) => {
    if (cancelled(e)) return;
    const js = start.toJSDate();
    // việc cả ngày: so theo ngày (tránh lệch múi giờ của toJSDate với ngày "trôi")
    const day = start.isDate ? `${start.year}-${pad(start.month)}-${pad(start.day)}` : vnDay(js);
    const last = vnDay(new Date((isRecurKey(key) ? toRecur : toSingle).getTime() - 1));
    if (day < today || day > last) return;
    const desc = plain(String(e.description || "")); const loc = String(e.location || "").trim();
    const notes = [desc, loc && !desc.includes(loc) ? "📍 " + loc : ""].filter(Boolean).join("\n").slice(0, 4000) || null;
    const due_date = day; let due_time: string | null = null, duration_min: number | null = null;
    if (!start.isDate) {
      due_time = hmFmt.format(js) + ":00";
      if (end) { const mins = Math.round((end.toJSDate().getTime() - js.getTime()) / 60000); if (mins > 0 && mins < 24 * 60 * 14) duration_min = mins; }
    }
    out.push({ key, title: (String(e.summary || "").trim() || "(Không tiêu đề)").slice(0, 500), notes, due_date, due_time, duration_min });
  };

  for (const e of [...masters.values(), ...orphans]) {
    if (out.length >= MAX_OCC) break;
    if (!e.isRecurring() || e.isRecurrenceException()) {
      const rid = e.isRecurrenceException() && e.recurrenceId ? "#" + e.recurrenceId.toString().replace(/[-:]/g, "") : "";
      push(e, e.startDate, e.endDate, e.uid + rid);
      continue;
    }
    const it = e.iterator();
    const near = from.getTime() - 2 * 86400000; // buổi gốc trước khung: bỏ qua nhanh (buổi dời giờ vào khung là trường hợp hiếm)
    // 20000 vòng ≈ lịch hằng ngày tạo từ ~55 năm trước — đủ để chạy tới khung hiện tại
    for (let i = 0, t = it.next(); t && i < 20000 && out.length < MAX_OCC; i++, t = it.next()) {
      const tj = t.toJSDate();
      if (tj > toRecur) break;
      if (tj.getTime() < near) continue;
      const d = e.getOccurrenceDetails(t);
      push(d.item, d.startDate, d.endDate, `${e.uid}#${d.recurrenceId.toString().replace(/[-:]/g, "")}`);
    }
  }
  return out;
}

const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/** Đồng bộ 1 lịch. Ném lỗi khi tải/đọc lịch thất bại (khi đó KHÔNG ẩn việc nào). */
export async function syncFeed(db: Db, feed: Feed, ownerEmail: string, now = new Date()) {
  const owner = ownerEmail.toLowerCase();
  const res = await fetch(feed.ics_url, { signal: AbortSignal.timeout(15000), cache: "no-store" });
  if (!res.ok) throw new Error(res.status === 404 ? "Link lịch không còn hợp lệ (404) — lấy lại địa chỉ bí mật iCal" : `Google trả lỗi ${res.status}`);
  const text = await res.text();
  if (!text.includes("BEGIN:VCALENDAR")) throw new Error("Link không phải lịch iCal");
  const occ = parseIcs(text, now);
  const keys = [...new Set(occ.map((o) => o.key))];

  // việc đã có mang mã sự kiện này: của /congviec (đẩy lên Google) → bỏ qua; của lịch này → cập nhật
  const existing: any[] = [];
  for (const part of chunk(keys, 150)) {
    const { data, error } = await db.from("tasks").select("id,owner_email,source,title,notes,due_date,due_time,duration_min,gcal_event_id,deleted_at").in("gcal_event_id", part);
    if (error) throw new Error(error.message);
    existing.push(...(data || []));
  }
  const fromWeb = new Set(existing.filter((t) => t.source !== "gcal").map((t) => t.gcal_event_id));
  const mine = new Map(existing.filter((t) => t.source === "gcal" && String(t.owner_email).toLowerCase() === owner).map((t) => [t.gcal_event_id, t]));

  const stamp = now.toISOString();
  const inserts: any[] = []; let updated = 0;
  for (const o of occ) {
    if (fromWeb.has(o.key)) continue;
    const t = mine.get(o.key);
    if (!t) { inserts.push({ owner_email: owner, list_id: feed.list_id, title: o.title, notes: o.notes, status: "todo", priority: 0, due_date: o.due_date, due_time: o.due_time, duration_min: o.duration_min, source: "gcal", gcal_event_id: o.key, gcal_synced_at: stamp }); continue; }
    if (t.deleted_at) continue; // người dùng đã xoá việc này trên /congviec → tôn trọng, không hồi sinh
    const same = t.title === o.title && (t.notes || null) === o.notes && t.due_date === o.due_date && (t.due_time || null) === o.due_time && (t.duration_min ?? null) === o.duration_min;
    if (same) continue;
    const { error } = await db.from("tasks").update({ title: o.title, notes: o.notes, due_date: o.due_date, due_time: o.due_time, duration_min: o.duration_min, gcal_synced_at: stamp }).eq("id", t.id);
    if (!error) updated++;
  }
  for (const part of chunk(inserts, 200)) { const { error } = await db.from("tasks").insert(part); if (error) throw new Error(error.message); }

  // ẩn việc chưa làm khi: sự kiện đã xoá/huỷ trên Google (chỉ xét trong khung vừa đọc), hoặc là buổi lặp lại đã qua
  const today = vnDay(now); const keySet = new Set(keys);
  const { data: open } = await db.from("tasks").select("id,gcal_event_id,due_date").eq("source", "gcal").eq("owner_email", owner).is("deleted_at", null).neq("status", "done")
    .lte("due_date", addDays(today, SINGLE_DAYS - 1)).limit(5000);
  const gone = (open || []).filter((t) => {
    const recur = isRecurKey(String(t.gcal_event_id || ""));
    if (t.due_date < today) return recur; // buổi lặp đã qua → ẩn; sự kiện lẻ đã qua → giữ (nhắc tick xong)
    if (recur && t.due_date > addDays(today, RECUR_DAYS - 1)) return false; // ngoài khung lặp vừa đọc
    return !keySet.has(t.gcal_event_id);
  }).map((t) => t.id);
  for (const part of chunk(gone, 150)) await db.from("tasks").update({ deleted_at: stamp }).in("id", part);

  await db.from("crm_gcal_feeds").update({ last_synced_at: stamp, last_error: null, last_count: occ.length }).eq("member_id", feed.member_id);
  return { events: occ.length, created: inserts.length, updated, removed: gone.length };
}

/** Đồng bộ các lịch đã quá `minAgeMs` kể từ lần trước (cron + khi mở trang Công việc). Lỗi từng lịch ghi vào last_error. */
export async function syncDueFeeds(db: Db, minAgeMs: number) {
  const { data: feeds } = await db.from("crm_gcal_feeds").select("member_id,ics_url,list_id,last_synced_at,crm_members(email,is_active)");
  const cutoff = Date.now() - minAgeMs;
  let changed = 0, synced = 0;
  for (const f of (feeds as any[]) || []) {
    if (f.last_synced_at && new Date(f.last_synced_at).getTime() > cutoff) continue;
    const email = f.crm_members?.email; if (!email || !f.crm_members?.is_active) continue;
    try {
      const r = await syncFeed(db, f, email); synced++;
      changed += r.created + r.updated + r.removed;
    } catch (e: any) {
      await db.from("crm_gcal_feeds").update({ last_synced_at: new Date().toISOString(), last_error: String(e?.message || e).slice(0, 300) }).eq("member_id", f.member_id);
    }
  }
  return { synced, changed };
}
