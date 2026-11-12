"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Phone, Plus, UserPlus, Sparkles, Ban, Trash2, RotateCcw, ClipboardList } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Conversation, Lead, Person, Stage } from "@/lib/types";
import { Avatar } from "@/components/Avatar";
import { GroupAvatar } from "@/components/GroupAvatar";
import { extractPhone } from "@/lib/phone";
import { money, dt, cn } from "@/lib/utils";
import { CustomerName, OldNames } from "@/components/CustomerName";
import { oldNames } from "@/lib/customer-name";
import { TaskDialog, TaskList, useOpenTasks } from "./Tasks";

/** leadBlockedBy: tên nhãn "Không tạo cơ hội" (Nhà cung cấp, Bạn bè, Gia đình, Shipper, Công nợ…) mà hội thoại đang mang → ẩn mục Cơ hội */
export function PersonPanel({ conv, members, leadBlockedBy = null }: { conv: Conversation; members: { id: string; name: string }[]; leadBlockedBy?: string | null }) {
  const showLeads = !leadBlockedBy;
  const sb = supabaseBrowser();
  const [person, setPerson] = useState<Person | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [orders, setOrders] = useState<{ id: string; code: string; grand_total: number; status: string }[]>([]);
  const [friendTask, setFriendTask] = useState<{ id: string; status: string; last_error?: string | null } | null>(null);
  // hội thoại Zalo 1:1: trạng thái bạn bè / chặn lấy từ identity.meta (worker đồng bộ)
  const isZalo = conv.channel_type === "zalo_personal" && conv.kind !== "group";
  const [ident, setIdent] = useState<{ meta?: Record<string, any> | null; phone?: string | null } | null>(null);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (isZalo) {
      const [{ data: i }, { data: t }] = await Promise.all([
        sb.from("crm_identities").select("meta,phone").eq("id", conv.identity_id).maybeSingle(),
        sb.from("crm_zalo_friend_tasks").select("id,status,last_error").eq("zalo_uid", conv.external_id || "").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      setIdent(i); setFriendTask(t);
    }
    if (conv.customer_id) {
      const { data: p } = await sb.from("crm_customers").select("*").eq("id", conv.customer_id).single(); setPerson(p as Person); setPhone(p?.phone || ""); setName(p?.name || "");
      const { data: l } = await sb.from("crm_v_leads").select("*").eq("person_id", conv.customer_id).order("created_at", { ascending: false }); setLeads((l as Lead[]) || []);
      const { data: o } = await sb.from("crm_orders").select("id,code,grand_total,status").eq("person_id", conv.customer_id).order("created_at", { ascending: false }); setOrders(o || []);
      if (p?.phone && !isZalo) { const { data: t } = await sb.from("crm_zalo_friend_tasks").select("id,status,last_error").eq("phone", p.phone).order("created_at", { ascending: false }).limit(1).maybeSingle(); setFriendTask(t); }
    } else {
      setPerson(null); setLeads([]); setOrders([]);
      setName(conv.display_name || "");
      // gợi ý SĐT: chỉ lấy từ tin KHÁCH gửi, bỏ số trong danh sách loại trừ (hotline, nhân viên)
      const [{ data: ins }, { data: st }] = await Promise.all([
        sb.from("crm_messages").select("text").eq("conversation_id", conv.id).eq("direction", "in").not("text", "is", null).order("created_at", { ascending: false }).limit(30),
        sb.from("crm_settings").select("value").eq("key", "phone").maybeSingle(),
      ]);
      const bl: string[] = (st?.value as any)?.blacklist || [];
      let found = "";
      for (const m of ins || []) { const ph = extractPhone(m.text); if (ph && !bl.includes(ph)) { found = ph; break; } }
      setPhone(found);
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
    const extra = (Array.isArray(person.custom?.phones) ? (person.custom.phones as string[]) : []).filter((x: string) => x !== v);
    const custom = { ...(person.custom || {}), phones: person.phone && person.phone !== v ? Array.from(new Set([person.phone, ...extra])) : extra };
    await sb.from("crm_customers").update({ phone: v, custom }).eq("id", person.id); load();
  };
  const makePrimary = async (v: string) => { if (!person) return; setPhone(v); const extra = ((person.custom?.phones as string[]) || []).filter((x: string) => x !== v); const custom = { ...(person.custom || {}), phones: person.phone ? [person.phone, ...extra] : extra }; await sb.from("crm_customers").update({ phone: v, custom }).eq("id", person.id); load(); };
  const [leadBusy, setLeadBusy] = useState(false); const [leadMsg, setLeadMsg] = useState("");
  // các giai đoạn của phễu mặc định → nút bấm nhanh "đánh dấu" ngay trong panel (Đã mua hàng = giai đoạn WON)
  const [stages, setStages] = useState<Stage[]>([]);
  useEffect(() => { (async () => { const { data: pipe } = await sb.from("crm_pipelines").select("id").eq("is_default", true).single(); if (!pipe) return; const { data } = await sb.from("crm_stages").select("*").eq("pipeline_id", pipe.id).order("sort_order"); setStages((data as Stage[]) || []); })(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const openLead = leads.find((l) => l.status === "open") || null; // cơ hội mở gần nhất (leads đã sort created_at desc)
  const lastLead = leads[0] || null;
  const markStage = async (st: Stage) => {
    if (!person || leadBusy) return; setLeadBusy(true); setLeadMsg("");
    const hdr = { "content-type": "application/json" };
    const patch = async (id: string) => { const r = await fetch("/api/leads", { method: "PATCH", headers: hdr, body: JSON.stringify({ id, stage_id: st.id }) }); if (!r.ok) setLeadMsg((await r.json()).error || "Không đổi được giai đoạn"); };
    try {
      if (openLead) { if (openLead.stage_id !== st.id) await patch(openLead.id); }
      else {
        // chưa có cơ hội mở → tạo mới. WON thì tạo ở giai đoạn mở đầu rồi chuyển sang WON để trigger DB ghi status/won_at/lịch sử đúng
        const first = stages.find((x) => x.kind === "open") || st;
        const r = await fetch("/api/leads", { method: "POST", headers: hdr, body: JSON.stringify({ title: person.name, person_id: person.id, pipeline_id: st.pipeline_id, stage_id: st.kind === "won" ? first.id : st.id, source_conversation_id: conv.id, source_channel_id: conv.channel_id, force: true }) });
        const j = await r.json(); if (!r.ok) setLeadMsg(j.error || "Không tạo được cơ hội"); else if (st.kind === "won" || j.existing) await patch(j.id);
      }
    } catch (e: any) { setLeadMsg(e.message || "Lỗi"); }
    setLeadBusy(false); load();
    try { window.dispatchEvent(new Event("crm:leads-changed")); } catch {} // danh sách hội thoại cập nhật tag ngay, không chờ realtime
  };
  const createLead = async () => {
    if (!person || leadBusy) return; setLeadBusy(true); setLeadMsg("");
    const { data: pipe } = await sb.from("crm_pipelines").select("id").eq("is_default", true).single();
    const { data: stage } = await sb.from("crm_stages").select("id").eq("pipeline_id", pipe!.id).eq("kind", "open").order("sort_order").limit(1).single();
    const r = await fetch("/api/leads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: person.name, person_id: person.id, pipeline_id: pipe!.id, stage_id: stage!.id, source_conversation_id: conv.id, source_channel_id: conv.channel_id }) });
    const j = await r.json(); if (j.existing) setLeadMsg("Khách đã có cơ hội đang mở — không tạo thêm."); setLeadBusy(false);
    load(); try { window.dispatchEvent(new Event("crm:leads-changed")); } catch {}
  };
  // Gửi lời mời kết bạn: hội thoại Zalo → theo UID (không cần SĐT, không cần hồ sơ); kênh khác → theo SĐT của khách
  const requestZaloFriend = async () => {
    if (!isZalo && !person?.phone) return;
    if (friendTask && ["failed", "not_found"].includes(friendTask.status)) { await sb.from("crm_zalo_friend_tasks").update({ status: "todo", attempts: 0, last_error: null }).eq("id", friendTask.id); load(); return; } // thử lại
    const who = person?.name || conv.display_name || "";
    await sb.from("crm_zalo_friend_tasks").insert({ customer_id: person?.id || null, phone: isZalo ? null : person!.phone, zalo_uid: isZalo ? conv.external_id : null, source_conversation_id: conv.id, greeting: `Xin chào ${who}, em bên showroom THLED Đồng Nai, kết bạn để gửi báo giá và tư vấn ạ.`.slice(0, 150) });
    load();
  };
  const unblockZalo = async () => {
    if (!isZalo || !conv.external_id) return;
    await sb.from("crm_zalo_actions").insert({ action: "unblock", zalo_uid: conv.external_id, conversation_id: conv.id, identity_id: conv.identity_id });
    await sb.from("crm_conversations").update({ is_hidden: false, status: "open" }).eq("id", conv.id);
    setIdent((i) => ({ ...(i || {}), meta: { ...(i?.meta || {}), blocked: false } })); load();
  };
  const blocked = !!ident?.meta?.blocked;
  // Công việc đang mở (lưu ở mục Hành động) của khách / hội thoại
  const { tasks, markDone } = useOpenTasks(conv);
  const [newTask, setNewTask] = useState(false);
  const taskBox = (
    <div className="pt-2 border-t border-slate-100">
      <div className="flex items-center justify-between mb-1"><b className="flex items-center gap-1"><ClipboardList size={14} />Công việc ({tasks.length})</b><button className="btn px-2 py-0.5" title="Tạo công việc (lưu vào Hành động)" onClick={() => setNewTask(true)}><Plus size={12} /></button></div>
      <TaskList tasks={tasks} members={members} onDone={markDone} />
      {newTask && <TaskDialog conv={conv} members={members} seed={{}} onClose={() => setNewTask(false)} />}
    </div>
  );
  // Xoá hội thoại khỏi CRM (ẩn toàn bộ kênh của khách) / Chặn trên Zalo — cũng có trong menu ⋯ của header
  const hideConv = async (hide: boolean) => {
    if (hide && !window.confirm("Xoá hội thoại này khỏi CRM?\nTin nhắn vẫn được lưu, tin mới sẽ không hiện và không báo. Xem lại ở bộ lọc “Đã xoá/chặn”.")) return;
    const q = sb.from("crm_conversations").update({ is_hidden: hide, status: hide ? "closed" : "open" });
    await (conv.customer_id ? q.eq("customer_id", conv.customer_id) : q.eq("id", conv.id));
  };
  const blockZalo = async () => {
    if (!isZalo || !conv.external_id) return;
    if (!window.confirm(`Chặn ${conv.display_name || "người này"} trên Zalo?\nHọ sẽ không nhắn được cho số Zalo của shop nữa. Hội thoại bị ẩn khỏi CRM, bỏ chặn được ở bộ lọc “Đã xoá/chặn”.`)) return;
    await sb.from("crm_zalo_actions").insert({ action: "block", zalo_uid: conv.external_id, conversation_id: conv.id, identity_id: conv.identity_id });
    await sb.from("crm_conversations").update({ is_hidden: true, status: "closed" }).eq("id", conv.id);
    setIdent((i) => ({ ...(i || {}), meta: { ...(i?.meta || {}), blocked: true } }));
  };
  const dangerBox = (
    <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-1">
      {conv.is_hidden ? <button className="btn flex-1 justify-center text-xs" onClick={() => hideConv(false)}><RotateCcw size={13} /> Khôi phục hội thoại</button>
        : <button className="btn flex-1 justify-center text-xs text-red-600" title="Ẩn khỏi CRM; tin nhắn vẫn lưu, xem lại ở bộ lọc Đã xoá/chặn" onClick={() => hideConv(true)}><Trash2 size={13} /> Xoá hội thoại</button>}
      {isZalo && !blocked && <button className="btn flex-1 justify-center text-xs text-red-600" title="Chặn thật trên Zalo của shop — chỉ dùng cho số spam" onClick={blockZalo}><Ban size={13} /> Chặn trên Zalo</button>}
    </div>
  );
  const isFriend = isZalo ? ident?.meta?.is_friend : friendTask?.status === "accepted";
  const pending = !!friendTask && ["todo", "pending", "sent"].includes(friendTask.status);
  const friendBox = (isZalo || person?.phone) && (
    <div className="pt-2 border-t border-slate-100">
      <div className="flex items-center justify-between mb-1"><b>Kết bạn Zalo</b>
        {blocked ? <span className="lchip lchip-red">Đã chặn</span>
          : isFriend === true ? <span className="lchip lchip-green">Đã là bạn</span>
          : friendTask ? <span className={cn("lchip", friendTask.status === "failed" || friendTask.status === "not_found" ? "lchip-red" : friendTask.status === "sent" ? "lchip-blue" : "lchip-gray")}>{({ todo: "Đang chờ gửi", pending: "Đang chờ gửi", sent: "Đã gửi lời mời", failed: "Chưa gửi được", not_found: "Không tìm thấy Zalo", skipped: "Bỏ qua" } as Record<string, string>)[friendTask.status] || friendTask.status}</span>
          : isZalo && ident?.meta?.is_friend === false ? <span className="lchip lchip-gray">Chưa kết bạn</span> : null}
      </div>
      {blocked ? <button className="btn w-full justify-center" onClick={unblockZalo}><Ban size={14} /> Bỏ chặn trên Zalo</button>
        : isFriend === true ? <div className="text-xs text-slate-500">Đã là bạn trên Zalo{ident?.meta?.friend_checked_at && ` · kiểm tra ${dt(ident.meta.friend_checked_at, "HH:mm dd/MM")}`}</div>
        : <>
          <button className="btn w-full justify-center" onClick={requestZaloFriend} disabled={pending || (!isZalo && !person?.phone)}><UserPlus size={14} /> {friendTask && ["failed", "not_found"].includes(friendTask.status) ? "Thử gửi lại lời mời" : "Gửi lời mời kết bạn"}</button>
          {friendTask?.last_error && ["failed", "not_found"].includes(friendTask.status) && <div className="text-xs text-red-600 mt-1">{friendTask.last_error}</div>}
          {!isZalo && !person?.phone && <div className="text-xs text-slate-500 mt-1">Cần có SĐT để kết bạn.</div>}
          {isZalo && isFriend === undefined && !friendTask && <div className="text-xs text-slate-400 mt-1">Chưa rõ đã là bạn chưa (worker sẽ kiểm tra trước khi gửi).</div>}
        </>}
    </div>
  );
  const [aiBusy, setAiBusy] = useState(false); const [ai, setAi] = useState<{ summary?: string; emotion?: string; stage?: string; product_interest?: string | null; error?: string } | null>(null);
  useEffect(() => { setAi(conv.ai_summary ? { summary: conv.ai_summary, emotion: conv.emotion || undefined } : null); }, [conv.id, conv.ai_summary, conv.emotion]);
  const summarize = async () => {
    setAiBusy(true); setAi((a) => ({ ...(a || {}), error: undefined }));
    const r = await fetch("/api/ai/summarize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversation_id: conv.id }) });
    const j = await r.json(); setAiBusy(false);
    if (!r.ok) { setAi({ error: j.error || "Tóm tắt thất bại" }); return; }
    setAi(j); load();
  };

  return (
    <div className="w-full md:w-[320px] shrink-0 md:border-l border-slate-200 bg-white overflow-y-auto flex-1 min-h-0">
      <div className="p-4 border-b border-slate-100 flex items-center gap-3">
        {conv.kind === "group" ? <GroupAvatar src={conv.identity_avatar} name={conv.display_name} members={(conv as any).meta?.members} size={44} /> : <Avatar src={person?.avatar_url || conv.identity_avatar} name={person?.name || conv.display_name} size={44} />}
        <div className="min-w-0">{person ? <CustomerName person={person} className="font-semibold" onSaved={load} /> : <div className="font-semibold truncate">{conv.display_name}</div>}{person && <Link href={`/cdp/${person.id}`} className="text-xs text-blue-600">Xem khách hàng</Link>}</div>
      </div>
      {!person ? (
        <div className="p-4 space-y-2">
          <div className="text-xs text-slate-500">Chưa có hồ sơ khách. Hệ thống sẽ tự tạo khi khách để lại SĐT, hoặc tạo tay:</div>
          <input className="input" placeholder="Tên" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input" placeholder="Số điện thoại" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <button className="btn btn-primary w-full justify-center" onClick={createPerson} disabled={busy}><Plus size={14} /> Tạo khách hàng</button>
          {taskBox}
          {friendBox}
          {dangerBox}
        </div>
      ) : (
        <div className="p-4 space-y-3 text-sm">
          <Row k="Phone"><div className="flex gap-1"><input className="input py-1" value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={savePhone} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />{person.phone && <a className="btn px-2" href={`tel:${person.phone}`}><Phone size={14} /></a>}</div>
            {Array.isArray(person.custom?.phones) && person.custom.phones.length > 0 && <div className="flex flex-wrap gap-1 mt-1">{(person.custom.phones as string[]).map((x: string) => <span key={x} className="chip bg-slate-100 text-slate-700 text-xs">{x} <button className="ml-1 text-blue-600" title="Dùng làm số chính" onClick={() => makePrimary(x)}>↑</button></span>)}</div>}</Row>
          {conv.kind !== "group" && conv.display_name && conv.display_name !== person.name && <Row k="Tên trên kênh"><span className="text-slate-600" title="Tên khách tự đặt trên Zalo/Facebook (tên gốc)">{conv.display_name}</span></Row>}
          {oldNames(person).length > 0 && <Row k="Tên cũ"><OldNames person={person} onSaved={load} /></Row>}
          <Row k="Giới tính"><select className="input py-1" value={person.gender || ""} onChange={async (e) => { await sb.from("crm_customers").update({ gender: e.target.value || null }).eq("id", person.id); load(); }}><option value="">-</option><option>Nam</option><option>Nữ</option></select></Row>
          {person.email && <Row k="Email">{person.email}</Row>}
          <Row k="Phụ trách"><select className="input py-1" value={person.assigned_to || ""} onChange={async (e) => { await sb.from("crm_customers").update({ assigned_to: e.target.value || null }).eq("id", person.id); load(); }}><option value="">-</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Row>
          <Row k="SP quan tâm"><input className="input py-1" defaultValue={(person.custom?.sp_quan_tam as string) || ""} onBlur={async (e) => { await sb.from("crm_customers").update({ custom: { ...person.custom, sp_quan_tam: e.target.value } }).eq("id", person.id); }} /></Row>
          {(person.emotion || conv.emotion) && <Row k="Cảm xúc">{person.emotion || conv.emotion}</Row>}
          <Row k="Nguồn">{({ automation: "Tự động từ hội thoại", manual: "Tạo tay", import: "Nhập file", web: "Website" } as Record<string, string>)[person.source_origin || ""] || person.source_origin || "—"}</Row>

          {taskBox}

          {friendBox}

          {showLeads ? <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between mb-1"><b>Cơ hội ({leads.filter((l) => l.status === "open").length} mở)</b><button className="btn px-2 py-0.5" title="Tạo cơ hội ở giai đoạn đầu" onClick={createLead} disabled={leadBusy}><Plus size={12} /></button></div>
            {stages.length > 0 && <div className="flex flex-wrap gap-1 mb-2" title={openLead ? "Bấm để chuyển cơ hội đang mở sang giai đoạn đó" : "Chưa có cơ hội mở — bấm để tạo cơ hội ở giai đoạn đó"}>
              {stages.filter((st) => st.kind !== "lost").map((st) => { const on = openLead ? openLead.stage_id === st.id : (st.kind === "won" && lastLead?.status === "won"); return (
                <button key={st.id} type="button" disabled={leadBusy || on} onClick={() => markStage(st)} className={cn("lchip border transition-colors", on ? "text-white border-transparent" : "bg-transparent text-slate-600 hover:text-white")} style={on ? { background: st.color } : { borderColor: st.color }} onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = st.color; }} onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = "transparent"; }}>{st.kind === "won" ? "✓ Đã mua hàng" : st.name}</button>); })}
            </div>}{leadMsg && <div className="text-xs text-amber-700 mb-1">{leadMsg}</div>}
            {leads.map((l) => <Link key={l.id} href={`/leads?lead=${l.id}`} className="block rounded border border-slate-100 p-2 mb-1 hover:bg-slate-50"><div className="font-medium truncate">{l.title}</div><div className="text-xs text-slate-500"><span className="chip text-white" style={{ background: l.stage_color }}>{l.stage_name}</span> · {dt(l.created_at, "dd/MM")}</div></Link>)}
          </div> : <div className="pt-2 border-t border-slate-100 text-xs text-slate-400" title="Bỏ tick 'Không tạo cơ hội' của nhãn trong Cài đặt → Nhãn nếu muốn theo dõi cơ hội cho nhóm này">Không theo dõi cơ hội — nhãn {`“${leadBlockedBy}”`}</div>}

          <div className="pt-2 border-t border-slate-100">
            <b>Đơn hàng & Báo giá ({orders.length})</b>
            {orders.map((o) => <Link key={o.id} href={`/orders/${o.id}`} className="flex justify-between text-xs py-1"><span>{o.code}</span><span>{money(o.grand_total)}</span></Link>)}
          </div>

          <button className="btn w-full justify-center" onClick={summarize} disabled={aiBusy}><Sparkles size={14} /> {aiBusy ? "AI đang đọc hội thoại…" : ai?.summary ? "AI tóm tắt lại" : "AI tóm tắt hội thoại"}</button>
          {ai?.error && <div className="text-xs text-red-600 mt-1">{ai.error}</div>}
          {dangerBox}
          {ai?.summary && <div className="mt-2 rounded-md border border-violet-200 bg-violet-50 p-2 text-xs text-slate-700 whitespace-pre-wrap">
            <div className="flex items-center gap-1 font-semibold text-violet-700 mb-1"><Sparkles size={12} /> Tóm tắt AI{ai.stage && <span className="chip bg-violet-100 text-violet-700 ml-auto">{ai.stage}</span>}</div>
            {ai.summary}
            {ai.product_interest && <div className="mt-1 text-slate-500">Quan tâm: {ai.product_interest}</div>}
          </div>}
        </div>
      )}
    </div>
  );
}
const Row = ({ k, children }: { k: string; children: React.ReactNode }) => <div className="grid grid-cols-[90px_1fr] items-center gap-2 min-h-[30px]"><div className="text-slate-500 text-[12px]">{k}</div><div className="min-w-0 text-[13px]">{children}</div></div>;
