import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { OrderForm } from "@/components/OrderForm";
export const dynamic = "force-dynamic";
/** Sửa đơn hàng / báo giá đã lưu */
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ conv?: string }> }) {
  const { id } = await params; const sp = await searchParams; const sb = await supabaseServer();
  const { data: order } = await sb.from("crm_orders").select("*").eq("id", id).single(); if (!order) notFound();
  const [lead, person, members, auth] = await Promise.all([
    order.lead_id ? sb.from("crm_v_leads").select("*").eq("id", order.lead_id).maybeSingle().then((r) => r.data) : null,
    order.person_id ? sb.from("crm_customers").select("id,name,phone,address").eq("id", order.person_id).maybeSingle().then((r) => r.data) : null,
    sb.from("crm_members").select("id,name").eq("is_active", true).then((r) => r.data || []),
    sb.auth.getUser(),
  ]);
  return <OrderForm order={order} lead={lead} person={person} members={members} conversationId={sp.conv || null} meId={auth.data.user?.id || null} />;
}
