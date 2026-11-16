import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentMember } from "@/lib/crm/work-items-server";
import { syncDueFeeds } from "@/lib/crm/gcal-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST — mở trang Công việc thì đồng bộ các lịch Google đã cũ hơn 1 phút (cả nhóm). Trả changed > 0 để trang tải lại. */
export async function POST() {
  const me = await currentMember();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await syncDueFeeds(supabaseAdmin(), 60_000);
  return NextResponse.json({ ok: true, ...r });
}
