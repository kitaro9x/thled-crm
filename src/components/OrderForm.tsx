"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Plus, Search, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image";
import { cn, money, ORDER_STATUS } from "@/lib/utils";
import type { ProductPick } from "@/app/api/products/search/route";

/** 1 dòng hàng lưu trong crm_orders.items (jsonb) — image: ảnh minh hoạ (catalogue thled.vn hoặc ảnh tự tải lên) */
export type OrderItem = { product_id?: number | null; code?: string | null; name: string; unit_price: number; qty: number; amount: number; image?: string | null };
type Row = OrderItem & { _k: string }; // _k: khoá ổn định cho React + tải ảnh đúng dòng (không lưu DB)
const uid = () => Math.random().toString(36).slice(2, 10);
/** bỏ khoá nội bộ _k trước khi lưu DB */
const stripRow = (r: Row): OrderItem => { const x: Partial<Row> = { ...r }; delete x._k; return { ...(x as OrderItem), name: r.name.trim() }; };
const toRow = (x: Partial<OrderItem>): Row => { const unit_price = Number(x.unit_price) || 0, qty = Number(x.qty ?? 1) || 0; return { product_id: x.product_id ?? null, code: x.code ?? null, name: x.name || "", unit_price, qty, amount: Math.round(unit_price * qty), image: x.image || null, _k: uid() }; };
const apptLabel = { meeting: "Hẹn khảo sát / lắp đặt / giao hàng", call: "Hẹn gọi lại", follow_up: "Nhắc chăm sóc" };

/**
 * Form đơn hàng / báo giá. Có `order` → chế độ SỬA (cập nhật đơn cũ), không có → tạo mới.
 * Lưu xong → mở trang xem lại đơn (/orders/[id]?saved=1) để kiểm tra trước khi in / gửi khách.
 */
export function OrderForm({ lead, person, members, conversationId, meId, order }: { lead: any; person: any; members: { id: string; name: string }[]; conversationId?: string | null; meId?: string | null; order?: any | null }) {
  const r = useRouter(); const sb = supabaseBrowser();
  const editing = !!order?.id;
  // lịch hẹn với khách (tạo kèm đơn → hiện ở Công việc, nhắc theo giờ) — mặc định KHÔNG, chỉ bật khi cần
  const [apptOn, setApptOn] = useState(false); const [apptType, setApptType] = useState<keyof typeof apptLabel>("meeting");
  const [apptAt, setApptAt] = useState(""); const [apptTitle, setApptTitle] = useState(""); const [apptNote, setApptNote] = useState("");
  const [address, setAddress] = useState(person?.address || "");
  const [items, setItems] = useState<Row[]>(() => (Array.isArray(order?.items) && order.items.length ? order.items.map(toRow) : [toRow({})]));
  const [tax, setTax] = useState(Number(order?.tax) || 0); const [ship, setShip] = useState(Number(order?.shipping_fee) || 0); const [disc, setDisc] = useState(Number(order?.total_discount) || 0);
  const [note, setNote] = useState(order?.note || "");
  const [saler, setSaler] = useState(order?.saler_id || lead?.assigned_to || meId || ""); const [status, setStatus] = useState(order?.status || "new");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");

  // tìm sản phẩm: catalogue thled.vn (có ảnh) + bảng products cũ
  const [search, setSearch] = useState(""); const [found, setFound] = useState<ProductPick[] | null>(null); const [searching, setSearching] = useState(false);
  const searchBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const s = search.trim(); if (s.length < 2) { setFound(null); return; }
    const ac = new AbortController();
    const t = setTimeout(async () => {
      setSearching(true);
      try { const res = await fetch(`/api/products/search?q=${encodeURIComponent(s)}`, { signal: ac.signal }); const j = await res.json(); setFound(j.items || []); }
      catch { /* huỷ do gõ tiếp */ } finally { setSearching(false); }
    }, 300);
    return () => { clearTimeout(t); ac.abort(); };
  }, [search]);
  useEffect(() => {
    if (found === null) return;
    const onDown = (e: MouseEvent) => { if (searchBox.current && !searchBox.current.contains(e.target as Node)) setFound(null); };
    document.addEventListener("mousedown", onDown); return () => document.removeEventListener("mousedown", onDown);
  }, [found]);
  const pick = (p: ProductPick) => { setItems((it) => [...it.filter((x) => x.name.trim()), toRow({ product_id: p.product_id, code: p.code, name: p.name, unit_price: p.price, qty: 1, image: p.image })]); setSearch(""); setFound(null); };

  const upd = (k: string, p: Partial<OrderItem>) => setItems((it) => it.map((x) => (x._k === k ? { ...x, ...p, amount: Math.round((p.unit_price ?? x.unit_price) * (p.qty ?? x.qty)) } : x)));
  const filled = items.filter((i) => i.name.trim());
  const total = filled.reduce((a, i) => a + i.amount, 0); const grand = total + tax + ship - disc;

  // ảnh sản phẩm cho từng dòng: tải lên kho crm-media, luôn chuyển JPEG để PDF hiển thị được
  const fileRef = useRef<HTMLInputElement>(null); const imgTarget = useRef(""); const [uploading, setUploading] = useState<string | null>(null);
  const chooseImage = (k: string) => { imgTarget.current = k; fileRef.current?.click(); };
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = ""; const k = imgTarget.current; if (!f || !k) return;
    if (!f.type.startsWith("image/")) { setErr("Chỉ nhận file ảnh (jpg, png, webp…)"); return; }
    setUploading(k); setErr("");
    try {
      const file = await compressImage(f, { max: 1200, force: true });
      const path = `orders/items/${Date.now()}-${uid()}.jpg`;
      const { error } = await sb.storage.from("crm-media").upload(path, file, { contentType: "image/jpeg", upsert: false });
      if (error) throw error;
      upd(k, { image: sb.storage.from("crm-media").getPublicUrl(path).data.publicUrl });
    } catch (er: any) { setErr("Không tải được ảnh: " + (er?.message || er)); }
    finally { setUploading(null); }
  };

  const save = async () => {
    if (!filled.length) { setErr("Thêm ít nhất 1 sản phẩm vào đơn."); return; }
    setBusy(true); setErr("");
    const payload = { status, saler_id: saler || null, items: filled.map(stripRow), total_amount: total, tax, shipping_fee: ship, total_discount: disc, note };
    let id: string = order?.id;
    if (editing) {
      const { error } = await sb.from("crm_orders").update(payload).eq("id", id);
      if (error) { setBusy(false); setErr("Không lưu được đơn: " + error.message); return; }
    } else {
      const { data, error } = await sb.from("crm_orders").insert({ ...payload, name: person?.name, lead_id: lead?.id, person_id: person?.id, created_by: meId || null }).select("id").single();
      if (error || !data) { setBusy(false); setErr("Không lưu được đơn: " + error?.message); return; }
      id = data.id;
    }
    if (person?.id && address && address !== person.address) await sb.from("crm_customers").update({ address }).eq("id", person.id);
    if (apptOn && apptAt) {
      const title = apptTitle || `${apptLabel[apptType]} — ${person?.name || "khách"}`;
      const { error: aErr } = await sb.from("crm_activities").insert({ type: apptType, title, description: [apptNote, address ? "Địa chỉ: " + address : "", `Đơn hàng: /orders/${id}`].filter(Boolean).join("\n"), lead_id: lead?.id || order?.lead_id || null, person_id: person?.id || null, conversation_id: conversationId || null, assignee_id: saler || meId || null, due_at: new Date(apptAt).toISOString(), priority: "normal", created_by: meId || null });
      if (aErr) alert("Đơn đã lưu nhưng không tạo được lịch hẹn: " + aErr.message);
    }
    // mở trang xem lại đơn vừa lưu (có nút quay lại hội thoại / sửa / in / gửi khách)
    r.push(`/orders/${id}?saved=${editing ? "edit" : "new"}${conversationId ? "&conv=" + conversationId : ""}`);
    r.refresh();
  };
  const cancel = () => (window.history.length > 1 ? r.back() : r.push(conversationId ? `/inbox?c=${conversationId}` : editing ? `/orders/${order.id}` : "/orders"));

  return (
    <div className="h-full overflow-auto p-3 md:p-4"><div className="card p-4 max-w-4xl mx-auto space-y-4 text-sm">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      <div className="flex items-center gap-2 flex-wrap">
        <b className="text-base">{editing ? `Sửa đơn ${order.code || ""}` : "Tạo đơn hàng / báo giá"}</b>
        {lead && <span className="chip bg-blue-50 text-blue-700">từ cơ hội: {lead.title}</span>}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="card p-3"><b>Khách hàng</b><div className="mt-1">{person ? <>{person.name}<br />{person.phone}</> : <span className="text-slate-400">Chưa chọn khách (tạo từ Hội thoại, Cơ hội hoặc CDP để tự điền)</span>}</div></div>
        <div className="card p-3 space-y-1.5"><b>Thông tin đơn</b>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Trạng thái">{Object.entries(ORDER_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <select className="input" value={saler} onChange={(e) => setSaler(e.target.value)} aria-label="Sale phụ trách"><option value="">Sale phụ trách</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
        </div>
        <div className="card p-3"><b>Ghi chú</b><textarea className="input mt-1" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></div>
      </div>
      {person && <div className="card p-3"><b>Địa chỉ giao / lắp đặt</b><input className="input mt-1" placeholder="Số nhà, đường, phường/xã…" value={address} onChange={(e) => setAddress(e.target.value)} /></div>}

      {/* sản phẩm */}
      <div className="space-y-2">
        <div ref={searchBox} className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input className="input" style={{ paddingLeft: 30 }} placeholder="Tìm sản phẩm theo mã hoặc tên (vd THLED-7980, quạt trần 1m4)…" value={search} onChange={(e) => setSearch(e.target.value)} />
          {searching && <Loader2 size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-slate-400" />}
          {found !== null && <div className="absolute z-20 card w-full shadow-lg max-h-80 overflow-auto mt-1">
            {found.length === 0 && !searching && <div className="px-3 py-2 text-slate-500">Không tìm thấy — bấm “Thêm dòng” để nhập tay.</div>}
            {found.map((p) => <button key={p.key} onClick={() => pick(p)} className="w-full text-left px-2 py-1.5 hover:bg-slate-50 flex items-center gap-2.5 border-b border-slate-100 last:border-0">
              <Thumb src={p.image} className="w-10 h-10" />
              <span className="flex-1 min-w-0 truncate">{p.name}</span>
              <span className="text-slate-500 shrink-0 tabular-nums">{p.price ? money(p.price) : p.price_text || "chưa có giá"}</span>
            </button>)}
          </div>}
        </div>

        <div className="rounded-lg border border-slate-200">
          <div className="hidden md:flex items-center gap-2 px-2 py-1.5 bg-slate-50 rounded-t-lg text-xs text-slate-500 font-medium">
            <span className="w-14 shrink-0">Ảnh</span><span className="flex-1">Sản phẩm</span><span className="w-32 text-right">Đơn giá</span><span className="w-16 text-right">SL</span><span className="w-28 text-right">Thành tiền</span><span className="w-7" />
          </div>
          {items.map((it) => <div key={it._k} className="flex flex-wrap md:flex-nowrap items-center gap-2 px-2 py-2 border-t border-slate-100 first:border-t-0 md:first:border-t">
            <div className="relative w-14 h-14 shrink-0">
              {it.image
                ? <button type="button" onClick={() => chooseImage(it._k)} title="Bấm để đổi ảnh" className="block w-14 h-14"><Thumb src={it.image} className="w-14 h-14" /></button>
                : <button type="button" onClick={() => chooseImage(it._k)} title="Thêm ảnh sản phẩm (nếu có)" className="w-14 h-14 rounded-md border border-dashed border-slate-300 grid place-items-center text-slate-400 hover:text-blue-600 hover:border-blue-400 transition-colors">{uploading === it._k ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={18} />}</button>}
              {it.image && uploading !== it._k && <button type="button" title="Bỏ ảnh" onClick={() => upd(it._k, { image: null })} className="absolute -top-1.5 -right-1.5 rounded-full border border-slate-200 bg-white p-0.5 text-slate-500 hover:text-red-600 shadow-sm"><X size={11} /></button>}
              {it.image && uploading === it._k && <div className="absolute inset-0 grid place-items-center rounded-md bg-black/40 text-white"><Loader2 size={16} className="animate-spin" /></div>}
            </div>
            <input className="input flex-1 min-w-[150px]" placeholder="Tên sản phẩm / mô tả" value={it.name} onChange={(e) => upd(it._k, { name: e.target.value })} />
            <div className="flex items-center gap-2 w-full md:w-auto pl-16 md:pl-0">
              <MoneyInput className="w-32" value={it.unit_price} onChange={(v) => upd(it._k, { unit_price: v })} aria-label="Đơn giá" />
              <div className="w-16 shrink-0"><input type="number" min={0} step="any" className="input text-right" value={it.qty} onChange={(e) => upd(it._k, { qty: Number(e.target.value) })} aria-label="Số lượng" /></div>
              <div className="w-28 text-right font-medium tabular-nums ml-auto md:ml-0">{money(it.amount)}</div>
              <button type="button" className="w-7 h-7 grid place-items-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50" title="Xoá dòng" onClick={() => setItems((x) => (x.length > 1 ? x.filter((y) => y._k !== it._k) : [toRow({})]))}><X size={15} /></button>
            </div>
          </div>)}
        </div>
        <button className="btn" onClick={() => setItems((x) => [...x, toRow({})])}><Plus size={14} /> Thêm dòng (nhập tay)</button>
      </div>

      <div className="md:ml-auto md:w-80 space-y-1.5">
        <L k="Tổng tiền hàng"><span className="tabular-nums">{money(total)}</span></L>
        <L k="Thuế (VAT)"><MoneyInput className="w-36" value={tax} onChange={setTax} /></L>
        <L k="Phí vận chuyển"><MoneyInput className="w-36" value={ship} onChange={setShip} /></L>
        <L k="Giảm giá"><MoneyInput className="w-36" value={disc} onChange={setDisc} /></L>
        <div className="flex justify-between font-bold text-base border-t border-slate-200 pt-1.5"><span>Tổng thanh toán</span><span className="tabular-nums">{money(grand)}</span></div>
      </div>

      <div className="card p-3 space-y-2">
        <label className="flex items-center gap-2 font-semibold cursor-pointer select-none"><input type="checkbox" checked={apptOn} onChange={(e) => setApptOn(e.target.checked)} />{editing ? "Thêm lịch hẹn với khách" : "Lịch hẹn với khách"}<span className="font-normal text-xs text-slate-500">(tuỳ chọn)</span></label>
        {apptOn && <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <select className="input" value={apptType} onChange={(e) => setApptType(e.target.value as keyof typeof apptLabel)}>{(Object.keys(apptLabel) as (keyof typeof apptLabel)[]).map((k) => <option key={k} value={k}>{apptLabel[k]}</option>)}</select>
          <input type="datetime-local" className="input" value={apptAt} onChange={(e) => setApptAt(e.target.value)} />
          <input className="input" placeholder="Tiêu đề (bỏ trống = tự đặt)" value={apptTitle} onChange={(e) => setApptTitle(e.target.value)} />
          <input className="input md:col-span-3" placeholder="Ghi chú hẹn: khung giờ khách rảnh, cần mang gì…" value={apptNote} onChange={(e) => setApptNote(e.target.value)} />
          {!apptAt && <div className="text-xs text-amber-700 md:col-span-3">Chọn ngày giờ để tạo lịch hẹn (hiện ở mục Công việc của người phụ trách).</div>}
        </div>}
      </div>

      {err && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700">{err}</div>}
      <div className="flex justify-end gap-2">
        <button className="btn" onClick={cancel} disabled={busy}>Huỷ</button>
        <button className="btn btn-primary" onClick={save} disabled={busy || !!uploading}>{busy ? "Đang lưu…" : `${editing ? "Lưu thay đổi" : "Lưu đơn hàng"}${apptOn && apptAt ? " + lịch hẹn" : ""}`}</button>
      </div>
    </div></div>
  );
}
const L = ({ k, children }: { k: string; children: React.ReactNode }) => <div className="flex justify-between items-center gap-3"><span className="text-slate-500 whitespace-nowrap">{k}</span>{children}</div>;

/** Ô nhập tiền: hiện dấu chấm nghìn (1.250.000), lưu số. className = độ rộng khung bọc (.input luôn rộng 100% nên không đặt w-* trực tiếp lên ô) */
function MoneyInput({ value, onChange, className, ...rest }: { value: number; onChange: (v: number) => void; className?: string; "aria-label"?: string }) {
  return <div className={cn("shrink-0", className)}><input {...rest} type="text" inputMode="numeric" className="input text-right tabular-nums" value={value ? value.toLocaleString("vi-VN") : ""} placeholder="0"
    onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, "")) || 0)} /></div>;
}

/** Ảnh nhỏ sản phẩm; lỗi tải / không có ảnh → ô trống nhạt */
function Thumb({ src, className }: { src?: string | null; className?: string }) {
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [src]);
  if (!src || bad) return <div className={cn("rounded-md bg-slate-100 grid place-items-center text-slate-400 shrink-0", className)}><ImagePlus size={14} /></div>;
  return <img src={src} alt="" loading="lazy" onError={() => setBad(true)} className={cn("rounded-md object-cover border border-slate-200 bg-white shrink-0", className)} />;
}
