import { supabaseServer } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/crm/require-admin";
import { KnowledgeClient } from "@/components/KnowledgeClient";
export const dynamic = "force-dynamic";
export default async function Page() {
  await requireAdmin();
  const sb = await supabaseServer();
  const [{ data: items }, { data: topics }] = await Promise.all([sb.from("crm_knowledge").select("*").order("created_at", { ascending: false }), sb.from("crm_knowledge_topics").select("*").order("sort_order")]);
  return <KnowledgeClient items={items || []} topics={topics || []} />;
}
