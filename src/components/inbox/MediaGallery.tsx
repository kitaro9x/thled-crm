"use client";
import { useEffect, useMemo, useState } from "react";
import { X, ChevronLeft, Image as ImageIcon, Video, FileText, Link2, Download, MessageSquareText, Play } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Message } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Lightbox } from "./Lightbox";

type Tab = "image" | "video" | "file" | "link";
type Who = "all" | "in" | "out";
type Item = { id: string; msgId: string; kind: Tab; url: string; name?: string; at: string; dir: string };
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

/**
 * Kho lưu trữ (giống Zalo): ảnh / video / file / link của khách (gom mọi kênh), mở ở cột bên phải cạnh khung chat.
 * Bấm ảnh → xem lớn (←→ chuyển ảnh); nút 💬 → nhảy tới tin nhắn gốc trong khung chat.
 */
export function MediaGallery({ ids, onClose, onJump }: { ids: string[]; onClose: () => void; onJump?: (messageId: string) => void }) {
  const [tab, setTab] = useState<Tab>("image"); const [who, setWho] = useState<Who>("all");
  const [msgs, setMsgs] = useState<Message[]>([]); const [loading, setLoading] = useState(true);
  const [lb, setLb] = useState<number | null>(null); const [video, setVideo] = useState<Item | null>(null);
  const idKey = ids.join(",");
  useEffect(() => {
    const sb = supabaseBrowser(); let alive = true; setLoading(true); setMsgs([]);
    (async () => {
      const [{ data: a }, { data: l }] = await Promise.all([
        sb.from("crm_messages").select("*").in("conversation_id", ids).neq("attachments", "[]").order("sent_at", { ascending: false }).limit(600),
        sb.from("crm_messages").select("*").in("conversation_id", ids).ilike("text", "%http%").order("sent_at", { ascending: false }).limit(300),
      ]);
      if (!alive) return;
      const m = new Map<string, Message>(); for (const x of [...(a || []), ...(l || [])] as Message[]) m.set(x.id, x);
      setMsgs(Array.from(m.values()).sort((x, y) => (y.sent_at || "").localeCompare(x.sent_at || ""))); setLoading(false);
    })();
    // tin mới có ảnh/file/link khi đang mở kho → hiện ngay
    const ch = sb.channel("gallery-" + ids.join("_")).on("postgres_changes", { event: "INSERT", schema: "public", table: "crm_messages", filter: `conversation_id=in.(${ids.join(",")})` }, (p) => {
      const n = p.new as Message; if (!(n.attachments?.length || /https?:\/\//.test(n.text || ""))) return;
      setMsgs((m) => (m.some((x) => x.id === n.id) ? m : [n, ...m]));
    }).subscribe();
    return () => { alive = false; sb.removeChannel(ch); };
  }, [idKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!video) return; const k = (e: KeyboardEvent) => { if (e.key === "Escape") setVideo(null); }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [video]);

  // phẳng hoá: mỗi mục = 1 ảnh/video/file/link kèm thời gian & hướng
  const items = useMemo(() => {
    const out: Item[] = [];
    for (const m of msgs) {
      for (const [i, a] of (m.attachments || []).entries()) { if (a.type === "sticker" || !a.url) continue; const kind: Tab = a.type === "image" ? "image" : a.type === "video" ? "video" : (a.type as string) === "link" ? "link" : "file"; out.push({ id: m.id + "#" + i, msgId: m.id, kind, url: a.url, name: a.name, at: m.sent_at, dir: m.direction }); }
      for (const u of (m.text || "").match(/https?:\/\/[^\s<>"']+/g) || []) out.push({ id: m.id + "@" + u, msgId: m.id, kind: "link", url: u, at: m.sent_at, dir: m.direction });
    }
    return out;
  }, [msgs]);
  const byWho = items.filter((x) => who === "all" || x.dir === who);
  const cur = byWho.filter((x) => x.kind === tab);
  const groups = useMemo(() => { const g = new Map<string, Item[]>(); for (const x of cur) { const k = dayKey(x.at); g.set(k, [...(g.get(k) || []), x]); } return Array.from(g.entries()); }, [cur]);
  const count = (k: Tab) => byWho.filter((x) => x.kind === k).length;
  const images = cur.filter((x) => x.kind === "image");
  const tabs: { k: Tab; label: string; icon: React.ReactNode }[] = [{ k: "image", label: "Ảnh", icon: <ImageIcon size={14} /> }, { k: "video", label: "Video", icon: <Video size={14} /> }, { k: "file", label: "File", icon: <FileText size={14} /> }, { k: "link", label: "Link", icon: <Link2 size={14} /> }];
  const from = (x: Item) => (x.dir === "out" ? "Mình" : "Khách");
  const jump = (msgId: string) => onJump?.(msgId);
  const JumpBtn = ({ x, className }: { x: Item; className?: string }) => onJump ? <button type="button" title="Xem trong hội thoại" onClick={(e) => { e.stopPropagation(); jump(x.msgId); }} className={cn("p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-slate-50 shrink-0", className)}><MessageSquareText size={14} /></button> : null;

  return <div className="w-full md:w-[320px] shrink-0 md:border-l border-slate-200 bg-white flex flex-col flex-1 min-h-0">
    <div className="h-14 shrink-0 flex items-center gap-1 px-2 border-b border-slate-200">
      <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-50" title="Đóng kho lưu trữ"><ChevronLeft size={18} /></button>
      <b className="text-[15px]">Kho lưu trữ</b>
      <button onClick={onClose} className="ml-auto p-1.5 rounded hover:bg-slate-50 hidden md:block" title="Đóng"><X size={16} /></button>
    </div>
    <div className="shrink-0 flex border-b border-slate-200">{tabs.map((x) => <button key={x.k} onClick={() => setTab(x.k)} className={cn("flex-1 flex items-center justify-center gap-1 py-2 text-[13px] border-b-2 -mb-px transition-colors", tab === x.k ? "border-blue-600 text-blue-700 font-semibold" : "border-transparent text-slate-500 hover:text-slate-700")}>{x.icon}{x.label}{count(x.k) > 0 && <span className="text-[11px] opacity-70">{count(x.k)}</span>}</button>)}</div>
    <div className="shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs text-slate-500">Người gửi:{([["all", "Tất cả"], ["in", "Khách"], ["out", "Mình"]] as [Who, string][]).map(([k, l]) => <button key={k} onClick={() => setWho(k)} className={cn("fchip", who === k && "on")}>{l}</button>)}</div>
    <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-3">
      {loading && <div className="text-slate-400 text-sm py-6 text-center">Đang tải…</div>}
      {!loading && groups.length === 0 && <div className="text-slate-400 text-sm text-center py-10">Chưa có {tabs.find((x) => x.k === tab)?.label.toLowerCase()} nào{who === "in" ? " khách gửi" : who === "out" ? " mình gửi" : ""}</div>}
      {groups.map(([day, list]) => <div key={day}>
        <div className="text-xs font-semibold text-slate-500 sticky top-0 bg-white py-1.5 z-[1]">{day} <span className="font-normal text-slate-400">· {list.length}</span></div>
        {tab === "image" && <div className="grid grid-cols-3 gap-1">{list.map((x) => <div key={x.id} role="button" tabIndex={0} onClick={() => setLb(images.findIndex((y) => y.id === x.id))} onKeyDown={(e) => { if (e.key === "Enter") setLb(images.findIndex((y) => y.id === x.id)); }} className="relative aspect-square overflow-hidden rounded-md bg-slate-100 group cursor-zoom-in">
          <img src={x.url} alt="" loading="lazy" className="w-full h-full object-cover" />
          <span className="absolute bottom-0 inset-x-0 text-[10px] px-1 py-0.5 text-white bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity">{from(x)} · {hhmm(x.at)}</span>
          {onJump && <button type="button" title="Xem trong hội thoại" onClick={(e) => { e.stopPropagation(); jump(x.msgId); }} className="absolute top-1 right-1 p-1 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"><MessageSquareText size={12} /></button>}
        </div>)}</div>}
        {tab === "video" && <div className="grid grid-cols-2 gap-1">{list.map((x) => <button key={x.id} type="button" onClick={() => setVideo(x)} className="relative aspect-video overflow-hidden rounded-md bg-black group">
          <video src={x.url} preload="metadata" muted playsInline className="w-full h-full object-cover pointer-events-none" />
          <span className="absolute inset-0 flex items-center justify-center"><span className="rounded-full bg-black/55 p-2 text-white"><Play size={16} /></span></span>
          <span className="absolute bottom-0 inset-x-0 text-[10px] px-1 py-0.5 text-white bg-black/45 text-left">{from(x)} · {hhmm(x.at)}</span>
        </button>)}</div>}
        {tab === "file" && <div className="space-y-1">{list.map((x) => <div key={x.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-slate-100 hover:bg-slate-50 text-sm">
          <FileText size={18} className="text-slate-400 shrink-0" />
          <a href={x.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1"><div className="truncate text-[13px]">{x.name || decodeURIComponent(x.url.split("/").pop() || "Tệp")}</div><div className="text-[11px] text-slate-400">{from(x)} · {hhmm(x.at)}</div></a>
          <JumpBtn x={x} /><a href={x.url} target="_blank" rel="noreferrer" title="Tải / mở" className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-slate-50"><Download size={14} /></a>
        </div>)}</div>}
        {tab === "link" && <div className="space-y-1">{list.map((x) => <div key={x.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-slate-100 hover:bg-slate-50 text-sm">
          <span className="w-8 h-8 rounded-md bg-slate-100 flex items-center justify-center shrink-0"><Link2 size={14} className="text-slate-500" /></span>
          <a href={x.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1"><div className="truncate text-[13px] font-medium">{host(x.url)}</div><div className="truncate text-[11px] text-blue-600">{x.url}</div><div className="text-[11px] text-slate-400">{from(x)} · {hhmm(x.at)}</div></a>
          <JumpBtn x={x} />
        </div>)}</div>}
      </div>)}
    </div>
    {lb !== null && lb >= 0 && images.length > 0 && <Lightbox images={images.map((x) => ({ url: x.url, caption: `${from(x)} · ${hhmm(x.at)} ${new Date(x.at).toLocaleDateString("vi-VN")}` }))} index={lb} onClose={() => setLb(null)} onJump={onJump ? (i) => { const x = images[i]; setLb(null); if (x) jump(x.msgId); } : undefined} />}
    {video && <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4" onClick={() => setVideo(null)}>
      <video src={video.url} controls autoPlay playsInline className="max-w-full max-h-full" onClick={(e) => e.stopPropagation()} />
      <div className="absolute top-3 right-3 flex gap-1" onClick={(e) => e.stopPropagation()}>
        {onJump && <button className="text-white bg-white/10 hover:bg-white/20 rounded-full p-2" title="Xem trong hội thoại" onClick={() => { const v = video; setVideo(null); jump(v.msgId); }}><MessageSquareText size={18} /></button>}
        <a href={video.url} target="_blank" rel="noreferrer" className="text-white bg-white/10 hover:bg-white/20 rounded-full p-2" title="Mở / tải video"><Download size={18} /></a>
        <button className="text-white bg-white/10 hover:bg-white/20 rounded-full p-2" title="Đóng" onClick={() => setVideo(null)}><X size={18} /></button>
      </div>
    </div>}
  </div>;
}
