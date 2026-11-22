import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentMember } from "@/lib/crm/work-items-server";

/** Tắt / bật AI trực thay cho RIÊNG một hội thoại (mọi nhân viên đang hoạt động). Body: { conversation_id, off } */
export async function POST(req: NextRequest) {
  const me = await currentMember();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const id = typeof body.conversation_id === "string" ? body.conversation_id : "";
  if (!id) return NextResponse.json({ error: "thiếu conversation_id" }, { status: 400 });
  const off = !!body.off;
  const db = supabaseAdmin();
  // tắt → đồng thời bỏ lượt đang chờ trả lời (nếu có)
  const patch = { off, updated_at: new Date().toISOString(), ...(off ? { status: "idle", due_at: null, queued_at: null } : {}) };
  const { data: upd, error } = await db.from("crm_ai_away_state").update(patch).eq("conversation_id", id).select("conversation_id");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!upd?.length) {
    const ins = await db.from("crm_ai_away_state").insert({ conversation_id: id, off });
    if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, off });
}
