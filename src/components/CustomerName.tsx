"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X, History } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { oldNames, renamePatch, dropOldNamePatch } from "@/lib/customer-name";

type P = { id: string; name?: string | null; custom?: Record<string, unknown> | null };

/** Ghi tên mới cho khách + lưu tên cũ vào custom.old_names, rồi "chạm" các hội thoại của khách để inbox (realtime) cập nhật tên ngay. */
export async function renameCustomer(p: P, newName: string) {
  const sb = supabaseBrowser();
  const name = newName.trim();
  if (!name || name === (p.name || "").trim()) return false;
  const { error } = await sb.from("crm_customers").update(renamePatch(p, name)).eq("id", p.id);
  if (error) throw error;
  await sb.from("crm_conversations").update({ updated_at: new Date().toISOString() }).eq("customer_id", p.id);
  return true;
}

/** Tên khách có nút ✎ sửa tại chỗ. Enter = lưu, Esc = huỷ. */
export function CustomerName({ person, className, onSaved }: { person: P; className?: string; onSaved?: () => void }) {
  const router = useRouter();
  const [edit, setEdit] = useState(false); const [v, setV] = useState(person.name || ""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  useEffect(() => { setV(person.name || ""); }, [person.name]);
  const done = () => { if (onSaved) onSaved(); else router.refresh(); };
  const save = async () => {
    if (busy) return; setBusy(true); setErr("");
    try { await renameCustomer(person, v); setEdit(false); done(); } catch (e: any) { setErr(e.message || "Không lưu được"); }
    setBusy(false);
  };
  if (!edit) return <div className={cn("flex items-center gap-1 min-w-0", className)}><span className="truncate">{person.name || "(chưa có tên)"}</span><button type="button" title="Đổi tên khách (tên cũ vẫn được lưu lại)" onClick={() => { setV(person.name || ""); setEdit(true); }} className="p-0.5 text-slate-400 hover:text-blue-600 shrink-0"><Pencil size={12} /></button></div>;
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1">
        <input autoFocus className="input py-1 text-sm font-normal" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEdit(false); }} placeholder="Tên khách" />
        <button type="button" className="btn px-2 py-1 btn-primary" onClick={save} disabled={busy || !v.trim()} title="Lưu"><Check size={14} /></button>
        <button type="button" className="btn px-2 py-1" onClick={() => setEdit(false)} title="Huỷ"><X size={14} /></button>
      </div>
      {err && <div className="text-xs text-red-600 mt-1">{err}</div>}
    </div>
  );
}

/** Danh sách tên cũ của khách: ↑ = dùng lại tên này (tên hiện tại sẽ vào lịch sử), × = bỏ khỏi lịch sử. */
export function OldNames({ person, onSaved, emptyText = "—" }: { person: P; onSaved?: () => void; emptyText?: string }) {
  const router = useRouter(); const sb = supabaseBrowser();
  const list = oldNames(person);
  const done = () => { if (onSaved) onSaved(); else router.refresh(); };
  if (!list.length) return <span className="text-slate-400">{emptyText}</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {list.map((x) => <span key={x} className="chip bg-slate-100 text-slate-700 text-xs inline-flex items-center gap-1"><History size={10} className="text-slate-400" />{x}
        <button type="button" className="text-blue-600" title="Dùng lại tên này" onClick={async () => { await renameCustomer(person, x); done(); }}>↑</button>
        <button type="button" className="text-slate-400 hover:text-red-600" title="Bỏ khỏi danh sách tên cũ" onClick={async () => { if (!confirm(`Bỏ "${x}" khỏi danh sách tên cũ?`)) return; await sb.from("crm_customers").update(dropOldNamePatch(person, x)).eq("id", person.id); done(); }}>×</button>
      </span>)}
    </div>
  );
}
