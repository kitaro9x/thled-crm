import { supabaseServer } from "@/lib/supabase/server";
import { SequencesClient } from "@/components/settings/SequencesClient";
export const dynamic = "force-dynamic";
export default async function Page() {
  const sb = await supabaseServer();
  const [s, st, k, p, stg, en] = await Promise.all([sb.from("crm_sequences").select("*").order("created_at"), sb.from("crm_sequence_steps").select("*").order("sort_order"), sb.from("crm_knowledge").select("id,title,shortcut").order("title"), sb.from("crm_pipelines").select("*"), sb.from("crm_stages").select("*").order("sort_order"), sb.from("crm_sequence_enrollments").select("sequence_id,status,sent_count")]);
  return <SequencesClient sequences={s.data || []} steps={st.data || []} knowledge={k.data || []} pipelines={p.data || []} stages={stg.data || []} enrollments={en.data || []} />;
}
