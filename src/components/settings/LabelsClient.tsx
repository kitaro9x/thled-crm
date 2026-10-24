"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Label } from "@/lib/types";
export function LabelsClient({ labels }: { labels: (Label & { synced_from?: string | null; description?: string | null })[] }) {
  const r = useRouter(); const sb = supabaseBrowser(); const [n, setN] = useState({ name: "", color: "#2563eb" });
  return <div className="card p-4 max-w-3xl text-sm"><div className="flex items-center mb-3"><b>Nhãn cuộc hội thoại</b><span className="text-slate-400 ml-2">dùng để phân loại hội thoại / khách hàng</span></div>
    <table className="w-full"><thead className="text-xs text-slate-500 text-left"><tr><th className="p-2">Thứ tự</th><th className="p-2">Tên nhãn</th><th className="p-2">Màu</th><th className="p-2">Mô tả</th><th className="p-2"></th></tr></thead>
      <tbody>{labels.map((l, i) => <tr key={l.id} className="border-t border-slate-100"><td className="p-2">{i + 1}</td><td className="p-2"><input className="input" defaultValue={l.name} onBlur={async (e) => { await sb.from("crm_labels").update({ name: e.target.value }).eq("id", l.id); r.refresh(); }} /></td><td className="p-2"><input type="color" defaultValue={l.color} onChange={async (e) => { await sb.from("crm_labels").update({ color: e.target.value }).eq("id", l.id); }} /></td><td className="p-2 text-slate-500">{l.synced_from ? "Đồng bộ từ nhãn Zalo" : l.description}</td><td className="p-2"><button className="text-red-600" onClick={async () => { await sb.from("crm_labels").delete().eq("id", l.id); r.refresh(); }}>Xoá</button></td></tr>)}</tbody></table>
    <div className="flex gap-2 mt-3"><input className="input w-64" placeholder="Tên nhãn mới" value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} /><input type="color" value={n.color} onChange={(e) => setN({ ...n, color: e.target.value })} /><button className="btn btn-primary" onClick={async () => { if (!n.name) return; await sb.from("crm_labels").insert({ name: n.name, color: n.color, sort_order: labels.length + 1 }); setN({ name: "", color: "#2563eb" }); r.refresh(); }}>+ Thêm nhãn</button></div></div>;
}
