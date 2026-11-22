import { supabaseServer } from "@/lib/supabase/server";
import { InboxClient } from "@/components/inbox/InboxClient";
import { aiPublic, mergeAi } from "@/lib/ai-config";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  const [{ data: convs }, { data: labels }, { data: members }, { data: channels }, { data: knowledge }, { data: aiRow }, { data: me }] = await Promise.all([
    sb.from("crm_v_conversations").select("*").eq("is_hidden", false).order("last_message_at", { ascending: false, nullsFirst: false }).limit(200),
    sb.from("crm_labels").select("*").eq("scope", "conversation").order("sort_order"),
    sb.from("crm_members").select("id,name,avatar_url,role,is_online").eq("is_active", true),
    sb.from("crm_v_channels").select("*"),
    sb.from("crm_knowledge").select("id,title,shortcut,content").in("kind", ["message", "text", "faq", "script"]).order("title").limit(300),
    sb.from("crm_settings").select("value").eq("key", "ai").maybeSingle(),
    sb.from("crm_members").select("role").eq("id", user?.id || "00000000-0000-0000-0000-000000000000").maybeSingle(),
  ]);
  return <InboxClient initial={convs || []} labels={labels || []} members={members || []} channels={channels || []} knowledge={knowledge || []} ai={aiPublic(mergeAi(aiRow?.value))} isAdmin={me?.role === "admin"} />;
}
