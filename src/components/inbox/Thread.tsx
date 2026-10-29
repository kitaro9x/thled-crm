"use client";
import { useEffect, useRef, useState } from "react";
import { Send, Clock, Tag, UserPlus, Star, Check, Zap, Paperclip, X, ArrowDown, Forward, Users, Pencil } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Conversation, Label, Message } from "@/lib/types";
import { ChannelIcon } from "@/components/ChannelIcon";
import { cn, dt, convName } from "@/lib/utils";
import { LinkPreview, firstUrl } from "./LinkPreview";
import { ForwardDialog } from "./ForwardDialog";
import { BankCard } from "./BankCard";
import { LocationCard } from "./LocationCard";

export function Thread({ conv, siblings, labels, members, knowledge }: { conv: Conversation; siblings?: Conversation[]; labels: Label[]; members: { id: string; name: string }[]; knowledge: { id: string; title: string; shortcut?: string | null; content: string }[] }) {
  const sb = supabaseBrowser();
  const all = siblings && siblings.length ? siblings : [conv];
  const ids = all.map((c) => c.id);
  const multi = all.length > 1;
  const byId = Object.fromEntries(all.map((c) => [c.id, c])) as Record<string, Conversation>;
  // kênh trả lời mặc định: hội thoại có tin khách gửi gần nhất
  const [target, setTarget] = useState<Conversation>(() => [...all].sort((a, b) => (b.last_inbound_at || b.last_message_at || "").localeCompare(a.last_inbound_at || a.last_message_at || ""))[0] || conv);
  const [fwd, setFwd] = useState<{ text?: string | null; attachments?: any[]; items?: { text?: string | null; attachments?: any[] }[] } | null>(null); const [fwdOk, setFwdOk] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set()); // chọn nhiều tin để chuyển tiếp
  const togglePick = (id: string) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  useEffect(() => { setPicked(new Set()); }, [conv.id]);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [schedule, setSchedule] = useState<string>("");
  const [showLabels, setShowLabels] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [convLabels, setConvLabels] = useState<string[]>(conv.labels || []);
  const [err, setErr] = useState<string | null>(null);
  const [files, setFiles] = useState<{ file: File; preview: string }[]>([]);
  const [showQuick, setShowQuick] = useState(false); const [quickQ, setQuickQ] = useState("");
  const quickRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  // đóng bảng nhãn / giao việc khi bấm ra ngoài hoặc Esc
  useEffect(() => {
    if (!showLabels && !showAssign) return;
    const onDown = (e: MouseEvent) => { if (headRef.current && !headRef.current.contains(e.target as Node)) { setShowLabels(false); setShowAssign(false); } };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setShowLabels(false); setShowAssign(false); } };
    document.addEventListener("mousedown", onDown); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [showLabels, showAssign]);
  // đóng bảng trả lời nhanh khi bấm ra ngoài hoặc Esc
  useEffect(() => {
    if (!showQuick) return;
    const onDown = (e: MouseEvent) => { if (quickRef.current && !quickRef.current.contains(e.target as Node)) setShowQuick(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowQuick(false); };
    document.addEventListener("mousedown", onDown); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [showQuick]);
  // tìm không dấu, không cần gõ "/": khớp tiêu đề/phím tắt, hoặc từ bắt đầu bằng từ khoá trong nội dung
  const norm = (t: string) => (t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
  const matchQuick = (k: { title: string; shortcut?: string | null; content: string }, q: string) => {
    const nq = norm(q).replace(/^\//, "").trim(); if (!nq) return true;
    if (norm(k.title).includes(nq) || norm(k.shortcut || "").replace(/^\//, "").includes(nq)) return true;
    return new RegExp("(^|[^a-z0-9])" + nq.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(norm(k.content));
  };
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null); const prevLen = useRef(0); const taRef = useRef<HTMLTextAreaElement>(null);
  const [atBottom, setAtBottom] = useState(true); const [unseen, setUnseen] = useState(0);
  const onScroll = () => { const el = scroller.current; if (!el) return; const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80; setAtBottom(near); if (near) setUnseen(0); };
  const scrollToBottom = () => { bottom.current?.scrollIntoView({ behavior: "smooth" }); setUnseen(0); };
  const addFiles = (list: FileList | File[]) => {
    const ok = Array.from(list).filter((f) => /^(image\/(jpeg|png|webp|gif)|video\/(mp4|quicktime)|application\/pdf)$/.test(f.type) && f.size <= 25 * 1024 * 1024);
    if (ok.length < Array.from(list).length) setErr("Chỉ nhận ảnh jpg/png/webp/gif, video mp4/mov, PDF — tối đa 25 MB");
    setFiles((fs) => [...fs, ...ok.map((file) => ({ file, preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : "" }))]);
  };
  /** Nén ảnh trên trình duyệt: tối đa 1600px cạnh dài, JPEG 0.85 (GIF giữ nguyên) */
  const compressImage = (file: File): Promise<File> => new Promise((resolve) => {
    if (!file.type.startsWith("image/") || file.type === "image/gif" || file.size < 300 * 1024) return resolve(file);
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1600; const sc = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => { URL.revokeObjectURL(url); resolve(b && b.size < file.size ? new File([b], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file); }, "image/jpeg", 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
  const uploadAll = async () => {
    const out: { type: string; url: string; name: string }[] = [];
    for (const { file: raw } of files) {
      const file = await compressImage(raw);
      const ext = (file.name.split(".").pop() || "bin").toLowerCase();
      const path = `${conv.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await sb.storage.from("crm-media").upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw new Error(`Không tải được "${raw.name}" (${(file.size / 1024 / 1024).toFixed(1)} MB): ${error.message}`);
      const { data } = sb.storage.from("crm-media").getPublicUrl(path);
      out.push({ type: file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "file", url: data.publicUrl, name: file.name });
    }
    return out;
  };

  const jumpBottom = () => { const el = scroller.current; if (el) el.scrollTop = el.scrollHeight; setAtBottom(true); setUnseen(0); };
  useEffect(() => {
    // mở hội thoại: xoá tin cũ, tải tin mới, nhảy xuống cuối, focus ô nhập để gõ ngay
    setMsgs([]); prevLen.current = 0; setAtBottom(true); setUnseen(0); setPicked(new Set());
    sb.from("crm_messages").select("*").in("conversation_id", ids).order("sent_at").limit(400).then(({ data }) => { setMsgs((data as Message[]) || []); requestAnimationFrame(() => { jumpBottom(); setTimeout(jumpBottom, 150); setTimeout(jumpBottom, 600); }); });
    if (window.matchMedia("(min-width: 768px)").matches) setTimeout(() => taRef.current?.focus(), 50); // điện thoại: không bật bàn phím tự động
    sb.from("crm_conversations").update({ unread_count: 0 }).in("id", ids).then(() => {});
    const ch = sb.channel("thread-" + ids.join("_")).on("postgres_changes", { event: "INSERT", schema: "public", table: "crm_messages", filter: `conversation_id=in.(${ids.join(",")})` }, (p) => setMsgs((m) => (m.some((x) => x.id === (p.new as Message).id) ? m : [...m.filter((x) => !(x.id.startsWith("tmp-") && x.direction === "out" && x.text === (p.new as Message).text)), p.new as Message].sort((a, b) => (a.sent_at || a.created_at || "").localeCompare(b.sent_at || b.created_at || "")))))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "crm_messages", filter: `conversation_id=in.(${ids.join(",")})` }, (p) => setMsgs((m) => m.map((x) => (x.id === (p.new as Message).id ? { ...x, ...(p.new as Message) } : x)))).subscribe();
    return () => { sb.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv.id]);
  useEffect(() => {
    const grew = msgs.length > prevLen.current; const first = prevLen.current === 0; prevLen.current = msgs.length;
    if (first) return; // lần tải đầu đã xử lý ở trên
    if (atBottom || !grew) bottom.current?.scrollIntoView({ behavior: "smooth" });
    else setUnseen((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgs.length]);

  const send = async () => {
    if (!text.trim() && !files.length) return; setSending(true); setErr(null);
    let attachments: { type: string; url: string; name: string }[] = [];
    try { setUploading(true); attachments = await uploadAll(); } catch (e: any) { setErr(e.message); setSending(false); setUploading(false); return; } finally { setUploading(false); }
    // hiện tin ngay (optimistic), server xác nhận sau; realtime sẽ thay bằng bản thật
    const tmpId = "tmp-" + Date.now(); const body = text.trim(); const sched = schedule;
    if (!sched) setMsgs((m) => [...m, { id: tmpId, conversation_id: target.id, direction: "out", type: attachments[0]?.type || "text", text: body || null, attachments, status: "queued", sent_at: new Date().toISOString(), created_at: new Date().toISOString() } as Message]);
    setText(""); setSchedule(""); setFiles([]);
    const r = await fetch("/api/messages/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversation_id: target.id, text: body || undefined, attachments, scheduled_at: sched || undefined }) });
    const j = await r.json(); setSending(false);
    if (!r.ok) { setErr(j.error || "Gửi thất bại"); setMsgs((m) => m.map((x) => (x.id === tmpId ? { ...x, status: "failed" } : x))); return; }
    if (!sched) setMsgs((m) => m.map((x) => (x.id === tmpId ? { ...x, status: "sent" } : x)));
  };
  const toggleLabel = async (name: string) => {
    const next = convLabels.includes(name) ? convLabels.filter((l) => l !== name) : [...convLabels, name];
    setConvLabels(next); await sb.from("crm_conversations").update({ labels: next }).eq("id", conv.id);
  };
  // đổi tên nhóm chỉ trong CRM (không đổi trên Zalo): lưu meta.alias, để trống = dùng lại tên gốc
  const renameGroup = async () => {
    const cur = (conv as any).meta?.alias || "";
    const v = window.prompt("Tên nhóm hiển thị trong CRM (để trống để dùng tên gốc trên Zalo):", cur || conv.display_name || "");
    if (v === null) return;
    const alias = v.trim() && v.trim() !== conv.display_name ? v.trim() : null;
    await sb.from("crm_conversations").update({ meta: { ...((conv as any).meta || {}), alias } }).eq("id", conv.id);
  };
  const assign = async (id: string) => { await sb.from("crm_conversations").update({ assigned_to: id }).eq("id", conv.id); setShowAssign(false); };
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (atItems.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setAtIdx((i) => (i + 1) % atItems.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setAtIdx((i) => (i - 1 + atItems.length) % atItems.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pickAt(atItems[atIdx]); return; }
    }
    if (slashItems.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSlashIdx((i) => (i + 1) % slashItems.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSlashIdx((i) => (i - 1 + slashItems.length) % slashItems.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pickSlash(slashItems[slashIdx]); return; }
      if (e.key === "Escape") { setText(""); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };
  // điền biến {fullname} {gender} {phone} khi chèn trả lời nhanh
  const fill = (t: string) => t.replace(/\{fullname\}/g, convName(conv) || "anh/chị").replace(/\{gender\}/g, "anh/chị").replace(/\{phone\}/g, conv.person_phone || "");
  // gõ "/" ở đầu ô chat → hiện gợi ý trả lời nhanh, lọc theo chữ sau dấu /; Enter/Tab chọn mục đầu
  const slashMatch = text.match(/^\/(\S*)$/);
  const slashItems = slashMatch ? knowledge.filter((k) => matchQuick(k, slashMatch[1])).slice(0, 8) : [];
  const [slashIdx, setSlashIdx] = useState(0);
  useEffect(() => { setSlashIdx(0); }, [text]);
  const pickSlash = (k: { content: string }) => { setText(fill(k.content)); };
  // nhóm Zalo: gõ "@" → gợi ý thành viên (worker lưu vào conv.meta.members); chèn "@Tên " → worker đổi thành tag thật
  const gmembers = ((conv as any).meta?.members || []) as { id: string; name: string }[];
  const atMatch = conv.kind === "group" && gmembers.length ? text.match(/(?:^|\s)@([^@\n]{0,30})$/) : null;
  const atItems = atMatch ? gmembers.filter((m) => !atMatch[1] || m.name.toLowerCase().includes(atMatch[1].toLowerCase())).slice(0, 8) : [];
  const [atIdx, setAtIdx] = useState(0);
  useEffect(() => { setAtIdx(0); }, [atMatch?.[1]]);
  const pickAt = (m: { name: string }) => { setText((t) => t.replace(/@([^@\n]{0,30})$/, "@" + m.name + " ")); };

  return (
    <>
      <div className="h-14 shrink-0 bg-white border-b border-slate-200 px-4 flex items-center gap-3">
        <div className="flex -space-x-1">{Array.from(new Set(all.map((c) => c.channel_type))).map((t) => <ChannelIcon key={t} type={t} size={22} />)}</div>
        <div className="min-w-0"><div className="font-semibold truncate flex items-center gap-1">{conv.kind === "group" && <span className="inline-flex items-center gap-0.5 group-badge shrink-0"><Users size={10} />NHÓM</span>}<span className="truncate">{convName(conv)}</span>{conv.kind === "group" && <button title="Đổi tên nhóm trong CRM" onClick={renameGroup} className="p-0.5 text-slate-400 hover:text-blue-600 shrink-0"><Pencil size={12} /></button>}</div><div className="text-xs text-slate-500 truncate">{conv.kind === "group" ? `Nhóm Zalo · ${((conv as any).meta?.members?.length || 0) > 0 ? `${(conv as any).meta.members.length} thành viên` : "Tên gốc: " + (conv.display_name || "")}` : (multi ? all.map((c) => c.channel_name + (c.kind === "comment" ? " (bình luận)" : "")).join(" · ") : conv.channel_name)}{conv.kind === "group" && (conv as any).meta?.alias && ` · Tên gốc: ${conv.display_name}`}{conv.person_phone && ` · ${conv.person_phone}`}</div></div>
        <div ref={headRef} className="ml-auto flex items-center gap-1 relative md:mr-10">
          <button className="btn px-2" title="Quan trọng" onClick={() => sb.from("crm_conversations").update({ is_important: !conv.is_important }).eq("id", conv.id)}><Star size={15} className={cn(conv.is_important && "fill-amber-400 text-amber-400")} /></button>
          <button className="btn px-2" title="Gắn nhãn" onClick={() => { setShowLabels((v) => !v); setShowAssign(false); }}><Tag size={15} /></button>
          <button className="btn px-2" title="Giao cho" onClick={() => { setShowAssign((v) => !v); setShowLabels(false); }}><UserPlus size={15} /></button>
          <button className="btn px-2" title={conv.status === "open" ? "Đóng hội thoại" : "Mở lại"} onClick={() => sb.from("crm_conversations").update({ status: conv.status === "open" ? "closed" : "open" }).eq("id", conv.id)}><Check size={15} /></button>
          {showLabels && <div className="absolute right-0 top-10 z-10 card p-2 w-56 max-h-72 overflow-auto shadow-lg"><div className="flex items-center justify-between text-xs text-slate-500 mb-1"><span>Gắn nhãn</span><button onClick={() => setShowLabels(false)} className="btn px-1.5 py-0.5"><X size={12} /></button></div>{labels.map((l) => <label key={l.id} className="flex items-center gap-2 py-1 text-sm cursor-pointer"><input type="checkbox" checked={convLabels.includes(l.name)} onChange={() => toggleLabel(l.name)} /><span className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} />{l.name}</label>)}</div>}
          {showAssign && <div className="absolute right-0 top-10 z-10 card p-2 w-56 shadow-lg">{members.map((m) => <button key={m.id} onClick={() => assign(m.id)} className="block w-full text-left py-1.5 px-2 rounded hover:bg-slate-50 text-sm">{m.name}</button>)}</div>}
        </div>
      </div>
      {convLabels.length > 0 && <div className="px-4 py-1.5 bg-white border-b border-slate-100 flex gap-1 flex-wrap">{convLabels.map((l) => { const lb = labels.find((x) => x.name === l); return <span key={l} className="chip text-white" style={{ background: lb?.color || "#64748b" }}>{l}</span>; })}</div>}
      {conv.ai_summary && <div className="mx-4 mt-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900"><b>AI tóm tắt:</b> {conv.ai_summary}</div>}
      {picked.size > 0 && <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-blue-50 border-b border-blue-100 text-sm"><b>Đã chọn {picked.size}</b><button className="btn btn-primary px-2 py-1 text-xs" onClick={() => setFwd({ items: msgs.filter((x) => picked.has(x.id)).map((x) => ({ text: x.text, attachments: x.attachments })) })}><Forward size={14} className="inline mr-1" />Chuyển tiếp</button><button className="btn px-2 py-1 text-xs" onClick={() => setPicked(new Set(msgs.filter((x) => x.attachments?.some((a) => a.type === "image")).map((x) => x.id)))}>Chọn tất cả ảnh</button><button className="btn px-2 py-1 text-xs ml-auto" onClick={() => setPicked(new Set())}>Huỷ</button></div>}
      {fwd && <ForwardDialog text={fwd.text} attachments={fwd.attachments} items={fwd.items} excludeId={conv.id} onClose={(sent) => { setFwd(null); if (sent) { setPicked(new Set()); setFwdOk("Đã chuyển tiếp tới " + sent); setTimeout(() => setFwdOk(""), 3000); } }} />}
      {fwdOk && <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 bg-emerald-600 text-white text-xs px-3 py-1.5 rounded-full shadow">{fwdOk}</div>}
      <div ref={scroller} onScroll={onScroll} className="flex-1 overflow-y-auto px-4 py-3 space-y-2 relative">
        {msgs.map((m) => (
          <div key={m.id} className={cn("flex group items-center gap-1", m.direction === "out" ? "justify-end" : "justify-start")}>
            {multi && m.direction !== "out" && <span className="mr-1 mt-2 shrink-0 self-start"><ChannelIcon type={byId[m.conversation_id]?.channel_type} size={14} /></span>}
            {m.direction === "out" && (m.text || m.attachments?.length) ? <span className={cn("flex items-center", picked.size ? "opacity-100" : "opacity-0 group-hover:opacity-100")}><input type="checkbox" title="Chọn để chuyển tiếp nhiều tin" checked={picked.has(m.id)} onChange={() => togglePick(m.id)} className="w-4 h-4 cursor-pointer" />{!picked.size && <button title="Chuyển tiếp" onClick={() => setFwd({ text: m.text, attachments: m.attachments })} className="p-1 rounded text-slate-400 hover:text-blue-600"><Forward size={14} /></button>}</span> : null}
            <div className={cn("max-w-[70%] rounded-2xl px-3 py-2 text-sm shadow-sm", m.direction === "out" ? (byId[m.conversation_id]?.channel_type === "zalo_personal" ? "bg-green-600 text-white rounded-br-sm" : "bg-blue-600 text-white rounded-br-sm") : "bg-white rounded-bl-sm")}>
              {m.attachments?.filter((a) => (a.type as string) !== "link").map((a, i) => a.type === "image" ? <a key={i} href={a.url} target="_blank"><img src={a.url} alt="" className="rounded-lg max-h-60 mb-1" onLoad={() => { if (atBottom) jumpBottom(); }} /></a> : a.type === "video" ? <video key={i} src={a.url} controls className="rounded-lg max-h-60 mb-1 max-w-full" /> : a.type === "audio" ? <audio key={i} src={a.url} controls className="mb-1 max-w-full" /> : <a key={i} href={a.url} target="_blank" className="underline block mb-1">📎 {a.name || a.type}</a>)}
              {m.direction === "in" && (m as any).sender_name && <div className="text-[11px] font-semibold text-blue-700 mb-0.5">{(m as any).sender_name}</div>}
              {(m as any).raw?.bank ? <BankCard bank={(m as any).raw.bank} /> : (m as any).raw?.location ? <LocationCard loc={(m as any).raw.location} /> : m.text && <div className="whitespace-pre-wrap break-words">{m.text.split(/(https?:\/\/[^\s<>"']+)/g).map((part, i) => /^https?:\/\//.test(part) ? <a key={i} href={part} target="_blank" rel="noreferrer" className="underline">{part}</a> : part)}</div>}
              {m.text && firstUrl(m.text) && <LinkPreview url={firstUrl(m.text)!} dark={m.direction === "out"} />}
              <div className={cn("text-[10px] mt-1 flex items-center gap-1", m.direction === "out" ? "text-blue-100" : "text-slate-400")}>{multi && m.direction === "out" && <ChannelIcon type={byId[m.conversation_id]?.channel_type} size={10} />}{multi && byId[m.conversation_id]?.kind === "comment" && "💬 bình luận · "}{dt(m.sent_at)}{m.direction === "out" && m.status === "queued" && " · đang gửi"}{m.status === "failed" && " · lỗi"}</div>
            </div>
            {m.direction !== "out" && (m.text || m.attachments?.length) ? <span className={cn("flex items-center", picked.size ? "opacity-100" : "opacity-0 group-hover:opacity-100")}><input type="checkbox" title="Chọn để chuyển tiếp nhiều tin" checked={picked.has(m.id)} onChange={() => togglePick(m.id)} className="w-4 h-4 cursor-pointer" />{!picked.size && <button title="Chuyển tiếp" onClick={() => setFwd({ text: m.text, attachments: m.attachments })} className="p-1 rounded text-slate-400 hover:text-blue-600"><Forward size={14} /></button>}</span> : null}
          </div>
        ))}
        <div ref={bottom} />
      </div>
      {!atBottom && <div className="relative h-0"><button onClick={scrollToBottom} className="absolute left-1/2 -translate-x-1/2 -top-12 z-10 btn rounded-full px-2.5 py-2 shadow-lg flex items-center" title="Xuống cuối hội thoại"><ArrowDown size={16} />{unseen > 0 && <span className="ml-1 bg-red-500 text-white rounded-full text-[10px] px-1.5">{unseen}</span>}</button></div>}
      <div className="bg-white border-t border-slate-200 p-3">
        {conv.scheduled_message && <div className="text-xs text-amber-700 mb-1 flex items-center gap-1"><Clock size={12} /> Tin hẹn giờ: “{conv.scheduled_message.text}” lúc {dt(conv.scheduled_message.send_at, "HH:mm dd/MM")}</div>}
        {err && <div className="text-xs text-red-600 mb-1">{err}</div>}
        {multi && <div className="flex items-center gap-1 mb-2 text-xs text-slate-500">Trả lời qua:{all.map((c) => <button key={c.id} onClick={() => setTarget(c)} className={cn("chip border flex items-center gap-1", target.id === c.id ? (c.channel_type === "zalo_personal" ? "bg-green-600 text-white border-green-600" : "bg-blue-600 text-white border-blue-600") : "bg-white border-slate-200 text-slate-600")}><ChannelIcon type={c.channel_type} size={12} />{c.kind === "group" ? "Nhóm Zalo" : c.channel_type === "zalo_personal" ? "Zalo" : c.kind === "comment" ? "FB bình luận" : "Messenger"}</button>)}</div>}
        {slashItems.length > 0 && <div className="mb-2 card shadow-lg max-h-64 overflow-auto p-1">
          <div className="px-2 py-1 text-[11px] text-slate-400">Trả lời nhanh — ↑↓ chọn, Enter/Tab chèn, Esc huỷ</div>
          {slashItems.map((k, i) => <button key={k.id} onMouseDown={(e) => { e.preventDefault(); pickSlash(k); }} className={cn("block w-full text-left px-2 py-1.5 text-sm rounded", i === slashIdx ? "bg-blue-50" : "hover:bg-slate-50")}><b className="text-blue-700">{k.shortcut}</b> {k.title}<div className="text-[11px] text-slate-400 truncate">{k.content}</div></button>)}
        </div>}
        {atItems.length > 0 && <div className="mb-2 card shadow-lg max-h-56 overflow-auto p-1">
          <div className="px-2 py-1 text-[11px] text-slate-400">Tag thành viên nhóm — ↑↓ chọn, Enter/Tab chèn</div>
          {atItems.map((m, i) => <button key={m.id} onMouseDown={(e) => { e.preventDefault(); pickAt(m); }} className={cn("block w-full text-left px-2 py-1.5 text-sm rounded", i === atIdx ? "bg-blue-50" : "hover:bg-slate-50")}>@{m.name}</button>)}
        </div>}
        {files.length > 0 && <div className="flex gap-2 flex-wrap mb-2">{files.map((f, i) => <div key={i} className="relative border rounded-md bg-slate-50 p-1 text-xs max-w-[120px]">{f.preview ? <img src={f.preview} alt="" className="h-16 rounded object-cover" /> : <div className="h-16 flex items-center px-1 truncate">{f.file.name}</div>}<button className="absolute -top-2 -right-2 bg-white border rounded-full p-0.5" onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))}><X size={12} /></button></div>)}</div>}
        <textarea ref={taRef} className="input resize-none" rows={3} placeholder="Nhập tin nhắn… (Enter gửi, Shift+Enter xuống dòng, gõ /phím_tắt để chèn trả lời nhanh, dán ảnh Ctrl+V)" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey}
          onPaste={(e) => { const fs = Array.from(e.clipboardData.files || []); if (fs.length) { e.preventDefault(); addFiles(fs); } }}
          onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }} onDragOver={(e) => e.preventDefault()} />
        <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,application/pdf" className="hidden" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
        <div className="flex items-center gap-2 mt-2">
          <div className="relative" ref={quickRef}><button className={cn("btn px-2", showQuick && "bg-blue-50 border-blue-300")} title="Trả lời nhanh" onClick={() => setShowQuick((v) => !v)}><Zap size={14} /></button>
            {showQuick && <div className="absolute bottom-9 left-0 z-20 card w-80 shadow-lg p-1">
              <input autoFocus className="input mb-1" placeholder="Gõ từ khoá: quạt, đèn thả, chào, showroom…" value={quickQ} onChange={(e) => setQuickQ(e.target.value)} />
              <div className="max-h-64 overflow-auto">
                {knowledge.length === 0 && <div className="p-2 text-xs text-slate-400">Chưa có nội dung trong Kho tri thức</div>}
                {knowledge.filter((k) => matchQuick(k, quickQ)).map((k) => (
                  <button key={k.id} onClick={() => { setText(fill(k.content)); setShowQuick(false); setQuickQ(""); }} className="block w-full text-left px-2 py-1.5 text-sm hover:bg-slate-50 rounded">
                    <div><b className="text-blue-700">{k.shortcut}</b> {k.title}</div><div className="text-[11px] text-slate-400 truncate">{k.content}</div>
                  </button>))}
              </div>
            </div>}
          </div>
          <button className="btn px-2" title="Đính kèm ảnh / video / PDF" onClick={() => fileRef.current?.click()}><Paperclip size={14} /></button>
          <label className="btn px-2 text-xs" title="Hẹn giờ gửi"><Clock size={14} /><input type="datetime-local" className="ml-1 text-xs outline-none" value={schedule} onChange={(e) => setSchedule(e.target.value)} /></label>
          <button className="btn btn-primary ml-auto" onClick={send} disabled={sending || (!text.trim() && !files.length)}><Send size={14} /> {uploading ? "Đang tải lên…" : schedule ? "Hẹn gửi" : "Gửi"}</button>
        </div>
      </div>
    </>
  );
}
