import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { ActivitiesClient } from "@/components/ActivitiesClient";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "todo" } = await searchParams;
  const sb = await supabaseServer();
  let q = sb.from("crm_activities").select("*, crm_leads(title), crm_customers(name,phone), crm_members!crm_activities_assignee_id_fkey(name)").neq("type", "note").order("due_at", { ascending: true, nullsFirst: false }).limit(500);
  const now = new Date().toISOString();
  if (tab === "todo") q = q.eq("is_done", false);
  if (["call", "meeting", "follow_up", "email"].includes(tab)) q = q.eq("is_done", false).eq("type", tab);
  if (tab === "overdue") q = q.eq("is_done", false).lt("due_at", now);
  if (tab === "today") q = q.eq("is_done", false).gte("due_at", now.slice(0, 10)).lt("due_at", new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  if (tab === "done") q = q.eq("is_done", true);
  const { data } = await q;
  const tabs = [["todo", "Chưa hoàn thành"], ["call", "Gọi"], ["meeting", "Họp"], ["follow_up", "Bám đuổi"], ["email", "Email"], ["overdue", "Quá hạn"], ["today", "Hôm nay"], ["done", "Đã xong"]];
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2 bg-white border-b border-slate-200 flex gap-2 items-center"><b className="mr-2">Hành động</b>{tabs.map(([k, l]) => <Link key={k} href={`/activities?tab=${k}`} className={`chip border ${tab === k ? "bg-blue-600 text-white border-blue-600" : "border-slate-200"}`}>{l}</Link>)}</div>
      <ActivitiesClient items={(data as any[]) || []} />
    </div>
  );
}
