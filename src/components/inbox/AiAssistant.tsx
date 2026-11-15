"use client";
import { useEffect, useRef, useState } from "react";
import { Sparkles, Send, ImagePlus, TextCursorInput, ExternalLink, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { AI_EVENT_ATTACH, AI_EVENT_INSERT, imageName } from "@/lib/ai-config";
import { SourceChips, type AiMode, type AiSourceRef } from "./AiSuggest";
import { SafeImg, useElapsed } from "./SafeImg";

interface Product { code: string; line: string | null; price: string | null; image_url: string | null; url: string | null; specs: Record<string, any> | null; note: string }
interface AskRes { mode: AiMode; answer: string; products: Product[]; notes: string[]; sources: AiSourceRef[] }
interface Turn { q: string; res?: AskRes; err?: string }

const EXAMPLES = ["Quạt trần 1m4 có đèn dưới 4 triệu?", "Bảo hành đèn chùm bao lâu, có lắp tận nhà không?", "Giá thi công LED đuổi cho nhà thầu?"];
const SPEC_LABEL: Record<string, string> = { kich_thuoc: "Kích thước", duong_kinh: "Đường kính", mau_chinh: "Màu", mau_sac: "Màu", dong_co: "Động cơ", den: "Đèn", nguon_sang: "Nguồn sáng", bao_hanh: "BH", bao_hanh_text: "BH", cong_suat: "Công suất" };
const specLine = (s: Record<string, any> | null) => s ? Object.entries(SPEC_LABEL).map(([k, l]) => (s[k] ? `${l}: ${s[k]}` : null)).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).slice(0, 3).join(" · ") : "";
/** số lượt hỏi đáp gần nhất gửi kèm để AI hiểu câu hỏi tiếp theo */
const HISTORY_TURNS = 4;

/**
 * Trợ lý AI ở cột phải — khung chat: nhân viên hỏi giá / mẫu / ảnh / chính sách và HỎI TIẾP (AI nhớ các câu trước).
 * Thẻ sản phẩm lấy giá + ảnh thật từ DB. Đổi hội thoại (PersonPanel remount) hoặc bấm "Hỏi mới" → xoá lịch sử.
 */
export function AiAssistant({ convId }: { convId?: string }) {
  const [q, setQ] = useState(""); const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]); const [mode, setMode] = useState<AiMode | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const sec = useElapsed(busy);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (turns.length) endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [turns.length, busy]);

  const ask = async (question = q, m = mode) => {
    const text = question.trim(); if (!text || busy) return;
    const history = turns.filter((t) => t.res).slice(-HISTORY_TURNS).map((t) => ({ q: t.q, a: t.res!.answer, codes: t.res!.products.map((p) => p.code) }));
    const idx = turns.length;
    setTurns((ts) => [...ts, { q: text }]); setQ(""); setBusy(true);
    const put = (patch: Partial<Turn>) => setTurns((ts) => ts.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
    try {
      const r = await fetch("/api/ai/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: text, conversation_id: convId, mode: m || undefined, history }) });
      const j = await r.json().catch(() => ({ error: `Lỗi ${r.status}` }));
      if (!r.ok) { put({ err: j.error || "AI tra cứu thất bại" }); return; }
      put({ res: j }); if (!m) setMode(j.mode);
    } catch (e: any) { put({ err: e?.message || "Mất kết nối" }); }
    finally { setBusy(false); }
  };
  const reset = () => { setTurns([]); setDone({}); setQ(""); };
  const attach = (k: string, p: Product) => { if (!p.image_url) return; window.dispatchEvent(new CustomEvent(AI_EVENT_ATTACH, { detail: { url: p.image_url, name: imageName(p.code, p.image_url) } })); setDone((d) => ({ ...d, [k + ":img"]: "✓" })); };
  const insert = (k: string, p: Product) => { window.dispatchEvent(new CustomEvent(AI_EVENT_INSERT, { detail: { text: `Mẫu ${p.code}${p.price ? ` giá ${p.price}` : ""}${specLine(p.specs) ? ` (${specLine(p.specs)})` : ""}` } })); setDone((d) => ({ ...d, [k + ":txt"]: "✓" })); };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 text-xs font-semibold text-violet-600"><Sparkles size={13} /> Trợ lý AI — hỏi đáp giá, ảnh, chính sách
        {turns.length > 0 && <button className="ml-auto p-0.5 rounded text-slate-500 hover:bg-slate-100 font-normal flex items-center gap-0.5 text-[10px]" disabled={busy} onClick={reset} title="Xoá cuộc hỏi đáp, bắt đầu câu hỏi mới"><RotateCcw size={11} /> Hỏi mới</button>}
        <div className={cn("flex rounded-md border border-slate-200 overflow-hidden text-[10px] font-normal", !turns.length && "ml-auto")}>
          {(["le", "thau"] as AiMode[]).map((m) => <button key={m} onClick={() => setMode(m)} className={cn("px-1.5 py-0.5", mode === m ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-100")}>{m === "le" ? "Lẻ" : "Thầu"}</button>)}
        </div>
      </div>

      {turns.map((t, ti) => <div key={ti} className="space-y-1.5">
        <div className="flex justify-end"><div className="max-w-[90%] rounded-lg rounded-br-sm bg-blue-600 text-white px-2 py-1 text-xs whitespace-pre-wrap">{t.q}</div></div>
        {t.err && <div className="text-xs text-red-600">{t.err}</div>}
        {t.res && <>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs whitespace-pre-wrap">{t.res.answer}</div>
          {t.res.notes.length > 0 && <div className="text-[11px] rounded border border-amber-200 bg-amber-50 text-amber-900 px-2 py-1">{t.res.notes.map((n, i) => <div key={i}>⚠️ {n}</div>)}</div>}
          {t.res.products.map((p) => { const k = `${ti}:${p.code}`; return <div key={k} className="flex gap-2 rounded-md border border-slate-200 bg-white p-1.5">
            <a href={p.image_url || undefined} target="_blank" rel="noreferrer" className="shrink-0" title="Mở ảnh lớn"><SafeImg src={p.image_url} alt={p.code} className="w-16 h-16 rounded object-cover border border-slate-100" /></a>
            <div className="min-w-0 flex-1 text-xs">
              <div className="font-semibold truncate">{p.code} {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="inline-block align-middle text-slate-400 hover:text-blue-600" title="Xem trên thled.vn"><ExternalLink size={11} /></a>}</div>
              <div className={cn("font-semibold", p.price ? "text-blue-700" : "text-amber-700")}>{p.price || "Chưa có giá — hỏi quản lý"}</div>
              <div className="text-[11px] text-slate-500 truncate" title={specLine(p.specs)}>{p.line}{specLine(p.specs) ? " · " + specLine(p.specs) : ""}</div>
              {p.note && <div className="text-[11px] text-slate-600 line-clamp-2">{p.note}</div>}
              <div className="flex gap-1 mt-1">
                {p.image_url && <button className="btn px-1.5 py-0 text-[11px]" style={{ minHeight: 24 }} onClick={() => attach(k, p)} title="Đính kèm ảnh vào ô soạn tin"><ImagePlus size={12} /> {done[k + ":img"] || "Ảnh"}</button>}
                <button className="btn px-1.5 py-0 text-[11px]" style={{ minHeight: 24 }} onClick={() => insert(k, p)} title="Chèn mã + giá vào ô soạn tin"><TextCursorInput size={12} /> {done[k + ":txt"] || "Chèn"}</button>
              </div>
            </div>
          </div>; })}
          <SourceChips sources={t.res.sources} />
        </>}
      </div>)}
      {busy && <div className="text-xs text-slate-500 flex items-center gap-1"><Sparkles size={12} className="animate-pulse text-violet-500" /> AI đang tra cứu… {sec}s</div>}
      <div ref={endRef} />

      <div className="flex gap-1">
        <textarea className="input resize-none text-xs" rows={2} disabled={busy}
          placeholder={turns.length ? "Hỏi tiếp… (AI nhớ các câu trước, vd: thế loại 1m5 thì sao?)" : "Hỏi AI: giá THLED-7980? quạt có đèn 1m5? bảo hành đèn vách?"}
          value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }} />
        <button className="btn btn-primary px-2 self-stretch" disabled={busy || !q.trim()} onClick={() => ask()} title="Gửi (Enter)"><Send size={14} /></button>
      </div>
      {!turns.length && !busy && <div className="flex flex-wrap gap-1">{EXAMPLES.map((x) => <button key={x} className="fchip text-[11px]" onClick={() => ask(x)}>{x}</button>)}</div>}
    </div>
  );
}
