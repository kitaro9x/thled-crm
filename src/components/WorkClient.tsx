"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Plus, ExternalLink, Mail, X, AlertTriangle } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { fmtVN, groupBySchedule, isOverdue, vnDay, type WorkItem, type workload } from "@/lib/work-items";

const CONGVIEC_URL = "https://www.thled.vn/congviec";
const kindLabel: Record<string, string> = { call: "Gọi", meeting: "Họp", follow_up: "Bám đuổi", email: "Email", note: "Ghi chú" };
const prioLabel: Record<string, string> = { high: "Gấp", medium: "Bình thường", low: "Thấp" };
const TABS: [string, string][] = [["todo", "Chưa hoàn thành"], ["today", "Hôm nay"], ["overdue", "Quá hạn"], ["web", "Từ /congviec"], ["crm", "Từ CRM"], ["call", "Gọi"], ["meeting", "Họp"], ["follow_up", "Bám đuổi"], ["email", "Email"], ["done", "Đã xong"]];

type Load = ReturnType<typeof workload>[number];
type MemberLite = { id: string; name: string; email: string };
type ListLite = { id: string; name: string; color: string; owner_email: string };

export function WorkClient({ tab, person, me, items, load, members, lists, error }: {
  tab: string; person: string; me: { id: string; name: string }; items: WorkItem[]; load: Load[]; members: MemberLite[]; lists: ListLite[]; error: string | null;
}) {
  const router = useRouter();
  const [list, setList] = useState(items);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(error);
  useEffect(() => setList(items), [items]);
  // quay lại tab/cửa sổ → tải lại để thấy việc mới thêm trên /congviec
  useEffect(() => { const f = () => router.refresh(); window.addEventListener("focus", f); return () => window.removeEventListener("focus", f); }, [router]);

  const href = (t: string, p: string) => { const q = new URLSearchParams(); if (t !== "todo") q.set("tab", t); if (p) q.set("p", p); const s = q.toString(); return "/activities" + (s ? "?" + s : ""); };

  const toggle = async (w: WorkItem) => {
    const done = w.status !== "done";
    const prev = list;
    setList((l) => l.map((x) => (x.key === w.key ? { ...x, status: done ? "done" : "todo", doneAt: done ? new Date().toISOString() : null } : x)));
    let fail: string | null = null;
    if (w.src === "crm") {
      const { error } = await supabaseBrowser().from("crm_activities").update({ is_done: done, done_at: done ? new Date().toISOString() : null }).eq("id", w.id);
      fail = error?.message || null;
    } else {
      const r = await fetch(`/api/tasks/${w.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ done }) });
      if (!r.ok) fail = (await r.json().catch(() => ({}))).error || "Lỗi cập nhật";
    }
    if (fail) { setList(prev); setErr(fail); }
  };

  const groups = useMemo(() => (tab === "done" ? null : groupBySchedule(list)), [list, tab]);
  const doneSorted = useMemo(() => (tab === "done" ? [...list].sort((a, b) => (b.doneAt || "").localeCompare(a.doneAt || "")) : []), [list, tab]);
  const totals = load.reduce((s, r) => ({ open: s.open + r.open, overdue: s.overdue + r.overdue, today: s.today + r.today }), { open: 0, overdue: 0, today: 0 });

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2 bg-white border-b border-slate-200 flex flex-wrap gap-2 items-center">
        <b className="mr-2">Công việc</b>
        <div className="flex gap-1.5 overflow-x-auto max-w-full">
          {TABS.map(([k, l]) => <Link key={k} href={href(k, person)} className={cn("chip border whitespace-nowrap", tab === k ? "bg-blue-600 text-white border-blue-600" : "border-slate-200")}>{l}</Link>)}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <select className="input py-1 w-auto" value={person} onChange={(e) => router.push(href(tab, e.target.value))} aria-label="Lọc theo người">
            <option value="">Cả nhóm</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.id === me.id ? `${m.name} (tôi)` : m.name}</option>)}
          </select>
          <span className="hidden sm:inline"><a href={CONGVIEC_URL} target="_blank" rel="noreferrer" className="btn whitespace-nowrap" title="Mở trang công việc trên website">/congviec<ExternalLink size={13} /></a></span>
          <button className="btn btn-primary whitespace-nowrap" onClick={() => setAdding(true)}><Plus size={15} />Thêm việc</button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {err && <div className="card p-2 text-sm text-red-600 flex items-center gap-2"><AlertTriangle size={14} />{err}<button className="ml-auto" onClick={() => setErr(null)} aria-label="Đóng"><X size={14} /></button></div>}

        {/* Khối lượng việc từng người (việc chưa xong, cả 2 nguồn) */}
        <div>
          <div className="text-xs text-slate-500 mb-1.5">Khối lượng việc · {totals.open} việc đang mở{totals.overdue ? <> · <span className="text-red-600 font-medium">{totals.overdue} quá hạn</span></> : null}{totals.today ? ` · ${totals.today} việc hôm nay` : ""}</div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {load.length === 0 && <div className="text-sm text-slate-400">Chưa có việc đang mở.</div>}
            {load.map((r) => {
              const on = !!r.ownerId && r.ownerId === person;
              return (
                <Link key={(r.ownerId || "") + r.name} href={r.ownerId ? href(tab, on ? "" : r.ownerId) : "#"} className={cn("card shrink-0 w-44 p-2.5 text-sm hover:bg-slate-50", on && "ring-2 ring-blue-500")}>
                  <div className="font-medium truncate">{r.name}{r.ownerId === me.id && <span className="text-slate-400 font-normal"> (tôi)</span>}</div>
                  <div className="flex items-baseline gap-1 mt-0.5"><span className="text-2xl font-semibold">{r.open}</span><span className="text-xs text-slate-500">việc mở</span></div>
                  <div className="text-xs mt-1 flex flex-wrap gap-x-2">
                    <span className={r.overdue ? "text-red-600 font-medium" : "text-slate-400"}>{r.overdue} quá hạn</span>
                    <span className="text-slate-500">{r.today} hôm nay</span>
                    <span className="text-slate-500">{r.week} trong 7 ngày</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {list.length === 0 && <div className="text-center text-slate-400 py-16">{tab === "done" ? "Chưa có việc nào xong" : "Tuyệt vời! Không có việc cần làm"}</div>}

        {/* Lịch trình: nhóm theo ngày */}
        {groups?.map((g) => (
          <section key={g.key}>
            <div className={cn("text-xs font-semibold mb-1.5 flex items-center gap-2", g.tone === "red" ? "text-red-600" : g.tone === "blue" ? "text-blue-700" : "text-slate-500")}>{g.label}<span className="chip bg-slate-100 text-slate-600 font-normal">{g.items.length}</span></div>
            <div className="card divide-y divide-slate-100">{g.items.map((w) => <Row key={w.key} w={w} onToggle={toggle} />)}</div>
          </section>
        ))}
        {tab === "done" && doneSorted.length > 0 && <div className="card divide-y divide-slate-100">{doneSorted.map((w) => <Row key={w.key} w={w} onToggle={toggle} showDone />)}</div>}
      </div>

      {adding && <AddDialog me={me} person={person} members={members} lists={lists} onClose={(ok) => { setAdding(false); if (ok) router.refresh(); }} />}
    </div>
  );
}

function Row({ w, onToggle, showDone }: { w: WorkItem; onToggle: (w: WorkItem) => void; showDone?: boolean }) {
  const done = w.status === "done";
  const late = isOverdue(w);
  const due = w.dueAt ? fmtVN(w.dueAt, !w.allDay) : "";
  const imgs = (w.attachments || []).filter((x) => x.type === "image");
  return (
    <div className="flex items-start gap-3 p-3 text-sm">
      <input type="checkbox" className="mt-1" checked={done} onChange={() => onToggle(w)} aria-label="Đánh dấu xong" />
      <span className="hidden sm:inline-flex"><Tag w={w} /></span>
      <div className="flex-1 min-w-0">
        <div className={cn("font-medium break-words", done && "line-through text-slate-400")} title={w.description || undefined}>{w.title}</div>
        <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-1">
          <span className="sm:hidden"><Tag w={w} /></span>
          {w.customer?.name && <span className="text-slate-700">{w.customer.name}</span>}{w.customer?.phone && <span>· {w.customer.phone}</span>}
          {w.lead && <>· <Link href={`/leads?lead=${w.lead.id}`} className="text-blue-600">{w.lead.title}</Link></>}
          {w.customerBusy && " · khách bận"}
          {w.conversationId && <Link href={`/inbox?c=${w.conversationId}`} className="inline-flex items-center gap-0.5 text-blue-600 hover:underline ml-1" title="Mở hội thoại đã tạo công việc này"><MessageSquare size={11} />Mở chat</Link>}
          {w.src === "web" && w.description && <span className="truncate max-w-[40ch]">{w.description}</span>}
          {w.gmailLink && <a href={w.gmailLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-blue-600 hover:underline"><Mail size={11} />Gmail</a>}
          {/* điện thoại: người làm + hạn nằm dưới tên việc */}
          <span className="sm:hidden">{w.ownerName}{due && <span className={cn(late && "text-red-600 font-medium")}> · {due}</span>}</span>
        </div>
        {imgs.length > 0 && <div className="flex gap-1 mt-1">{imgs.slice(0, 4).map((x, i) => <a key={i} href={x.url} target="_blank" rel="noreferrer"><img src={x.url} alt="" className="w-9 h-9 rounded object-cover border border-slate-200" /></a>)}</div>}
      </div>
      {w.status === "doing" && <span className="chip bg-blue-50 text-blue-700 shrink-0">Đang làm</span>}
      {w.priority && w.priority !== "medium" && <span className={cn("chip shrink-0", w.priority === "high" ? "bg-red-50 text-red-600" : "bg-slate-100")}>{prioLabel[w.priority]}</span>}
      <span className="hidden sm:block text-slate-500 w-32 truncate shrink-0">{w.ownerName}</span>
      <span className={cn("hidden sm:block w-28 text-right shrink-0", late ? "text-red-600 font-medium" : "text-slate-500")}>{showDone ? (w.doneAt ? "xong " + fmtVN(w.doneAt, false) : "") : due}</span>
    </div>
  );
}

/** Nhãn nguồn: loại việc CRM (Gọi/Họp/Bám đuổi…) hoặc danh sách trên /congviec (chấm màu) */
function Tag({ w }: { w: WorkItem }) {
  if (w.src === "crm") return <span className="chip bg-slate-100 sm:w-28 justify-center shrink-0" title="Việc tạo trong CRM">{kindLabel[w.kind] || w.kind}</span>;
  return <span className="chip bg-slate-100 sm:w-28 justify-center shrink-0 gap-1 max-w-[9rem]" title={`Việc trên /congviec${w.list ? " · " + w.list.name : ""}`}><span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: w.list?.color || "#94a3b8" }} /><span className="truncate">{w.list?.name || "/congviec"}</span></span>;
}

function AddDialog({ me, person, members, lists, onClose }: { me: { id: string; name: string }; person: string; members: MemberLite[]; lists: ListLite[]; onClose: (ok?: boolean) => void }) {
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState(members.some((m) => m.id === person) ? person : members.some((m) => m.id === me.id) ? me.id : members[0]?.id || "");
  const [date, setDate] = useState(vnDay(new Date()));
  const [time, setTime] = useState("");
  const [listId, setListId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ownerEmail = members.find((m) => m.id === owner)?.email.toLowerCase();
  const ownerLists = lists.filter((l) => l.owner_email.toLowerCase() === ownerEmail);
  useEffect(() => setListId(""), [owner]);

  const save = async () => {
    if (!title.trim()) { setErr("Nhập tên công việc"); return; }
    setBusy(true); setErr(null);
    const r = await fetch("/api/tasks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, owner_id: owner, due_date: date || null, due_time: time || null, list_id: listId || null, notes: notes || null }) });
    setBusy(false);
    if (!r.ok) { setErr((await r.json().catch(() => ({}))).error || "Lỗi lưu"); return; }
    onClose(true);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={() => onClose()}>
      <div className="card w-full max-w-md p-4 space-y-3 text-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center"><b>Thêm công việc</b><span className="text-xs text-slate-500 ml-2">lưu vào /congviec của người làm</span><button className="ml-auto" onClick={() => onClose()} aria-label="Đóng"><X size={16} /></button></div>
        <input className="input" autoFocus placeholder="Việc cần làm, vd: Giao hàng anh Sang" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1"><span className="text-xs text-slate-500">Người làm</span>
            <select className="input" value={owner} onChange={(e) => setOwner(e.target.value)}>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
          <label className="space-y-1"><span className="text-xs text-slate-500">Danh sách</span>
            <select className="input" value={listId} onChange={(e) => setListId(e.target.value)}><option value="">— Không —</option>{ownerLists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
          <label className="space-y-1"><span className="text-xs text-slate-500">Ngày</span><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="space-y-1"><span className="text-xs text-slate-500">Giờ (tuỳ chọn)</span><input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} disabled={!date} /></label>
        </div>
        <textarea className="input" rows={2} placeholder="Ghi chú" value={notes} onChange={(e) => setNotes(e.target.value)} />
        {err && <div className="text-red-600 text-xs">{err}</div>}
        <div className="flex justify-end gap-2"><button className="btn" onClick={() => onClose()}>Huỷ</button><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Đang lưu…" : "Lưu"}</button></div>
      </div>
    </div>
  );
}
