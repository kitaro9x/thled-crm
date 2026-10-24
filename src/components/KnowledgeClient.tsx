"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Knowledge } from "@/lib/types";
export function KnowledgeClient({ items, topics }: { items: Knowledge[]; topics: { id: string; name: string }[] }) {
  const r = useRouter(); const sb = supabaseBrowser();
  const [edit, setEdit] = useState<Partial<Knowledge> | null>(null);
  const [topic, setTopic] = useState("");
  const save = async () => {
    if (!edit?.title || !edit.content) return;
    const row = { title: edit.title, content: edit.content, shortcut: edit.shortcut || null, ai_description: edit.ai_description || null, topic_id: edit.topic_id || null, kind: edit.kind || "message" };
    if (edit.id) await sb.from("crm_knowledge").update(row).eq("id", edit.id); else await sb.from("crm_knowledge").insert(row);
    setEdit(null); r.refresh();
  };
  const addTopic = async () => { if (!topic) return; await sb.from("crm_knowledge_topics").insert({ name: topic }); setTopic(""); r.refresh(); };
  return (
    <div className="h-full flex">
      <div className="w-56 border-r border-slate-200 bg-white p-3 text-sm">
        <b>Chủ đề</b>
        {topics.map((t) => <div key={t.id} className="py-1">{t.name}</div>)}
        <div className="flex gap-1 mt-2"><input className="input py-1" placeholder="Thêm chủ đề" value={topic} onChange={(e) => setTopic(e.target.value)} /><button className="btn px-2" onClick={addTopic}>+</button></div>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <div className="flex items-center mb-3"><b>Kho tri thức</b><span className="text-slate-400 text-sm ml-2">dùng cho trả lời nhanh (/phím_tắt), kịch bản nuôi và chatbot AI</span><button className="btn btn-primary ml-auto" onClick={() => setEdit({ kind: "message" })}>+ Nội dung</button></div>
        <table className="w-full text-sm card bg-white"><thead className="bg-slate-50 text-xs text-slate-500 text-left"><tr><th className="p-2">Tiêu đề</th><th className="p-2">Phím tắt</th><th className="p-2">Loại</th><th className="p-2">Nội dung</th></tr></thead>
          <tbody>{items.map((k) => <tr key={k.id} onClick={() => setEdit(k)} className="border-t border-slate-100 cursor-pointer hover:bg-blue-50"><td className="p-2 font-medium">{k.title}</td><td className="p-2"><code>{k.shortcut}</code></td><td className="p-2">{k.kind}</td><td className="p-2 text-slate-500 truncate max-w-md">{k.content}</td></tr>)}</tbody></table>
      </div>
      {edit && <div className="w-[420px] border-l border-slate-200 bg-white p-4 space-y-2 text-sm">
        <b>{edit.id ? "Sửa" : "Thêm"} nội dung</b>
        <input className="input" placeholder="Tiêu đề" value={edit.title || ""} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
        <input className="input" placeholder="Phím tắt, vd /giaquat" value={edit.shortcut || ""} onChange={(e) => setEdit({ ...edit, shortcut: e.target.value })} />
        <select className="input" value={edit.topic_id || ""} onChange={(e) => setEdit({ ...edit, topic_id: e.target.value || null })}><option value="">Chủ đề</option>{topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        <select className="input" value={edit.kind || "message"} onChange={(e) => setEdit({ ...edit, kind: e.target.value })}><option value="message">Tin nhắn</option><option value="mail">Mail</option></select>
        <textarea className="input" rows={8} placeholder="Nội dung. Biến: {fullname} {gender} {phone}. Spin: #text{a|b}" value={edit.content || ""} onChange={(e) => setEdit({ ...edit, content: e.target.value })} />
        <textarea className="input" rows={2} placeholder="Mô tả cho AI (khi nào dùng nội dung này)" value={edit.ai_description || ""} onChange={(e) => setEdit({ ...edit, ai_description: e.target.value })} />
        <div className="flex gap-2"><button className="btn btn-primary" onClick={save}>Lưu</button><button className="btn" onClick={() => setEdit(null)}>Huỷ</button>{edit.id && <button className="btn btn-danger ml-auto" onClick={async () => { await sb.from("crm_knowledge").delete().eq("id", edit.id!); setEdit(null); r.refresh(); }}>Xoá</button>}</div>
      </div>}
    </div>
  );
}
