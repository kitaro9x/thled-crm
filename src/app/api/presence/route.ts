import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
/** Heartbeat online (gọi mỗi 60s từ client) — phục vụ phân phối "ưu tiên Online" */
export async function POST() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  await supabaseAdmin().from("crm_members").update({ is_online: true, last_seen_at: new Date().toISOString() }).eq("id", user.id);
  return NextResponse.json({ ok: true });
}
