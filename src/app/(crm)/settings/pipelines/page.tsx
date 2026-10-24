import { supabaseServer } from "@/lib/supabase/server";
import { PipelinesClient } from "@/components/settings/PipelinesClient";
export const dynamic = "force-dynamic";
export default async function Page() {
  const sb = await supabaseServer();
  const [{ data: pipelines }, { data: stages }, { data: members }] = await Promise.all([sb.from("crm_pipelines").select("*").order("sort_order"), sb.from("crm_stages").select("*").order("sort_order"), sb.from("crm_members").select("id,name")]);
  return <PipelinesClient pipelines={pipelines || []} stages={stages || []} members={members || []} />;
}
