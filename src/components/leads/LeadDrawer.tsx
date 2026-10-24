"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { X, Phone, Users, Mail, Repeat, StickyNote, ShoppingCart } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Activity, Lead, Stage } from "@/lib/types";
import { cn, dt, money } from "@/lib/utils";

const types = [{ k: "note", l: "Ghi chú", i: StickyNote }, { k: "call", l: "Gọi điện", i: Phone }, { k: "meeting", l: "Cuộc họp", i: Users }, { k: "follow_up", l: "Follow up", i: Repeat }, { k: "email", l: "Email", i: Mail }] as const;

export function LeadDrawer({ lead, stages, members, lostReasons, onClose, onPatch, onMove }: { lead: Lead; stages: Stage[]; members: { id: string; name: string }[]; lostReasons: string[]; onClose: () => void; onPatch: (p: Partial<Lead>) => void; onMove: (stageId: string) => void }) {
  const sb = supabaseBrowser();
  const [acts, setActs] = useState<Activity[]>([]);
  const [note, setNote] = useState("");
  const [quick, setQuick] = useState<{ type: Activity["type"]; title: string; due: string } | null>(null);
  const [lostOpen, setLostOpen] = useState(false);
  const openStages = stages.filter((s) => s.kind === "open");
  const idx = openStages.findIndex((s) => s.id === lead.stage_id);

  const load = async () => { const { data } = await sb.from("crm_activities").select("*").eq("lead_id", lead.id).order("created_at", { ascending: false }); setActs((data as Activity[]) || []); };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [lead.id]);

  const addNote = async () => { if (!note.trim()) return; await sb.from("crm_activities").insert({ type: "note", title: note.trim(), lead_id: lead.id, person_id: lead.person_id, is_done: true, done_at: new Date().toISOString() }); setNote(""); load(); };
  const addQuick = async () => { if (!quick) return; await sb.from("crm_activities").insert({ type: quick.type, title: quick.title, lead_id: lead.id, person_id: lead.person_id, assignee_id: lead.assigned_to, due_at: quick.due ? new Date(quick.due).toISOString() : null }); setQuick(null); load(); };
  const toggleDone = async (a: Activity) => { await sb.from("crm_activities").update({ is_done: !a.is_done, done_at: a.is_done ? null : new Date().toISOString() }).eq("id", a.id); load(); };
  const won = stages.find((s) => s.kind === "won"), lost = stages.find((s) => s.kind === "lost");

  return (
    <div className="fixed inset-0 z-20 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-[860px] bg-white h-full flex flex-col shadow-2xl">
        <div className="h-12 bg-slate-800 text-white px-4 flex items-center gap-3">
          <button onClick={onClose}><X size={18} /></button>
          <div className="font-semibold truncate">{lead.title}</div>
          <div className="ml-auto flex gap-2">
            {lead.status === "open" && won && <button className="btn btn-primary bg-emerald-600 border-emerald-600 hover:bg-emerald-700" onClick={() => onMove(won.id)}>WON</button>}
            {lead.status === "open" && lost && <button className="btn btn-danger" onClick={() => setLostOpen(true)}>LOST</button>}
            {lead.status !== "open" && <span className={cn("chip", lead.status === "won" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700")}>{lead.status.toUpperCase()}</span>}
          </div>
        </div>
        {lostOpen && <div className="p-3 bg-red-50 border-b border-red-200 flex gap-2 items-center text-sm"><span>Lý do thất bại:</span><select className="input w-56" onChange={(e) => onPatch({ lost_reason: e.target.value })}><option value="">Chọn</option>{lostReasons.map((r) => <option key={r}>{r}</option>)}</select><input className="input w-56" placeholder="hoặc nhập tự do" onBlur={(e) => e.target.value && onPatch({ lost_reason: e.target.value })} /><button className="btn btn-danger" onClick={() => { onMove(lost!.id); setLostOpen(false); }}>Xác nhận LOST</button><button className="btn" onClick={() => setLostOpen(false)}>Huỷ</button></div>}
        {/* stage progress */}
        <div className="flex border-b border-slate-200">{openStages.map((s, i) => <button key={s.id} onClick={() => onMove(s.id)} className={cn("flex-1 text-xs py-2 border-r border-white", i <= idx ? "text-white" : "bg-slate-100 text-slate-500")} style={i <= idx ? { background: s.color } : {}}>{s.name}</button>)}</div>
        <div className="flex-1 flex min-h-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
            <div className="card p-3"><textarea className="input" rows={2} placeholder="Nhập ghi chú của bạn tại đây" value={note} onChange={(e) => setNote(e.target.value)} /><div className="text-right mt-2"><button className="btn btn-primary" onClick={addNote}>Lưu ghi chú</button></div></div>
            <div className="card p-3">
              <div className="flex items-center gap-2 text-sm"><b>Hành động</b><span className="text-slate-400">Tạo nhanh:</span>{types.filter((t) => t.k !== "note").map((t) => <button key={t.k} className="text-blue-600 hover:underline" onClick={() => setQuick({ type: t.k, title: t.l, due: "" })}>{t.l}</button>)}</div>
              {quick && <div className="mt-2 flex gap-2"><input className="input" value={quick.title} onChange={(e) => setQuick({ ...quick, title: e.target.value })} /><input type="datetime-local" className="input w-52" value={quick.due} onChange={(e) => setQuick({ ...quick, due: e.target.value })} /><button className="btn btn-primary" onClick={addQuick}>Lưu</button><button className="btn" onClick={() => setQuick(null)}>Huỷ</button></div>}
            </div>
            <div className="card p-3">
              <b className="text-sm">Dòng thời gian</b>
              {acts.length === 0 && <div className="text-slate-400 text-sm py-6 text-center">Chưa ghi nhận hoạt động nào trong cơ hội này</div>}
              {acts.map((a) => { const T = types.find((t) => t.k === a.type)?.i || StickyNote; return (
                <div key={a.id} className="flex gap-2 py-2 border-t border-slate-100 text-sm">
                  {a.type !== "note" ? <input type="checkbox" checked={a.is_done} onChange={() => toggleDone(a)} className="mt-1" /> : <T size={14} className="mt-1 text-slate-400" />}
                  <div className="flex-1"><div className={cn(a.is_done && a.type !== "note" && "line-through text-slate-400")}>{a.title}</div>{a.description && <div className="text-xs text-slate-500">{a.description}</div>}<div className="text-xs text-slate-400">{types.find((t) => t.k === a.type)?.l} · {dt(a.created_at, "HH:mm dd/MM/yyyy")}{a.due_at && ` · hạn ${dt(a.due_at, "HH:mm dd/MM")}`}</div></div>
                </div>); })}
            </div>
          </div>
          <div className="w-[300px] border-l border-slate-200 overflow-y-auto p-4 text-sm space-y-2">
            <F k="Name">{lead.person_name || lead.title}</F>
            <F k="Phone">{lead.person_phone || "-"}</F>
            <F k="Phụ trách"><select className="input py-1" value={lead.assigned_to || ""} onChange={(e) => onPatch({ assigned_to: e.target.value || null })}><option value="">-</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></F>
            <F k="Qualified"><select className="input py-1" value={lead.qualified == null ? "" : String(lead.qualified)} onChange={(e) => onPatch({ qualified: e.target.value === "" ? null : e.target.value === "true" })}><option value="">Chưa xác định</option><option value="true">Tiềm năng</option><option value="false">Không tiềm năng</option></select></F>
            <F k="Deal size"><input className="input py-1" type="number" defaultValue={lead.deal_size || ""} onBlur={(e) => onPatch({ deal_size: Number(e.target.value) || null })} /></F>
            <F k="Score">{lead.score ?? "-"}</F>
            <F k="Source">{lead.source_origin || "-"}</F>
            <F k="Đổi stage">{dt(lead.last_stage_change_at, "dd/MM/yyyy")}</F>
            <F k="Tạo lúc">{dt(lead.created_at, "HH:mm dd/MM/yyyy")}</F>
            {lead.lost_reason && <F k="Lý do lost">{lead.lost_reason}</F>}
            {lead.person_id && <Link href={`/cdp/${lead.person_id}`} className="text-blue-600 block">Xem khách hàng →</Link>}
            {lead.source_conversation_id && <Link href={`/inbox?c=${lead.source_conversation_id}`} className="text-blue-600 block">Mở hội thoại →</Link>}
            <Link href={`/orders/new?lead=${lead.id}`} className="btn w-full justify-center mt-2"><ShoppingCart size={14} /> Tạo đơn hàng / báo giá</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
const F = ({ k, children }: { k: string; children: React.ReactNode }) => <div className="grid grid-cols-[90px_1fr] gap-2 items-center"><span className="text-slate-500 text-xs">{k}</span><div className="min-w-0 truncate">{children}</div></div>;
