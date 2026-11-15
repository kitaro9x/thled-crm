import { redirect } from "next/navigation";
import { WorkClient } from "@/components/WorkClient";
import { currentMember, loadWorkItems } from "@/lib/crm/work-items-server";
import { isOverdue, isToday, workload, type WorkItem } from "@/lib/work-items";
export const dynamic = "force-dynamic";

/**
 * Mục "Công việc" (trước đây "Hành động"): gộp việc CRM (crm_activities) + việc trang thled.vn/congviec (tasks)
 * để cả nhóm thấy khối lượng việc & lịch trình của từng người.
 * ?tab=todo|today|overdue|web|crm|call|meeting|follow_up|email|done  ?p=<member id>|me
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string; p?: string }> }) {
  const { tab = "todo", p = "" } = await searchParams;
  const me = await currentMember();
  if (!me) redirect("/login");
  const done = tab === "done";
  const open = await loadWorkItems(me, { done: false });
  const base = done ? await loadWorkItems(me, { done: true }) : open;

  const now = new Date();
  const person = p === "me" ? me.id : p;
  const byTab = (w: WorkItem) => {
    if (tab === "today") return isToday(w, now);
    if (tab === "overdue") return isOverdue(w, now);
    if (tab === "web") return w.src === "web";
    if (tab === "crm") return w.src === "crm";
    if (["call", "meeting", "follow_up", "email"].includes(tab)) return w.kind === tab;
    return true;
  };
  const items = base.items.filter((w) => byTab(w) && (!person || w.ownerId === person));

  return (
    <WorkClient
      key={tab + "|" + person}
      tab={tab}
      person={person}
      me={{ id: me.id, name: me.name }}
      items={items}
      load={workload(open.items, now)}
      members={open.members.filter((m) => m.email).map((m) => ({ id: m.id, name: m.name, email: m.email! }))}
      lists={open.lists}
      error={base.error}
    />
  );
}
