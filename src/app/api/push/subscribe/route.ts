import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
export async function POST(req: NextRequest) {
  const sb = await supabaseServer(); const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { subscription } = await req.json();
  if (!subscription?.endpoint || !subscription?.keys) return NextResponse.json({ error: "bad subscription" }, { status: 400 });
  const { error } = await supabaseAdmin().from("crm_push_subscriptions").upsert({ member_id: user.id, endpoint: subscription.endpoint, keys: subscription.keys, user_agent: req.headers.get("user-agent"), last_seen_at: new Date().toISOString() }, { onConflict: "endpoint" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
export async function DELETE(req: NextRequest) {
  const sb = await supabaseServer(); const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { endpoint } = await req.json();
  await supabaseAdmin().from("crm_push_subscriptions").delete().eq("endpoint", endpoint).eq("member_id", user.id);
  return NextResponse.json({ ok: true });
}
