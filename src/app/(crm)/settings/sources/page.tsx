import { supabaseServer } from "@/lib/supabase/server";
import { SourcesClient } from "@/components/settings/SourcesClient";
export const dynamic = "force-dynamic";
export default async function Page() {
  const sb = await supabaseServer();
  const [s, c, p, st, m] = await Promise.all([sb.from("crm_lead_sources").select("*").order("created_at"), sb.from("crm_v_channels").select("*"), sb.from("crm_pipelines").select("*").order("sort_order"), sb.from("crm_stages").select("*").order("sort_order"), sb.from("crm_members").select("id,name")]);
  return <SourcesClient sources={s.data || []} channels={c.data || []} pipelines={p.data || []} stages={st.data || []} members={m.data || []} />;
}
