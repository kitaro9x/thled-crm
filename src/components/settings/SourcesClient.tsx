"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Channel, LeadSource, Pipeline, Stage } from "@/lib/types";

const blank: Partial<LeadSource> = { name: "KH Mới", type: "conversation", is_active: true, channel_ids: [], owner_mode: "current", create_when_phone: true, create_when_email: false, create_when_new_conversation: false, dedupe_phone: true, dedupe_email: false, on_duplicate: "link", after_duplicate: {}, create_lead: true, lead_mode: "if_none", lead_owner_mode: "current", lead_followers: [] };

export function SourcesClient({ sources, channels, pipelines, stages, members }: { sources: LeadSource[]; channels: Channel[]; pipelines: Pipeline[]; stages: Stage[]; members: { id: string; name: string }[] }) {
  const r = useRouter(); const sb = supabaseBrowser();
  const [edit, setEdit] = useState<Partial<LeadSource> | null>(null);
  const save = async () => {
    const { id, ...row } = edit!;
    if (id) await sb.from("crm_lead_sources").update(row).eq("id", id); else await sb.from("crm_lead_sources").insert(row);
    setEdit(null); r.refresh();
  };
  const T = ({ k, v }: { k: keyof LeadSource; v?: any }) => <input type="checkbox" checked={!!edit?.[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.checked })} />;
  const Sel = ({ k, opts }: { k: keyof LeadSource; opts: [string, string][] }) => <select className="input" value={(edit?.[k] as string) || ""} onChange={(e) => setEdit({ ...edit, [k]: e.target.value || null })}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>;
  const stagesOf = stages.filter((s) => s.pipeline_id === edit?.pipeline_id && s.kind === "open");
  return (
    <div className="text-sm space-y-4">
      <div className="flex items-center"><div><b className="text-base">Quản lý nguồn đầu vào</b><div className="text-slate-500">Theo dõi và cấu hình các kết nối dữ liệu từ các nguồn (Hội thoại, Open API, Leadform, Import)</div></div><button className="btn btn-primary ml-auto" onClick={() => setEdit({ ...blank, pipeline_id: pipelines.find((p) => p.is_default)?.id })}>+ Thêm nguồn mới</button></div>
      <div className="card">
        <table className="w-full"><thead className="bg-slate-50 text-xs text-slate-500 text-left"><tr><th className="p-2">Nguồn</th><th className="p-2">Loại</th><th className="p-2">Kênh</th><th className="p-2">Điều kiện</th><th className="p-2">Cơ hội</th><th className="p-2">Trạng thái</th><th className="p-2"></th></tr></thead>
          <tbody>{sources.map((s) => <tr key={s.id} className="border-t border-slate-100"><td className="p-2 font-medium">{s.name}</td><td className="p-2">{s.type}</td><td className="p-2">{s.channel_ids.length ? s.channel_ids.map((c) => channels.find((x) => x.id === c)?.name).join(", ") : "Tất cả"}</td><td className="p-2">{[s.create_when_phone && "có SĐT", s.create_when_email && "có email", s.create_when_new_conversation && "hội thoại mới"].filter(Boolean).join(" / ")}</td><td className="p-2">{s.create_lead ? `${s.lead_mode === "always" ? "Luôn tạo" : "Tạo nếu chưa có"} → ${stages.find((x) => x.id === s.stage_id)?.name || "?"}` : "Không"}</td><td className="p-2"><input type="checkbox" checked={s.is_active} onChange={async (e) => { await sb.from("crm_lead_sources").update({ is_active: e.target.checked }).eq("id", s.id); r.refresh(); }} /></td><td className="p-2"><button className="text-blue-600 mr-2" onClick={() => setEdit(s)}>Sửa</button><button className="text-red-600" onClick={async () => { if (confirm("Xoá nguồn?")) { await sb.from("crm_lead_sources").delete().eq("id", s.id); r.refresh(); } }}>Xoá</button></td></tr>)}
          {sources.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-slate-400">Chưa có nguồn. Tạo nguồn “Hội thoại” để hệ thống tự bắt SĐT và tạo khách + cơ hội.</td></tr>}</tbody></table>
      </div>
      {edit && (
        <div className="card p-4 grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2"><b>Trạng thái hoạt động</b><T k="is_active" /></div>
            <b>Thông tin tạo khách hàng</b>
            <div className="grid grid-cols-2 gap-2"><Sel k="type" opts={[["conversation", "Hội thoại"], ["api", "Open API"], ["leadform", "Facebook Leadform"], ["import", "Nhập dữ liệu"]]} /><input className="input" value={edit.name || ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Tên nguồn" /></div>
            <div><div className="text-slate-500 mb-1">Chọn kênh áp dụng (trống = tất cả)</div><div className="flex flex-wrap gap-2">{channels.map((c) => <label key={c.id} className="flex items-center gap-1"><input type="checkbox" checked={edit.channel_ids?.includes(c.id)} onChange={(e) => { const s = new Set(edit.channel_ids || []); if (e.target.checked) s.add(c.id); else s.delete(c.id); setEdit({ ...edit, channel_ids: [...s] }); }} />{c.name}</label>)}</div></div>
            <div><div className="text-slate-500 mb-1">Người phụ trách khách hàng</div><div className="flex gap-2"><Sel k="owner_mode" opts={[["current", "Người phụ trách hội thoại hiện tại"], ["fixed", "Chọn nhân sự cụ thể"], ["none", "Không chọn ai"]]} />{edit.owner_mode === "fixed" && <Sel k="owner_id" opts={[["", "—"], ...members.map((m) => [m.id, m.name] as [string, string])]} />}</div></div>
            <div><b>Điều kiện tạo khách hàng</b><div className="text-xs text-slate-500">Hệ thống chỉ tạo khi cuộc hội thoại chưa được liên kết với khách hàng nào trước đó</div>
              <label className="flex gap-2 mt-1"><T k="create_when_phone" /> Khi có số điện thoại</label><label className="flex gap-2"><T k="create_when_email" /> Khi có email</label><label className="flex gap-2"><T k="create_when_new_conversation" /> Khi có cuộc hội thoại mới</label></div>
          </div>
          <div className="space-y-3">
            <b>Kiểm tra trùng lặp khách hàng</b>
            <label className="flex gap-2"><T k="dedupe_phone" /> Kiểm tra theo số điện thoại</label><label className="flex gap-2"><T k="dedupe_email" /> Kiểm tra theo email</label>
            <div><div className="text-slate-500 mb-1">Hành động khi phát hiện tồn tại khách hàng</div><Sel k="on_duplicate" opts={[["link", "Không tạo khách mới & tự động liên kết hội thoại với khách đã phát hiện"], ["skip", "Không tạo khách mới & không liên kết hội thoại"]]} /></div>
            <div className="grid grid-cols-2 gap-2"><input className="input" placeholder="Ghi chú tự động (khi trùng)" value={edit.after_duplicate?.note || ""} onChange={(e) => setEdit({ ...edit, after_duplicate: { ...edit.after_duplicate, note: e.target.value } })} /><select className="input" value={edit.after_duplicate?.activity?.type || ""} onChange={(e) => setEdit({ ...edit, after_duplicate: { ...edit.after_duplicate, activity: e.target.value ? { type: e.target.value, title: "Khách cũ nhắn lại", assignee_mode: "current" } : undefined } })}><option value="">Không tạo hành động</option><option value="call">Tạo việc: Gọi</option><option value="follow_up">Tạo việc: Follow up</option></select></div>
            <div className="flex items-center gap-2"><b>Tạo cơ hội bán hàng</b><T k="create_lead" /></div>
            {edit.create_lead && <>
              <Sel k="lead_mode" opts={[["always", "Luôn tạo cơ hội mới"], ["if_none", "Không tạo cơ hội mới nếu khách hàng đã có cơ hội mở"]]} />
              <div className="grid grid-cols-2 gap-2"><Sel k="pipeline_id" opts={pipelines.map((p) => [p.id, p.name])} /><Sel k="stage_id" opts={[["", "Giai đoạn bắt đầu"], ...stagesOf.map((s) => [s.id, s.name] as [string, string])]} /></div>
              <div className="grid grid-cols-2 gap-2"><Sel k="lead_owner_mode" opts={[["current", "Người phụ trách hội thoại"], ["fixed", "Nhân sự cụ thể"], ["none", "Không gán"]]} />{edit.lead_owner_mode === "fixed" && <Sel k="lead_owner_id" opts={[["", "—"], ...members.map((m) => [m.id, m.name] as [string, string])]} />}</div>
            </>}
            <div className="flex gap-2 justify-end"><button className="btn" onClick={() => setEdit(null)}>Huỷ</button><button className="btn btn-primary" onClick={save}>Lưu lại</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
