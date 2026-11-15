"use client";
import { useState } from "react";
import { Sparkles, Search, ImagePlus, TextCursorInput, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { AI_EVENT_ATTACH, AI_EVENT_INSERT } from "@/lib/ai-config";
import { SourceChips, type AiMode, type AiSourceRef } from "./AiSuggest";

interface Product { code: string; line: string | null; price: string | null; image_url: string | null; url: string | null; specs: Record<string, any> | null; note: string }
interface AskRes { mode: AiMode; answer: string; products: Product[]; notes: string[]; sources: AiSourceRef[] }

const EXAMPLES = ["Quạt trần 1m4 có đèn dưới 4 triệu?", "Bảo hành đèn chùm bao lâu, có lắp tận nhà không?", "Giá thi công LED đuổi cho nhà thầu?"];
const SPEC_LABEL: Record<string, string> = { kich_thuoc: "Kích thước", duong_kinh: "Đường kính", mau_chinh: "Màu", mau_sac: "Màu", dong_co: "Động cơ", den: "Đèn", nguon_sang: "Nguồn sáng", bao_hanh: "BH", bao_hanh_text: "BH", cong_suat: "Công suất" };
const specLine = (s: Record<string, any> | null) => s ? Object.entries(SPEC_LABEL).map(([k, l]) => (s[k] ? `${l}: ${s[k]}` : null)).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).slice(0, 3).join(" · ") : "";

/** Trợ lý AI ở cột phải: nhân viên hỏi giá / mẫu / ảnh / chính sách. Thẻ sản phẩm lấy giá + ảnh thật từ DB. */
export function AiAssistant({ convId }: { convId?: string }) {
  const [q, setQ] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const [res, setRes] = useState<AskRes | null>(null); const [mode, setMode] = useState<AiMode | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const ask = async (question = q, m = mode) => {
    if (!question.trim() || busy) return; setBusy(true); setErr(""); setDone({});
    try {
      const r = await fetch("/api/ai/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question, conversation_id: convId, mode: m || undefined }) });
      const j = await r.json().catch(() => ({ error: `Lỗi ${r.status}` }));
      if (!r.ok) { setErr(j.error || "AI tra cứu thất bại"); return; }
      setRes(j); if (!m) setMode(j.mode);
    } catch (e: any) { setErr(e?.message || "Mất kết nối"); }
    finally { setBusy(false); }
  };
  const attach = (p: Product) => { if (!p.image_url) return; window.dispatchEvent(new CustomEvent(AI_EVENT_ATTACH, { detail: { url: p.image_url, name: `${p.code}.jpg` } })); setDone((d) => ({ ...d, [p.code + ":img"]: "✓" })); };
  const insert = (p: Product) => { window.dispatchEvent(new CustomEvent(AI_EVENT_INSERT, { detail: { text: `Mẫu ${p.code}${p.price ? ` giá ${p.price}` : ""}${specLine(p.specs) ? ` (${specLine(p.specs)})` : ""}` } })); setDone((d) => ({ ...d, [p.code + ":txt"]: "✓" })); };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 text-xs font-semibold text-violet-600"><Sparkles size={13} /> Trợ lý AI — tra giá, ảnh, chính sách
        <div className="ml-auto flex rounded-md border border-slate-200 overflow-hidden text-[10px] font-normal">
          {(["le", "thau"] as AiMode[]).map((m) => <button key={m} onClick={() => setMode(m)} className={cn("px-1.5 py-0.5", mode === m ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-100")}>{m === "le" ? "Lẻ" : "Thầu"}</button>)}
        </div>
      </div>
      <div className="flex gap-1">
        <textarea className="input resize-none text-xs" rows={2} placeholder="Hỏi AI: giá THLED-7980? quạt có đèn 1m5? bảo hành đèn vách?" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }} />
        <button className="btn btn-primary px-2 self-stretch" disabled={busy || !q.trim()} onClick={() => ask()} title="Hỏi (Enter)"><Search size={14} /></button>
      </div>
      {!res && !busy && <div className="flex flex-wrap gap-1">{EXAMPLES.map((x) => <button key={x} className="fchip text-[11px]" onClick={() => { setQ(x); ask(x); }}>{x}</button>)}</div>}
      {busy && <div className="text-xs text-slate-500 flex items-center gap-1"><Sparkles size={12} className="animate-pulse text-violet-500" /> AI đang tra cứu…</div>}
      {err && <div className="text-xs text-red-600">{err}</div>}
      {res && !busy && <div className="space-y-2">
        <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs whitespace-pre-wrap">{res.answer}</div>
        {res.notes.length > 0 && <div className="text-[11px] rounded border border-amber-200 bg-amber-50 text-amber-900 px-2 py-1">{res.notes.map((n, i) => <div key={i}>⚠️ {n}</div>)}</div>}
        {res.products.map((p) => <div key={p.code} className="flex gap-2 rounded-md border border-slate-200 bg-white p-1.5">
          {p.image_url ? <img src={p.image_url} alt={p.code} className="w-16 h-16 rounded object-cover shrink-0 border border-slate-100" /> : <div className="w-16 h-16 rounded bg-slate-100 shrink-0 grid place-items-center text-[10px] text-slate-400">không ảnh</div>}
          <div className="min-w-0 flex-1 text-xs">
            <div className="font-semibold truncate">{p.code} {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="inline-block align-middle text-slate-400 hover:text-blue-600" title="Xem trên thled.vn"><ExternalLink size={11} /></a>}</div>
            <div className={cn("font-semibold", p.price ? "text-blue-700" : "text-amber-700")}>{p.price || "Chưa có giá — hỏi quản lý"}</div>
            <div className="text-[11px] text-slate-500 truncate" title={specLine(p.specs)}>{p.line}{specLine(p.specs) ? " · " + specLine(p.specs) : ""}</div>
            {p.note && <div className="text-[11px] text-slate-600 line-clamp-2">{p.note}</div>}
            <div className="flex gap-1 mt-1">
              {p.image_url && <button className="btn px-1.5 py-0 text-[11px]" style={{ minHeight: 24 }} onClick={() => attach(p)} title="Đính kèm ảnh vào ô soạn tin"><ImagePlus size={12} /> {done[p.code + ":img"] || "Ảnh"}</button>}
              <button className="btn px-1.5 py-0 text-[11px]" style={{ minHeight: 24 }} onClick={() => insert(p)} title="Chèn mã + giá vào ô soạn tin"><TextCursorInput size={12} /> {done[p.code + ":txt"] || "Chèn"}</button>
            </div>
          </div>
        </div>)}
        <SourceChips sources={res.sources} />
      </div>}
    </div>
  );
}
