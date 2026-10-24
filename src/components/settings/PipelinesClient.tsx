"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Pipeline, Stage } from "@/lib/types";
export function PipelinesClient({ pipelines, stages, members }: { pipelines: (Pipeline & { member_ids?: string[] })[]; stages: Stage[]; members: { id: string; name: string }[] }) {
  const r = useRouter(); const sb = supabaseBrowser();
  const [pid, setPid] = useState(pipelines[0]?.id);
  const p = pipelines.find((x) => x.id === pid); const mine = stages.filter((s) => s.pipeline_id === pid);
  const addPipeline = async () => { const name = prompt("Tên phễu"); if (!name) return; const { data } = await sb.from("crm_pipelines").insert({ name, sort_order: pipelines.length }).select("id").single(); if (data) { await sb.from("crm_stages").insert([{ pipeline_id: data.id, name: "Mới", sort_order: 0, kind: "open" }, { pipeline_id: data.id, name: "WON", sort_order: 90, kind: "won", color: "#16a34a" }, { pipeline_id: data.id, name: "LOST", sort_order: 91, kind: "lost", color: "#dc2626" }]); } r.refresh(); };
  const addStage = async () => { const name = prompt("Tên giai đoạn"); if (!name) return; await sb.from("crm_stages").insert({ pipeline_id: pid, name, sort_order: mine.filter((s) => s.kind === "open").length }); r.refresh(); };
  const upd = async (id: string, patch: Partial<Stage>) => { await sb.from("crm_stages").update(patch).eq("id", id); r.refresh(); };
  const del = async (id: string) => { if (!confirm("Xoá giai đoạn? Lead trong giai đoạn này sẽ lỗi.")) return; await sb.from("crm_stages").delete().eq("id", id); r.refresh(); };
  const move = async (s: Stage, dir: -1 | 1) => { const open = mine.filter((x) => x.kind === "open"); const i = open.findIndex((x) => x.id === s.id); const j = i + dir; if (j < 0 || j >= open.length) return; await sb.from("crm_stages").update({ sort_order: j }).eq("id", s.id); await sb.from("crm_stages").update({ sort_order: i }).eq("id", open[j].id); r.refresh(); };
  return (
    <div className="grid grid-cols-[220px_1fr] gap-4 text-sm">
      <div className="card p-3"><b>YOUR PIPELINES</b>{pipelines.map((x) => <button key={x.id} onClick={() => setPid(x.id)} className={`block w-full text-left px-2 py-1.5 rounded mt-1 ${x.id === pid ? "bg-blue-50 text-blue-700" : "hover:bg-slate-50"}`}>{x.name}{x.is_default && " ★"}</button>)}<button className="btn w-full justify-center mt-2" onClick={addPipeline}>+ Add Pipeline</button></div>
      {p && <div className="space-y-4">
        <div className="card p-4"><div className="flex items-center gap-2"><input className="input w-64 font-semibold" defaultValue={p.name} onBlur={async (e) => { await sb.from("crm_pipelines").update({ name: e.target.value }).eq("id", p.id); r.refresh(); }} />{!p.is_default && <button className="btn" onClick={async () => { await sb.from("crm_pipelines").update({ is_default: false }).neq("id", p.id); await sb.from("crm_pipelines").update({ is_default: true }).eq("id", p.id); r.refresh(); }}>Đặt mặc định</button>}</div>
          <div className="mt-3"><b>Quyền truy cập</b> <span className="text-slate-400">(trống = tất cả)</span><div className="flex gap-3 flex-wrap mt-1">{members.map((m) => <label key={m.id} className="flex items-center gap-1"><input type="checkbox" checked={p.member_ids?.includes(m.id)} onChange={async (e) => { const ids = new Set<string>(p.member_ids || []); if (e.target.checked) ids.add(m.id); else ids.delete(m.id); await sb.from("crm_pipelines").update({ member_ids: [...ids] }).eq("id", p.id); r.refresh(); }} />{m.name}</label>)}</div></div></div>
        <div className="card p-4"><b>Active stages</b><div className="text-slate-500 text-xs mb-2">Đây là những giai đoạn chính trong luồng làm việc của bạn</div>
          {mine.filter((s) => s.kind === "open").map((s) => <div key={s.id} className="flex items-center gap-2 py-1"><input type="color" value={s.color} onChange={(e) => upd(s.id, { color: e.target.value })} className="w-8 h-8 border-0" /><input className="input w-64" defaultValue={s.name} onBlur={(e) => upd(s.id, { name: e.target.value })} /><input className="input w-28" type="number" placeholder="rotten days" defaultValue={s.rotten_days || ""} onBlur={(e) => upd(s.id, { rotten_days: Number(e.target.value) || null })} /><button className="btn px-2" onClick={() => move(s, -1)}>↑</button><button className="btn px-2" onClick={() => move(s, 1)}>↓</button><button className="btn px-2 text-red-600" onClick={() => del(s.id)}>×</button></div>)}
          <button className="btn mt-2" onClick={addStage}>+ Giai đoạn</button></div>
        <div className="card p-4"><b>Close stages</b><div className="text-slate-500 text-xs mb-2">Những giai đoạn này sẽ đánh dấu kết thúc luồng làm việc</div>{mine.filter((s) => s.kind !== "open").map((s) => <div key={s.id} className="flex items-center gap-2 py-1"><span className="chip text-white w-16 justify-center" style={{ background: s.color }}>{s.kind.toUpperCase()}</span><input className="input w-64" defaultValue={s.name} onBlur={(e) => upd(s.id, { name: e.target.value })} /></div>)}</div>
      </div>}
    </div>
  );
}
