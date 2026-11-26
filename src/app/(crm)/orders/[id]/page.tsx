import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { money, dt, ORDER_STATUS } from "@/lib/utils";
import { OrderActions } from "@/components/orders/OrderActions";
export const dynamic = "force-dynamic";
/** Xem lại đơn hàng / báo giá (mở ngay sau khi lưu đơn: ?saved=new|edit&conv=<hội thoại>) */
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; conv?: string }> }) {
  const { id } = await params; const sp = await searchParams; const sb = await supabaseServer();
  const { data: o } = await sb.from("crm_orders").select("*, crm_customers(name,phone,address)").eq("id", id).single(); if (!o) notFound();
  const { data: company } = await sb.from("crm_settings").select("value").eq("key", "company").single();
  const c = company?.value || {};
  const items = (o.items as any[]) || [];
  const hasImg = items.some((it) => it.image);
  return (
    <div className="h-full overflow-auto p-3 md:p-6 print:p-0 print:overflow-visible">
      <OrderActions orderId={o.id} code={o.code} total={money(o.grand_total)} conv={sp.conv || null} saved={sp.saved === "new" || sp.saved === "edit" ? sp.saved : null} />
      <div className="card p-5 md:p-8 max-w-3xl mx-auto print:border-0 print:shadow-none" id="quote">
        <div className="flex flex-wrap gap-3 justify-between border-b-2 border-slate-800 pb-4"><div><div className="text-xl font-bold">{c.name}</div><div className="text-sm text-slate-600">{c.address}<br />ĐT: {c.phone} · {c.website} · MST {c.tax_code}</div></div><div className="text-right"><div className="text-2xl font-black text-blue-700">BÁO GIÁ / ĐƠN HÀNG</div><div className="text-sm">Số: {o.code}<br />Ngày: {dt(o.created_at, "dd/MM/yyyy")}</div></div></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4 text-sm"><div><b>Khách hàng:</b> {o.crm_customers?.name}<br /><b>SĐT:</b> {o.crm_customers?.phone}<br /><b>Địa chỉ:</b> {o.crm_customers?.address || "-"}</div><div><b>Trạng thái:</b> {ORDER_STATUS[o.status] || o.status}<br /><b>Ghi chú:</b> {o.note || "-"}</div></div>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-100"><tr><th className="p-2 text-left w-8">#</th>{hasImg && <th className="p-2 text-left w-20">Ảnh</th>}<th className="p-2 text-left">Sản phẩm</th><th className="p-2 text-right">Đơn giá</th><th className="p-2 text-right">SL</th><th className="p-2 text-right">Thành tiền</th></tr></thead>
          <tbody>{items.map((it, i) => <tr key={i} className="border-b border-slate-100 align-middle"><td className="p-2">{i + 1}</td>{hasImg && <td className="p-2">{it.image ? <a href={it.image} target="_blank" rel="noreferrer" title="Xem ảnh lớn"><img src={it.image} alt="" className="w-16 h-16 rounded-md object-cover border border-slate-200 bg-white" /></a> : <div className="w-16 h-16 rounded-md bg-slate-50" />}</td>}<td className="p-2">{it.name}</td><td className="p-2 text-right whitespace-nowrap">{money(it.unit_price)}</td><td className="p-2 text-right">{it.qty}</td><td className="p-2 text-right whitespace-nowrap">{money(it.amount)}</td></tr>)}</tbody></table></div>
        <div className="sm:ml-auto sm:w-72 text-sm mt-3 space-y-1"><Row k="Tổng tiền hàng" v={money(o.total_amount)} /><Row k="Thuế" v={money(o.tax)} /><Row k="Phí vận chuyển" v={money(o.shipping_fee)} /><Row k="Giảm giá" v={"-" + money(o.total_discount)} /><div className="flex justify-between font-bold text-base border-t border-slate-200 pt-1"><span>Tổng thanh toán</span><span>{money(o.grand_total)}</span></div></div>
        <div className="grid grid-cols-2 text-center text-sm mt-10"><div>Người lập báo giá<br /><br /><br /></div><div>Khách hàng<br /><br /><br /></div></div>
      </div>
      <div className="text-center mt-4 print:hidden text-sm text-slate-500">In: chọn “Lưu dưới dạng PDF” trong hộp thoại in nếu muốn file; hoặc bấm Tải PDF ở trên.</div>
    </div>
  );
}
const Row = ({ k, v }: { k: string; v: string }) => <div className="flex justify-between"><span className="text-slate-500">{k}</span><span>{v}</span></div>;
