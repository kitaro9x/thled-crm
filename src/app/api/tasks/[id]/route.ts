import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentMember, canTouchWebTask } from "@/lib/crm/work-items-server";

/** PATCH /api/tasks/:id — đánh dấu xong / chưa xong 1 việc của trang /congviec. { done: boolean } */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await currentMember();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  if (typeof b.done !== "boolean") return NextResponse.json({ error: "Thiếu done" }, { status: 422 });
  const admin = supabaseAdmin();
  const chk = await canTouchWebTask(admin, me, id);
  if (!chk.ok) return NextResponse.json({ error: chk.error }, { status: chk.status });
  const { error } = await admin.from("tasks").update({ status: b.done ? "done" : "todo", completed_at: b.done ? new Date().toISOString() : null }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
