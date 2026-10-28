import webpush from "web-push";
import { supabaseAdmin } from "@/lib/supabase/admin";

let configured = false;
async function setup(db: ReturnType<typeof supabaseAdmin>) {
  if (configured) return true;
  const { data } = await db.from("crm_secrets").select("value").eq("key", "vapid").maybeSingle();
  const v = data?.value as { publicKey: string; privateKey: string; subject: string } | undefined;
  if (!v) return false;
  webpush.setVapidDetails(v.subject || "mailto:thled.vn@gmail.com", v.publicKey, v.privateKey);
  configured = true; return true;
}

/** Gửi thông báo đẩy "khách nhắn tin" tới nhân sự. Không ném lỗi — thông báo là best-effort. */
export async function pushNewMessage(db: ReturnType<typeof supabaseAdmin>, p: { conversationId: string; title: string; body: string; icon?: string | null; assignedTo?: string | null; labels?: string[] }) {
  try {
    const { data: st } = await db.from("crm_settings").select("value").eq("key", "notifications").maybeSingle();
    const cfg = (st?.value as any) || {};
    if (cfg.push_enabled === false) return;
    if (!(await setup(db))) return;
    // ai nhận: người được giao (nếu bật only_assigned và đã giao), còn lại mọi nhân sự đang hoạt động; hội thoại nhãn "chỉ admin" → chỉ admin
    let q = db.from("crm_push_subscriptions").select("id,endpoint,keys,member_id,crm_members!inner(role,is_active)");
    if (cfg.only_assigned && p.assignedTo) q = q.eq("member_id", p.assignedTo);
    const { data: subs } = await q;
    let adminOnly = false;
    if (p.labels?.length) { const { data: l } = await db.from("crm_labels").select("name").in("name", p.labels).eq("admin_only", true).limit(1); adminOnly = !!l?.length; }
    const payload = JSON.stringify({ title: p.title, body: p.body.slice(0, 140), icon: p.icon || "/icons/icon-192.png", url: `/inbox?c=${p.conversationId}`, tag: `conv-${p.conversationId}` });
    await Promise.all((subs || []).filter((s: any) => s.crm_members?.is_active && (!adminOnly || s.crm_members?.role === "admin")).map(async (s: any) => {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload, { TTL: 600 }); }
      catch (e: any) { if (e?.statusCode === 404 || e?.statusCode === 410) await db.from("crm_push_subscriptions").delete().eq("id", s.id); }
    }));
  } catch (e) { console.error("push err", e); }
}
