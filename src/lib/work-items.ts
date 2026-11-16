/**
 * Mục "Công việc" của CRM gộp 2 nguồn trong cùng Supabase:
 *  - crm_activities: việc tạo trong CRM (từ hội thoại, cơ hội, đơn hàng…)
 *  - tasks (+ task_lists): việc của trang thled.vn/congviec
 * Không copy dữ liệu: CRM đọc/ghi thẳng bảng gốc nên 2 bên luôn khớp nhau.
 * File này chỉ có kiểu + hàm thuần (dùng được cả server lẫn client).
 */
export type WorkItem = {
  key: string; // "crm:<id>" | "web:<id>"
  src: "crm" | "web";
  id: string;
  title: string;
  description: string | null;
  kind: string; // crm: call|meeting|follow_up|email ; web: "web"
  status: "todo" | "doing" | "done";
  doneAt: string | null;
  dueAt: string | null; // ISO; việc cả ngày (không giờ) = 23:59 giờ VN của ngày đó
  allDay: boolean;
  ownerId: string | null; // crm_members.id
  ownerName: string;
  priority: "low" | "medium" | "high" | null;
  list: { name: string; color: string } | null;
  // chỉ có ở việc CRM
  customer?: { name?: string | null; phone?: string | null } | null;
  lead?: { id: string; title: string } | null;
  conversationId?: string | null;
  attachments?: { type?: string; url: string; name?: string }[];
  customerBusy?: boolean;
  // chỉ có ở việc /congviec
  gmailLink?: string | null;
  origin?: "web" | "gmail" | "gcal" | "journal"; // tasks.source: gcal = nhập từ Google Calendar
};

export const TZ = "Asia/Ho_Chi_Minh";
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
/** Ngày (YYYY-MM-DD) theo giờ Việt Nam */
export const vnDay = (d: Date | string) => dayFmt.format(typeof d === "string" ? new Date(d) : d);
const hmFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
/** "dd/MM" hoặc "HH:mm dd/MM" theo giờ VN (giống nhau ở server & trình duyệt) */
export const fmtVN = (iso: string, withTime = true) => { const d = vnDay(iso); const dmy = `${d.slice(8, 10)}/${d.slice(5, 7)}`; return withTime ? `${hmFmt.format(new Date(iso))} ${dmy}` : dmy; };
/** Cộng n ngày vào chuỗi YYYY-MM-DD */
export const addDays = (day: string, n: number) => { const d = new Date(day + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export const isDone = (w: WorkItem) => w.status === "done";
export const isOverdue = (w: WorkItem, now = new Date()) => !isDone(w) && !!w.dueAt && new Date(w.dueAt) < now;
export const isToday = (w: WorkItem, now = new Date()) => !!w.dueAt && vnDay(w.dueAt) === vnDay(now);

const WD = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
const dm = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const wd = (day: string) => WD[new Date(day + "T00:00:00Z").getUTCDay()];

/** Nhóm việc chưa xong theo lịch trình: Quá hạn → Hôm nay → Ngày mai → 5 ngày tới → Sau đó → Chưa có hạn */
export function groupBySchedule(items: WorkItem[], now = new Date()) {
  const today = vnDay(now);
  const groups = new Map<string, { key: string; label: string; tone?: "red" | "blue"; items: WorkItem[] }>();
  const put = (key: string, label: string, w: WorkItem, tone?: "red" | "blue") => {
    if (!groups.has(key)) groups.set(key, { key, label, tone, items: [] });
    groups.get(key)!.items.push(w);
  };
  for (const w of items) {
    if (!w.dueAt) { put("9-none", "Chưa có hạn", w); continue; }
    if (isOverdue(w, now)) { put("0-overdue", "Quá hạn", w, "red"); continue; }
    const d = vnDay(w.dueAt);
    if (d === today) put("1-" + d, `Hôm nay · ${wd(d)} ${dm(d)}`, w, "blue");
    else if (d === addDays(today, 1)) put("2-" + d, `Ngày mai · ${wd(d)} ${dm(d)}`, w);
    else if (d <= addDays(today, 6)) put("3-" + d, `${wd(d)} ${dm(d)}`, w);
    else put("8-later", "Sau đó", w);
  }
  const byDue = (a: WorkItem, b: WorkItem) => (a.dueAt || "").localeCompare(b.dueAt || "") || a.title.localeCompare(b.title);
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key)).map((g) => ({ ...g, items: g.items.sort(byDue) }));
}

/** Khối lượng việc từng người (chỉ tính việc chưa xong) */
export function workload(items: WorkItem[], now = new Date()) {
  const today = vnDay(now); const week = addDays(today, 6);
  const m = new Map<string, { ownerId: string | null; name: string; open: number; overdue: number; today: number; week: number; noDue: number }>();
  for (const w of items) {
    if (isDone(w)) continue;
    const k = w.ownerId || "none:" + w.ownerName;
    if (!m.has(k)) m.set(k, { ownerId: w.ownerId, name: w.ownerName, open: 0, overdue: 0, today: 0, week: 0, noDue: 0 });
    const r = m.get(k)!;
    r.open++;
    if (isOverdue(w, now)) r.overdue++;
    else if (w.dueAt) { const d = vnDay(w.dueAt); if (d === today) r.today++; if (d <= week) r.week++; }
    else r.noDue++;
  }
  return [...m.values()].sort((a, b) => b.overdue - a.overdue || b.open - a.open);
}
