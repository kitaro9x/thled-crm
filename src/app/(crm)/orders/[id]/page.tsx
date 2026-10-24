import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { money, dt } from "@/lib/utils";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const sb = await supabaseServer();
  const { data: o } = await sb.from("crm_orders").select("*, crm_customers(name,phone,address)").eq("id", id).single(); if (!o) notFound();
  const { data: company } = await sb.from("crm_settings").select("value").eq("key", "company").single();
  const c = company?.value || {};
  return (
    <div className="h-full overflow-auto p-6">
      <div className="card p-8 max-w-3xl mx-auto print:border-0" id="quote">
        <div className="flex justify-between border-b-2 border-slate-800 pb-4"><div><div className="text-xl font-bold">{c.name}</div><div className="text-sm text-slate-600">{c.address}<br />ĐT: {c.phone} · {c.website} · MST {c.tax_code}</div></div><div className="text-right"><div className="text-2xl font-black text-blue-700">BÁO GIÁ / ĐƠN HÀNG</div><div className="text-sm">Số: {o.code}<br />Ngày: {dt(o.created_at, "dd/MM/yyyy")}</div></div></div>
        <div className="grid grid-cols-2 gap-4 py-4 text-sm"><div><b>Khách hàng:</b> {o.crm_customers?.name}<br /><b>SĐT:</b> {o.crm_customers?.phone}<br /><b>Địa chỉ:</b> {o.crm_customers?.address || "-"}</div><div><b>Trạng thái:</b> {o.status}<br /><b>Ghi chú:</b> {o.note || "-"}</div></div>
        <table className="w-full text-sm"><thead className="bg-slate-100"><tr><th className="p-2 text-left">#</th><th className="p-2 text-left">Sản phẩm</th><th className="p-2 text-right">Đơn giá</th><th className="p-2 text-right">SL</th><th className="p-2 text-right">Thành tiền</th></tr></thead>
          <tbody>{(o.items as any[]).map((it, i) => <tr key={i} className="border-b border-slate-100"><td className="p-2">{i + 1}</td><td className="p-2">{it.name}</td><td className="p-2 text-right">{money(it.unit_price)}</td><td className="p-2 text-right">{it.qty}</td><td className="p-2 text-right">{money(it.amount)}</td></tr>)}</tbody></table>
        <div className="ml-auto w-72 text-sm mt-3 space-y-1"><Row k="Tổng tiền hàng" v={money(o.total_amount)} /><Row k="Thuế" v={money(o.tax)} /><Row k="Phí vận chuyển" v={money(o.shipping_fee)} /><Row k="Giảm giá" v={"-" + money(o.total_discount)} /><div className="flex justify-between font-bold text-base border-t pt-1"><span>Tổng thanh toán</span><span>{money(o.grand_total)}</span></div></div>
        <div className="grid grid-cols-2 text-center text-sm mt-10"><div>Người lập báo giá<br /><br /><br /></div><div>Khách hàng<br /><br /><br /></div></div>
      </div>
      <div className="text-center mt-4 print:hidden text-sm text-slate-500">Nhấn Ctrl+P để in hoặc lưu PDF gửi khách</div>
    </div>
  );
}
const Row = ({ k, v }: { k: string; v: string }) => <div className="flex justify-between"><span className="text-slate-500">{k}</span><span>{v}</span></div>;
