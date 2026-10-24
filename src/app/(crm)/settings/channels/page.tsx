import { supabaseServer } from "@/lib/supabase/server";
import { ChannelsClient } from "@/components/settings/ChannelsClient";
export const dynamic = "force-dynamic";
export default async function Page() {
  const sb = await supabaseServer();
  const [{ data: channels }, { data: worker }] = await Promise.all([sb.from("crm_v_channels").select("*").order("created_at"), sb.from("crm_zalo_worker").select("*").eq("id", 1).maybeSingle()]);
  return <ChannelsClient channels={channels || []} worker={worker} appId={process.env.FB_APP_ID || ""} />;
}
