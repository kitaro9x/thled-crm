"use client";
import { useEffect, useRef, useState } from "react";
import { X, Search, Forward } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Attachment, Conversation } from "@/lib/types";
import { Avatar } from "@/components/Avatar";
import { GroupAvatar } from "@/components/GroupAvatar";
import { convName } from "@/lib/utils";
import { ChannelIcon } from "@/components/ChannelIcon";

/** Chuyển tiếp 1 tin (chữ + đính kèm) sang hội thoại khác */
type Item = { text?: string | null; attachments?: Attachment[] };
export function ForwardDialog({ text, attachments, items, excludeId, onClose }: { text?: string | null; attachments?: Attachment[]; items?: Item[]; excludeId: string; onClose: (sent?: string) => void }) {
  const list0: Item[] = items?.length ? items : [{ text, attachments }];
  const nImg = list0.reduce((n, it) => n + (it.attachments?.length || 0), 0);
  const [q, setQ] = useState(""); const [list, setList] = useState<Conversation[]>([]); const [busy, setBusy] = useState<string | null>(null); const [err, setErr] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setTimeout(async () => {
      let qq = supabaseBrowser().from("crm_v_conversations").select("*").neq("id", excludeId).in("kind", ["inbox", "group"]).order("last_message_at", { ascending: false }).limit(20);
      if (q.trim()) qq = qq.or(`display_name.ilike.%${q.trim()}%,person_name.ilike.%${q.trim()}%,person_phone.ilike.%${q.trim()}%,meta->>alias.ilike.%${q.trim()}%`);
      const { data } = await qq; setList((data as Conversation[]) || []);
    }, 200); return () => clearTimeout(t);
  }, [q, excludeId]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const c = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("keydown", k); document.addEventListener("mousedown", c);
    return () => { document.removeEventListener("keydown", k); document.removeEventListener("mousedown", c); };
  }, [onClose]);
  const send = async (c: Conversation) => {
    setBusy(c.id); setErr("");
    // gom: toàn bộ ảnh/tệp gửi chung 1 lượt, các đoạn chữ gửi từng tin
    const atts = list0.flatMap((it) => it.attachments || []); const texts = list0.map((it) => (it.text || "").trim()).filter(Boolean);
    const payloads = texts.length === 1 && list0.length === 1 ? [{ text: texts[0], attachments: atts }] : [...texts.map((t) => ({ text: t, attachments: [] as Attachment[] })), ...(atts.length ? [{ text: "", attachments: atts }] : [])];
    for (const p of payloads) {
      const r = await fetch("/api/messages/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversation_id: c.id, ...p }) });
      if (!r.ok) { const j = await r.json(); setBusy(null); setErr(j.error || "Gửi lỗi"); return; }
    }
    setBusy(null); onClose(convName(c) || "khách");
  };
  return <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3">
    <div ref={box} className="card w-full max-w-md max-h-[80vh] flex flex-col">
      <div className="flex items-center gap-2 p-3 border-b border-slate-100"><Forward size={16} /><b className="flex-1">Chuyển tiếp tới…</b><button onClick={() => onClose()} className="p-1 rounded hover:bg-slate-100"><X size={16} /></button></div>
      <div className="p-2 text-xs text-slate-500 bg-slate-50 border-b border-slate-100 line-clamp-2">{list0.length > 1 ? `${list0.length} tin nhắn` + (nImg ? ` · ${nImg} ảnh/tệp` : "") : (text || (nImg ? `[${nImg} tệp đính kèm]` : ""))}</div>
      <div className="p-2 relative"><Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" /><input autoFocus className="input" style={{ paddingLeft: 30 }} placeholder="Tìm tên khách, SĐT…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {err && <div className="px-3 text-xs text-red-600">{err}</div>}
      <div className="flex-1 overflow-y-auto">
        {list.map((c) => <button key={c.id} disabled={!!busy} onClick={() => send(c)} className="w-full text-left flex items-center gap-2 px-3 py-2 hover:bg-slate-50 border-b border-slate-50">
          {c.kind === "group" ? <GroupAvatar src={c.identity_avatar} name={convName(c)} members={(c as any).meta?.members} size={32} /> : <Avatar src={c.identity_avatar} name={c.display_name || "?"} size={32} />}
          <div className="flex-1 min-w-0"><div className="font-medium truncate flex items-center gap-1"><ChannelIcon type={c.channel_type} size={12} />{c.kind === "group" && <span className="group-badge">NHÓM</span>}{convName(c)}</div><div className="text-xs text-slate-400 truncate">{c.person_phone || c.last_message_text || ""}</div></div>
          <span className="text-xs text-blue-600">{busy === c.id ? "Đang gửi…" : "Gửi"}</span>
        </button>)}
        {list.length === 0 && <div className="p-6 text-center text-slate-400 text-sm">Không có hội thoại phù hợp</div>}
      </div>
    </div>
  </div>;
}
