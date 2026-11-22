import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentMember } from "@/lib/crm/work-items-server";
import { shopPhones } from "@/lib/crm/lessons-server";
import { pushToMember } from "@/lib/crm/push";
import { cleanLesson } from "@/lib/lessons";

/**
 * Lưu 1 bài học từ hội thoại. Admin lưu → `approved` (Trợ lý AI dùng ngay, GitHub Action của THLED-Brain sẽ kéo về raw/inbox).
 * Nhân viên khác → `pending`, báo admin duyệt ở Cài đặt → Trợ lý AI.
 */
export async function POST(req: NextRequest) {
  const me = await currentMember();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const db = supabaseAdmin();
  const fields = cleanLesson(body, await shopPhones(db));
  if (!fields.title || !(fields.takeaway || fields.handling)) return NextResponse.json({ error: "Cần có tiêu đề và ít nhất phần 'Cách xử lý' hoặc 'Quy tắc rút ra'" }, { status: 400 });
  const isAdmin = me.role === "admin";
  const now = new Date().toISOString();
  const { data, error } = await db.from("crm_ai_lessons").insert({
    ...fields, created_by: me.id, conversation_id: typeof body.conversation_id === "string" ? body.conversation_id : null,
    status: isAdmin ? "approved" : "pending", approved_by: isAdmin ? me.id : null, approved_at: isAdmin ? now : null,
  }).select("id,status").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!isAdmin) {
    const { data: admins } = await db.from("crm_members").select("id").eq("role", "admin").eq("is_active", true);
    await Promise.all((admins || []).map((a) => pushToMember(db, a.id, { title: "Bài học mới chờ duyệt", body: `${me.name}: ${fields.title}`, url: "/settings/ai#lessons", tag: `lesson-${data.id}` })));
  }
  return NextResponse.json({ ok: true, id: data.id, status: data.status });
}
