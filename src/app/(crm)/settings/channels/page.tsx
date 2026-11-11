import { supabaseServer } from "@/lib/supabase/server";
import { Suspense } from "react";
import { ChannelsClient } from "@/components/settings/ChannelsClient";
export const dynamic = "force-dynamic";
export default async function Page() {
  const sb = await supabaseServer();
  const [{ data: channels }, { data: worker }, { data: welcome }] = await Promise.all([sb.from("crm_v_channels").select("*").order("created_at"), sb.from("crm_zalo_worker").select("*").eq("id", 1).maybeSingle(), sb.from("crm_settings").select("value").eq("key", "zalo_welcome").maybeSingle()]);
  return <Suspense><ChannelsClient channels={channels || []} worker={worker} appId={process.env.FB_APP_ID || ""} welcome={welcome?.value || null} /></Suspense>;
}
