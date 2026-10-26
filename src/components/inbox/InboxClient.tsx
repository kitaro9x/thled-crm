"use client";
import { useEffect, useMemo, useState } from "react";
import { Search, Filter, Users } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Channel, Conversation, Label, Member } from "@/lib/types";
import { Avatar } from "@/components/Avatar";
import { ChannelIcon } from "@/components/ChannelIcon";
import { ago, cn } from "@/lib/utils";
import { Thread } from "./Thread";
import { PersonPanel } from "./PersonPanel";

type QuickFilter = "open" | "closed" | "all" | "unread" | "unanswered" | "important" | "overdue";
const quick: { k: QuickFilter; l: string }[] = [
  { k: "open", l: "Hội thoại mở" }, { k: "closed", l: "Hội thoại đóng" }, { k: "all", l: "Tất cả" }, { k: "unread", l: "Chưa đọc" },
  { k: "unanswered", l: "Chưa trả lời" }, { k: "important", l: "Quan trọng" }, { k: "overdue", l: "Cảnh báo chưa trả lời" },
];

export function InboxClient({ initial, labels, members, channels, knowledge }: { initial: Conversation[]; labels: Label[]; members: Pick<Member, "id" | "name" | "avatar_url" | "role" | "is_online">[]; channels: Channel[]; knowledge: { id: string; title: string; shortcut?: string | null; content: string }[] }) {
  const [convs, setConvs] = useState<Conversation[]>(initial);
  const [sel, setSel] = useState<string | null>(initial[0]?.id ?? null);
  const [q, setQ] = useState("");
  const [qf, setQf] = useState<QuickFilter>("open");
  const [showFilter, setShowFilter] = useState(false);
  const [f, setF] = useState<{ channel?: string; label?: string; assignee?: string; hasPhone?: string }>({});
  const [group, setGroup] = useState(true); // gộp FB + Zalo của cùng khách thành 1 dòng
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
        setConvs((cs) => { const rest = cs.filter((c) => c.id !== id); return [data as Conversation, ...rest].sort((a, b) => (b.last_message_at || "").localeCompare(a.last_message_at || "")); });
      }).subscribe();
    return () => { sb.removeChannel(ch); };
  }, []);

  const list = useMemo(() => convs.filter((c) => {
    if (qf === "open" && c.status !== "open") return false;
    if (qf === "closed" && c.status !== "closed") return false;
    if (qf === "unread" && !c.unread_count) return false;
    if (qf === "unanswered" && !(c.last_inbound_at && (!c.last_message_at || c.last_inbound_at >= c.last_message_at))) return false;
    if (qf === "important" && !c.is_important) return false;
    if (qf === "overdue" && !(c.last_inbound_at && c.unread_count > 0 && Date.now() - new Date(c.last_inbound_at).getTime() > 15 * 60000)) return false;
    if (f.channel && c.channel_id !== f.channel) return false;
    if (f.label && !c.labels?.includes(f.label)) return false;
    if (f.assignee && c.assigned_to !== f.assignee) return false;
    if (f.hasPhone === "yes" && !c.person_phone) return false;
    if (f.hasPhone === "no" && c.person_phone) return false;
    if (q) { const s = q.toLowerCase(); return (c.display_name || "").toLowerCase().includes(s) || (c.person_phone || "").includes(s) || (c.last_message_text || "").toLowerCase().includes(s); }
    return true;
  }), [convs, q, qf, f]);

  // gộp: 1 khách (customer_id) = 1 dòng; hội thoại chưa có khách đứng riêng
  const groups = useMemo(() => {
    if (!group) return list.map((c) => ({ key: c.id, convs: [c], primary: c, unread: c.unread_count }));
    const m = new Map<string, Conversation[]>();
    for (const c of list) { const k = c.customer_id || c.id; m.set(k, [...(m.get(k) || []), c]); }
    return Array.from(m.entries()).map(([key, cs]) => { const sorted = [...cs].sort((a, b) => (b.last_message_at || "").localeCompare(a.last_message_at || "")); return { key, convs: sorted, primary: sorted[0], unread: cs.reduce((n, c) => n + (c.unread_count || 0), 0) }; })
      .sort((a, b) => (b.primary.last_message_at || "").localeCompare(a.primary.last_message_at || ""));
  }, [list, group]);
  const curGroup = groups.find((g) => g.key === sel) || groups.find((g) => g.convs.some((c) => c.id === sel)) || null;
  const current = curGroup?.primary || convs.find((c) => c.id === sel) || null;
  // mọi hội thoại của khách này (kể cả ngoài bộ lọc) để thread hiển thị đủ kênh
  const siblings = useMemo(() => current ? (group && current.customer_id ? convs.filter((c) => c.customer_id === current.customer_id) : [current]) : [], [convs, current, group]);

  return (
    <div className="h-full flex">
      {/* cột 1: danh sách */}
      <div className="w-[340px] shrink-0 border-r border-slate-200 bg-white flex flex-col">
        <div className="p-2 border-b border-slate-100 space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1"><Search size={14} className="absolute left-2 top-2.5 text-slate-400" /><input className="input pl-7" placeholder="Tìm tên, SĐT, nội dung" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <button className={cn("btn px-2", group && "bg-blue-50 border-blue-300")} title={group ? "Đang gộp FB + Zalo theo khách (bấm để tách)" : "Gộp hội thoại theo khách"} onClick={toggleGroup}><Users size={14} /></button>
            <button className={cn("btn px-2", showFilter && "bg-blue-50 border-blue-300")} onClick={() => setShowFilter((v) => !v)}><Filter size={14} /></button>
          </div>
          <div className="flex gap-1 flex-wrap">{quick.map((x) => <button key={x.k} onClick={() => setQf(x.k)} className={cn("chip border", qf === x.k ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200")}>{x.l}</button>)}</div>
          {showFilter && (
            <div className="grid grid-cols-2 gap-1 text-xs">
              <select className="input" value={f.channel || ""} onChange={(e) => setF({ ...f, channel: e.target.value || undefined })}><option value="">Nguồn hội thoại</option>{channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              <select className="input" value={f.label || ""} onChange={(e) => setF({ ...f, label: e.target.value || undefined })}><option value="">Thẻ</option>{labels.map((l) => <option key={l.id} value={l.name}>{l.name}</option>)}</select>
              <select className="input" value={f.assignee || ""} onChange={(e) => setF({ ...f, assignee: e.target.value || undefined })}><option value="">Nhân viên</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
              <select className="input" value={f.hasPhone || ""} onChange={(e) => setF({ ...f, hasPhone: e.target.value || undefined })}><option value="">Trạng thái SĐT</option><option value="yes">Đã có SĐT</option><option value="no">Chưa có SĐT</option></select>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {list.length === 0 && <div className="p-6 text-center text-slate-400 text-sm">Không có hội thoại</div>}
          {groups.map((g) => { const c = g.primary; const types = Array.from(new Set(g.convs.map((x) => x.channel_type))); return (
            <button key={g.key} onClick={() => setSel(g.key)} className={cn("w-full text-left flex gap-2 px-3 py-2.5 border-b border-slate-50 hover:bg-slate-50", sel === g.key && "bg-blue-50")}>
              <div className="relative"><Avatar src={c.identity_avatar} name={c.display_name} size={40} /><span className="absolute -bottom-0.5 -right-0.5 flex">{types.map((t) => <ChannelIcon key={t} type={t} size={14} />)}</span></div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2"><div className={cn("truncate", g.unread ? "font-semibold" : "font-medium")}>{c.person_name || c.display_name || c.external_id}{g.convs.length > 1 && <span className="ml-1 text-[10px] text-slate-400">{g.convs.length} kênh</span>}</div><div className="text-[11px] text-slate-400 shrink-0">{ago(c.last_message_at)}</div></div>
                <div className="flex items-center justify-between gap-2"><div className="truncate text-xs text-slate-500">{c.kind === "comment" && "💬 "}{c.last_message_text}</div>{g.unread > 0 && <span className="bg-red-500 text-white rounded-full text-[10px] px-1.5 min-w-[18px] text-center">{g.unread}</span>}</div>
                <div className="flex gap-1 mt-1 flex-wrap">{c.person_phone && <span className="chip bg-emerald-50 text-emerald-700">📞 {c.person_phone}</span>}{c.labels?.slice(0, 2).map((l) => <span key={l} className="chip bg-slate-100 text-slate-600">{l}</span>)}{c.assignee_name && <span className="chip bg-blue-50 text-blue-700">{c.assignee_name}</span>}</div>
              </div>
            </button>); })}
        </div>
      </div>
      {/* cột 2: thread */}
      <div className="flex-1 min-w-0 flex flex-col bg-[#eef1f6]">
        {current ? <Thread key={current.id + ":" + siblings.map((c) => c.id).join(",")} conv={current} siblings={siblings} labels={labels} members={members} knowledge={knowledge} /> : <div className="m-auto text-slate-400">Chọn một hội thoại</div>}
      </div>
      {/* cột 3: panel khách */}
      {current && <PersonPanel key={"p" + current.id} conv={current} members={members} />}
    </div>
  );
}
