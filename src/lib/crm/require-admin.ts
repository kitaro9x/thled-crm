import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
/** Trang chỉ admin: nhân sự khác bị đưa về Hội thoại */
export async function requireAdmin() {
  const sb = await supabaseServer(); const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await sb.from("crm_members").select("role").eq("id", user.id).maybeSingle();
  if (me?.role !== "admin") redirect("/inbox?denied=1");
}
