"use client";
import { useEffect, useRef, useState } from "react";
import { BrainCircuit, RefreshCw, Sparkles, X } from "lucide-react";
import type { LessonFields } from "@/lib/lessons";
import { cn } from "@/lib/utils";
import { useElapsed } from "./SafeImg";

const EMPTY: LessonFields = { title: "", situation: "", handling: "", outcome: "", takeaway: "", sample_reply: "", customer_type: null, tags: [] };
const AREAS: { k: "situation" | "handling" | "outcome" | "takeaway" | "sample_reply"; l: string; hint: string; rows: number }[] = [
  { k: "situation", l: "Tình huống", hint: "Khách hỏi / gặp chuyện gì", rows: 3 },
  { k: "handling", l: "Cách xử lý", hint: "Shop đã trả lời, làm gì", rows: 3 },
  { k: "outcome", l: "Kết quả", hint: "Chốt được, hẹn lại, mất khách…", rows: 2 },
  { k: "takeaway", l: "Quy tắc rút ra ⭐", hint: "Khi khách …, nên … vì … (AI luôn đọc phần này)", rows: 2 },
  { k: "sample_reply", l: "Câu trả lời mẫu (tuỳ chọn)", hint: "Câu trả lời hay đáng dùng lại", rows: 3 },
];

/**
 * "Đưa vào Brain": AI chắt hội thoại (hoặc các tin đã chọn) thành 1 bài học đã ẩn danh → người dùng sửa → lưu.
 * Admin lưu là Trợ lý AI dùng ngay; nhân viên khác gửi đề xuất chờ admin duyệt. Bài đã duyệt tự chép sang THLED-Brain (raw/inbox).
 */
export function LessonDialog({ convId, messageIds, onClose }: { convId: string; messageIds?: string[]; onClose: (saved?: { status: string }) => void }) {
  const [f, setF] = useState<LessonFields>(EMPTY); const [tagText, setTagText] = useState("");
  const [busy, setBusy] = useState(true); const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(""); const [note, setNote] = useState("");
  const sec = useElapsed(busy); const reqId = useRef(0);

  const draft = async () => {
    const id = ++reqId.current; setBusy(true); setErr(""); setNote("");
    try {
      const r = await fetch("/api/ai/lessons/draft", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversation_id: convId, message_ids: messageIds?.length ? messageIds : undefined }) });
      const j = await r.json().catch(() => ({ error: `Lỗi ${r.status}` }));
      if (id !== reqId.current) return;
      if (!r.ok) { setErr((j.error || "AI chưa soạn được") + " — anh/chị vẫn có thể tự điền rồi lưu."); return; }
      setF(j.draft); setTagText((j.draft.tags || []).join(", "));
      if (j.worth_keeping === false) setNote(`AI thấy đoạn này ít giá trị để học${j.why_not ? ": " + j.why_not : ""}. Vẫn lưu được nếu anh/chị thấy cần.`);
    } catch (e: any) { if (id === reqId.current) setErr((e?.message || "Mất kết nối") + " — có thể tự điền rồi lưu."); }
    finally { if (id === reqId.current) setBusy(false); }
  };
  useEffect(() => { draft(); return () => { reqId.current++; }; }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setSaving(true); setErr("");
    const tags = tagText.split(",").map((t) => t.trim()).filter(Boolean);
    const r = await fetch("/api/ai/lessons", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...f, tags, conversation_id: convId }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setSaving(false);
    if (!r?.ok) { setErr(j.error || "Lưu thất bại"); return; }
    onClose({ status: j.status });
  };
  const canSave = !busy && !saving && f.title.trim() && (f.takeaway.trim() || f.handling.trim());

  return <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center md:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
    <div className="card w-full md:max-w-xl shadow-2xl max-h-[92dvh] flex flex-col rounded-b-none md:rounded-lg">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
        <BrainCircuit size={18} className="text-violet-500" />
        <div className="flex-1"><b>Đưa vào Brain — bài học từ hội thoại</b><div className="text-[11px] text-slate-500">{messageIds?.length ? `Từ ${messageIds.length} tin đã chọn` : "Từ 80 tin gần nhất của hội thoại"} · AI đã xoá tên, SĐT, địa chỉ khách — kiểm tra lại trước khi lưu</div></div>
        <button className="p-1 rounded hover:bg-slate-100 text-slate-500" disabled={busy} title="AI soạn lại" onClick={draft}><RefreshCw size={15} className={cn(busy && "animate-spin")} /></button>
        <button className="p-1 rounded hover:bg-slate-100 text-slate-500" onClick={() => onClose()} title="Đóng"><X size={16} /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 text-sm">
        {busy && <div className="text-xs text-slate-500 flex items-center gap-1"><Sparkles size={12} className="animate-pulse text-violet-500" /> AI đang đọc hội thoại và chắt bài học… {sec}s</div>}
        {note && <div className="text-xs rounded-md border border-amber-200 bg-amber-50 text-amber-900 px-2 py-1.5">{note}</div>}
        {err && <div className="text-xs text-red-600">{err}</div>}
        <div><div className="text-xs text-slate-500 mb-0.5">Tên bài học</div><input className="input" disabled={busy} maxLength={140} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Vd: Khách chê quạt trần đắt hơn ngoài chợ" /></div>
        {AREAS.map((a) => <div key={a.k}><div className="text-xs text-slate-500 mb-0.5">{a.l}</div><textarea className={cn("input resize-y", a.k === "takeaway" && "border-violet-300")} rows={a.rows} disabled={busy} value={f[a.k]} onChange={(e) => setF({ ...f, [a.k]: e.target.value })} placeholder={a.hint} /></div>)}
        <div className="grid grid-cols-2 gap-2">
          <div><div className="text-xs text-slate-500 mb-0.5">Loại khách</div><select className="input" disabled={busy} value={f.customer_type || ""} onChange={(e) => setF({ ...f, customer_type: (e.target.value || null) as LessonFields["customer_type"] })}><option value="">Chung</option><option value="le">Khách lẻ</option><option value="thau">Nhà thầu</option></select></div>
          <div><div className="text-xs text-slate-500 mb-0.5">Thẻ (cách nhau dấu phẩy)</div><input className="input" disabled={busy} value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="quat-tran, so-gia" /></div>
        </div>
        <p className="text-[11px] text-slate-400">Không ghi giá vốn, chiết khấu nhà cung cấp, tên NCC. Admin lưu là Trợ lý AI dùng ngay; nhân viên lưu thì chờ admin duyệt. Bài đã duyệt tự chép sang THLED-Brain (raw/inbox) để ingest thành wiki.</p>
      </div>
      <div className="flex items-center gap-2 px-4 py-3 border-t border-slate-100">
        <button className="btn" onClick={() => onClose()} disabled={saving}>Huỷ</button>
        <button className="btn btn-primary ml-auto" disabled={!canSave} onClick={save}>{saving ? "Đang lưu…" : "Lưu bài học"}</button>
      </div>
    </div>
  </div>;
}
