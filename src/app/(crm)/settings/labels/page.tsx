import { supabaseServer } from "@/lib/supabase/server";
import { LabelsClient } from "@/components/settings/LabelsClient";
export const dynamic = "force-dynamic";
export default async function Page() { const sb = await supabaseServer(); const { data } = await sb.from("crm_labels").select("*").order("sort_order"); return <LabelsClient labels={data || []} />; }
