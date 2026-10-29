"use client";
import { useState } from "react";
import { Copy, Check, Phone, QrCode } from "lucide-react";
import { Avatar } from "@/components/Avatar";
/** Danh thiếp Zalo được chia sẻ: ảnh, tên, SĐT (gọi / chép), QR Zalo */
export function ContactCard({ c }: { c: { name?: string; phone?: string; avatar?: string | null; qr?: string | null } }) {
  const [ok, setOk] = useState(false); const [showQr, setShowQr] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(c.phone || ""); setOk(true); setTimeout(() => setOk(false), 1500); } catch {} };
  return <div className="w-[280px] max-w-full rounded-xl bg-white text-slate-800 border border-slate-200 p-3">
    <div className="flex items-center gap-3"><Avatar src={c.avatar} name={c.name} size={44} /><div className="min-w-0"><div className="text-[11px] text-slate-400">Danh thiếp</div><div className="font-semibold truncate">{c.name || "—"}</div>{c.phone && <a href={`tel:${c.phone}`} className="text-blue-600 font-medium tracking-wide">{c.phone}</a>}</div></div>
    {(c.phone || c.qr) && <div className="flex gap-2 mt-2">
      {c.phone && <button onClick={copy} className="btn px-2 py-1 text-xs flex items-center gap-1">{ok ? <Check size={12} /> : <Copy size={12} />}{ok ? "Đã chép" : "Chép SĐT"}</button>}
      {c.phone && <a href={`tel:${c.phone}`} className="btn px-2 py-1 text-xs flex items-center gap-1"><Phone size={12} />Gọi</a>}
      {c.qr && <button onClick={() => setShowQr(!showQr)} className="btn px-2 py-1 text-xs flex items-center gap-1"><QrCode size={12} />QR Zalo</button>}
    </div>}
    {showQr && c.qr && <img src={c.qr} alt="QR Zalo" className="w-40 h-40 mt-2 rounded border" />}
  </div>;
}
