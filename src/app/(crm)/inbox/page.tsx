import { supabaseServer } from "@/lib/supabase/server";
import { InboxClient } from "@/components/inbox/InboxClient";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const sb = await supabaseServer();
  const [{ data: convs }, { data: labels }, { data: members }, { data: channels }, { data: knowledge }] = await Promise.all([
    sb.from("crm_v_conversations").select("*").eq("is_hidden", false).order("last_message_at", { ascending: false, nullsFirst: false }).limit(200),
    sb.from("crm_labels").select("*").eq("scope", "conversation").order("sort_order"),
    sb.from("crm_members").select("id,name,avatar_url,role,is_online").eq("is_active", true),
    sb.from("crm_v_channels").select("*"),
    sb.from("crm_knowledge").select("id,title,shortcut,content").eq("kind", "message").limit(200),
  ]);
  return <InboxClient initial={convs || []} labels={labels || []} members={members || []} channels={channels || []} knowledge={knowledge || []} />;
}
