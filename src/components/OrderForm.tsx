"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { money } from "@/lib/utils";
type Item = { product_id?: number; name: string; unit_price: number; qty: number; amount: number };
export function OrderForm({ lead, person, members }: { lead: any; person: any; members: { id: string; name: string }[] }) {
  const r = useRouter(); const sb = supabaseBrowser();
  const [items, setItems] = useState<Item[]>([{ name: "", unit_price: 0, qty: 1, amount: 0 }]);
  const [tax, setTax] = useState(0); const [ship, setShip] = useState(0); const [disc, setDisc] = useState(0); const [note, setNote] = useState("");
  const [saler, setSaler] = useState(lead?.assigned_to || ""); const [status, setStatus] = useState("new");
  const [search, setSearch] = useState(""); const [found, setFound] = useState<any[]>([]); const [busy, setBusy] = useState(false);
  useEffect(() => { if (search.length < 2) { setFound([]); return; } const t = setTimeout(async () => { const { data } = await sb.from("products").select("id,name,actualPrice,regularPrice,image").ilike("name", `%${search}%`).limit(8); setFound(data || []); }, 300); return () => clearTimeout(t); /* eslint-disable-next-line */ }, [search]);
  const total = items.reduce((a, i) => a + i.amount, 0); const grand = total + tax + ship - disc;
  const upd = (i: number, p: Partial<Item>) => setItems((it) => it.map((x, k) => (k === i ? { ...x, ...p, amount: (p.unit_price ?? x.unit_price) * (p.qty ?? x.qty) } : x)));
  const pick = (p: any) => { setItems((it) => [...it.filter((x) => x.name), { product_id: p.id, name: p.name, unit_price: p.actualPrice || p.regularPrice || 0, qty: 1, amount: p.actualPrice || p.regularPrice || 0 }]); setSearch(""); setFound([]); };
  const save = async () => {
    setBusy(true);
    const { data, error } = await sb.from("crm_orders").insert({ name: person?.name, status, lead_id: lead?.id, person_id: person?.id, saler_id: saler || null, items: items.filter((i) => i.name), total_amount: total, tax, shipping_fee: ship, total_discount: disc, note }).select("id").single();
    setBusy(false); if (error) { alert(error.message); return; }
    r.push(`/orders/${data.id}`);
  };
  return (
    <div className="h-full overflow-auto p-4"><div className="card p-4 max-w-4xl mx-auto space-y-4 text-sm">
      <div className="flex items-center"><b className="text-base">Tạo đơn hàng / báo giá</b>{lead && <span className="chip bg-blue-50 text-blue-700 ml-2">từ cơ hội: {lead.title}</span>}</div>
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-3"><b>Contact Info</b><div className="mt-1">{person ? <>{person.name}<br />{person.phone}<br />{person.address}</> : <span className="text-slate-400">Chưa chọn khách (tạo từ Cơ hội hoặc CDP để tự điền)</span>}</div></div>
        <div className="card p-3 space-y-1"><b>Order Info</b><select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>{["new", "confirmed", "delivering", "done", "cancelled"].map((s) => <option key={s}>{s}</option>)}</select><select className="input" value={saler} onChange={(e) => setSaler(e.target.value)}><option value="">Sale phụ trách</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
        <div className="card p-3"><b>Ghi chú</b><textarea className="input mt-1" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></div>
      </div>
      <div className="relative"><input className="input" placeholder="Tìm sản phẩm trong catalog thled.vn…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {found.length > 0 && <div className="absolute z-10 card w-full shadow-lg max-h-60 overflow-auto">{found.map((p) => <button key={p.id} onClick={() => pick(p)} className="w-full text-left px-3 py-2 hover:bg-slate-50 flex justify-between"><span>{p.name}</span><span className="text-slate-500">{money(p.actualPrice || p.regularPrice)}</span></button>)}</div>}
      </div>
      <table className="w-full"><thead className="bg-slate-50 text-xs text-slate-500 text-left"><tr><th className="p-2">Sản phẩm</th><th className="p-2 w-36">Đơn giá</th><th className="p-2 w-20">SL</th><th className="p-2 w-36 text-right">Thành tiền</th><th className="w-8"></th></tr></thead>
        <tbody>{items.map((it, i) => <tr key={i} className="border-t border-slate-100"><td className="p-1"><input className="input" value={it.name} onChange={(e) => upd(i, { name: e.target.value })} /></td><td className="p-1"><input type="number" className="input" value={it.unit_price} onChange={(e) => upd(i, { unit_price: Number(e.target.value) })} /></td><td className="p-1"><input type="number" className="input" value={it.qty} onChange={(e) => upd(i, { qty: Number(e.target.value) })} /></td><td className="p-1 text-right">{money(it.amount)}</td><td><button className="text-red-500" onClick={() => setItems((x) => x.filter((_, k) => k !== i))}>×</button></td></tr>)}</tbody></table>
      <button className="btn" onClick={() => setItems((x) => [...x, { name: "", unit_price: 0, qty: 1, amount: 0 }])}>+ Dòng</button>
      <div className="ml-auto w-80 space-y-1"><L k="Total Amount">{money(total)}</L><L k="Tax"><input type="number" className="input w-32 text-right" value={tax} onChange={(e) => setTax(Number(e.target.value))} /></L><L k="Shipping Fee"><input type="number" className="input w-32 text-right" value={ship} onChange={(e) => setShip(Number(e.target.value))} /></L><L k="Total Discount"><input type="number" className="input w-32 text-right" value={disc} onChange={(e) => setDisc(Number(e.target.value))} /></L><div className="flex justify-between font-bold text-base border-t pt-1"><span>Grand Total</span><span>{money(grand)}</span></div></div>
      <div className="text-right"><button className="btn btn-primary" onClick={save} disabled={busy}>Lưu đơn hàng</button></div>
    </div></div>
  );
}
const L = ({ k, children }: { k: string; children: React.ReactNode }) => <div className="flex justify-between items-center"><span className="text-slate-500">{k}</span>{children}</div>;
