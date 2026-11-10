import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import webpush from "web-push";
import { PUSH_OPTS } from "@/lib/crm/push";
/** Gửi 1 thông báo thử tới chính người bấm (mọi thiết bị đã bật) */
export async function POST() {
  const sb = await supabaseServer(); const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = supabaseAdmin();
  const { data: v } = await db.from("crm_secrets").select("value").eq("key", "vapid").maybeSingle();
  const k = v?.value as { publicKey?: string; privateKey?: string; subject?: string } | undefined;
  if (!k?.publicKey || !k?.privateKey) return NextResponse.json({ ok: false, sent: 0, error: "Server chưa cấu hình khoá VAPID" });
  webpush.setVapidDetails(k.subject || "mailto:thled.vn@gmail.com", k.publicKey, k.privateKey);
  const { data: subs } = await db.from("crm_push_subscriptions").select("id,endpoint,keys").eq("member_id", user.id);
  let ok = 0; let lastErr = "";
  for (const s of subs || []) {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys as any }, JSON.stringify({ title: "THLED CRM", body: "Thông báo đẩy đang hoạt động ✅", url: "/inbox", tag: "test" }), PUSH_OPTS); ok++; }
    catch (e: any) {
      lastErr = e?.statusCode ? `mã ${e.statusCode}` : e?.message || "lỗi";
      if (e?.statusCode === 404 || e?.statusCode === 410) await db.from("crm_push_subscriptions").delete().eq("id", s.id); // thiết bị đã gỡ/hết hạn
    }
  }
  return NextResponse.json({ ok: true, sent: ok, devices: subs?.length || 0, error: ok ? undefined : lastErr || undefined });
}
