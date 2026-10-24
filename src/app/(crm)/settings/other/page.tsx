import { supabaseServer } from "@/lib/supabase/server";
import { OtherClient } from "@/components/settings/OtherClient";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "phone" } = await searchParams; const sb = await supabaseServer();
  const [{ data: settings }, { data: lost }, { data: emotions }] = await Promise.all([sb.from("crm_settings").select("*"), sb.from("crm_lost_reasons").select("*").order("sort_order"), sb.from("crm_emotions").select("*").order("sort_order")]);
  const s: Record<string, any> = {}; (settings || []).forEach((x) => (s[x.key] = x.value));
  return <OtherClient tab={tab} settings={s} lost={lost || []} emotions={emotions || []} />;
}
