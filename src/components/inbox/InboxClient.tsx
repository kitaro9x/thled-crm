"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Filter, Users, ArrowLeft, UserRound, PanelRightClose, PanelRightOpen, MessageSquare, Phone } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Channel, Conversation, Label, Member } from "@/lib/types";
import { Avatar } from "@/components/Avatar";
import { GroupAvatar } from "@/components/GroupAvatar";
import { ChannelIcon } from "@/components/ChannelIcon";
import { ago, cn, convName } from "@/lib/utils";
import { labelTone } from "@/lib/label-tone";
import { Thread } from "./Thread";
import { PersonPanel } from "./PersonPanel";

type QuickFilter = "open" | "closed" | "all" | "unread" | "unanswered" | "important" | "overdue" | "hidden";
const quick: { k: QuickFilter; l: string }[] = [
  { k: "open", l: "Hội thoại mở" }, { k: "closed", l: "Hội thoại đóng" }, { k: "all", l: "Tất cả" }, { k: "unread", l: "Chưa đọc" },
  { k: "unanswered", l: "Chưa trả lời" }, { k: "important", l: "Quan trọng" }, { k: "overdue", l: "Cảnh báo chưa trả lời" },
  { k: "hidden", l: "Đã xoá/chặn" },
];

export function InboxClient({ initial, labels, members, channels, knowledge }: { initial: Conversation[]; labels: Label[]; members: Pick<Member, "id" | "name" | "avatar_url" | "role" | "is_online">[]; channels: Channel[]; knowledge: { id: string; title: string; shortcut?: string | null; content: string }[] }) {
  const [convs, setConvs] = useState<Conversation[]>(initial);
  // hội thoại đã xoá/chặn (is_hidden) chỉ tải khi mở bộ lọc "Đã xoá/chặn"
  const [hiddenConvs, setHiddenConvs] = useState<Conversation[] | null>(null);
  const [sel, setSel] = useState<string | null>(initial[0]?.id ?? null);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0); // dòng đang chọn bằng phím khi tìm kiếm
  const [qf, setQf] = useState<QuickFilter>("open");
  const [showFilter, setShowFilter] = useState(false);
  const [f, setF] = useState<{ channel?: string; label?: string; assignee?: string; hasPhone?: string; lead?: string }>({});
  // tag lead theo khách: giai đoạn cơ hội đang mở + đã mua hàng (WON hoặc có đơn) — để nhìn danh sách là biết khách ở đâu trong phễu
  const [leadTags, setLeadTags] = useState<Record<string, LeadTag>>({});
  // nhãn "Không tạo cơ hội" (Cài đặt → Nhãn): Nhà cung cấp, Bạn bè, Gia đình, Shipper, Công nợ… → không hiện tag lead, không có mục Cơ hội
  const skipLabels = useMemo(() => new Set(labels.filter((l) => l.skip_lead).map((l) => l.name)), [labels]);
  const blockingLabel = useCallback((cs: Conversation[]) => cs.flatMap((c) => c.labels || []).find((l) => skipLabels.has(l)) || null, [skipLabels]);
  const leadable = useCallback((cs: Conversation[]) => !blockingLabel(cs), [blockingLabel]);
  // khách có BẤT KỲ hội thoại nào mang nhãn loại trừ → cả khách đó không phải khách hàng (đồng bộ với panel)
  const blockedCust = useMemo(() => new Set(convs.filter((c) => !leadable([c])).map((c) => c.customer_id).filter(Boolean) as string[]), [convs, leadable]);
  const isCustomer = useCallback((c: Conversation) => leadable([c]) && !(c.customer_id && blockedCust.has(c.customer_id)), [leadable, blockedCust]);
  const custKey = useMemo(() => Array.from(new Set(convs.filter((c) => leadable([c])).map((c) => c.customer_id).filter(Boolean) as string[])).sort().join(","), [convs, leadable]);
  const loadLeadTags = useCallback(async () => {
    const ids = custKey ? custKey.split(",") : []; if (!ids.length) { setLeadTags({}); return; }
    const sb = supabaseBrowser(); const out: Record<string, LeadTag> = {};
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const [{ data: ls }, { data: cs }] = await Promise.all([
        sb.from("crm_v_leads").select("person_id,status,stage_id,stage_name,stage_color,stage_kind,updated_at").in("person_id", chunk).order("updated_at", { ascending: false }),
        sb.from("crm_customers").select("id,total_orders").in("id", chunk),
      ]);
      for (const c of cs || []) out[c.id] = { won: false, lost: false, orders: c.total_orders || 0 };
      for (const l of ls || []) {
        const t = (out[l.person_id!] ||= { won: false, lost: false, orders: 0 });
        if (l.status === "won") t.won = true; else if (l.status === "lost") t.lost = true;
        else if (!t.open) t.open = { id: l.stage_id, name: l.stage_name || "", color: l.stage_color || "#64748b" }; // cơ hội mở cập nhật gần nhất
      }
    }
    setLeadTags(out);
  }, [custKey]);
  useEffect(() => { loadLeadTags(); }, [loadLeadTags]);
  useEffect(() => { // cơ hội / đơn hàng đổi → tải lại tag
    const sb = supabaseBrowser();
    const ch = sb.channel("inbox-leads").on("postgres_changes", { event: "*", schema: "public", table: "crm_leads" }, () => loadLeadTags()).on("postgres_changes", { event: "*", schema: "public", table: "crm_orders" }, () => loadLeadTags()).subscribe();
    const onLocal = () => loadLeadTags(); window.addEventListener("crm:leads-changed", onLocal); // panel vừa đổi giai đoạn / tạo cơ hội
    const onFocus = () => loadLeadTags(); window.addEventListener("focus", onFocus); // quay lại từ trang Cơ hội (Kanban) → tải lại tag
    return () => { sb.removeChannel(ch); window.removeEventListener("crm:leads-changed", onLocal); window.removeEventListener("focus", onFocus); };
  }, [loadLeadTags]);
  // lọc theo lead: bought = WON/có đơn · open = đang có cơ hội mở (kể cả khách cũ mua lại) · lost = chỉ còn cơ hội thất bại · none = chưa có gì
  const matchLead = (c: Conversation, want: string) => {
    const t = c.customer_id ? leadTags[c.customer_id] : undefined; const bought = !!t && (t.won || t.orders > 0);
    if (want === "bought") return bought; if (want === "open") return !!t?.open;
    if (want === "lost") return !!t && t.lost && !t.open && !bought;
    return !t || (!t.open && !bought && !t.lost);
  };
  // hàng chip lọc theo giai đoạn: các giai đoạn mở của phễu mặc định (trừ Huỷ) + "Đã mua hàng"
  const [stages, setStages] = useState<{ id: string; name: string; color: string }[]>([]);
  useEffect(() => { (async () => { const sb = supabaseBrowser(); const { data: pipe } = await sb.from("crm_pipelines").select("id").eq("is_default", true).single(); if (!pipe) return; const { data } = await sb.from("crm_stages").select("id,name,color,kind").eq("pipeline_id", pipe.id).eq("kind", "open").order("sort_order"); setStages(((data as any[]) || []).filter((x) => !/^hu[ỷy]/i.test(x.name))); })(); }, []);
  const [stageF, setStageF] = useState<string | null>(null); // id giai đoạn hoặc "bought"
  const matchStage = (c: Conversation, want: string) => { const t = c.customer_id ? leadTags[c.customer_id] : undefined; return want === "bought" ? !!t && (t.won || t.orders > 0) : t?.open?.id === want; };
  const stageLabel = (n: string) => (/^khởi tạo lead$/i.test(n) ? "Lead" : n);
  const [group, setGroup] = useState(true); // gộp FB + Zalo của cùng khách thành 1 dòng
  // chip "Khách hàng": chỉ hiện hội thoại là khách (chưa gắn nhãn hoặc nhãn khách) — loại Nhà cung cấp, Gia đình, Bạn bè, Công nợ, Thầu, Shipper… (nhãn có tick "Không tạo cơ hội")
  const [custOnly, setCustOnly] = useState(false);
  useEffect(() => { try { setCustOnly(localStorage.getItem("inbox_cust_only") === "1"); } catch {} }, []);
  const toggleCustOnly = () => { setCustOnly((v) => { try { localStorage.setItem("inbox_cust_only", v ? "0" : "1"); } catch {} return !v; }); };
  const [mobileView, setMobileView] = useState<"list" | "thread" | "panel">("list"); // điện thoại: từng màn
  const [showPanel, setShowPanel] = useState(true); // máy tính: ẩn/hiện cột hồ sơ khách
  useEffect(() => { try { const v = localStorage.getItem("inbox_panel"); if (v !== null) setShowPanel(v === "1"); } catch {} }, []);
  const togglePanel = () => { setShowPanel((v) => { try { localStorage.setItem("inbox_panel", v ? "0" : "1"); } catch {} return !v; }); };
  const [autoCreate, setAutoCreate] = useState<boolean | null>(null); // công tắc tự tạo khách/cơ hội (nguồn khách hàng)
  useEffect(() => { supabaseBrowser().from("crm_lead_sources").select("is_active").eq("type", "conversation").then(({ data }) => setAutoCreate(!!data?.some((x) => x.is_active))); }, []);
  const toggleAuto = async () => { const n = !autoCreate; setAutoCreate(n); await supabaseBrowser().from("crm_lead_sources").update({ is_active: n }).eq("type", "conversation"); };
  // mở từ thông báo đẩy: /inbox?c=<conversation id>
  useEffect(() => { try { const c = new URLSearchParams(window.location.search).get("c"); if (c) { setSel(c); setMobileView("thread"); } } catch {} }, []);
  useEffect(() => { try { const v = localStorage.getItem("inbox_group"); if (v !== null) setGroup(v === "1"); } catch {} }, []);
  const toggleGroup = () => { setGroup((g) => { try { localStorage.setItem("inbox_group", g ? "0" : "1"); } catch {} return !g; }); };

  // realtime: cập nhật danh sách khi có tin mới
  useEffect(() => {
    const sb = supabaseBrowser();
    const ch = sb.channel("inbox")
      .on("postgres_changes", { event: "*", schema: "public", table: "crm_conversations" }, async (p) => {
        const id = (p.new as any)?.id || (p.old as any)?.id; if (!id) return;
        const { data } = await sb.from("crm_v_conversations").select("*").eq("id", id).single();
        if (!data) return;
        const put = (cs: Conversation[]) => { const rest = cs.filter((c) => c.id !== id); return [data as Conversation, ...rest].sort((a, b) => (b.last_message_at || "").localeCompare(a.last_message_at || "")); };
        setConvs(put); setHiddenConvs((h) => (h ? put(h) : h));
      }).subscribe();
    return () => { sb.removeChannel(ch); };
  }, []);

  useEffect(() => { if (qf !== "hidden") return; supabaseBrowser().from("crm_v_conversations").select("*").eq("is_hidden", true).order("last_message_at", { ascending: false, nullsFirst: false }).limit(200).then(({ data }) => setHiddenConvs((data as Conversation[]) || [])); }, [qf]);
  const pool = qf === "hidden" ? hiddenConvs || [] : convs;
  const base = useMemo(() => pool.filter((c) => {
    if (qf === "hidden") return !!c.is_hidden && (!q || convName(c).toLowerCase().includes(q.toLowerCase()) || (c.person_phone || "").includes(q));
    if (c.is_hidden) return false; // đã xoá/chặn → chỉ hiện ở bộ lọc riêng
    if (qf === "open" && c.status !== "open") return false;
    if (qf === "closed" && c.status !== "closed") return false;
    if (qf === "unread" && !c.unread_count) return false;
    if (qf === "unanswered" && !(c.last_inbound_at && (!c.last_message_at || c.last_inbound_at >= c.last_message_at))) return false;
    if (qf === "important" && !c.is_important) return false;
    if (qf === "overdue" && !(c.last_inbound_at && c.unread_count > 0 && Date.now() - new Date(c.last_inbound_at).getTime() > 15 * 60000)) return false;
    if (custOnly && !isCustomer(c)) return false;
    if (f.channel && c.channel_id !== f.channel) return false;
    if (f.label && !c.labels?.includes(f.label)) return false;
    if (f.assignee && c.assigned_to !== f.assignee) return false;
    if (f.hasPhone === "yes" && !c.person_phone) return false;
    if (f.hasPhone === "no" && c.person_phone) return false;
    if (f.lead && !matchLead(c, f.lead)) return false;
    if (q) { const s = q.toLowerCase(); return convName(c).toLowerCase().includes(s) || (c.person_phone || "").includes(s) || (c.last_message_text || "").toLowerCase().includes(s); }
    return true;
  }), [pool, q, qf, f, leadTags, custOnly, isCustomer]); // eslint-disable-line react-hooks/exhaustive-deps -- matchLead đọc leadTags
  const list = useMemo(() => (stageF ? base.filter((c) => matchStage(c, stageF)) : base), [base, stageF, leadTags]); // eslint-disable-line react-hooks/exhaustive-deps -- matchStage đọc leadTags
  // số khách (không trùng) ở mỗi giai đoạn trong danh sách đang lọc
  const stageCount = useMemo(() => { const out: Record<string, number> = {}; const keys = ["bought", ...stages.map((x) => x.id)];
    for (const k of keys) out[k] = new Set(base.filter((c) => matchStage(c, k)).map((c) => c.customer_id || c.id)).size; return out; }, [base, stages, leadTags]); // eslint-disable-line react-hooks/exhaustive-deps

  // gộp: 1 khách (customer_id) = 1 dòng; hội thoại chưa có khách đứng riêng
  const groups = useMemo(() => {
    if (!group) return list.map((c) => ({ key: c.id, convs: [c], primary: c, unread: c.unread_count }));
    const m = new Map<string, Conversation[]>();
    for (const c of list) { const k = c.customer_id || c.id; m.set(k, [...(m.get(k) || []), c]); }
    return Array.from(m.entries()).map(([key, cs]) => { const sorted = [...cs].sort((a, b) => (b.last_message_at || "").localeCompare(a.last_message_at || "")); return { key, convs: sorted, primary: sorted[0], unread: cs.reduce((n, c) => n + (c.unread_count || 0), 0) }; })
      .sort((a, b) => (b.primary.last_message_at || "").localeCompare(a.primary.last_message_at || ""));
  }, [list, group]);
  const curGroup = groups.find((g) => g.key === sel) || groups.find((g) => g.convs.some((c) => c.id === sel)) || null;
  const current = curGroup?.primary || pool.find((c) => c.id === sel) || null;
  useEffect(() => { try { if (current?.id) window.history.replaceState(null, "", `/inbox?c=${current.id}`); } catch {} }, [current?.id]); // eslint-disable-line
  // mọi hội thoại của khách này (kể cả ngoài bộ lọc) để thread hiển thị đủ kênh
  const siblings = useMemo(() => current ? (group && current.customer_id ? pool.filter((c) => c.customer_id === current.customer_id && !!c.is_hidden === !!current.is_hidden) : [current]) : [], [pool, current, group]);

  return (
    <div className="h-full flex">
      {/* cột 1: danh sách */}
      <div className={cn("w-full md:w-[340px] shrink-0 border-r border-slate-200 bg-white flex-col", mobileView === "list" ? "flex" : "hidden md:flex")}>
        <div className="p-2 border-b border-slate-100 space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" /><input className="input" style={{ paddingLeft: 30 }} placeholder="Tìm tên, SĐT, nội dung (↑↓ chọn, Enter mở)" value={q} onChange={(e) => { setQ(e.target.value); setHi(0); }}
                onKeyDown={(e) => {
                  if (!groups.length) return;
                  if (e.key === "ArrowDown") { e.preventDefault(); setHi((i) => Math.min(i + 1, groups.length - 1)); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setHi((i) => Math.max(i - 1, 0)); }
                  else if (e.key === "Enter") { e.preventDefault(); const g = groups[hi] || groups[0]; if (g) { setSel(g.key); setMobileView("thread"); (e.target as HTMLInputElement).blur(); } }
                  else if (e.key === "Escape") { setQ(""); (e.target as HTMLInputElement).blur(); }
                }} /></div>
            <button className={cn("btn px-2", group && "bg-blue-50 border-blue-300")} title={group ? "Đang gộp FB + Zalo theo khách (bấm để tách)" : "Gộp hội thoại theo khách"} onClick={toggleGroup}><Users size={14} /></button>
            <button className={cn("btn px-2", showFilter && "bg-blue-50 border-blue-300")} onClick={() => setShowFilter((v) => !v)}><Filter size={14} /></button>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer select-none" title="Bật: khách nhắn kèm SĐT → tự tạo khách + cơ hội + kết bạn Zalo. Tắt: chỉ tạo tay bằng nút 'Tạo khách hàng'."><input type="checkbox" checked={!!autoCreate} onChange={toggleAuto} disabled={autoCreate === null} /> Tự tạo khách & cơ hội khi có SĐT</label>
          <div className="flex gap-1.5 flex-wrap">{quick.map((x) => <button key={x.k} onClick={() => setQf(x.k)} className={cn("fchip", qf === x.k && "on")}>{x.l}</button>)}<button onClick={toggleCustOnly} title="Chỉ hiện khách hàng: hội thoại chưa gắn nhãn hoặc nhãn khách. Ẩn Nhà cung cấp, Gia đình, Bạn bè, Công nợ, Thầu, Shipper… (nhãn có tick 'Không tạo cơ hội' trong Cài đặt → Nhãn). Kết hợp được với các chip khác." className={cn("fchip", custOnly && "on", custOnly && "ring-1 ring-emerald-400")}>{custOnly ? "✓ " : ""}Khách hàng</button></div>
          {stages.length > 0 && <div className="flex gap-1.5 flex-wrap" title="Lọc theo giai đoạn cơ hội của khách — bấm lần nữa để bỏ lọc">
            {stages.map((st) => <button key={st.id} onClick={() => setStageF((v) => (v === st.id ? null : st.id))} className={cn("fchip", stageF === st.id && "on")} style={stageF === st.id ? { background: st.color, borderColor: st.color, color: "#fff" } : { borderColor: st.color }}>{stageLabel(st.name)} <span className="opacity-70 tabular-nums">{stageCount[st.id] ?? 0}</span></button>)}
            <button onClick={() => setStageF((v) => (v === "bought" ? null : "bought"))} className={cn("fchip", stageF === "bought" && "on")} style={stageF === "bought" ? { background: "#16a34a", borderColor: "#16a34a", color: "#fff" } : { borderColor: "#16a34a" }}>✓ Đã mua hàng <span className="opacity-70 tabular-nums">{stageCount.bought ?? 0}</span></button>
          </div>}
          {showFilter && (
            <div className="grid grid-cols-2 gap-1 text-xs">
              <select className="input" value={f.channel || ""} onChange={(e) => setF({ ...f, channel: e.target.value || undefined })}><option value="">Nguồn hội thoại</option>{channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              <select className="input" value={f.label || ""} onChange={(e) => setF({ ...f, label: e.target.value || undefined })}><option value="">Thẻ</option>{labels.map((l) => <option key={l.id} value={l.name}>{l.name}</option>)}</select>
              <select className="input" value={f.assignee || ""} onChange={(e) => setF({ ...f, assignee: e.target.value || undefined })}><option value="">Nhân viên</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
              <select className="input" value={f.hasPhone || ""} onChange={(e) => setF({ ...f, hasPhone: e.target.value || undefined })}><option value="">Trạng thái SĐT</option><option value="yes">Đã có SĐT</option><option value="no">Chưa có SĐT</option></select>
              <select className="input col-span-2" value={f.lead || ""} onChange={(e) => setF({ ...f, lead: e.target.value || undefined })}><option value="">Trạng thái lead</option><option value="bought">Đã mua hàng</option><option value="open">Đang có cơ hội mở</option><option value="lost">Chỉ có cơ hội LOST</option><option value="none">Chưa có cơ hội</option></select>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {qf === "hidden" && <div className="px-3 py-1.5 text-[11px] text-slate-500 bg-amber-50 border-b border-amber-100">Hội thoại đã xoá hoặc chặn. Mở hội thoại → menu ⋯ để khôi phục / bỏ chặn.</div>}
          {list.length === 0 && <div className="p-6 text-center text-slate-400 text-sm">{qf === "hidden" && hiddenConvs === null ? "Đang tải…" : "Không có hội thoại"}</div>}
          {groups.map((g, gi) => { const c = g.primary; const types = Array.from(new Set(g.convs.map((x) => x.channel_type))); return (
            <a key={g.key} href={`/inbox?c=${c.id}`} onClick={(e) => { if (e.ctrlKey || e.metaKey || e.shiftKey) return; /* Ctrl/⌘+click, chuột giữa → mở tab mới */ e.preventDefault(); setSel(g.key); setMobileView("thread"); }} className={cn("conv-row", (sel === g.key || g.convs.some((x) => x.id === sel)) && "sel", q && gi === hi && "ring-2 ring-inset ring-blue-400")}>
              <div className={cn("relative shrink-0 self-start mt-0.5", c.kind === "group" && "ring-2 ring-emerald-400 rounded-full")}>{c.kind === "group" ? <GroupAvatar src={c.identity_avatar} name={convName(c)} members={(c as any).meta?.members} size={42} /> : <Avatar src={c.identity_avatar} name={convName(c)} size={42} />}<span className="absolute -bottom-0.5 -right-0.5 flex">{types.map((t) => <ChannelIcon key={t} type={t} size={14} />)}</span></div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {g.unread > 0 && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" title="Chưa đọc" />}
                  <div className={cn("truncate text-[14px] leading-5 flex-1", g.unread ? "font-semibold" : "font-medium")}>{c.kind === "group" && <span className="mr-1 inline-flex items-center gap-0.5 align-middle group-badge"><Users size={10} />NHÓM</span>}{convName(c)}{g.convs.length > 1 && <span className="ml-1 text-[11px] font-normal text-slate-400">{g.convs.length} kênh</span>}</div>
                  <div className={cn("text-[12px] shrink-0 tabular-nums", g.unread ? "text-blue-600 font-medium" : "text-slate-400")}>{ago(c.last_message_at)}</div>
                </div>
                <div className="flex items-center gap-2 mt-0.5"><div className={cn("truncate text-[13px] leading-5 flex-1", (c.last_message_text || "").startsWith("📵") ? "text-red-600 font-medium" : g.unread ? "text-slate-700" : "text-slate-500")}>{c.kind === "comment" && <MessageSquare size={12} className="inline mr-1 -mt-0.5 text-slate-400" />}{c.last_message_text}</div>{g.unread > 0 && <span className="bg-red-500 text-white rounded-full text-[11px] font-semibold px-1.5 min-w-[20px] h-5 inline-flex items-center justify-center shrink-0">{g.unread}</span>}</div>
                {(c.person_phone || c.labels?.length || c.assignee_name || (c.customer_id && leadTags[c.customer_id])) && <div className="flex gap-1 mt-1 flex-wrap items-center">{c.person_phone && <span className="lchip lchip-green"><Phone size={10} className="mr-1" />{c.person_phone}</span>}{c.customer_id && leadTags[c.customer_id] && leadable(g.convs) && <LeadChips t={leadTags[c.customer_id]} />}{c.labels?.slice(0, 2).map((l) => <span key={l} className={cn("lchip", labelTone(l))}>{l}</span>)}{c.assignee_name && <span className="lchip lchip-blue">{c.assignee_name}</span>}</div>}
              </div>
            </a>); })}
        </div>
      </div>
      {/* cột 2: thread */}
      <div className={cn("flex-1 min-w-0 min-h-0 flex-col bg-[#eef1f6]", mobileView === "thread" ? "flex" : "hidden md:flex")}>
        {current && <div className="md:hidden flex items-center gap-2 px-2 py-1.5 bg-white border-b border-slate-200 text-sm"><button className="btn px-2" onClick={() => setMobileView("list")}><ArrowLeft size={16} /></button><div className="font-semibold truncate flex-1">{current.kind === "group" && <span className="mr-1 inline-flex items-center gap-0.5 align-middle group-badge"><Users size={10} />NHÓM</span>}{convName(current)}</div><button className="btn px-2" onClick={() => setMobileView("panel")}><UserRound size={16} /></button></div>}
        {current ? <div className="relative flex-1 min-h-0 flex flex-col">
          <button className="hidden md:flex absolute top-3 right-3 z-10 btn px-2" title={showPanel ? "Ẩn hồ sơ khách (chat rộng hơn)" : "Hiện hồ sơ khách"} onClick={togglePanel}>{showPanel ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}</button>
          <Thread key={current.id + ":" + siblings.map((c) => c.id).join(",")} conv={current} siblings={siblings} labels={labels} members={members} knowledge={knowledge} />
        </div> : <div className="m-auto text-slate-400">Chọn một hội thoại</div>}
      </div>
      {/* cột 3: panel khách */}
      {current && <div className={cn("min-h-0 flex-col", mobileView === "panel" ? "flex w-full" : showPanel ? "hidden md:flex" : "hidden")}>
        <div className="md:hidden flex items-center gap-2 px-2 py-1.5 bg-white border-b border-slate-200 text-sm"><button className="btn px-2" onClick={() => setMobileView("thread")}><ArrowLeft size={16} /></button><div className="font-semibold">Hồ sơ khách</div></div>
        <PersonPanel key={"p" + current.id} conv={current} members={members} leadBlockedBy={blockingLabel(siblings)} />
      </div>}
    </div>
  );
}

type LeadTag = { open?: { id?: string; name: string; color: string }; won: boolean; lost: boolean; orders: number };
/** Chip lead trên dòng hội thoại: "Đã mua hàng" (WON hoặc có đơn) · giai đoạn cơ hội đang mở (màu theo giai đoạn) · LOST khi chỉ còn cơ hội thất bại */
function LeadChips({ t }: { t: LeadTag }) {
  const bought = t.won || t.orders > 0;
  return (<>
    {bought && <span className="lchip lchip-green" title={t.orders > 0 ? `Đã có ${t.orders} đơn hàng` : "Đã có cơ hội WON"}>✓ Đã mua hàng</span>}
    {t.open && <span className="lchip" style={{ background: t.open.color, color: "#fff" }} title="Cơ hội đang mở">{t.open.name}</span>}
    {!bought && !t.open && t.lost && <span className="lchip lchip-red" title="Cơ hội đã thất bại">LOST</span>}
  </>);
}
