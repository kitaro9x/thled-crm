"use client";
import { useEffect, useRef, useState } from "react";
import { Sparkles, X, RefreshCw, ImageIcon, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { SafeImg, useElapsed } from "./SafeImg";

export type AiMode = "le" | "thau";
export interface AiImage { url: string; code: string; price?: string | null }
export interface AiSourceRef { path: string; title: string; status: string | null; updated: string | null }
interface SuggestRes { mode: AiMode; model: string; need: string; missing: string; notes: string[]; suggestions: { style: string; text: string; images: AiImage[] }[]; sources: AiSourceRef[] }

const HINTS = ["Báo giá", "Xin SĐT / địa chỉ", "Chốt lịch lắp", "Chăm sóc lại", "Giới thiệu showroom"];
const statusTone = (s: string | null) => (s === "mau-thuan" ? "lchip-red" : s === "on-dinh" ? "lchip-green" : "lchip-amber");

/** Chip nguồn THLED-Brain (tên trang + trạng thái) */
export function SourceChips({ sources }: { sources: AiSourceRef[] }) {
  if (!sources.length) return null;
  return <div className="flex flex-wrap gap-1 items-center text-[11px] text-slate-500"><BookOpen size={11} /> Nguồn:
    {sources.map((s) => <span key={s.path} className={cn("lchip", statusTone(s.status))} title={`${s.path}${s.updated ? " · cập nhật " + s.updated : ""}${s.status ? " · " + s.status : ""}`}>{s.title}</span>)}
  </div>;
}

/**
 * Hàng gợi ý trả lời phía trên ô soạn tin. Bấm "Dùng" → chèn chữ (+ ảnh) vào ô soạn — KHÔNG tự gửi.
 * Chế độ Khách lẻ / Nhà thầu: mặc định server đoán theo nhãn "Thầu", nhân viên đổi được.
 */
export function AiSuggestPanel({ convId, onUse, onClose }: { convId: string; onUse: (text: string, images: AiImage[]) => void; onClose: () => void }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [res, setRes] = useState<SuggestRes | null>(null);
  const [hint, setHint] = useState(""); const [mode, setMode] = useState<AiMode | null>(null);
  const reqId = useRef(0);
  const sec = useElapsed(busy);
  const run = async (h = hint, m = mode) => {
    const id = ++reqId.current; setBusy(true); setErr("");
    try {
      const r = await fetch("/api/ai/suggest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversation_id: convId, hint: h || undefined, mode: m || undefined }) });
      const j = await r.json().catch(() => ({ error: `Lỗi ${r.status}` }));
      if (id !== reqId.current) return;
      if (!r.ok) { setErr(j.error || "AI gợi ý thất bại"); return; }
      setRes(j); if (!m) setMode(j.mode);
    } catch (e: any) { if (id === reqId.current) setErr(e?.message || "Mất kết nối"); }
    finally { if (id === reqId.current) setBusy(false); }
  };
  useEffect(() => { run("", null); return () => { reqId.current++; }; }, [convId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mb-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="flex items-center gap-1 font-semibold text-violet-600 text-xs"><Sparkles size={13} /> AI gợi ý trả lời</span>
        <div className="flex rounded-md border border-slate-200 overflow-hidden text-[11px] ml-1" title="Áp chính sách theo đối tượng khách">
          {(["le", "thau"] as AiMode[]).map((m) => <button key={m} disabled={busy} onClick={() => { setMode(m); run(hint, m); }} className={cn("px-2 py-0.5", mode === m ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-100")}>{m === "le" ? "Khách lẻ" : "Nhà thầu"}</button>)}
        </div>
        <button className="ml-auto p-1 rounded hover:bg-slate-200 text-slate-500" disabled={busy} title="Soạn lại" onClick={() => run()}><RefreshCw size={13} className={cn(busy && "animate-spin")} /></button>
        <button className="p-1 rounded hover:bg-slate-200 text-slate-500" title="Đóng" onClick={onClose}><X size={14} /></button>
      </div>
      <div className="flex gap-1 flex-wrap mt-1.5">
        {HINTS.map((h) => <button key={h} disabled={busy} onClick={() => { const v = hint === h ? "" : h; setHint(v); run(v); }} className={cn("fchip", hint === h && "on")}>{h}</button>)}
        <input className="input py-0.5 text-xs flex-1 min-w-[140px] h-6" placeholder="Hướng khác… (Enter)" disabled={busy}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const v = (e.target as HTMLInputElement).value.trim(); setHint(v); run(v); } }} />
      </div>
      {busy && <div className="text-xs text-slate-500 mt-2 flex items-center gap-1"><Sparkles size={12} className="animate-pulse text-violet-500" /> AI đang đọc hội thoại, tra giá & chính sách… {sec}s</div>}
      {err && <div className="text-xs text-red-600 mt-2">{err}</div>}
      {res && !busy && <div className="mt-2 space-y-1.5">
        {(res.need || res.missing) && <div className="text-[11px] text-slate-500">{res.need && <><b>Khách cần:</b> {res.need}</>}{res.missing && <> · <b>Nên hỏi thêm:</b> {res.missing}</>}</div>}
        {res.notes.length > 0 && <div className="text-[11px] rounded border border-amber-200 bg-amber-50 text-amber-900 px-2 py-1">{res.notes.map((n, i) => <div key={i}>⚠️ {n}</div>)}</div>}
        <div className="grid gap-1.5 md:grid-cols-3">
          {res.suggestions.map((s, i) => <div key={i} className="rounded-md border border-slate-200 bg-white p-2 flex flex-col">
            <div className="text-[11px] font-semibold text-violet-600 mb-0.5">{s.style}</div>
            <div className="text-[13px] whitespace-pre-wrap flex-1">{s.text}</div>
            {s.images.length > 0 && <div className="flex gap-1 mt-1.5 flex-wrap">{s.images.map((im) => <SafeImg key={im.url} src={im.url} alt={im.code} title={`${im.code}${im.price ? " · " + im.price : ""}`} className="w-10 h-10 rounded object-cover border border-slate-200" />)}</div>}
            <div className="flex gap-1 mt-1.5">
              <button className="btn btn-primary px-2 py-0.5 text-xs" style={{ minHeight: 26 }} onClick={() => onUse(s.text, s.images)}>Dùng{s.images.length ? ` + ${s.images.length} ảnh` : ""}</button>
              {s.images.length > 0 && <button className="btn px-2 py-0.5 text-xs" style={{ minHeight: 26 }} title="Chỉ chèn chữ" onClick={() => onUse(s.text, [])}><ImageIcon size={12} className="opacity-40" /> Chỉ chữ</button>}
            </div>
          </div>)}
        </div>
        <SourceChips sources={res.sources} />
        <div className="text-[10px] text-slate-400">Gợi ý do AI soạn — đọc lại giá, bảo hành trước khi gửi. Không tự gửi.</div>
      </div>}
    </div>
  );
}
