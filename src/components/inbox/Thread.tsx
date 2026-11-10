"use client";
import { useEffect, useRef, useState } from "react";
import { Send, Clock, Tag, UserPlus, Star, Check, Zap, Paperclip, X, ArrowDown, Forward, Users, Pencil, ShoppingCart, Images, ExternalLink, Reply, MessageSquareQuote, Copy, CheckSquare, Square, MoreHorizontal, Trash2, Ban, RotateCcw } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Conversation, Label, Message } from "@/lib/types";
import { ChannelIcon } from "@/components/ChannelIcon";
import { cn, dt, ago, convName } from "@/lib/utils";
import { renameCustomer } from "@/components/CustomerName";
import { LinkPreview, firstUrl } from "./LinkPreview";
import { ForwardDialog } from "./ForwardDialog";
import { BankCard } from "./BankCard";
import { LocationCard } from "./LocationCard";
import { ContactCard } from "./ContactCard";
import { CallCard } from "./CallCard";
import { MediaGallery } from "./MediaGallery";
import { Lightbox } from "./Lightbox";

export function Thread({ conv, siblings, labels, members, knowledge }: { conv: Conversation; siblings?: Conversation[]; labels: Label[]; members: { id: string; name: string }[]; knowledge: { id: string; title: string; shortcut?: string | null; content: string }[] }) {
  const sb = supabaseBrowser();
  const all = siblings && siblings.length ? siblings : [conv];
  const ids = all.map((c) => c.id);
  const memberName = Object.fromEntries(members.map((x) => [x.id, x.name])); // tên người trả lời trên bong bóng gửi đi
  const multi = all.length > 1;
  const byId = Object.fromEntries(all.map((c) => [c.id, c])) as Record<string, Conversation>;
  // kênh trả lời mặc định: hội thoại có tin khách gửi gần nhất
  const [target, setTarget] = useState<Conversation>(() => [...all].sort((a, b) => (b.last_inbound_at || b.last_message_at || "").localeCompare(a.last_inbound_at || a.last_message_at || ""))[0] || conv);
  const [fwd, setFwd] = useState<{ text?: string | null; attachments?: any[]; items?: { text?: string | null; attachments?: any[] }[] } | null>(null); const [fwdOk, setFwdOk] = useState("");
  const [showGallery, setShowGallery] = useState(false);
  const [showMore, setShowMore] = useState(false);
  // điện thoại: nhấn giữ tin 450ms → hiện thanh thao tác (trích dẫn / chuyển tiếp / chép / chọn)
  const [touchActions, setTouchActions] = useState<string | null>(null); const lpTimer = useRef<any>(null);
  const lpStart = (id: string) => { lpTimer.current = setTimeout(() => { setTouchActions(id); if (navigator.vibrate) navigator.vibrate(10); }, 450); };
  const lpEnd = () => { if (lpTimer.current) clearTimeout(lpTimer.current); };
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => { const mq = window.matchMedia("(max-width: 767px)"); const f = () => setIsMobile(mq.matches); f(); mq.addEventListener("change", f); return () => mq.removeEventListener("change", f); }, []);
  const [handoverBusy, setHandoverBusy] = useState(false); const [handoverMsg, setHandoverMsg] = useState("");
  const handover = async (action: "take" | "release") => {
    setHandoverBusy(true); setHandoverMsg("");
    const r = await fetch(`/api/channels/${conv.channel_id}/handover`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversation_id: conv.id, action }) });
    const j = await r.json(); setHandoverBusy(false);
    if (!r.ok) setHandoverMsg("Meta từ chối: " + (j.error || "") + (j.code ? ` (mã ${j.code})` : "") + " — kiểm tra Cài đặt Handover của Page (xem hướng dẫn).");
  };
  const [lb, setLb] = useState<number | null>(null); // lightbox: chỉ số trong danh sách ảnh của hội thoại
  const [replyTo, setReplyTo] = useState<Message | null>(null); // trích dẫn tin khi trả lời
  useEffect(() => { setReplyTo(null); }, [conv.id]);
  const quoteOf = (m: Message) => { const a0 = m.attachments?.[0]; return { msg: m.text || "", thumb: a0?.type === "image" ? a0.url : null, kind: a0 ? a0.type : "text", name: a0?.name || null, from: m.direction === "out" ? "Mình" : ((m as any).sender_name || convName(conv)), msg_id: m.external_msg_id || null }; };
  const [picked, setPicked] = useState<Set<string>>(new Set()); // chọn nhiều tin để chuyển tiếp
  const togglePick = (id: string) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  useEffect(() => { setPicked(new Set()); }, [conv.id]);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const allImages = msgs.flatMap((x) => (x.attachments || []).filter((a) => a.type === "image").map((a) => ({ url: a.url, caption: `${x.direction === "out" ? "Mình" : ((x as any).sender_name || "Khách")} · ${dt(x.sent_at)}` })));
  const PAGE = 200; const [hasMore, setHasMore] = useState(false); const [loadingOld, setLoadingOld] = useState(false);
  const loadOlder = async () => {
    const oldest = msgs[0]?.sent_at; if (!oldest || loadingOld) return; setLoadingOld(true);
    const el = scroller.current; const before = el ? el.scrollHeight - el.scrollTop : 0;
    const { data } = await sb.from("crm_messages").select("*").in("conversation_id", ids).lt("sent_at", oldest).order("sent_at", { ascending: false }).limit(PAGE);
    const arr = ((data as Message[]) || []).reverse(); setHasMore(arr.length >= PAGE);
    setMsgs((m) => [...arr, ...m]); setLoadingOld(false);
    requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - before; }); // giữ nguyên vị trí đang đọc
  };
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  // trạng thái worker Zalo: phiên hết hạn / worker tắt → báo ngay trên khung chat (tin sẽ không đi được)
  const [zw, setZw] = useState<{ state?: string; heartbeat_at?: string | null; last_error?: string | null } | null>(null);
  useEffect(() => {
    if (!all.some((c) => c.channel_type === "zalo_personal")) return;
    sb.from("crm_zalo_worker").select("state,heartbeat_at,last_error").eq("id", 1).maybeSingle().then(({ data }) => setZw(data));
    const ch = sb.channel("zw-thread").on("postgres_changes", { event: "UPDATE", schema: "public", table: "crm_zalo_worker" }, (p) => setZw(p.new as any)).subscribe();
    const t = setInterval(() => setZw((w) => (w ? { ...w } : w)), 60000); // tính lại "quá hạn heartbeat" mỗi phút
    return () => { sb.removeChannel(ch); clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv.id]);
  const zaloDown = target.channel_type === "zalo_personal" && zw && (zw.state !== "online" || !zw.heartbeat_at || Date.now() - new Date(zw.heartbeat_at).getTime() > 3 * 60000);
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
    const onDown = (e: MouseEvent) => { if (headRef.current && !headRef.current.contains(e.target as Node)) { setShowLabels(false); setShowAssign(false); setShowMore(false); } };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setShowLabels(false); setShowAssign(false); setShowMore(false); } };
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
  // trích dẫn → tìm tin gốc: khớp msgId (globalMsgId) hoặc cliMsgId; chưa tải → hỏi DB rồi tải dần tới tin đó
  const quoteHit = (q: any, x: Message) => (q.msg_id && x.external_msg_id === String(q.msg_id)) || (q.cli_id && String((x as any).raw?.zq?.cliMsgId ?? "") === String(q.cli_id));
  const [quoteNote, setQuoteNote] = useState<{ id: string; text: string } | null>(null);
  const flash = (id: string) => { const el = document.getElementById("msg-" + id); if (!el) return false; el.scrollIntoView({ block: "center", behavior: "smooth" }); el.classList.add("ring-2", "ring-amber-400", "bg-amber-50/40"); setTimeout(() => el.classList.remove("ring-2", "ring-amber-400", "bg-amber-50/40"), 2200); return true; };
  const jumpToQuote = async (from: Message, q: any) => {
    setQuoteNote(null);
    const local = msgs.find((x) => quoteHit(q, x)); if (local && flash(local.id)) return;
    if (!q.msg_id && !q.cli_id) { setQuoteNote({ id: from.id, text: "Tin trích dẫn này không có mã tin gốc — không định vị được." }); return; }
    setQuoteNote({ id: from.id, text: "Đang tìm tin gốc…" });
    let found: Message | null = null;
    if (q.msg_id) { const { data } = await sb.from("crm_messages").select("*").in("conversation_id", ids).eq("external_msg_id", String(q.msg_id)).limit(1); found = (data as Message[])?.[0] || null; }
    if (!found && q.cli_id) { const { data } = await sb.from("crm_messages").select("*").in("conversation_id", ids).eq("raw->zq->>cliMsgId", String(q.cli_id)).limit(1); found = (data as Message[])?.[0] || null; }
    if (!found) { setQuoteNote({ id: from.id, text: "Không tìm thấy tin gốc trong CRM (có thể gửi trước khi kết nối Zalo vào CRM, hoặc đã bị thu hồi)." }); return; }
    const oldest = msgs[0]?.sent_at;
    if (oldest && (found.sent_at || "") < oldest) {
      // tải toàn bộ tin từ tin gốc tới phần đang có (giới hạn 2000 tin để không treo trình duyệt)
      const { data } = await sb.from("crm_messages").select("*").in("conversation_id", ids).gte("sent_at", found.sent_at).lt("sent_at", oldest).order("sent_at", { ascending: true }).limit(2000);
      const arr = (data as Message[]) || [];
      setMsgs((m) => { const have = new Set(m.map((x) => x.id)); return [...arr.filter((x) => !have.has(x.id)), ...m]; });
    } else if (!msgs.some((x) => x.id === found!.id)) {
      setMsgs((m) => [...m, found!].sort((a, b) => (a.sent_at || a.created_at || "").localeCompare(b.sent_at || b.created_at || "")));
    }
    setQuoteNote(null);
    // chờ React vẽ xong rồi cuộn tới
    let tries = 0; const go = () => { if (flash(found!.id) || ++tries > 20) return; setTimeout(go, 80); }; setTimeout(go, 60);
  };
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
    // LỖI CŨ: order tăng dần + limit → hội thoại dài bị cắt mất tin MỚI. Giờ lấy 200 tin mới nhất rồi đảo lại; tin cũ hơn tải thêm bằng nút.
    sb.from("crm_messages").select("*").in("conversation_id", ids).order("sent_at", { ascending: false }).limit(PAGE).then(({ data }) => { const arr = ((data as Message[]) || []).reverse(); setHasMore(arr.length >= PAGE); setMsgs(arr); requestAnimationFrame(() => { jumpBottom(); setTimeout(jumpBottom, 150); setTimeout(jumpBottom, 600); }); });
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
    const body = text.trim(); const sched = schedule; const rt = replyTo;
    setText(""); setSchedule(""); setFiles([]); setReplyTo(null);
    await post({ conversation_id: target.id, text: body || undefined, attachments, scheduled_at: sched || undefined, reply_to: rt?.id || undefined, quote: rt ? quoteOf(rt) : null });
  };
  /** Gọi API gửi; hiện tin ngay (optimistic), server xác nhận sau; lỗi → bong bóng "lỗi" kèm lý do + nút Gửi lại */
  const post = async (p: { conversation_id: string; text?: string; attachments: any[]; scheduled_at?: string; reply_to?: string; quote?: any; retry_of?: string }) => {
    const tmpId = "tmp-" + Date.now(); const sched = p.scheduled_at;
    if (!sched) setMsgs((m) => [...m, { id: tmpId, conversation_id: p.conversation_id, direction: "out", type: p.attachments[0]?.type || "text", text: p.text || null, attachments: p.attachments, status: "queued", sent_at: new Date().toISOString(), created_at: new Date().toISOString(), raw: p.quote ? { quote: p.quote } : null } as any]);
    const r = await fetch("/api/messages/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversation_id: p.conversation_id, text: p.text, attachments: p.attachments, scheduled_at: sched, reply_to: p.reply_to, retry_of: p.retry_of }) });
    const j = await r.json(); setSending(false);
    if (!r.ok) { setErr(j.error || "Gửi thất bại"); setMsgs((m) => m.map((x) => (x.id === tmpId ? { ...x, status: "failed", raw: { ...((x as any).raw || {}), error: j.error || "Gửi thất bại" } } : x))); return; }
    if (!sched) setMsgs((m) => m.map((x) => (x.id === tmpId ? { ...x, status: "sent" } : x)));
    if (p.retry_of) setMsgs((m) => m.filter((x) => x.id !== p.retry_of)); // bản lỗi cũ đã xoá (server) hoặc là tin tạm
  };
  /** Gửi lại tin lỗi: giữ nguyên nội dung/đính kèm; tin tạm (tmp-) chỉ cần gửi lại, tin trong DB → server xoá bản lỗi */
  const retry = (m: Message) => { setSending(true); setErr(null); const q = (m as any).raw?.quote; const orig = q?.msg_id ? msgs.find((x) => x.external_msg_id === q.msg_id) : null; post({ conversation_id: m.conversation_id, text: m.text || undefined, attachments: m.attachments || [], quote: q || null, reply_to: orig?.id, retry_of: m.id.startsWith("tmp-") ? undefined : m.id }); if (m.id.startsWith("tmp-")) setMsgs((x) => x.filter((y) => y.id !== m.id)); };
  const toggleLabel = async (name: string) => {
    const next = convLabels.includes(name) ? convLabels.filter((l) => l !== name) : [...convLabels, name];
    setConvLabels(next); await sb.from("crm_conversations").update({ labels: next }).eq("id", conv.id);
  };
  // đổi tên chỉ trong CRM (không đổi trên Zalo/FB):
  //  - khách đã có hồ sơ → đổi tên khách (crm_customers), tên cũ được lưu vào custom.old_names
  //  - nhóm / hội thoại chưa có khách → lưu meta.alias, để trống = dùng lại tên gốc trên kênh
  const renameGroup = async () => {
    if (conv.kind !== "group" && conv.customer_id) {
      const { data: p } = await sb.from("crm_customers").select("id,name,custom").eq("id", conv.customer_id).single();
      if (!p) return;
      const v = window.prompt("Tên khách hiển thị trong CRM (tên cũ vẫn được lưu lại trong hồ sơ):", p.name || conv.display_name || "");
      if (v === null || !v.trim()) return;
      try { await renameCustomer(p, v); } catch (e: any) { setErr(e.message || "Không đổi tên được"); }
      return;
    }
    const cur = (conv as any).meta?.alias || "";
    const v = window.prompt(conv.kind === "group" ? "Tên nhóm hiển thị trong CRM (để trống để dùng tên gốc trên Zalo):" : "Tên hiển thị trong CRM (để trống để dùng tên gốc trên kênh):", cur || conv.display_name || "");
    if (v === null) return;
    const alias = v.trim() && v.trim() !== conv.display_name ? v.trim() : null;
    await sb.from("crm_conversations").update({ meta: { ...((conv as any).meta || {}), alias } }).eq("id", conv.id);
  };
  // Xoá hội thoại khỏi CRM = ẩn (is_hidden) toàn bộ hội thoại của khách này; tin nhắn vẫn lưu, xem lại ở bộ lọc "Đã xoá/chặn"
  const hideConv = async (hide: boolean) => {
    if (hide && !window.confirm("Xoá hội thoại này khỏi CRM?\nTin nhắn vẫn được lưu, tin mới sẽ không hiện và không báo. Xem lại ở bộ lọc “Đã xoá/chặn”.")) return;
    await sb.from("crm_conversations").update({ is_hidden: hide, status: hide ? "closed" : "open" }).in("id", ids); setShowMore(false);
  };
  // Chặn trên Zalo: tạo hành động cho worker (api.blockUser) + ẩn hội thoại ngay
  const zaloConv = all.find((c) => c.channel_type === "zalo_personal" && c.kind !== "group") || null;
  const blockZalo = async (block: boolean) => {
    if (!zaloConv?.external_id) return;
    if (block && !window.confirm(`Chặn ${convName(conv)} trên Zalo?\nHọ sẽ không nhắn được cho số Zalo của shop nữa. Hội thoại bị ẩn khỏi CRM, bỏ chặn được ở bộ lọc “Đã xoá/chặn”.`)) return;
    await sb.from("crm_zalo_actions").insert({ action: block ? "block" : "unblock", zalo_uid: zaloConv.external_id, conversation_id: zaloConv.id, identity_id: zaloConv.identity_id });
    await sb.from("crm_conversations").update({ is_hidden: block, status: block ? "closed" : "open" }).in("id", ids); setShowMore(false);
  };
  // thanh thao tác khi rê chuột lên tin: Trích dẫn · Chuyển tiếp · Chép · Chọn
  const renderActions = (m: Message) => {
    if (!(m.text || m.attachments?.length)) return null;
    const on = picked.has(m.id);
    const B = (title: string, onClick: () => void, icon: React.ReactNode, active?: boolean) => <button title={title} onClick={onClick} className={cn("p-1.5 rounded-md text-slate-500 hover:bg-blue-50 hover:text-blue-700 transition", active && "text-blue-700")}>{icon}</button>;
    if (isMobile && touchActions !== m.id && !picked.size && !on) return null;
    return <div className={cn("flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white shadow-md px-0.5 self-center transition-opacity", picked.size || on || touchActions === m.id ? "opacity-100 msg-actions" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100")}>
      {!picked.size && <>{B("Trích dẫn tin này để trả lời", () => { setReplyTo(m); taRef.current?.focus(); }, <MessageSquareQuote size={15} />)}
      {B("Chuyển tiếp", () => setFwd({ text: m.text, attachments: m.attachments }), <Forward size={15} />)}
      {m.text && B("Chép nội dung", () => { navigator.clipboard?.writeText(m.text || ""); }, <Copy size={15} />)}</>}
      {B(on ? "Bỏ chọn" : "Chọn nhiều tin để chuyển tiếp", () => togglePick(m.id), on ? <CheckSquare size={15} /> : <Square size={15} />, on)}
    </div>;
  };
  // Tạo đơn hàng từ hội thoại: chưa có hồ sơ khách thì tạo nhanh rồi mở form đơn (kèm lịch hẹn)
  const createOrder = async () => {
    let pid = conv.customer_id;
    if (!pid) {
      // nhóm: hồ sơ khách mang tên nhóm (có thể sửa tên/SĐT sau ở CDP); 1-1: tên + SĐT đang có
      const { data: p, error } = await sb.from("crm_customers").insert({ name: convName(conv), phone: conv.person_phone || null, avatar_url: conv.identity_avatar, source_origin: "manual", source_channel_id: conv.channel_id, ...(conv.kind === "group" ? { tags: ["Nhóm Zalo"] } : {}) }).select("id").single();
      if (error || !p) { alert("Không tạo được hồ sơ khách: " + error?.message); return; }
      pid = p.id; await sb.from("crm_conversations").update({ customer_id: pid }).eq("id", conv.id); await sb.from("crm_identities").update({ customer_id: pid }).eq("id", conv.identity_id);
    }
    window.location.href = `/orders/new?person=${pid}&conv=${conv.id}`;
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
    if (e.key === "Escape" && replyTo) { setReplyTo(null); return; }
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
        <div className="min-w-0"><div className="font-semibold truncate flex items-center gap-1">{conv.kind === "group" && <span className="inline-flex items-center gap-0.5 group-badge shrink-0"><Users size={10} />NHÓM</span>}<span className="truncate">{convName(conv)}</span>{conv.is_important && <Star size={14} className="fill-amber-400 text-amber-400 shrink-0" />}<button title={conv.kind === "group" ? "Đổi tên nhóm trong CRM" : conv.customer_id ? "Đổi tên khách (tên cũ vẫn được lưu)" : "Đổi tên hiển thị trong CRM"} onClick={renameGroup} className="p-0.5 text-slate-400 hover:text-blue-600 shrink-0"><Pencil size={12} /></button></div><div className="text-xs text-slate-500 truncate">{conv.kind === "group" ? `Nhóm Zalo · ${((conv as any).meta?.members?.length || 0) > 0 ? `${(conv as any).meta.members.length} thành viên` : "Tên gốc: " + (conv.display_name || "")}` : (multi ? all.map((c) => c.channel_name + (c.kind === "comment" ? " (bình luận)" : "")).join(" · ") : conv.channel_name)}{conv.kind === "group" && (conv as any).meta?.alias && ` · Tên gốc: ${conv.display_name}`}{conv.kind !== "group" && conv.display_name && convName(conv) !== conv.display_name && ` · Tên gốc: ${conv.display_name}`}{conv.person_phone && ` · ${conv.person_phone}`}</div></div>
        <div ref={headRef} className="ml-auto flex items-center gap-1 relative md:mr-10">
          <button className={cn("tbtn", showLabels && "active")} title="Gắn nhãn cho hội thoại" onClick={() => { setShowLabels((v) => !v); setShowAssign(false); setShowMore(false); }}><Tag size={15} /><span className="hidden lg:inline">Nhãn</span></button>
          <button className={cn("tbtn", showAssign && "active")} title="Giao hội thoại cho nhân viên" onClick={() => { setShowAssign((v) => !v); setShowLabels(false); setShowMore(false); }}><UserPlus size={15} /><span className="hidden lg:inline">Giao cho</span></button>
          <button className="tbtn" title={conv.kind === "group" ? "Tạo đơn hàng + lịch hẹn cho nhóm này" : "Tạo đơn hàng + lịch hẹn cho khách này"} onClick={createOrder}><ShoppingCart size={15} /><span className="hidden lg:inline">Tạo đơn</span></button>
          <button className="tbtn" title="Thư viện ảnh / video / file / link" onClick={() => setShowGallery(true)}><Images size={15} /><span className="hidden lg:inline">Thư viện</span></button>
          <button className={cn("tbtn", showMore && "active")} title="Thêm thao tác" onClick={() => { setShowMore((v) => !v); setShowLabels(false); setShowAssign(false); }}><MoreHorizontal size={16} /></button>
          {showMore && <div className="absolute right-0 top-10 z-10 card p-1.5 w-60 shadow-lg text-sm">
            <button className="flex w-full items-center gap-2 px-2 py-2 rounded hover:bg-slate-50" onClick={() => { sb.from("crm_conversations").update({ is_important: !conv.is_important }).eq("id", conv.id); setShowMore(false); }}><Star size={15} className={cn(conv.is_important && "fill-amber-400 text-amber-400")} />{conv.is_important ? "Bỏ đánh dấu quan trọng" : "Đánh dấu quan trọng"}</button>
            <button className="flex w-full items-center gap-2 px-2 py-2 rounded hover:bg-slate-50" onClick={() => { sb.from("crm_conversations").update({ status: conv.status === "open" ? "closed" : "open" }).eq("id", conv.id); setShowMore(false); }}><Check size={15} />{conv.status === "open" ? "Đóng hội thoại (đã xử lý xong)" : "Mở lại hội thoại"}</button>
            <a className="hidden md:flex w-full items-center gap-2 px-2 py-2 rounded hover:bg-slate-50" href={`/inbox?c=${conv.id}`} target="_blank" rel="noreferrer" onClick={() => setShowMore(false)}><ExternalLink size={15} />Mở ở tab mới</a>
            <div className="my-1 border-t border-slate-100" />
            {conv.is_hidden
              ? <button className="flex w-full items-center gap-2 px-2 py-2 rounded hover:bg-slate-50" onClick={() => hideConv(false)}><RotateCcw size={15} />Khôi phục hội thoại</button>
              : <button className="flex w-full items-center gap-2 px-2 py-2 rounded hover:bg-slate-50 text-red-600" onClick={() => hideConv(true)}><Trash2 size={15} />Xoá hội thoại khỏi CRM</button>}
            {zaloConv && (conv.is_hidden
              ? <button className="flex w-full items-center gap-2 px-2 py-2 rounded hover:bg-slate-50" onClick={() => blockZalo(false)}><Ban size={15} />Bỏ chặn trên Zalo (nếu đã chặn)</button>
              : <button className="flex w-full items-center gap-2 px-2 py-2 rounded hover:bg-slate-50 text-red-600" title="Người này không nhắn được cho Zalo shop nữa; hội thoại bị ẩn" onClick={() => blockZalo(true)}><Ban size={15} />Chặn người này trên Zalo</button>)}
          </div>}
          {showLabels && <div className="absolute right-0 top-10 z-10 card p-2 w-56 max-h-72 overflow-auto shadow-lg"><div className="flex items-center justify-between text-xs text-slate-500 mb-1"><span>Gắn nhãn</span><button onClick={() => setShowLabels(false)} className="btn px-1.5 py-0.5"><X size={12} /></button></div>{labels.map((l) => <label key={l.id} className="flex items-center gap-2 py-1 text-sm cursor-pointer"><input type="checkbox" checked={convLabels.includes(l.name)} onChange={() => toggleLabel(l.name)} /><span className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} />{l.name}</label>)}</div>}
          {showAssign && <div className="absolute right-0 top-10 z-10 card p-2 w-56 shadow-lg">{members.map((m) => <button key={m.id} onClick={() => assign(m.id)} className="block w-full text-left py-1.5 px-2 rounded hover:bg-slate-50 text-sm">{m.name}</button>)}</div>}
        </div>
      </div>
      {convLabels.length > 0 && <div className="px-4 py-1.5 bg-white border-b border-slate-100 flex gap-1 flex-wrap">{convLabels.map((l) => { const lb = labels.find((x) => x.name === l); return <span key={l} className="chip text-white" style={{ background: lb?.color || "#64748b" }}>{l}</span>; })}</div>}
      {conv.ai_summary && <div className="mx-4 mt-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900"><b>AI tóm tắt:</b> {conv.ai_summary}</div>}
      {showGallery && <MediaGallery ids={ids} onClose={() => setShowGallery(false)} />}
      {lb !== null && allImages.length > 0 && <Lightbox images={allImages} index={lb} onClose={() => setLb(null)} />}
      {(() => { const ai = (conv as any).meta?.ai_meta; if (conv.channel_type !== "fb_page" || !ai) return null; const ref = ai.standby ? ai.standby_at : ai.last_at; if (!ref) return null; const fresh = Date.now() - new Date(ref).getTime() < 48 * 3600000; if (!fresh && !ai.standby) return null; return (
        <div className={cn("shrink-0 flex flex-wrap items-center gap-2 px-3 py-1.5 text-xs border-b", ai.taken_over ? "bg-emerald-50 border-emerald-100 text-emerald-800" : "bg-violet-50 border-violet-100 text-violet-800")}>
          <span>{ai.taken_over ? "✅ Nhân viên đang giữ hội thoại — AI Meta tạm ngưng." : (ai.standby ? "🤖 Business Suite / AI Meta đang giữ quyền hội thoại này — CRM chỉ đang theo dõi. Bấm để giành quyền và tự trả lời." : "🤖 Hội thoại này đang được trả lời từ Business Suite (tác nhân AI của Meta hoặc người dùng app Messenger/Business Suite).")}</span>
          <button className="btn px-2 py-1 text-xs ml-auto" disabled={handoverBusy} onClick={() => handover(ai.taken_over ? "release" : "take")}>{handoverBusy ? "Đang xử lý…" : ai.taken_over ? "Trả lại cho AI Meta" : "Tôi tự trả lời"}</button>
          {handoverMsg && <span className="w-full text-red-600">{handoverMsg}</span>}
        </div>); })()}
      {picked.size > 0 && <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-blue-50 border-b border-blue-100 text-sm"><b>Đã chọn {picked.size}</b><button className="btn btn-primary px-2 py-1 text-xs" onClick={() => setFwd({ items: msgs.filter((x) => picked.has(x.id)).map((x) => ({ text: x.text, attachments: x.attachments })) })}><Forward size={14} className="inline mr-1" />Chuyển tiếp</button><button className="btn px-2 py-1 text-xs" onClick={() => setPicked(new Set(msgs.filter((x) => x.attachments?.some((a) => a.type === "image")).map((x) => x.id)))}>Chọn tất cả ảnh</button><button className="btn px-2 py-1 text-xs ml-auto" onClick={() => setPicked(new Set())}>Huỷ</button></div>}
      {fwd && <ForwardDialog text={fwd.text} attachments={fwd.attachments} items={fwd.items} excludeId={conv.id} onClose={(sent) => { setFwd(null); if (sent) { setPicked(new Set()); setFwdOk("Đã chuyển tiếp tới " + sent); setTimeout(() => setFwdOk(""), 3000); } }} />}
      {fwdOk && <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 bg-emerald-600 text-white text-xs px-3 py-1.5 rounded-full shadow">{fwdOk}</div>}
      <div ref={scroller} onScroll={onScroll} onClick={(e) => { if (touchActions && !(e.target as HTMLElement).closest(".msg-actions")) setTouchActions(null); }} className="flex-1 overflow-y-auto px-4 py-3 space-y-2 relative">
        {hasMore && <div className="text-center"><button onClick={loadOlder} disabled={loadingOld} className="btn text-xs px-3 py-1">{loadingOld ? "Đang tải…" : "Xem tin cũ hơn"}</button></div>}
        {msgs.map((m) => (
          <div key={m.id} id={"msg-" + m.id} onTouchStart={() => lpStart(m.id)} onTouchEnd={lpEnd} onTouchMove={lpEnd} onContextMenu={(e) => { if (isMobile) e.preventDefault(); }} className={cn("flex group items-center gap-1.5 rounded-xl transition py-0.5 select-none md:select-text", m.direction === "out" ? "justify-end" : "justify-start")}>
            {multi && m.direction !== "out" && <span className="mr-1 mt-2 shrink-0 self-start"><ChannelIcon type={byId[m.conversation_id]?.channel_type} size={14} /></span>}
            {m.direction === "out" && renderActions(m)}
            <div className={cn("relative max-w-[70%] lg:max-w-[640px] rounded-2xl px-3.5 py-2 text-[15px] leading-[1.5] shadow-sm", m.reactions && Object.keys(m.reactions).length > 0 && "mb-3", (m as any).raw?.call ? "!bg-transparent !shadow-none !p-0" : m.direction === "out" ? (m.status === "failed" ? "bg-red-600 text-white rounded-br-sm" : byId[m.conversation_id]?.channel_type === "zalo_personal" ? "bg-green-600 text-white rounded-br-sm" : "bg-blue-600 text-white rounded-br-sm") : "bg-white rounded-bl-sm")}>
              {m.attachments?.filter((a) => (a.type as string) !== "link").map((a, i) => a.type === "image" ? <img key={i} src={a.url} alt="" className="rounded-lg max-h-60 mb-1 cursor-zoom-in hover:opacity-95" onLoad={() => { if (atBottom) jumpBottom(); }} onClick={() => { const k = allImages.findIndex((x) => x.url === a.url); setLb(k >= 0 ? k : 0); }} /> : a.type === "video" ? <video key={i} src={a.url} controls className="rounded-lg max-h-60 mb-1 max-w-full" /> : a.type === "audio" ? <audio key={i} src={a.url} controls className="mb-1 max-w-full" /> : <a key={i} href={a.url} target="_blank" className="underline block mb-1">📎 {a.name || a.type}</a>)}
              {m.direction === "in" && (m as any).sender_name && <div className="text-[12px] font-semibold text-blue-700 mb-0.5">{(m as any).sender_name}</div>}
              {(m as any).raw?.quote && (() => { const q = (m as any).raw.quote; const canJump = !!(q.msg_id || q.cli_id); return (<>
                <button onClick={() => jumpToQuote(m, q)} title={canJump ? "Bấm để xem tin gốc" : "Không có mã tin gốc"} className={cn("mb-1.5 w-full text-left flex gap-2 items-center rounded-md border-l-4 px-2 py-1.5 text-xs", m.direction === "out" ? "bg-black/15 border-white/60 text-white/90" : "bg-slate-100 border-blue-500 text-slate-700", canJump && "cursor-pointer hover:brightness-95")}>
                  {q.thumb && <img src={q.thumb} alt="" className="w-10 h-10 rounded object-cover shrink-0" />}
                  <div className="min-w-0"><div className="font-semibold truncate">{q.from || "Tin nhắn"}</div><div className="truncate opacity-80">{q.msg || (q.kind === "image" ? "[Hình ảnh]" : q.kind === "video" ? "[Video]" : q.name ? "📎 " + q.name : "[Tệp]")}</div></div>
                </button>
                {quoteNote?.id === m.id && <div className={cn("mb-1.5 text-[11px] italic", m.direction === "out" ? "text-white/80" : "text-amber-700")}>{quoteNote.text}</div>}</>); })()}
              {m.direction === "out" && <div className={cn("text-[11px] font-medium opacity-85 mb-0.5", (m as any).raw?.meta_ai && "text-violet-200")}>{(m as any).raw?.meta_ai ? "🤖 Business Suite (AI Meta / trả lời ngoài CRM)" : m.sender_member_id ? (memberName[m.sender_member_id] || "Nhân viên") : (byId[m.conversation_id]?.channel_type === "zalo_personal" ? "Zalo (điện thoại)" : "Fanpage (Messenger)")}</div>}
              {(m as any).raw?.bank ? <BankCard bank={(m as any).raw.bank} /> : (m as any).raw?.location ? <LocationCard loc={(m as any).raw.location} /> : (m as any).raw?.contact ? <ContactCard c={(m as any).raw.contact} /> : (m as any).raw?.call ? <CallCard call={(m as any).raw.call} /> : m.text && <div className="whitespace-pre-wrap break-words">{m.text.split(/(https?:\/\/[^\s<>"']+)/g).map((part, i) => /^https?:\/\//.test(part) ? <a key={i} href={part} target="_blank" rel="noreferrer" className="underline">{part}</a> : part)}</div>}
              {m.text && firstUrl(m.text) && <LinkPreview url={firstUrl(m.text)!} dark={m.direction === "out"} />}
              <div className={cn("text-[11px] mt-1 flex items-center gap-1 tabular-nums", m.direction === "out" ? "text-blue-100/90" : "text-slate-500")}>{multi && m.direction === "out" && <ChannelIcon type={byId[m.conversation_id]?.channel_type} size={10} />}{multi && byId[m.conversation_id]?.kind === "comment" && "💬 bình luận · "}{dt(m.sent_at)}{m.direction === "out" && m.status === "queued" && " · đang gửi"}{m.status === "failed" && <span className="text-red-100 font-semibold">· chưa gửi được</span>}{m.direction === "out" && m.status === "failed" && <button onClick={() => retry(m)} disabled={sending} className="ml-1 rounded bg-white/90 text-red-700 px-1.5 py-0.5 font-semibold hover:bg-white disabled:opacity-60">Gửi lại</button>}</div>
              {m.status === "failed" && (m as any).raw?.error && <div className="text-[11px] mt-0.5 text-red-100/90 break-words">{String((m as any).raw.error)}</div>}
              {m.reactions && Object.keys(m.reactions).length > 0 && (() => {
                // gom theo emoji như Zalo: ❤️ 2 · 👍 1 — rê chuột để xem ai thả
                const rs = Object.values(m.reactions!); const by = new Map<string, string[]>();
                for (const r of rs) by.set(r.icon, [...(by.get(r.icon) || []), r.self ? "Mình" : (r.name || convName(byId[m.conversation_id] || conv))]);
                const tip = Array.from(by.entries()).map(([ic, ns]) => `${ic} ${ns.join(", ")}`).join("\n");
                return <div title={tip} className={cn("absolute -bottom-3 flex items-center gap-0.5 rounded-full bg-white border border-slate-200 shadow-sm px-1.5 py-[1px] text-[13px] leading-none text-slate-600 select-none", m.direction === "out" ? "left-2" : "right-2")}>
                  {Array.from(by.keys()).slice(0, 4).map((ic) => <span key={ic}>{ic}</span>)}{rs.length > 1 && <span className="text-[11px] font-medium tabular-nums ml-0.5">{rs.length}</span>}
                </div>;
              })()}
            </div>
            {m.direction !== "out" && renderActions(m)}
          </div>
        ))}
        <div ref={bottom} />
      </div>
      {!atBottom && <div className="relative h-0"><button onClick={scrollToBottom} className="absolute left-1/2 -translate-x-1/2 -top-12 z-10 btn rounded-full px-2.5 py-2 shadow-lg flex items-center" title="Xuống cuối hội thoại"><ArrowDown size={16} />{unseen > 0 && <span className="ml-1 bg-red-500 text-white rounded-full text-[10px] px-1.5">{unseen}</span>}</button></div>}
      <div className="bg-white border-t border-slate-200 p-3">
        {conv.scheduled_message && <div className="text-xs text-amber-700 mb-1 flex items-center gap-1"><Clock size={12} /> Tin hẹn giờ: “{conv.scheduled_message.text}” lúc {dt(conv.scheduled_message.send_at, "HH:mm dd/MM")}</div>}
        {err && <div className="text-xs text-red-600 mb-1">{err}</div>}
        {zaloDown && <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5 mb-2">⚠️ Zalo đang mất kết nối ({zw?.state === "need_qr" || zw?.state === "qr_ready" ? "phiên đăng nhập hết hạn, cần quét QR lại" : zw?.state !== "online" ? `worker ${zw?.state || "offline"}` : "worker không phản hồi"}{zw?.heartbeat_at ? `, hoạt động lần cuối ${ago(zw.heartbeat_at)}` : ""}) — tin gửi đi sẽ không tới khách. <a href="/settings/channels" className="underline font-semibold">Cài đặt → Kết nối kênh</a>{zw?.last_error ? <div className="opacity-80 mt-0.5">{zw.last_error}</div> : null}</div>}
        {multi && <div className="flex items-center gap-1 mb-2 text-xs text-slate-500">Trả lời qua:{all.map((c) => <button key={c.id} onClick={() => setTarget(c)} className={cn("chip border flex items-center gap-1", target.id === c.id ? (c.channel_type === "zalo_personal" ? "bg-green-600 text-white border-green-600" : "bg-blue-600 text-white border-blue-600") : "bg-white border-slate-200 text-slate-600")}><ChannelIcon type={c.channel_type} size={12} />{c.kind === "group" ? "Nhóm Zalo" : c.channel_type === "zalo_personal" ? "Zalo" : c.kind === "comment" ? "FB bình luận" : "Messenger"}</button>)}</div>}
        {slashItems.length > 0 && <div className="mb-2 card shadow-lg max-h-64 overflow-auto p-1">
          <div className="px-2 py-1 text-[11px] text-slate-400">Trả lời nhanh — ↑↓ chọn, Enter/Tab chèn, Esc huỷ</div>
          {slashItems.map((k, i) => <button key={k.id} onMouseDown={(e) => { e.preventDefault(); pickSlash(k); }} className={cn("block w-full text-left px-2 py-1.5 text-sm rounded", i === slashIdx ? "bg-blue-50" : "hover:bg-slate-50")}><b className="text-blue-700">{k.shortcut}</b> {k.title}<div className="text-[11px] text-slate-400 truncate">{k.content}</div></button>)}
        </div>}
        {atItems.length > 0 && <div className="mb-2 card shadow-lg max-h-56 overflow-auto p-1">
          <div className="px-2 py-1 text-[11px] text-slate-400">Tag thành viên nhóm — ↑↓ chọn, Enter/Tab chèn</div>
          {atItems.map((m, i) => <button key={m.id} onMouseDown={(e) => { e.preventDefault(); pickAt(m); }} className={cn("block w-full text-left px-2 py-1.5 text-sm rounded", i === atIdx ? "bg-blue-50" : "hover:bg-slate-50")}>@{m.name}</button>)}
        </div>}
        {replyTo && (() => { const q = quoteOf(replyTo); return <div className="mb-2 flex items-center gap-2 rounded-md border-l-4 border-blue-500 bg-slate-50 px-2 py-1.5 text-xs">
          <Reply size={14} className="text-blue-600 shrink-0" />{q.thumb && <img src={q.thumb} alt="" className="w-8 h-8 rounded object-cover" />}
          <div className="min-w-0 flex-1"><div className="font-semibold">Trả lời {q.from}</div><div className="truncate text-slate-600">{q.msg || (q.kind === "image" ? "[Hình ảnh]" : q.name ? "📎 " + q.name : "[Tệp]")}</div></div>
          <button onClick={() => setReplyTo(null)} className="p-1 rounded hover:bg-slate-200" title="Bỏ trích dẫn (Esc)"><X size={14} /></button></div>; })()}
        {files.length > 0 && <div className="flex gap-2 flex-wrap mb-2">{files.map((f, i) => <div key={i} className="relative border rounded-md bg-slate-50 p-1 text-xs max-w-[120px]">{f.preview ? <img src={f.preview} alt="" className="h-16 rounded object-cover" /> : <div className="h-16 flex items-center px-1 truncate">{f.file.name}</div>}<button className="absolute -top-2 -right-2 bg-white border rounded-full p-0.5" onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))}><X size={12} /></button></div>)}</div>}
        <textarea ref={taRef} className="input resize-none" rows={3} placeholder={isMobile ? "Nhập tin nhắn… (nhấn giữ tin để trích dẫn / chuyển tiếp)" : "Nhập tin nhắn… (Enter gửi, Shift+Enter xuống dòng, gõ /phím_tắt để chèn trả lời nhanh, dán ảnh Ctrl+V)"} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey}
          onPaste={(e) => { const fs = Array.from(e.clipboardData.files || []); if (fs.length) { e.preventDefault(); addFiles(fs); } }}
          onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }} onDragOver={(e) => e.preventDefault()} />
        <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,application/pdf" className="hidden" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
        <div className="flex items-center gap-2 mt-2">
          <div className="relative" ref={quickRef}><button className={cn("tbtn", showQuick && "active")} title="Trả lời nhanh (hoặc gõ / trong ô nhập)" onClick={() => setShowQuick((v) => !v)}><Zap size={15} /><span className="hidden lg:inline">Trả lời nhanh</span></button>
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
          <button className="tbtn" title="Đính kèm ảnh / video / PDF (hoặc dán Ctrl+V, kéo thả)" onClick={() => fileRef.current?.click()}><Paperclip size={15} /><span className="hidden lg:inline">Đính kèm</span></button>
          {/* hẹn giờ gửi: ẩn theo yêu cầu (hay bấm nhầm); logic gửi theo lịch vẫn giữ nguyên */}
          <button className={cn("ml-auto inline-flex items-center gap-1.5 rounded-md px-4 text-sm font-semibold transition-colors duration-150 active:scale-[0.97] h-9", (text.trim() || files.length) && !sending ? "bg-blue-600 hover:bg-blue-700 text-white shadow-sm cursor-pointer" : "bg-slate-200 text-slate-500 cursor-not-allowed dark-send-off")} onClick={send} disabled={sending || (!text.trim() && !files.length)} title="Gửi (Enter)"><Send size={15} /> {uploading ? "Đang tải lên…" : sending ? "Đang gửi…" : schedule ? "Hẹn gửi" : "Gửi"}</button>
        </div>
      </div>
    </>
  );
}
