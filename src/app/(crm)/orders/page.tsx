import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { dt, money } from "@/lib/utils";
export const dynamic = "force-dynamic";
export default async function Page() {
  const sb = await supabaseServer();
  const { data } = await sb.from("crm_orders").select("*, crm_customers(name,phone), crm_members!crm_orders_saler_id_fkey(name)").order("created_at", { ascending: false }).limit(300);
  const total = (data || []).reduce((a, o) => a + Number(o.grand_total), 0);
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2 bg-white border-b border-slate-200 flex items-center gap-3"><b>Orders</b><span className="chip bg-slate-100">{data?.length || 0}</span><Link href="/orders/new" className="btn btn-primary ml-auto">+ Order</Link></div>
      <div className="flex-1 overflow-auto p-4">
        <table className="w-full text-sm card bg-white"><thead className="bg-slate-50 text-xs text-slate-500 text-left"><tr><th className="p-2">Order Id</th><th className="p-2">Khách</th><th className="p-2">Status</th><th className="p-2">Sale</th><th className="p-2">Items</th><th className="p-2 text-right">Total</th><th className="p-2">Tạo</th></tr></thead>
          <tbody>{(data || []).map((o: any) => <tr key={o.id} className="border-t border-slate-100 hover:bg-blue-50"><td className="p-2"><Link href={`/orders/${o.id}`} className="text-blue-600 font-medium">{o.code}</Link></td><td className="p-2">{o.crm_customers?.name}<div className="text-xs text-slate-400">{o.crm_customers?.phone}</div></td><td className="p-2"><span className="chip bg-slate-100">{o.status}</span></td><td className="p-2">{o.crm_members?.name || "-"}</td><td className="p-2">{o.items?.length}</td><td className="p-2 text-right">{money(o.grand_total)}</td><td className="p-2 text-slate-500">{dt(o.created_at, "dd/MM/yyyy")}</td></tr>)}</tbody></table>
        <div className="text-right mt-2 text-sm">Tổng đơn: <b>{data?.length || 0}</b> · Tổng tiền: <b>{money(total)}</b></div>
      </div>
    </div>
  );
}
