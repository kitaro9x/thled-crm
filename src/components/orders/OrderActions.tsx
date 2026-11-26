"use client";
import { useState } from "react";
import Link from "next/link";
import { Printer, FileDown, Send, Pencil, ArrowLeft, CheckCircle2 } from "lucide-react";
import { ForwardDialog } from "@/components/inbox/ForwardDialog";
/** Thanh nút cho trang đơn hàng: Quay lại hội thoại · Sửa đơn · In · Tải PDF · Gửi qua hội thoại (+ báo "đã lưu" khi vừa lưu đơn) */
export function OrderActions({ orderId, code, total, conv, saved }: { orderId: string; code?: string | null; total?: string; conv?: string | null; saved?: "new" | "edit" | null }) {
  const [file, setFile] = useState<{ url: string; name: string } | null>(null); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");
  const share = async () => {
    setBusy(true); setMsg("");
    const r = await fetch(`/api/orders/${orderId}/pdf`, { method: "POST" }); const j = await r.json(); setBusy(false);
    if (!r.ok) { setMsg("Lỗi tạo PDF: " + j.error); return; }
    setFile(j);
  };
  const q = conv ? `?conv=${conv}` : "";
  return <div className="print:hidden max-w-3xl mx-auto mb-3 space-y-2 text-sm">
    {saved && <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">
      <CheckCircle2 size={16} className="shrink-0" /><span><b>{saved === "edit" ? "Đã lưu thay đổi" : "Đã lưu đơn"} {code}</b> — kiểm tra lại bên dưới trước khi in hoặc gửi khách. Sai chỗ nào bấm <b>Sửa đơn</b>.</span>
    </div>}
    <div className="flex flex-wrap items-center gap-2">
      {conv && <Link className="btn" href={`/inbox?c=${conv}`}><ArrowLeft size={15} />Quay lại hội thoại</Link>}
      <Link className="btn" href={`/orders/${orderId}/edit${q}`}><Pencil size={15} />Sửa đơn</Link>
      <button className="btn" onClick={() => window.print()}><Printer size={15} />In</button>
      <a className="btn" href={`/api/orders/${orderId}/pdf`}><FileDown size={15} />Tải PDF</a>
      <button className="btn btn-primary" onClick={share} disabled={busy}><Send size={15} />{busy ? "Đang tạo PDF…" : "Gửi qua hội thoại"}</button>
      {msg && <span className="text-emerald-700">{msg}</span>}
    </div>
    {file && <ForwardDialog excludeId="" text={`THLED gửi anh/chị báo giá ${code || ""}${total ? " · Tổng: " + total : ""}. Anh/chị xem file đính kèm giúp em ạ.`} attachments={[{ type: "file", url: file.url, name: file.name }]} onClose={(sent) => { setFile(null); if (sent) setMsg("Đã gửi báo giá tới " + sent); }} />}
  </div>;
}
