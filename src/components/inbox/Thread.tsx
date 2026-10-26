"use client";
import { useEffect, useRef, useState } from "react";
import { Send, Clock, Tag, UserPlus, Star, Check, Zap } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Conversation, Label, Message } from "@/lib/types";
import { ChannelIcon } from "@/components/ChannelIcon";
import { cn, dt } from "@/lib/utils";

export function Thread({ conv, siblings, labels, members, knowledge }: { conv: Conversation; siblings?: Conversation[]; labels: Label[]; members: { id: string; name: string }[]; knowledge: { id: string; title: string; shortcut?: string | null; content: string }[] }) {
  const sb = supabaseBrowser();
  const all = siblings && siblings.length ? siblings : [conv];
  const ids = all.map((c) => c.id);
  const multi = all.length > 1;
  const byId = Object.fromEntries(all.map((c) => [c.id, c])) as Record<string, Conversation>;
  // kênh trả lời mặc định: hội thoại có tin khách gửi gần nhất
  const [target, setTarget] = useState<Conversation>(() => [...all].sort((a, b) => (b.last_inbound_at || b.last_message_at || "").localeCompare(a.last_inbound_at || a.last_message_at || ""))[0] || conv);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [schedule, setSchedule] = useState<string>("");
  const [showLabels, setShowLabels] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [convLabels, setConvLabels] = useState<string[]>(conv.labels || []);
  const [err, setErr] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sb.from("crm_messages").select("*").in("conversation_id", ids).order("sent_at").limit(400).then(({ data }) => setMsgs((data as Message[]) || []));
    sb.from("crm_conversations").update({ unread_count: 0 }).in("id", ids).then(() => {});
    const ch = sb.channel("thread-" + ids.join("_")).on("postgres_changes", { event: "INSERT", schema: "public", table: "crm_messages", filter: `conversation_id=in.(${ids.join(",")})` }, (p) => setMsgs((m) => (m.some((x) => x.id === (p.new as Message).id) ? m : [...m, p.new as Message].sort((a, b) => (a.sent_at || a.created_at || "").localeCompare(b.sent_at || b.created_at || ""))))).subscribe();
    return () => { sb.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv.id]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length]);

  const send = async () => {
    if (!text.trim()) return; setSending(true); setErr(null);
    const r = await fetch("/api/messages/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversation_id: target.id, text: text.trim(), scheduled_at: schedule || undefined }) });
    const j = await r.json(); setSending(false);
    if (!r.ok) { setErr(j.error || "Gửi thất bại"); return; }
    setText(""); setSchedule("");
  };
  const toggleLabel = async (name: string) => {
    const next = convLabels.includes(name) ? convLabels.filter((l) => l !== name) : [...convLabels, name];
    setConvLabels(next); await sb.from("crm_conversations").update({ labels: next }).eq("id", conv.id);
  };
  const assign = async (id: string) => { await sb.from("crm_conversations").update({ assigned_to: id }).eq("id", conv.id); setShowAssign(false); };
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };
  // phím tắt /xxx từ kho tri thức
  useEffect(() => {
    const m = text.match(/^\/(\S+)$/); if (!m) return;
    const k = knowledge.find((x) => x.shortcut === "/" + m[1] || x.shortcut === m[1]);
    if (k) setText(k.content);
  }, [text, knowledge]);

  return (
    <>
      <div className="h-14 shrink-0 bg-white border-b border-slate-200 px-4 flex items-center gap-3">
        <div className="flex -space-x-1">{Array.from(new Set(all.map((c) => c.channel_type))).map((t) => <ChannelIcon key={t} type={t} size={22} />)}</div>
        <div className="min-w-0"><div className="font-semibold truncate">{conv.person_name || conv.display_name}</div><div className="text-xs text-slate-500">{multi ? all.map((c) => c.channel_name + (c.kind === "comment" ? " (bình luận)" : "")).join(" · ") : conv.channel_name}{conv.person_phone && ` · ${conv.person_phone}`}</div></div>
        <div className="ml-auto flex items-center gap-1 relative">
          <button className="btn px-2" title="Quan trọng" onClick={() => sb.from("crm_conversations").update({ is_important: !conv.is_important }).eq("id", conv.id)}><Star size={15} className={cn(conv.is_important && "fill-amber-400 text-amber-400")} /></button>
          <button className="btn px-2" title="Gắn nhãn" onClick={() => { setShowLabels((v) => !v); setShowAssign(false); }}><Tag size={15} /></button>
          <button className="btn px-2" title="Giao cho" onClick={() => { setShowAssign((v) => !v); setShowLabels(false); }}><UserPlus size={15} /></button>
          <button className="btn px-2" title={conv.status === "open" ? "Đóng hội thoại" : "Mở lại"} onClick={() => sb.from("crm_conversations").update({ status: conv.status === "open" ? "closed" : "open" }).eq("id", conv.id)}><Check size={15} /></button>
          {showLabels && <div className="absolute right-0 top-10 z-10 card p-2 w-56 max-h-72 overflow-auto shadow-lg">{labels.map((l) => <label key={l.id} className="flex items-center gap-2 py-1 text-sm cursor-pointer"><input type="checkbox" checked={convLabels.includes(l.name)} onChange={() => toggleLabel(l.name)} /><span className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} />{l.name}</label>)}</div>}
          {showAssign && <div className="absolute right-0 top-10 z-10 card p-2 w-56 shadow-lg">{members.map((m) => <button key={m.id} onClick={() => assign(m.id)} className="block w-full text-left py-1.5 px-2 rounded hover:bg-slate-50 text-sm">{m.name}</button>)}</div>}
        </div>
      </div>
      {convLabels.length > 0 && <div className="px-4 py-1.5 bg-white border-b border-slate-100 flex gap-1 flex-wrap">{convLabels.map((l) => { const lb = labels.find((x) => x.name === l); return <span key={l} className="chip text-white" style={{ background: lb?.color || "#64748b" }}>{l}</span>; })}</div>}
      {conv.ai_summary && <div className="mx-4 mt-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900"><b>AI tóm tắt:</b> {conv.ai_summary}</div>}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {msgs.map((m) => (
          <div key={m.id} className={cn("flex", m.direction === "out" ? "justify-end" : "justify-start")}>
            {multi && m.direction !== "out" && <span className="mr-1 mt-2 shrink-0"><ChannelIcon type={byId[m.conversation_id]?.channel_type} size={14} /></span>}
            <div className={cn("max-w-[70%] rounded-2xl px-3 py-2 text-sm shadow-sm", m.direction === "out" ? "bg-blue-600 text-white rounded-br-sm" : "bg-white rounded-bl-sm")}>
              {m.attachments?.map((a, i) => a.type === "image" ? <a key={i} href={a.url} target="_blank"><img src={a.url} alt="" className="rounded-lg max-h-60 mb-1" /></a> : <a key={i} href={a.url} target="_blank" className="underline block mb-1">{a.name || a.type}</a>)}
              {m.text && <div className="whitespace-pre-wrap break-words">{m.text}</div>}
              <div className={cn("text-[10px] mt-1 flex items-center gap-1", m.direction === "out" ? "text-blue-100" : "text-slate-400")}>{multi && m.direction === "out" && <ChannelIcon type={byId[m.conversation_id]?.channel_type} size={10} />}{multi && byId[m.conversation_id]?.kind === "comment" && "💬 bình luận · "}{dt(m.sent_at)}{m.direction === "out" && m.status === "queued" && " · đang gửi"}{m.status === "failed" && " · lỗi"}</div>
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      <div className="bg-white border-t border-slate-200 p-3">
        {conv.scheduled_message && <div className="text-xs text-amber-700 mb-1 flex items-center gap-1"><Clock size={12} /> Tin hẹn giờ: “{conv.scheduled_message.text}” lúc {dt(conv.scheduled_message.send_at, "HH:mm dd/MM")}</div>}
        {err && <div className="text-xs text-red-600 mb-1">{err}</div>}
        {multi && <div className="flex items-center gap-1 mb-2 text-xs text-slate-500">Trả lời qua:{all.map((c) => <button key={c.id} onClick={() => setTarget(c)} className={cn("chip border flex items-center gap-1", target.id === c.id ? "bg-blue-600 text-white border-blue-600" : "bg-white border-slate-200 text-slate-600")}><ChannelIcon type={c.channel_type} size={12} />{c.channel_type === "zalo_personal" ? "Zalo" : c.kind === "comment" ? "FB bình luận" : "Messenger"}</button>)}</div>}
        <textarea className="input resize-none" rows={3} placeholder="Nhập tin nhắn… (Enter gửi, Shift+Enter xuống dòng, gõ /phím_tắt để chèn trả lời nhanh)" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} />
        <div className="flex items-center gap-2 mt-2">
          <div className="relative group"><button className="btn px-2" title="Trả lời nhanh"><Zap size={14} /></button>
            <div className="hidden group-hover:block absolute bottom-9 left-0 z-10 card w-72 max-h-64 overflow-auto shadow-lg p-1">{knowledge.length === 0 && <div className="p-2 text-xs text-slate-400">Chưa có nội dung trong Kho tri thức</div>}{knowledge.map((k) => <button key={k.id} onClick={() => setText(k.content)} className="block w-full text-left px-2 py-1.5 text-sm hover:bg-slate-50 rounded"><b>{k.shortcut}</b> {k.title}</button>)}</div>
          </div>
          <label className="btn px-2 text-xs" title="Hẹn giờ gửi"><Clock size={14} /><input type="datetime-local" className="ml-1 text-xs outline-none" value={schedule} onChange={(e) => setSchedule(e.target.value)} /></label>
          <button className="btn btn-primary ml-auto" onClick={send} disabled={sending || !text.trim()}><Send size={14} /> {schedule ? "Hẹn gửi" : "Gửi"}</button>
        </div>
      </div>
    </>
  );
}
