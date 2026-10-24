import { supabaseServer } from "@/lib/supabase/server";
import { money } from "@/lib/utils";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const to = sp.to ? new Date(sp.to) : new Date(); const from = sp.from ? new Date(sp.from) : new Date(Date.now() - 30 * 86400000);
  const sb = await supabaseServer();
  const [{ data: msgs }, { data: leads }, { data: orders }, { data: members }, { data: convs }, { data: stages }] = await Promise.all([
    sb.from("crm_messages").select("direction,sent_at,sender_member_id,conversation_id").gte("sent_at", from.toISOString()).lte("sent_at", to.toISOString()).limit(20000),
    sb.from("crm_v_leads").select("id,status,assigned_to,assignee_name,qualified,created_at,stage_id,stage_name,lost_reason,won_at").gte("created_at", from.toISOString()).lte("created_at", to.toISOString()),
    sb.from("crm_orders").select("grand_total,saler_id,created_at").gte("created_at", from.toISOString()).lte("created_at", to.toISOString()),
    sb.from("crm_members").select("id,name"), sb.from("crm_v_conversations").select("id,channel_name,channel_type,first_response_seconds,labels,created_at").gte("created_at", from.toISOString()),
    sb.from("crm_stages").select("id,name,kind").order("sort_order"),
  ]);
  const inb = (msgs || []).filter((m) => m.direction === "in").length, outb = (msgs || []).length - inb;
  const byHour = Array.from({ length: 24 }, (_, h) => ({ h, in: 0, out: 0 }));
  (msgs || []).forEach((m) => { const h = new Date(m.sent_at).getHours(); if (m.direction === "in") byHour[h].in++; else byHour[h].out++; });
  const max = Math.max(1, ...byHour.map((x) => x.in + x.out));
  const byMember = (members || []).map((m) => ({ ...m, sent: (msgs || []).filter((x) => x.sender_member_id === m.id).length, leads: (leads || []).filter((l) => l.assigned_to === m.id), orders: (orders || []).filter((o) => o.saler_id === m.id) }));
  const byChannel = Object.values((convs || []).reduce((a: any, c) => { a[c.channel_name] = a[c.channel_name] || { name: c.channel_name, n: 0 }; a[c.channel_name].n++; return a; }, {})) as { name: string; n: number }[];
  const frt = (convs || []).filter((c) => c.first_response_seconds != null); const avgFrt = frt.length ? Math.round(frt.reduce((a, c) => a + c.first_response_seconds!, 0) / frt.length / 60) : 0;
  const tags = Object.entries((convs || []).flatMap((c) => c.labels || []).reduce((a: any, t) => { a[t] = (a[t] || 0) + 1; return a; }, {})).sort((a: any, b: any) => b[1] - a[1]).slice(0, 8);
  const lostReasons = Object.entries((leads || []).filter((l) => l.status === "lost").reduce((a: any, l) => { const k = l.lost_reason || "Không ghi"; a[k] = (a[k] || 0) + 1; return a; }, {}));
  const revenue = (orders || []).reduce((a, o) => a + Number(o.grand_total), 0);
  return (
    <div className="h-full overflow-auto p-4 space-y-4">
      <form className="flex items-center gap-2 text-sm"><b className="text-base mr-2">Báo cáo</b><input type="date" name="from" defaultValue={from.toISOString().slice(0, 10)} className="input w-40" /><span>→</span><input type="date" name="to" defaultValue={to.toISOString().slice(0, 10)} className="input w-40" /><button className="btn">Xem</button></form>
      <div className="grid grid-cols-6 gap-3">{[["Tin nhắn đến", inb], ["Tin nhắn đã gửi", outb], ["Hội thoại mới", convs?.length || 0], ["Phản hồi TB", `${avgFrt} phút`], ["Cơ hội mới", leads?.length || 0], ["Doanh thu", money(revenue)]].map(([k, v]) => <div key={k as string} className="card p-3"><div className="text-xs text-slate-500">{k as string}</div><div className="text-xl font-bold">{v as string}</div></div>)}</div>
      <div className="grid grid-cols-2 gap-4">
        <div className="card p-4"><b>Lưu lượng tin nhắn theo giờ</b><div className="flex items-end gap-0.5 h-32 mt-3">{byHour.map((x) => <div key={x.h} className="flex-1 flex flex-col justify-end" title={`${x.h}h: đến ${x.in}, gửi ${x.out}`}><div className="bg-blue-500" style={{ height: `${(x.out / max) * 100}%` }} /><div className="bg-emerald-500" style={{ height: `${(x.in / max) * 100}%` }} /></div>)}</div><div className="flex justify-between text-[10px] text-slate-400 mt-1"><span>0h</span><span>12h</span><span>23h</span></div></div>
        <div className="card p-4"><b>Kênh có tương tác cao nhất</b>{byChannel.map((c) => <Bar key={c.name} k={c.name} v={c.n} max={Math.max(...byChannel.map((x) => x.n), 1)} />)}<b className="block mt-3">Top thẻ hội thoại</b>{tags.map(([k, v]: any) => <Bar key={k} k={k} v={v} max={Number(tags[0]?.[1] || 1)} />)}</div>
      </div>
      <div className="card p-4"><b>Báo cáo bán hàng theo nhân viên</b>
        <table className="w-full text-sm mt-2"><thead className="text-xs text-slate-500 text-left"><tr><th className="p-2">Member</th><th className="p-2">Tin gửi</th><th className="p-2">Total Lead</th><th className="p-2">Qualified</th><th className="p-2">Won</th><th className="p-2">Lost</th><th className="p-2">CR</th><th className="p-2">Order</th><th className="p-2">Revenue</th><th className="p-2">AOV</th></tr></thead>
          <tbody>{byMember.map((m) => { const won = m.leads.filter((l) => l.status === "won").length; const rev = m.orders.reduce((a, o) => a + Number(o.grand_total), 0); return <tr key={m.id} className="border-t border-slate-100"><td className="p-2 font-medium">{m.name}</td><td className="p-2">{m.sent}</td><td className="p-2">{m.leads.length}</td><td className="p-2">{m.leads.filter((l) => l.qualified).length}</td><td className="p-2 text-emerald-600">{won}</td><td className="p-2 text-red-600">{m.leads.filter((l) => l.status === "lost").length}</td><td className="p-2">{m.leads.length ? Math.round((won / m.leads.length) * 100) : 0}%</td><td className="p-2">{m.orders.length}</td><td className="p-2">{money(rev)}</td><td className="p-2">{money(m.orders.length ? rev / m.orders.length : 0)}</td></tr>; })}</tbody></table></div>
      <div className="grid grid-cols-2 gap-4">
        <div className="card p-4"><b>Phễu theo giai đoạn</b>{(stages || []).map((s) => <Bar key={s.id} k={s.name} v={(leads || []).filter((l) => l.stage_id === s.id).length} max={Math.max(1, leads?.length || 1)} />)}</div>
        <div className="card p-4"><b>Lý do thất bại</b>{lostReasons.length === 0 && <div className="text-slate-400 text-sm mt-2">Chưa có</div>}{lostReasons.map(([k, v]: any) => <Bar key={k} k={k} v={v} max={Math.max(...lostReasons.map((x: any) => x[1]))} />)}</div>
      </div>
    </div>
  );
}
const Bar = ({ k, v, max }: { k: string; v: number; max: number }) => <div className="flex items-center gap-2 text-sm mt-1"><span className="w-40 truncate text-slate-600">{k}</span><div className="flex-1 bg-slate-100 rounded h-3"><div className="bg-blue-500 h-3 rounded" style={{ width: `${(v / max) * 100}%` }} /></div><span className="w-8 text-right">{v}</span></div>;
