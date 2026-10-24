import { supabaseServer } from "@/lib/supabase/server";
import { MembersClient } from "@/components/settings/MembersClient";
export const dynamic = "force-dynamic";
export default async function Page() { const sb = await supabaseServer(); const { data } = await sb.from("crm_members").select("*").order("created_at"); return <MembersClient members={data || []} />; }
