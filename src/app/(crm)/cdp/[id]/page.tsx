import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { Avatar } from "@/components/Avatar";
import { ChannelIcon } from "@/components/ChannelIcon";
import { dt, money } from "@/lib/utils";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const sb = await supabaseServer();
  const { data: p } = await sb.from("crm_customers").select("*").eq("id", id).single(); if (!p) notFound();
  const [{ data: convs }, { data: leads }, { data: orders }, { data: acts }] = await Promise.all([
    sb.from("crm_v_conversations").select("*").eq("customer_id", id), sb.from("crm_v_leads").select("*").eq("person_id", id).order("created_at", { ascending: false }),
    sb.from("crm_orders").select("*").eq("person_id", id).order("created_at", { ascending: false }), sb.from("crm_activities").select("*").eq("person_id", id).order("created_at", { ascending: false }).limit(50),
  ]);
  return (
    <div className="h-full overflow-auto p-4 grid grid-cols-[320px_1fr] gap-4">
      <div className="card p-4 space-y-2 text-sm h-fit">
        <div className="flex items-center gap-3"><Avatar src={p.avatar_url} name={p.name} size={56} /><div><div className="text-lg font-semibold">{p.name}</div><div className="text-slate-500">{p.phone}</div></div></div>
        {[["Email", p.email], ["Giới tính", p.gender], ["Zalo", p.zalo], ["Địa chỉ", p.address], ["SP quan tâm", p.custom?.sp_quan_tam], ["Cảm xúc", p.emotion], ["Nguồn", p.source_origin], ["Tạo", dt(p.created_at, "dd/MM/yyyy")]].map(([k, v]) => <div key={k as string} className="grid grid-cols-[100px_1fr]"><span className="text-slate-500">{k as string}</span><span>{(v as string) || "-"}</span></div>)}
        <div><b>Kênh liên lạc</b><div className="flex gap-2 mt-1">{(convs || []).map((c) => <Link key={c.id} href={`/inbox?c=${c.id}`} className="btn px-2"><ChannelIcon type={c.channel_type} /> {c.display_name}</Link>)}</div></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-center pt-2"><Stat n={p.total_leads} l="Cơ hội" /><Stat n={p.won_leads} l="Won" /><Stat n={p.total_orders} l="Đơn" /></div>
      </div>
      <div className="space-y-4">
        <Sec t="Cơ hội">{(leads || []).map((l) => <Link key={l.id} href={`/leads?lead=${l.id}&pipeline=${l.pipeline_id}`} className="flex justify-between py-1.5 border-t border-slate-100"><span>{l.title}</span><span className="chip text-white" style={{ background: l.stage_color }}>{l.stage_name}</span></Link>)}</Sec>
        <Sec t="Đơn hàng & Báo giá">{(orders || []).map((o) => <Link key={o.id} href={`/orders/${o.id}`} className="flex justify-between py-1.5 border-t border-slate-100"><span>{o.code} · {o.status}</span><span>{money(o.grand_total)}</span></Link>)}</Sec>
        <Sec t="Hoạt động">{(acts || []).map((a) => <div key={a.id} className="py-1.5 border-t border-slate-100 text-sm"><span className="chip bg-slate-100 mr-2">{a.type}</span>{a.title}<span className="text-xs text-slate-400 ml-2">{dt(a.created_at, "HH:mm dd/MM")}</span></div>)}</Sec>
      </div>
    </div>
  );
}
const Stat = ({ n, l }: { n: number; l: string }) => <div className="rounded bg-slate-50 p-2"><div className="text-lg font-bold">{n}</div><div className="text-xs text-slate-500">{l}</div></div>;
const Sec = ({ t, children }: { t: string; children: React.ReactNode }) => <div className="card p-4"><b>{t}</b><div className="mt-2 text-sm">{children}</div></div>;
