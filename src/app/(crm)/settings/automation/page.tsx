import { supabaseServer } from "@/lib/supabase/server";
import { AutomationClient } from "@/components/settings/AutomationClient";
export const dynamic = "force-dynamic";
export default async function Page() {
  const sb = await supabaseServer();
  const [p, st, ru, m, sq, sc] = await Promise.all([sb.from("crm_pipelines").select("*").order("sort_order"), sb.from("crm_stages").select("*").order("sort_order"), sb.from("crm_automation_rules").select("*").order("sort_order"), sb.from("crm_members").select("id,name,zalo_uid"), sb.from("crm_sequences").select("id,name"), sb.from("crm_scoring_rules").select("*")]);
  return <AutomationClient pipelines={p.data || []} stages={st.data || []} rules={ru.data || []} members={m.data || []} sequences={sq.data || []} scoring={sc.data || []} />;
}
