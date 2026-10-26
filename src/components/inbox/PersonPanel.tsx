"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Phone, Plus, UserPlus, Sparkles } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Conversation, Lead, Person } from "@/lib/types";
import { Avatar } from "@/components/Avatar";
import { extractPhone } from "@/lib/phone";
import { money, dt } from "@/lib/utils";

export function PersonPanel({ conv, members }: { conv: Conversation; members: { id: string; name: string }[] }) {
  const sb = supabaseBrowser();
  const [person, setPerson] = useState<Person | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [orders, setOrders] = useState<{ id: string; code: string; grand_total: number; status: string }[]>([]);
  const [friendTask, setFriendTask] = useState<{ status: string } | null>(null);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (conv.customer_id) {
      const { data: p } = await sb.from("crm_customers").select("*").eq("id", conv.customer_id).single(); setPerson(p as Person); setPhone(p?.phone || ""); setName(p?.name || "");
      const { data: l } = await sb.from("crm_v_leads").select("*").eq("person_id", conv.customer_id).order("created_at", { ascending: false }); setLeads((l as Lead[]) || []);
      const { data: o } = await sb.from("crm_orders").select("id,code,grand_total,status").eq("person_id", conv.customer_id).order("created_at", { ascending: false }); setOrders(o || []);
      if (p?.phone) { const { data: t } = await sb.from("crm_zalo_friend_tasks").select("status").eq("phone", p.phone).order("created_at", { ascending: false }).limit(1).maybeSingle(); setFriendTask(t); }
    } else {
      setPerson(null); setLeads([]); setOrders([]);
      setPhone(extractPhone(conv.last_message_text) || ""); setName(conv.display_name || "");
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [conv.id, conv.customer_id]);

  const createPerson = async () => {
    setBusy(true);
    const { data: p, error } = await sb.from("crm_customers").insert({ name: name || conv.display_name, phone: phone || null, avatar_url: conv.identity_avatar, source_origin: "manual", source_channel_id: conv.channel_id }).select("*").single();
    if (!error && p) { await sb.from("crm_conversations").update({ customer_id: p.id }).eq("id", conv.id); await sb.from("crm_identities").update({ customer_id: p.id }).eq("id", conv.identity_id); }
    setBusy(false); load();
  };
  // chỉ lưu khi người dùng thật sự đổi số; không bao giờ ghi đè bằng rỗng (tránh mất SĐT khi bấm vào rồi rời ô)
  const savePhone = async () => {
    if (!person) return; const v = phone.replace(/[\s.\-]/g, "");
    if (!v || v === person.phone) { setPhone(person.phone || ""); return; }
    const extra = (Array.isArray(person.custom?.phones) ? person.custom.phones : []).filter((x: string) => x !== v);
    const custom = { ...(person.custom || {}), phones: person.phone && person.phone !== v ? Array.from(new Set([person.phone, ...extra])) : extra };
    await sb.from("crm_customers").update({ phone: v, custom }).eq("id", person.id); load();
  };
  const makePrimary = async (v: string) => { if (!person) return; setPhone(v); const extra = (person.custom?.phones || []).filter((x: string) => x !== v); const custom = { ...(person.custom || {}), phones: person.phone ? [person.phone, ...extra] : extra }; await sb.from("crm_customers").update({ phone: v, custom }).eq("id", person.id); load(); };
  const createLead = async () => {
    if (!person) return;
    const { data: pipe } = await sb.from("crm_pipelines").select("id").eq("is_default", true).single();
    const { data: stage } = await sb.from("crm_stages").select("id").eq("pipeline_id", pipe!.id).eq("kind", "open").order("sort_order").limit(1).single();
    await fetch("/api/leads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: person.name, person_id: person.id, pipeline_id: pipe!.id, stage_id: stage!.id, source_conversation_id: conv.id, source_channel_id: conv.channel_id }) });
    load();
  };
  const requestZaloFriend = async () => {
    if (!person?.phone) return;
    await sb.from("crm_zalo_friend_tasks").insert({ customer_id: person.id, phone: person.phone, source_conversation_id: conv.id, greeting: `Xin chào ${person.name || ""}, em bên showroom THLED Đồng Nai, kết bạn để gửi báo giá và tư vấn ạ.`.slice(0, 150) });
    load();
  };
  const summarize = async () => {
    const r = await fetch("/api/ai/summarize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversation_id: conv.id }) });
    if (!r.ok) alert("Chưa cấu hình ANTHROPIC_API_KEY");
  };

  return (
    <div className="w-[320px] shrink-0 border-l border-slate-200 bg-white overflow-y-auto">
      <div className="p-4 border-b border-slate-100 flex items-center gap-3">
        <Avatar src={person?.avatar_url || conv.identity_avatar} name={person?.name || conv.display_name} size={44} />
        <div className="min-w-0"><div className="font-semibold truncate">{person?.name || conv.display_name}</div>{person && <Link href={`/cdp/${person.id}`} className="text-xs text-blue-600">Xem khách hàng</Link>}</div>
      </div>
      {!person ? (
        <div className="p-4 space-y-2">
          <div className="text-xs text-slate-500">Chưa có hồ sơ khách. Hệ thống sẽ tự tạo khi khách để lại SĐT, hoặc tạo tay:</div>
          <input className="input" placeholder="Tên" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input" placeholder="Số điện thoại" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <button className="btn btn-primary w-full justify-center" onClick={createPerson} disabled={busy}><Plus size={14} /> Tạo khách hàng</button>
        </div>
      ) : (
        <div className="p-4 space-y-3 text-sm">
          <Row k="Phone"><div className="flex gap-1"><input className="input py-1" value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={savePhone} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />{person.phone && <a className="btn px-2" href={`tel:${person.phone}`}><Phone size={14} /></a>}</div>
            {Array.isArray(person.custom?.phones) && person.custom.phones.length > 0 && <div className="flex flex-wrap gap-1 mt-1">{person.custom.phones.map((x: string) => <span key={x} className="chip bg-slate-100 text-slate-700 text-xs">{x} <button className="ml-1 text-blue-600" title="Dùng làm số chính" onClick={() => makePrimary(x)}>↑</button></span>)}</div>}</Row>
          <Row k="Giới tính"><select className="input py-1" value={person.gender || ""} onChange={async (e) => { await sb.from("crm_customers").update({ gender: e.target.value || null }).eq("id", person.id); load(); }}><option value="">-</option><option>Nam</option><option>Nữ</option></select></Row>
          <Row k="Email">{person.email || "-"}</Row>
          <Row k="Phụ trách"><select className="input py-1" value={person.assigned_to || ""} onChange={async (e) => { await sb.from("crm_customers").update({ assigned_to: e.target.value || null }).eq("id", person.id); load(); }}><option value="">-</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Row>
          <Row k="SP quan tâm"><input className="input py-1" defaultValue={(person.custom?.sp_quan_tam as string) || ""} onBlur={async (e) => { await sb.from("crm_customers").update({ custom: { ...person.custom, sp_quan_tam: e.target.value } }).eq("id", person.id); }} /></Row>
          <Row k="Cảm xúc">{person.emotion || conv.emotion || "-"}</Row>
          <Row k="Nguồn">{person.source_origin || "-"}</Row>

          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between mb-1"><b>Kết bạn Zalo</b>{friendTask && <span className="chip bg-slate-100">{friendTask.status}</span>}</div>
            <button className="btn w-full justify-center" onClick={requestZaloFriend} disabled={!person.phone || !!friendTask}><UserPlus size={14} /> Gửi lời mời kết bạn</button>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between mb-1"><b>Cơ hội ({leads.filter((l) => l.status === "open").length} mở)</b><button className="btn px-2 py-0.5" onClick={createLead}><Plus size={12} /></button></div>
            {leads.map((l) => <Link key={l.id} href={`/leads?lead=${l.id}`} className="block rounded border border-slate-100 p-2 mb-1 hover:bg-slate-50"><div className="font-medium truncate">{l.title}</div><div className="text-xs text-slate-500"><span className="chip text-white" style={{ background: l.stage_color }}>{l.stage_name}</span> · {dt(l.created_at, "dd/MM")}</div></Link>)}
          </div>

          <div className="pt-2 border-t border-slate-100">
            <b>Đơn hàng & Báo giá ({orders.length})</b>
            {orders.map((o) => <Link key={o.id} href={`/orders/${o.id}`} className="flex justify-between text-xs py-1"><span>{o.code}</span><span>{money(o.grand_total)}</span></Link>)}
          </div>

          <button className="btn w-full justify-center" onClick={summarize}><Sparkles size={14} /> AI tóm tắt hội thoại</button>
        </div>
      )}
    </div>
  );
}
const Row = ({ k, children }: { k: string; children: React.ReactNode }) => <div className="grid grid-cols-[90px_1fr] items-center gap-2"><div className="text-slate-500 text-xs">{k}</div><div className="min-w-0">{children}</div></div>;
