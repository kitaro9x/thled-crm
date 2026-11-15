import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { WorkItem } from "@/lib/work-items";

export type Member = { id: string; name: string; email: string | null; role: string; is_active: boolean };
export type TaskList = { id: string; name: string; color: string; owner_email: string };

/** Người đang đăng nhập phải là thành viên CRM còn hoạt động */
export async function currentMember(): Promise<Member | null> {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from("crm_members").select("id,name,email,role,is_active").eq("id", user.id).maybeSingle();
  if (!data?.is_active) return null;
  return { ...data, email: data.email || user.email || null } as Member;
}

const norm = (s?: string | null) => (s || "").normalize("NFC").trim().toLowerCase();
/** Danh sách "Cá nhân" trên /congviec là việc riêng: chỉ chủ danh sách thấy */
export const isPrivateList = (name?: string | null) => ["cá nhân", "ca nhan"].includes(norm(name));

/** Ngày + giờ (giờ VN) của /congviec → ISO. Không có giờ = cuối ngày (chưa quá hạn tới hết ngày). */
const webDue = (date?: string | null, time?: string | null) => (date ? new Date(`${date}T${(time || "23:59:59").slice(0, 8)}+07:00`).toISOString() : null);
const webPrio = (p?: number | null): WorkItem["priority"] => (p === 3 ? "high" : p === 2 ? "medium" : p === 1 ? "low" : null);

/**
 * Tải việc của cả 2 nguồn.
 * done=false → việc chưa xong (tính lịch trình + khối lượng), done=true → 200 việc xong gần nhất.
 */
export async function loadWorkItems(me: Member, opts: { done: boolean }) {
  const sb = await supabaseServer();
  const admin = supabaseAdmin();
  const [{ data: members }, { data: lists }] = await Promise.all([
    sb.from("crm_members").select("id,name,email,role,is_active").order("name"),
    admin.from("task_lists").select("id,name,color,owner_email").eq("archived", false).order("sort_order"),
  ]);
  const mem = (members as Member[]) || [];
  const byEmail = new Map(mem.filter((m) => m.email).map((m) => [norm(m.email), m]));
  const listById = new Map(((lists as TaskList[]) || []).map((l) => [l.id, l]));

  let cq = sb.from("crm_activities").select("*, crm_leads(title), crm_customers(name,phone), crm_members!crm_activities_assignee_id_fkey(name)").neq("type", "note").eq("is_done", opts.done).limit(opts.done ? 200 : 500);
  cq = opts.done ? cq.order("done_at", { ascending: false, nullsFirst: false }) : cq.order("due_at", { ascending: true, nullsFirst: false });
  let wq = admin.from("tasks").select("id,owner_email,list_id,title,notes,status,priority,due_date,due_time,completed_at,gmail_link").is("deleted_at", null).is("parent_id", null).limit(opts.done ? 200 : 500);
  wq = opts.done ? wq.eq("status", "done").order("completed_at", { ascending: false, nullsFirst: false }) : wq.neq("status", "done");
  const [{ data: acts, error: e1 }, { data: tasks, error: e2 }] = await Promise.all([cq, wq]);

  const items: WorkItem[] = [];
  for (const a of (acts as any[]) || []) {
    items.push({
      key: "crm:" + a.id, src: "crm", id: a.id, title: a.title || "(không tên)", description: a.description || null, kind: a.type,
      status: a.is_done ? "done" : "todo", doneAt: a.done_at || null, dueAt: a.due_at || null, allDay: false,
      ownerId: a.assignee_id || null, ownerName: a.crm_members?.name || mem.find((m) => m.id === a.assignee_id)?.name || "Chưa giao",
      priority: ["low", "medium", "high"].includes(a.priority) ? a.priority : "medium", list: null,
      customer: a.crm_customers || null, lead: a.lead_id && a.crm_leads ? { id: a.lead_id, title: a.crm_leads.title } : null,
      conversationId: a.conversation_id || null, attachments: Array.isArray(a.attachments) ? a.attachments : [], customerBusy: !!a.customer_busy,
    });
  }
  const myEmail = norm(me.email);
  for (const t of (tasks as any[]) || []) {
    const list = t.list_id ? listById.get(t.list_id) : undefined;
    if (list && isPrivateList(list.name) && norm(t.owner_email) !== myEmail) continue; // việc riêng của người khác
    const owner = byEmail.get(norm(t.owner_email));
    items.push({
      key: "web:" + t.id, src: "web", id: t.id, title: t.title, description: t.notes || null, kind: "web",
      status: t.status === "done" ? "done" : t.status === "doing" ? "doing" : "todo", doneAt: t.completed_at || null,
      dueAt: webDue(t.due_date, t.due_time), allDay: !!t.due_date && !t.due_time,
      ownerId: owner?.id || null, ownerName: owner?.name || String(t.owner_email || "").split("@")[0] || "?",
      priority: webPrio(t.priority), list: list ? { name: list.name, color: list.color } : null, gmailLink: t.gmail_link || null,
    });
  }
  // lists chỉ trả về loại công khai (để chọn khi thêm việc), danh sách riêng chỉ của mình
  const visibleLists = ((lists as TaskList[]) || []).filter((l) => !isPrivateList(l.name) || norm(l.owner_email) === myEmail);
  return { items, members: mem.filter((m) => m.is_active), lists: visibleLists, error: e1?.message || e2?.message || null };
}

/** Kiểm tra quyền sửa 1 việc /congviec: việc trong danh sách "Cá nhân" chỉ chủ sở hữu được sửa */
export async function canTouchWebTask(admin: SupabaseClient, me: Member, id: string) {
  const { data: t } = await admin.from("tasks").select("id,owner_email,list_id,deleted_at").eq("id", id).maybeSingle();
  if (!t || t.deleted_at) return { ok: false as const, status: 404, error: "Không tìm thấy công việc" };
  if (t.list_id) {
    const { data: l } = await admin.from("task_lists").select("name").eq("id", t.list_id).maybeSingle();
    if (l && isPrivateList(l.name) && norm(t.owner_email) !== norm(me.email)) return { ok: false as const, status: 403, error: "Việc cá nhân của người khác" };
  }
  return { ok: true as const, task: t };
}
