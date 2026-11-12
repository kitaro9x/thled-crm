"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { X, ClipboardList, FileText, CalendarClock } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Activity, Attachment, Conversation, Message } from "@/lib/types";
import { cn, dt, convName } from "@/lib/utils";

/**
 * Công việc tạo từ hội thoại = bản ghi crm_activities (mục "Hành động").
 * Một nguồn duy nhất: hiện ở trang Hành động (lọc Hôm nay / Quá hạn), timeline cơ hội, panel khách và thanh trên khung chat.
 */
export const TASK_TYPES = [
  { k: "follow_up", l: "Bám đuổi" },
  { k: "call", l: "Gọi điện" },
  { k: "meeting", l: "Hẹn gặp / lắp đặt" },
  { k: "email", l: "Email / gửi báo giá" },
] as const;
const PRIO = [{ k: "low", l: "Thấp" }, { k: "medium", l: "Bình thường" }, { k: "high", l: "Gấp" }] as const;
export const typeLabel = (t: string) => TASK_TYPES.find((x) => x.k === t)?.l || t;
export const notifyTasksChanged = () => { try { window.dispatchEvent(new Event("crm:activities-changed")); } catch {} };

export type TaskSeed = { title?: string; description?: string; attachments?: Attachment[]; conversationId?: string };

/** Gom các tin đã chọn thành nội dung công việc: tên = câu dài nhất khách viết, mô tả = trích nguyên văn có giờ, đính kèm = ảnh/file trong tin */
export function taskSeedFrom(list: Message[], conv: Conversation): TaskSeed {
  const sorted = [...list].sort((a, b) => (a.sent_at || "").localeCompare(b.sent_at || ""));
  const who = (m: Message) => (m.direction === "out" ? "Mình" : (m as any).sender_name || convName(conv) || "Khách");
  const what = (m: Message) => m.text || (m.attachments || []).map((a) => (a.type === "image" ? "[Hình ảnh]" : a.type === "video" ? "[Video]" : a.type === "sticker" ? "[Sticker]" : "📎 " + (a.name || "Tệp"))).join(" ") || "[Tin nhắn]";
  const texts = sorted.filter((m) => m.text?.trim());
  const pool = texts.some((m) => m.direction === "in") ? texts.filter((m) => m.direction === "in") : texts;
  const best = pool.reduce<string>((s, m) => ((m.text || "").trim().length > s.length ? (m.text || "").trim() : s), "");
  return {
    title: best.replace(/\s+/g, " ").slice(0, 150),
    description: sorted.map((m) => `[${dt(m.sent_at)}] ${who(m)}: ${what(m)}`).join("\n"),
    attachments: sorted.flatMap((m) => (m.attachments || []).filter((a) => a.url && a.type !== "sticker" && a.type !== "audio")),
    conversationId: sorted[sorted.length - 1]?.conversation_id,
  };
}

// datetime-local cần "YYYY-MM-DDTHH:mm" theo giờ máy
const toLocal = (d: Date) => { const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const at = (dayOffset: number, h: number) => { const d = new Date(); d.setDate(d.getDate() + dayOffset); d.setHours(h, 0, 0, 0); return d; };
function dueChoices() {
  const now = new Date(); const inHour = new Date(now.getTime() + 3600000); inHour.setSeconds(0, 0);
  const out: { l: string; v: string }[] = [{ l: "1 giờ nữa", v: toLocal(inHour) }];
  if (now.getHours() < 16) out.push({ l: "Cuối ngày 17:00", v: toLocal(at(0, 17)) });
  out.push({ l: "Sáng mai 9:00", v: toLocal(at(1, 9)) }, { l: "Chiều mai 14:00", v: toLocal(at(1, 14)) }, { l: "Không hạn", v: "" });
  return out;
}

export function TaskDialog({ conv, members, seed, onClose }: { conv: Conversation; members: { id: string; name: string }[]; seed?: TaskSeed; onClose: (created?: { assignee?: string; due?: string }) => void }) {
  const sb = supabaseBrowser();
  const choices = useMemo(dueChoices, []);
  const [title, setTitle] = useState(seed?.title || "");
  const [type, setType] = useState<string>("follow_up");
  const [assignee, setAssignee] = useState<string>(conv.assigned_to || "");
  const [due, setDue] = useState<string>(choices.find((c) => c.l.startsWith("Cuối ngày"))?.v || choices.find((c) => c.l.startsWith("Sáng mai"))!.v);
  const [prio, setPrio] = useState<string>("medium");
  const [desc, setDesc] = useState(seed?.description || "");
  const [atts, setAtts] = useState<Attachment[]>(seed?.attachments || []);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const titleRef = useRef<HTMLTextAreaElement>(null);
  // mặc định giao cho người phụ trách hội thoại, chưa giao thì cho chính mình
  useEffect(() => {
    if (conv.assigned_to) return;
    sb.auth.getSession().then(({ data }) => { const id = data.session?.user?.id; if (id && members.some((m) => m.id === id)) setAssignee((a) => a || id); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { titleRef.current?.focus(); titleRef.current?.select(); }, []);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [onClose]);

  const save = async () => {
    if (!title.trim() || busy) { if (!title.trim()) { setErr("Nhập tên công việc"); titleRef.current?.focus(); } return; }
    setBusy(true); setErr("");
    const r = await fetch("/api/activities", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      title: title.trim(), type, priority: prio, description: desc.trim() || null, attachments: atts,
      conversation_id: seed?.conversationId || conv.id, person_id: conv.customer_id || null, assignee_id: assignee || null, due_at: due ? new Date(due).toISOString() : null,
    }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) { setErr(j.error || "Không tạo được công việc"); return; }
    notifyTasksChanged();
    onClose({ assignee: members.find((m) => m.id === assignee)?.name, due: due ? dt(new Date(due).toISOString()) : undefined });
  };

  return <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center md:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="card w-full md:max-w-lg shadow-2xl max-h-[92dvh] flex flex-col rounded-b-none md:rounded-lg">
      <div className="flex items-center gap-2 px-4 h-12 border-b border-slate-200 shrink-0">
        <ClipboardList size={17} className="text-blue-600" /><b>Tạo công việc</b><span className="text-xs text-slate-500 truncate">· {convName(conv)}</span>
        <button onClick={() => onClose()} className="ml-auto p-1 rounded hover:bg-slate-100" title="Đóng (Esc)"><X size={18} /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
        <div><div className="text-xs font-medium text-slate-500 mb-1">Việc cần làm *</div>
          <textarea ref={titleRef} rows={2} className="input resize-none" placeholder="VD: Kiểm tra lại giá 2 mẫu mâm pha lê khách hỏi, báo lại khách" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save(); }} /></div>
        <div><div className="text-xs font-medium text-slate-500 mb-1">Loại</div>
          <div className="flex flex-wrap gap-1.5">{TASK_TYPES.map((t) => <button key={t.k} type="button" onClick={() => setType(t.k)} className={cn("fchip", type === t.k && "on")}>{t.l}</button>)}</div></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><div className="text-xs font-medium text-slate-500 mb-1">Giao cho</div>
            <select className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)}><option value="">— Chính mình —</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
          <div><div className="text-xs font-medium text-slate-500 mb-1">Mức độ</div>
            <div className="flex gap-1.5">{PRIO.map((p) => <button key={p.k} type="button" onClick={() => setPrio(p.k)} className={cn("fchip", prio === p.k && "on")}>{p.l}</button>)}</div></div>
        </div>
        <div><div className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1"><CalendarClock size={13} />Hạn xử lý</div>
          <div className="flex flex-wrap gap-1.5 mb-1.5">{choices.map((c) => <button key={c.l} type="button" onClick={() => setDue(c.v)} className={cn("fchip", due === c.v && "on")}>{c.l}</button>)}</div>
          <input type="datetime-local" className="input" value={due} onChange={(e) => setDue(e.target.value)} /></div>
        <div><div className="text-xs font-medium text-slate-500 mb-1">Thông tin tiếp nhận</div>
          <textarea rows={4} className="input text-[13px]" placeholder="Ghi chú thêm: mã mẫu, kích thước, giá khách hỏi, địa chỉ lắp…" value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
        {atts.length > 0 && <div><div className="text-xs font-medium text-slate-500 mb-1">Đính kèm từ tin nhắn ({atts.length})</div>
          <div className="flex flex-wrap gap-1.5">{atts.map((a, i) => <div key={a.url + i} className="relative group">
            {a.type === "image" ? <img src={a.url} alt="" className="w-16 h-16 rounded-md object-cover border border-slate-200" /> : <div className="w-16 h-16 rounded-md border border-slate-200 bg-slate-50 flex flex-col items-center justify-center text-[10px] text-slate-500 px-1 text-center"><FileText size={16} />{a.type === "video" ? "Video" : (a.name || "Tệp").slice(0, 14)}</div>}
            <button type="button" title="Bỏ đính kèm" onClick={() => setAtts((x) => x.filter((_, j) => j !== i))} className="absolute -top-1.5 -right-1.5 bg-white border border-slate-200 rounded-full p-0.5 shadow"><X size={11} /></button></div>)}</div></div>}
        {err && <div className="text-xs text-red-600">{err}</div>}
      </div>
      <div className="flex items-center gap-2 px-4 py-3 border-t border-slate-200 shrink-0">
        <span className="text-[11px] text-slate-500 hidden sm:block">Lưu vào <b>Hành động</b>, gắn với khách & cơ hội đang mở</span>
        <button className="btn ml-auto" onClick={() => onClose()}>Huỷ</button>
        <button className="btn btn-primary" onClick={save} disabled={busy} title="Ctrl+Enter">{busy ? "Đang lưu…" : "Tạo công việc"}</button>
      </div>
    </div>
  </div>;
}

/** Công việc chưa xong của khách (mọi kênh) hoặc của hội thoại khi chưa có hồ sơ khách; tự cập nhật realtime */
export function useOpenTasks(conv: Conversation) {
  const [tasks, setTasks] = useState<Activity[]>([]);
  const key = conv.customer_id ? "p:" + conv.customer_id : "c:" + conv.id;
  useEffect(() => {
    const sb = supabaseBrowser(); let alive = true;
    const load = async () => {
      let q = sb.from("crm_activities").select("*").neq("type", "note").eq("is_done", false).order("due_at", { ascending: true, nullsFirst: false }).limit(30);
      q = conv.customer_id ? q.eq("person_id", conv.customer_id) : q.eq("conversation_id", conv.id);
      const { data } = await q; if (alive) setTasks((data as Activity[]) || []);
    };
    load();
    const filter = conv.customer_id ? `person_id=eq.${conv.customer_id}` : `conversation_id=eq.${conv.id}`;
    // tên kênh phải duy nhất: supabase-js trả lại kênh cũ nếu trùng tên (panel + khung chat cùng dùng hook này)
    const ch = sb.channel("tasks-" + key + "-" + Math.random().toString(36).slice(2, 8)).on("postgres_changes", { event: "*", schema: "public", table: "crm_activities", filter }, () => load()).subscribe();
    window.addEventListener("crm:activities-changed", load);
    return () => { alive = false; sb.removeChannel(ch); window.removeEventListener("crm:activities-changed", load); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const markDone = async (a: Activity) => {
    setTasks((t) => t.filter((x) => x.id !== a.id));
    await supabaseBrowser().from("crm_activities").update({ is_done: true, done_at: new Date().toISOString() }).eq("id", a.id);
    notifyTasksChanged();
  };
  return { tasks, markDone };
}

/** Danh sách việc đang mở: tick = xong; bấm tên để xem thông tin tiếp nhận + ảnh */
export function TaskList({ tasks, members, onDone, onImage }: { tasks: Activity[]; members: { id: string; name: string }[]; onDone: (a: Activity) => void; onImage?: (url: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const name = (id?: string | null) => members.find((m) => m.id === id)?.name;
  if (!tasks.length) return <div className="text-xs text-slate-400 py-1">Chưa có công việc nào đang mở.</div>;
  return <div className="space-y-1">{tasks.map((a) => {
    const late = !!a.due_at && new Date(a.due_at).getTime() < Date.now();
    const atts = ((a as any).attachments || []) as Attachment[];
    return <div key={a.id} className={cn("rounded-md border px-2 py-1.5", late ? "border-red-200 bg-red-50" : "border-slate-100")}>
      <div className="flex items-start gap-2">
        <input type="checkbox" className="mt-1 shrink-0 cursor-pointer" title="Đánh dấu đã xong" onChange={() => onDone(a)} />
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen((o) => (o === a.id ? null : a.id))}>
          <div className={cn("text-[13px] leading-snug", open === a.id ? "" : "line-clamp-2")}>{a.priority === "high" && <span className="text-red-600 font-semibold">[Gấp] </span>}{a.title}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">{typeLabel(a.type)}{name(a.assignee_id) && ` · ${name(a.assignee_id)}`}{a.due_at && <span className={cn(late && "text-red-600 font-medium")}> · {late ? "quá hạn " : "hạn "}{dt(a.due_at, "HH:mm dd/MM")}</span>}{atts.length > 0 && ` · ${atts.length} ảnh/tệp`}</div>
        </button>
      </div>
      {open === a.id && (a.description || atts.length > 0) && <div className="mt-1.5 pl-6 space-y-1.5">
        {a.description && <div className="text-[12px] text-slate-600 whitespace-pre-wrap break-words">{a.description}</div>}
        {atts.length > 0 && <div className="flex flex-wrap gap-1">{atts.map((x, i) => x.type === "image"
          ? <button key={i} type="button" onClick={() => onImage ? onImage(x.url) : window.open(x.url, "_blank")}><img src={x.url} alt="" className="w-12 h-12 rounded object-cover border border-slate-200" /></button>
          : <a key={i} href={x.url} target="_blank" rel="noreferrer" className="text-[11px] text-blue-600 underline">📎 {x.name || x.type}</a>)}</div>}
      </div>}
    </div>;
  })}<Link href="/activities" className="block text-[11px] text-blue-600 pt-0.5">Xem tất cả trong Hành động →</Link></div>;
}
