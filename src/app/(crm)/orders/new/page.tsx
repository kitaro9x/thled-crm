import { supabaseServer } from "@/lib/supabase/server";
import { OrderForm } from "@/components/OrderForm";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ lead?: string; person?: string }> }) {
  const sp = await searchParams; const sb = await supabaseServer();
  const lead = sp.lead ? (await sb.from("crm_v_leads").select("*").eq("id", sp.lead).single()).data : null;
  const personId = sp.person || lead?.person_id;
  const person = personId ? (await sb.from("crm_customers").select("id,name,phone,address").eq("id", personId).single()).data : null;
  const { data: members } = await sb.from("crm_members").select("id,name").eq("is_active", true);
  return <OrderForm lead={lead} person={person} members={members || []} />;
}
