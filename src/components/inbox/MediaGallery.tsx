"use client";
import { useEffect, useMemo, useState } from "react";
import { X, Image as ImageIcon, Video, FileText, Link2, Download } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Message } from "@/lib/types";
import { cn } from "@/lib/utils";
type Tab = "image" | "video" | "file" | "link";
const dayKey = (iso: string) => { const d = new Date(iso); return d.toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }); };
/** Thư viện ảnh / video / file / link của một khách (gom mọi kênh), theo dòng thời gian */
export function MediaGallery({ ids, onClose, onJump }: { ids: string[]; onClose: () => void; onJump?: (messageId: string) => void }) {
  const [tab, setTab] = useState<Tab>("image"); const [msgs, setMsgs] = useState<Message[]>([]); const [view, setView] = useState<string | null>(null); const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => {
    const sb = supabaseBrowser();
    const [{ data: a }, { data: l }] = await Promise.all([
      sb.from("crm_messages").select("*").in("conversation_id", ids).neq("attachments", "[]").order("sent_at", { ascending: false }).limit(600),
      sb.from("crm_messages").select("*").in("conversation_id", ids).ilike("text", "%http%").order("sent_at", { ascending: false }).limit(300),
    ]);
    const m = new Map<string, Message>(); for (const x of [...(a || []), ...(l || [])] as Message[]) m.set(x.id, x);
    setMsgs(Array.from(m.values()).sort((x, y) => (y.sent_at || "").localeCompare(x.sent_at || ""))); setLoading(false);
  })(); }, [ids.join(",")]); // eslint-disable-line
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") view ? setView(null) : onClose(); }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [view, onClose]);
  // phẳng hoá: mỗi mục = 1 ảnh/video/file/link kèm thời gian & hướng
  const items = useMemo(() => {
    const out: { id: string; msgId: string; kind: Tab; url: string; name?: string; at: string; dir: string }[] = [];
    for (const m of msgs) {
      for (const [i, a] of (m.attachments || []).entries()) { const kind: Tab = a.type === "image" ? "image" : a.type === "video" ? "video" : (a.type as string) === "link" ? "link" : "file"; if (a.type === "sticker") continue; out.push({ id: m.id + "#" + i, msgId: m.id, kind, url: a.url, name: a.name, at: m.sent_at, dir: m.direction }); }
      for (const u of (m.text || "").match(/https?:\/\/[^\s<>"']+/g) || []) out.push({ id: m.id + "@" + u, msgId: m.id, kind: "link", url: u, at: m.sent_at, dir: m.direction });
    }
    return out;
  }, [msgs]);
  const cur = items.filter((x) => x.kind === tab);
  const groups = useMemo(() => { const g = new Map<string, typeof cur>(); for (const x of cur) { const k = dayKey(x.at); g.set(k, [...(g.get(k) || []), x]); } return Array.from(g.entries()); }, [cur]);
  const counts = { image: items.filter((x) => x.kind === "image").length, video: items.filter((x) => x.kind === "video").length, file: items.filter((x) => x.kind === "file").length, link: items.filter((x) => x.kind === "link").length };
  const tabs: { k: Tab; label: string; icon: React.ReactNode }[] = [{ k: "image", label: "Ảnh", icon: <ImageIcon size={14} /> }, { k: "video", label: "Video", icon: <Video size={14} /> }, { k: "file", label: "File", icon: <FileText size={14} /> }, { k: "link", label: "Link", icon: <Link2 size={14} /> }];
  const t = (iso: string) => new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  return <div className="absolute inset-0 z-30 bg-white flex flex-col">
    <div className="h-12 shrink-0 flex items-center gap-2 px-3 border-b border-slate-200"><b>Thư viện</b><div className="flex gap-1 ml-2">{tabs.map((x) => <button key={x.k} onClick={() => setTab(x.k)} className={cn("chip gap-1 cursor-pointer", tab === x.k ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600")}>{x.icon}{x.label} {counts[x.k] > 0 && <span className="opacity-80">{counts[x.k]}</span>}</button>)}</div><button onClick={onClose} className="ml-auto p-1 rounded hover:bg-slate-100"><X size={18} /></button></div>
    <div className="flex-1 overflow-y-auto p-3 space-y-4">
      {loading && <div className="text-slate-400 text-sm">Đang tải…</div>}
      {!loading && groups.length === 0 && <div className="text-slate-400 text-sm text-center py-10">Chưa có {tabs.find((x) => x.k === tab)?.label.toLowerCase()} nào trong hội thoại này</div>}
      {groups.map(([day, list]) => <div key={day}>
        <div className="text-xs font-semibold text-slate-500 mb-2 sticky top-0 bg-white py-1">{day} <span className="font-normal text-slate-400">· {list.length}</span></div>
        {tab === "image" && <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1.5">{list.map((x) => <button key={x.id} onClick={() => setView(x.url)} className="relative aspect-square overflow-hidden rounded-md bg-slate-100 group"><img src={x.url} alt="" loading="lazy" className="w-full h-full object-cover" /><span className={cn("absolute bottom-0 inset-x-0 text-[10px] px-1 py-0.5 text-white bg-black/40 opacity-0 group-hover:opacity-100", x.dir === "out" && "text-emerald-200")}>{x.dir === "out" ? "Mình" : "Khách"} · {t(x.at)}</span></button>)}</div>}
        {tab === "video" && <div className="grid grid-cols-2 md:grid-cols-3 gap-2">{list.map((x) => <div key={x.id} className="rounded-md overflow-hidden bg-black"><video src={x.url} controls preload="metadata" className="w-full max-h-48" /><div className="text-[10px] text-slate-300 px-1 py-0.5">{x.dir === "out" ? "Mình" : "Khách"} · {t(x.at)}</div></div>)}</div>}
        {tab === "file" && <div className="space-y-1">{list.map((x) => <a key={x.id} href={x.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-slate-100 hover:bg-slate-50 text-sm"><FileText size={16} className="text-slate-400 shrink-0" /><span className="truncate flex-1">{x.name || x.url.split("/").pop()}</span><span className="text-[11px] text-slate-400">{x.dir === "out" ? "Mình" : "Khách"} · {t(x.at)}</span><Download size={14} className="text-slate-400" /></a>)}</div>}
        {tab === "link" && <div className="space-y-1">{list.map((x) => <a key={x.id} href={x.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-slate-100 hover:bg-slate-50 text-sm"><Link2 size={14} className="text-slate-400 shrink-0" /><span className="truncate flex-1 text-blue-600">{x.url}</span><span className="text-[11px] text-slate-400">{x.dir === "out" ? "Mình" : "Khách"} · {t(x.at)}</span></a>)}</div>}
      </div>)}
    </div>
    {view && <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setView(null)}>
      <img src={view} alt="" className="max-w-full max-h-full object-contain" />
      <a href={view} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="absolute top-3 right-14 text-white bg-white/10 rounded-full p-2" title="Mở ảnh gốc / tải"><Download size={18} /></a>
      <button onClick={() => setView(null)} className="absolute top-3 right-3 text-white bg-white/10 rounded-full p-2"><X size={18} /></button>
    </div>}
  </div>;
}
