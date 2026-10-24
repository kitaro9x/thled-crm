"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, Table2, Plus, Settings2 } from "lucide-react";
import Link from "next/link";
import type { Lead, Pipeline, Stage } from "@/lib/types";
import { cn, money, ago } from "@/lib/utils";
import { Avatar } from "@/components/Avatar";
import { LeadDrawer } from "./LeadDrawer";

export function LeadsClient({ pipelines, pipelineId, stages, initial, members, lostReasons, openLead, view: v0 }: { pipelines: Pipeline[]; pipelineId: string; stages: Stage[]; initial: Lead[]; members: { id: string; name: string }[]; lostReasons: string[]; openLead?: string; view: "kanban" | "table" }) {
  const r = useRouter();
  const [leads, setLeads] = useState<Lead[]>(initial);
  const [view, setView] = useState<"kanban" | "table">(v0);
  const [open, setOpen] = useState<string | null>(openLead || null);
  const [tab, setTab] = useState<"all" | "open" | "archived">("open");
  const [q, setQ] = useState("");
  const [drag, setDrag] = useState<string | null>(null);

  const openStages = stages.filter((s) => s.kind === "open");
  const won = stages.find((s) => s.kind === "won"), lost = stages.find((s) => s.kind === "lost");
  const kpi = { total: leads.length, open: leads.filter((l) => l.status === "open").length, won: leads.filter((l) => l.status === "won").length, lost: leads.filter((l) => l.status === "lost").length, revenue: leads.filter((l) => l.status === "won").reduce((a, l) => a + Number(l.deal_size || 0), 0) };
  const shown = useMemo(() => leads.filter((l) => (tab === "open" ? l.status === "open" : tab === "archived" ? l.status !== "open" : true)).filter((l) => !q || l.title.toLowerCase().includes(q.toLowerCase()) || (l.person_phone || "").includes(q)), [leads, tab, q]);

  const moveLead = async (id: string, stageId: string) => {
    const s = stages.find((x) => x.id === stageId)!;
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, stage_id: stageId, stage_name: s.name, stage_color: s.color, status: s.kind === "won" ? "won" : s.kind === "lost" ? "lost" : "open" } : l)));
    const res = await fetch("/api/leads", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, stage_id: stageId }) });
    if (!res.ok) { const j = await res.json(); alert(j.error); r.refresh(); }
  };
  const patch = async (id: string, p: Partial<Lead>) => {
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l)));
    await fetch("/api/leads", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...p }) });
  };
  const createLead = async () => {
    const title = prompt("Tên cơ hội / tên khách:"); if (!title) return;
    const res = await fetch("/api/leads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, pipeline_id: pipelineId, stage_id: openStages[0].id }) });
    if (res.ok) r.refresh();
  };
  const current = leads.find((l) => l.id === open) || null;

  return (
    <div className="h-full flex flex-col">
      <div className="bg-slate-900 text-slate-200 text-xs px-4 py-1.5 flex gap-4">
        <span>Tổng: <b className="text-white">{kpi.total}</b></span><span>Cơ hội mở: <b className="text-white">{kpi.open}</b></span><span>Won: <b className="text-emerald-400">{kpi.won}</b></span><span>Lost: <b className="text-red-400">{kpi.lost}</b></span><span>Doanh thu: <b className="text-white">{money(kpi.revenue)}</b></span>
      </div>
      <div className="px-4 py-2 bg-white border-b border-slate-200 flex items-center gap-2">
        <select className="input w-auto font-semibold" value={pipelineId} onChange={(e) => r.push(`/leads?pipeline=${e.target.value}`)}>{pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <button className={cn("btn", view === "table" && "bg-blue-50 border-blue-300")} onClick={() => setView("table")}><Table2 size={14} /> Table</button>
        <button className={cn("btn", view === "kanban" && "bg-blue-50 border-blue-300")} onClick={() => setView("kanban")}><LayoutGrid size={14} /> Kanban</button>
        <div className="flex gap-1 ml-2">{(["all", "open", "archived"] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={cn("chip border", tab === t ? "bg-blue-600 text-white border-blue-600" : "border-slate-200")}>{t === "all" ? "Tất cả" : t === "open" ? "Open Lead" : "Lead đã lưu trữ"}</button>)}</div>
        <input className="input w-56 ml-2" placeholder="Tìm tên, SĐT" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="ml-auto flex gap-2"><button className="btn btn-primary" onClick={createLead}><Plus size={14} /> Lead</button><Link href={`/settings/pipelines?pipeline=${pipelineId}`} className="btn"><Settings2 size={14} /> Cài đặt</Link></div>
      </div>

      {view === "kanban" ? (
        <div className="flex-1 overflow-x-auto overflow-y-hidden p-3 flex gap-3">
          {[...openStages, ...(tab !== "open" ? [won, lost].filter(Boolean) as Stage[] : [])].map((s) => {
            const items = shown.filter((l) => l.stage_id === s.id);
            return (
              <div key={s.id} className="w-[270px] shrink-0 flex flex-col rounded-lg bg-slate-100 border border-slate-200" onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag) moveLead(drag, s.id); setDrag(null); }}>
                <div className="px-3 py-2 text-sm font-semibold flex items-center justify-between border-b-4" style={{ borderColor: s.color }}><span>{s.name}</span><span className="text-slate-500 font-normal">{items.length}</span></div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {items.map((l) => (
                    <div key={l.id} draggable onDragStart={() => setDrag(l.id)} onClick={() => setOpen(l.id)} className="card p-2.5 cursor-pointer hover:shadow-md">
                      <div className="flex items-center gap-2"><Avatar src={l.person_avatar} name={l.title} size={26} /><div className="font-medium text-sm truncate flex-1">{l.title}</div>{l.score != null && <span className="chip bg-amber-100 text-amber-800">{l.score}</span>}</div>
                      <div className="text-xs text-slate-500 mt-1">{l.person_phone || "Chưa có SĐT"} · {ago(l.created_at)}</div>
                      <div className="flex items-center justify-between mt-1.5 text-xs"><span className={cn("chip", l.open_activities ? "bg-blue-50 text-blue-700" : "bg-red-50 text-red-600")}>{l.open_activities ? `${l.open_activities} việc` : "No activity"}</span><span className="text-slate-500">{l.assignee_name || "—"}</span></div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-3">
          <table className="w-full text-sm bg-white card">
            <thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="p-2">#</th><th className="p-2">Title</th><th className="p-2">Phone</th><th className="p-2">Giai đoạn</th><th className="p-2">Phụ trách</th><th className="p-2">Giá trị</th><th className="p-2">Điểm</th><th className="p-2">Tạo</th></tr></thead>
            <tbody>{shown.map((l, i) => <tr key={l.id} onClick={() => setOpen(l.id)} className="border-t border-slate-100 hover:bg-blue-50 cursor-pointer"><td className="p-2 text-slate-400">{shown.length - i}</td><td className="p-2 font-medium">{l.title}</td><td className="p-2">{l.person_phone || "-"}</td><td className="p-2"><span className="chip text-white" style={{ background: l.stage_color }}>{l.stage_name}</span></td><td className="p-2">{l.assignee_name || "-"}</td><td className="p-2">{l.deal_size ? money(l.deal_size) : "-"}</td><td className="p-2">{l.score ?? "-"}</td><td className="p-2 text-slate-500">{ago(l.created_at)}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      {current && <LeadDrawer lead={current} stages={stages} members={members} lostReasons={lostReasons} onClose={() => setOpen(null)} onPatch={(p) => patch(current.id, p)} onMove={(sid) => moveLead(current.id, sid)} />}
    </div>
  );
}
