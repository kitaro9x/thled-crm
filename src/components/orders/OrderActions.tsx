"use client";
import { useState } from "react";
import { Printer, FileDown, Send } from "lucide-react";
import { ForwardDialog } from "@/components/inbox/ForwardDialog";
/** Thanh nút cho trang đơn hàng: In · Tải PDF · Gửi qua hội thoại */
export function OrderActions({ orderId, code, total }: { orderId: string; code?: string | null; total?: string }) {
  const [file, setFile] = useState<{ url: string; name: string } | null>(null); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");
  const share = async () => {
    setBusy(true); setMsg("");
    const r = await fetch(`/api/orders/${orderId}/pdf`, { method: "POST" }); const j = await r.json(); setBusy(false);
    if (!r.ok) { setMsg("Lỗi tạo PDF: " + j.error); return; }
    setFile(j);
  };
  return <div className="print:hidden max-w-3xl mx-auto mb-3 flex flex-wrap items-center gap-2 text-sm">
    <button className="btn flex items-center gap-1" onClick={() => window.print()}><Printer size={15} />In</button>
    <a className="btn flex items-center gap-1" href={`/api/orders/${orderId}/pdf`}><FileDown size={15} />Tải PDF</a>
    <button className="btn btn-primary flex items-center gap-1" onClick={share} disabled={busy}><Send size={15} />{busy ? "Đang tạo PDF…" : "Gửi qua hội thoại"}</button>
    {msg && <span className="text-emerald-700">{msg}</span>}
    {file && <ForwardDialog excludeId="" text={`THLED gửi anh/chị báo giá ${code || ""}${total ? " · Tổng: " + total : ""}. Anh/chị xem file đính kèm giúp em ạ.`} attachments={[{ type: "file", url: file.url, name: file.name }]} onClose={(sent) => { setFile(null); if (sent) setMsg("Đã gửi báo giá tới " + sent); }} />}
  </div>;
}
