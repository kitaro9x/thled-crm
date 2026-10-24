"use client";
import Link from "next/link";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn, dt } from "@/lib/utils";
const label: Record<string, string> = { call: "Gọi", meeting: "Họp", follow_up: "Follow up", email: "Email", note: "Ghi chú" };
export function ActivitiesClient({ items }: { items: any[] }) {
  const [list, setList] = useState(items);
  const toggle = async (a: any) => {
    const done = !a.is_done; setList((l) => l.map((x) => (x.id === a.id ? { ...x, is_done: done } : x)));
    await supabaseBrowser().from("crm_activities").update({ is_done: done, done_at: done ? new Date().toISOString() : null }).eq("id", a.id);
  };
  const overdue = (a: any) => !a.is_done && a.due_at && new Date(a.due_at) < new Date();
  return (
    <div className="flex-1 overflow-auto p-4">
      {list.length === 0 && <div className="text-center text-slate-400 py-16">Tuyệt vời! Không có việc cần làm</div>}
      <div className="card divide-y divide-slate-100">
        {list.map((a) => (
          <div key={a.id} className="flex items-center gap-3 p-3 text-sm">
            <input type="checkbox" checked={a.is_done} onChange={() => toggle(a)} />
            <span className="chip bg-slate-100 w-20 justify-center">{label[a.type]}</span>
            <div className="flex-1 min-w-0"><div className={cn("font-medium", a.is_done && "line-through text-slate-400")}>{a.title}</div><div className="text-xs text-slate-500">{a.crm_leads?.title && <Link href={`/leads?lead=${a.lead_id}`} className="text-blue-600">{a.crm_leads.title}</Link>}{a.crm_customers?.phone && ` · ${a.crm_customers.phone}`}{a.customer_busy && " · khách bận"}</div></div>
            <span className={cn("chip", a.priority === "high" ? "bg-red-50 text-red-600" : a.priority === "low" ? "bg-slate-100" : "bg-amber-50 text-amber-700")}>{a.priority}</span>
            <span className="text-slate-500 w-32">{a.crm_members?.name || "—"}</span>
            <span className={cn("w-28 text-right", overdue(a) ? "text-red-600 font-medium" : "text-slate-500")}>{a.due_at ? dt(a.due_at, "HH:mm dd/MM") : ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
