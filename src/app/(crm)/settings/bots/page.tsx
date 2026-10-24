import { supabaseServer } from "@/lib/supabase/server";
import { BotsClient } from "@/components/settings/BotsClient";
export const dynamic = "force-dynamic";
export default async function Page() { const sb = await supabaseServer(); const [{ data: bots }, { data: channels }] = await Promise.all([sb.from("crm_comment_bots").select("*").order("created_at"), sb.from("crm_v_channels").select("*").eq("type", "fb_page")]); return <BotsClient bots={bots || []} channels={channels || []} />; }
