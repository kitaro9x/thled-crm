import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentMember } from "@/lib/crm/work-items-server";
import { shopPhones } from "@/lib/crm/lessons-server";
import { cleanLesson, type LessonStatus } from "@/lib/lessons";

const ACTIONS: Record<string, LessonStatus> = { approve: "approved", reject: "rejected", off: "off", on: "approved" };

/** Admin duyệt / từ chối / tắt / bật lại / sửa nội dung 1 bài học. Body: { action?, fields? } */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await currentMember();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (me.role !== "admin") return NextResponse.json({ error: "Chỉ admin duyệt bài học" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const db = supabaseAdmin();
  const patch: Record<string, unknown> = {};
  if (body.fields && typeof body.fields === "object") {
    const f = cleanLesson(body.fields, await shopPhones(db));
    if (!f.title) return NextResponse.json({ error: "Thiếu tiêu đề" }, { status: 400 });
    // sửa nội dung → chép lại sang THLED-Brain ở lần đồng bộ sau (thành 1 file inbox mới)
    Object.assign(patch, f, { brain_exported_at: null });
  }
  if (typeof body.action === "string") {
    const status = ACTIONS[body.action];
    if (!status) return NextResponse.json({ error: "action không hợp lệ" }, { status: 400 });
    patch.status = status;
    if (status === "approved") Object.assign(patch, { approved_by: me.id, approved_at: new Date().toISOString() });
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Không có gì để cập nhật" }, { status: 400 });
  const { data, error } = await db.from("crm_ai_lessons").update(patch).eq("id", id).select("id,status").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Không tìm thấy bài học" }, { status: 404 });
  return NextResponse.json({ ok: true, ...data });
}
