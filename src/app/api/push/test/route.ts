import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import webpush from "web-push";
/** Gửi 1 thông báo thử tới chính người bấm */
export async function POST() {
  const sb = await supabaseServer(); const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = supabaseAdmin();
  const { data: v } = await db.from("crm_secrets").select("value").eq("key", "vapid").maybeSingle();
  const k = v?.value as any; webpush.setVapidDetails(k.subject, k.publicKey, k.privateKey);
  const { data: subs } = await db.from("crm_push_subscriptions").select("endpoint,keys").eq("member_id", user.id);
  let ok = 0; for (const s of subs || []) { try { await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys as any }, JSON.stringify({ title: "THLED CRM", body: "Thông báo đẩy đang hoạt động ✅", url: "/inbox", tag: "test" })); ok++; } catch {} }
  return NextResponse.json({ ok: true, sent: ok, devices: subs?.length || 0 });
}
