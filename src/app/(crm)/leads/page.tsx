import { supabaseServer } from "@/lib/supabase/server";
import { LeadsClient } from "@/components/leads/LeadsClient";
export const dynamic = "force-dynamic";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ pipeline?: string; lead?: string; view?: string }> }) {
  const sp = await searchParams;
  const sb = await supabaseServer();
  const { data: pipelines } = await sb.from("crm_pipelines").select("*").order("sort_order");
  const pipelineId = sp.pipeline || pipelines?.find((p) => p.is_default)?.id || pipelines?.[0]?.id;
  const [{ data: stages }, { data: leads }, { data: members }, { data: lostReasons }] = await Promise.all([
    sb.from("crm_stages").select("*").eq("pipeline_id", pipelineId).order("sort_order"),
    sb.from("crm_v_leads").select("*").eq("pipeline_id", pipelineId).order("created_at", { ascending: false }).limit(1000),
    sb.from("crm_members").select("id,name").eq("is_active", true),
    sb.from("crm_lost_reasons").select("name").order("sort_order"),
  ]);
  return <LeadsClient pipelines={pipelines || []} pipelineId={pipelineId} stages={stages || []} initial={leads || []} members={members || []} lostReasons={(lostReasons || []).map((r) => r.name)} openLead={sp.lead} view={(sp.view as "kanban" | "table") || "kanban"} />;
}
