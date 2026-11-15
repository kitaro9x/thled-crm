import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentMember, isPrivateList } from "@/lib/crm/work-items-server";
import { pushToMember } from "@/lib/crm/push";

/**
 * POST /api/tasks — thêm việc vào bảng `tasks` (trang thled.vn/congviec) từ mục Công việc của CRM.
 * { title, owner_id?, due_date? (YYYY-MM-DD), due_time? (HH:mm), list_id?, notes? }
 * Chủ việc (owner_email) = email của người được giao → hiện cả trên /congviec của người đó.
 */
export async function POST(req: NextRequest) {
  const me = await currentMember();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const title = String(b.title || "").trim();
  if (!title) return NextResponse.json({ error: "Thiếu tên công việc" }, { status: 422 });
  const admin = supabaseAdmin();

  let owner = me;
  if (b.owner_id && b.owner_id !== me.id) {
    const { data } = await admin.from("crm_members").select("id,name,email,role,is_active").eq("id", b.owner_id).maybeSingle();
    if (!data?.is_active) return NextResponse.json({ error: "Không tìm thấy nhân sự" }, { status: 422 });
    owner = data as typeof me;
  }
  if (!owner.email) return NextResponse.json({ error: `${owner.name} chưa có email trong Cài đặt → Nhân sự` }, { status: 422 });

  const due_date = /^\d{4}-\d{2}-\d{2}$/.test(b.due_date || "") ? b.due_date : null;
  const due_time = due_date && /^\d{2}:\d{2}$/.test(b.due_time || "") ? b.due_time + ":00" : null;
  let list_id: string | null = null;
  if (b.list_id) {
    const { data: l } = await admin.from("task_lists").select("id,name,owner_email").eq("id", b.list_id).maybeSingle();
    // danh sách riêng ("Cá nhân") chỉ được dùng cho việc của chính chủ danh sách
    if (l && !(isPrivateList(l.name) && l.owner_email?.toLowerCase() !== owner.email.toLowerCase())) list_id = l.id;
  }

  const { data, error } = await admin.from("tasks").insert({
    owner_email: owner.email.toLowerCase(), title: title.slice(0, 500), notes: b.notes ? String(b.notes).slice(0, 4000) : null,
    status: "todo", priority: 0, due_date, due_time, list_id, source: "web", // giữ đúng giá trị /congviec dùng (ràng buộc tasks_source_check)
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (owner.id !== me.id) {
    const when = due_date ? ` · hạn ${due_date.slice(8, 10)}/${due_date.slice(5, 7)}${due_time ? " " + due_time.slice(0, 5) : ""}` : "";
    await pushToMember(admin, owner.id, { title: `📋 ${me.name} giao việc`, body: title + when, url: "/activities", tag: `task-${data.id}` }).catch(() => {});
  }
  return NextResponse.json({ ok: true, id: data.id });
}
