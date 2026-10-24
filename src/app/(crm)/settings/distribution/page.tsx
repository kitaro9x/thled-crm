import { supabaseServer } from "@/lib/supabase/server";
import { DistributionClient } from "@/components/settings/DistributionClient";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "conversation" } = await searchParams; const sb = await supabaseServer();
  const [r, c, p, m, logs] = await Promise.all([sb.from("crm_distribution_rules").select("*").order("created_at"), sb.from("crm_v_channels").select("*"), sb.from("crm_pipelines").select("*"), sb.from("crm_members").select("*").eq("is_active", true), sb.from("crm_distribution_logs").select("*, crm_members(name)").order("created_at", { ascending: false }).limit(100)]);
  return <DistributionClient tab={tab as any} rules={r.data || []} channels={c.data || []} pipelines={p.data || []} members={m.data || []} logs={logs.data || []} />;
}
