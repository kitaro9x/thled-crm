"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Moon, AlertTriangle, Check } from "lucide-react";
import { awayActive, type AiSettings, type AwaySettings } from "@/lib/ai-config";
import { AWAY_ACTION_LABEL } from "@/lib/away";
import { cn, dt } from "@/lib/utils";

export interface AwayRun { id: number; created_at: string; conversation_id: string | null; mode: string; action: string; need: string | null; reason: string | null; reply: string | null; sent: boolean; error: string | null; who?: string; channel?: string | null }
const TONE: Record<string, string> = { answer: "lchip-green", handoff: "lchip-amber", skip: "lchip-gray", blocked: "lchip-red", error: "lchip-red" };
const UNTIL: [string, string][] = [["", "tới khi anh tắt"], ["2", "2 giờ nữa"], ["4", "4 giờ nữa"], ["8", "8 giờ nữa"], ["12", "12 giờ nữa"]];

/**
 * Cài đặt → Trợ lý AI → "AI trực thay khi nghỉ": bật tay / theo lịch, chạy thử hay gửi thật, phạm vi khách, giới hạn, nhật ký ca trực.
 * Lưu qua PUT /api/ai/away (chỉ admin). Mặc định: tắt + chạy thử (không gửi gì cho khách).
 */
export function AwayCard({ settings, labels, runs, zaloOk }: { settings: AiSettings; labels: { name: string; skip_lead?: boolean }[]; runs: AwayRun[]; zaloOk: boolean }) {
  const r = useRouter();
  const [a, setA] = useState<AwaySettings>(settings.away);
  const [hours, setHours] = useState("");
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const active = awayActive({ ...settings, away: a });
  const dirty = JSON.stringify(a) !== JSON.stringify(settings.away);
  const put = async (patch: Partial<AwaySettings>, okText = "Đã lưu") => {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/ai/away", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) }).catch(() => null);
    const j = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) { setMsg({ ok: false, t: j.error || "Lưu thất bại" }); return; }
    setA(j.away); setMsg({ ok: true, t: okText }); r.refresh();
  };
  const toggleOn = () => {
    if (a.on) return put({ on: false }, "Đã tắt trực thay");
    const until = hours ? new Date(Date.now() + Number(hours) * 3600_000).toISOString() : null;
    return put({ ...a, on: true, until }, a.mode === "live" ? "Đã bật — AI đang trực (GỬI THẬT)" : "Đã bật — AI đang trực (chạy thử, không gửi)");
  };
  const custLabels = labels.filter((l) => !l.skip_lead);
  const toggleLabel = (n: string) => setA({ ...a, customer_labels: a.customer_labels.includes(n) ? a.customer_labels.filter((x) => x !== n) : [...a.customer_labels, n] });
  const num = (k: "max_per_conv" | "max_per_hour" | "max_per_day", label: string, max: number) =>
    <label className="flex items-center gap-1.5 text-xs">{label}<input type="number" min={1} max={max} className="input w-16 py-0.5" value={a[k]} onChange={(e) => setA({ ...a, [k]: Number(e.target.value) })} /></label>;

  return <div id="away" className="card p-4 space-y-3 text-sm max-w-3xl">
    <div className="flex items-center gap-3">
      <Moon className="text-indigo-500" size={20} />
      <div className="flex-1"><b>AI trực thay khi nghỉ</b><div className="text-xs text-slate-500">Khi anh off, AI tự trả lời khách trong phạm vi an toàn: tư vấn mẫu, giá niêm yết, bảo hành, showroom. Mặc cả, giảm giá, tồn kho, chốt đơn, khiếu nại → gửi 1 câu giữ khách, tạo việc và báo đẩy cho anh.</div></div>
      <span className={cn("lchip shrink-0", active ? (a.mode === "live" ? "lchip-green" : "lchip-amber") : "lchip-gray")}>{active ? (a.mode === "live" ? "Đang trực · gửi thật" : "Đang trực · chạy thử") : "Đang nghỉ"}</span>
    </div>
    {!settings.enabled && <div className="text-xs rounded-md bg-amber-50 text-amber-900 px-2 py-1.5"><AlertTriangle size={12} className="inline" /> Trợ lý AI tổng đang TẮT (công tắc đầu trang) — trực thay không chạy.</div>}

    <div className="rounded-md border border-slate-200 p-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button className={cn("btn", a.on ? "" : "btn-primary")} disabled={busy} onClick={toggleOn}>{a.on ? "Tắt trực thay" : "🌙 Bật trực thay ngay"}</button>
        {!a.on && <label className="flex items-center gap-1.5 text-xs text-slate-600">tự tắt sau<select className="input w-auto py-0.5" value={hours} onChange={(e) => setHours(e.target.value)}>{UNTIL.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>}
        {a.on && <span className="text-xs text-slate-600">Bật tay từ {dt(a.on_at, "HH:mm dd/MM")}{a.until ? ` · tự tắt lúc ${dt(a.until, "HH:mm dd/MM")}` : " · tới khi anh tắt"}</span>}
      </div>
      <label className="flex flex-wrap items-center gap-2 text-xs">
        <input type="checkbox" checked={a.schedule.enabled} onChange={(e) => setA({ ...a, schedule: { ...a.schedule, enabled: e.target.checked } })} />
        Tự trực hằng ngày từ <input type="time" className="input w-24 py-0.5" value={a.schedule.from} onChange={(e) => setA({ ...a, schedule: { ...a.schedule, from: e.target.value } })} />
        đến <input type="time" className="input w-24 py-0.5" value={a.schedule.to} onChange={(e) => setA({ ...a, schedule: { ...a.schedule, to: e.target.value } })} /> <span className="text-slate-400">(giờ Việt Nam, qua đêm được)</span>
      </label>
    </div>

    <div className="grid gap-2 md:grid-cols-2">
      {([["shadow", "Chạy thử (không gửi)", "AI soạn câu trả lời vào Nhật ký ca trực bên dưới, KHÔNG gửi gì cho khách. Dùng vài buổi để xem AI trả lời có ổn không."], ["live", "Gửi thật", "AI tự gửi tin cho khách đủ điều kiện. Chỉ bật sau khi đã xem nhật ký chạy thử."]] as const).map(([v, l, d]) =>
        <label key={v} className={cn("rounded-md border p-2 cursor-pointer", a.mode === v ? (v === "live" ? "border-emerald-500 bg-green-50" : "border-blue-500 bg-blue-50") : "border-slate-200")}>
          <div className="flex items-center gap-1.5"><input type="radio" name="away-mode" checked={a.mode === v} onChange={() => setA({ ...a, mode: v })} /><b>{l}</b></div>
          <div className="text-xs text-slate-500 mt-0.5">{d}</div>
        </label>)}
    </div>

    <div className="space-y-1.5">
      <b className="text-xs">Phạm vi</b>
      <div className="flex flex-wrap gap-3 text-xs">
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={a.channels.fb} onChange={(e) => setA({ ...a, channels: { ...a.channels, fb: e.target.checked } })} /> Messenger (Fanpage) — mọi khách nhắn tin</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={a.channels.zalo} onChange={(e) => setA({ ...a, channels: { ...a.channels, zalo: e.target.checked } })} /> Zalo — chỉ hội thoại rõ là khách</label>
      </div>
      {a.channels.zalo && <div className="text-xs text-slate-600">Zalo được gửi thật khi hội thoại có 1 trong các nhãn dưới đây, hoặc người đó từng nhắn Fanpage, hoặc đã có đơn hàng. Có hồ sơ khách nhưng chưa rõ → chỉ soạn nháp. Người lạ, nhóm, nhãn Gia đình / Bạn bè / Nhà cung cấp… → AI không đụng tới.
        <div className="flex flex-wrap gap-1 mt-1">{custLabels.map((l) => <button key={l.name} type="button" onClick={() => toggleLabel(l.name)} className={cn("fchip", a.customer_labels.includes(l.name) && "on")}>{l.name}</button>)}</div>
      </div>}
      {a.channels.zalo && !zaloOk && <div className="text-xs rounded-md bg-amber-50 text-amber-900 px-2 py-1.5"><AlertTriangle size={12} className="inline" /> Zalo đang mất kết nối (worker không phản hồi) — AI không gửi được qua Zalo, và cả Messenger cũng không được trực thay vì nhịp xử lý do worker Zalo gọi mỗi phút.</div>}
    </div>

    <div className="space-y-1.5">
      <b className="text-xs">Giới hạn an toàn</b>
      <div className="flex flex-wrap gap-3">{num("max_per_conv", "Tối đa lượt / khách / ca", 10)}{num("max_per_hour", "lượt / giờ", 60)}{num("max_per_day", "lượt / ngày", 500)}</div>
      <div><div className="text-xs text-slate-500 mb-0.5">Câu giữ khách (khi AI không được tự trả lời)</div><textarea className="input text-xs" rows={2} maxLength={400} value={a.handoff_text} onChange={(e) => setA({ ...a, handoff_text: e.target.value })} /></div>
    </div>

    <div className="flex items-center gap-2">
      <button className="btn btn-primary" disabled={busy || !dirty} onClick={() => put(a)}>{busy ? "Đang lưu…" : "Lưu cài đặt trực thay"}</button>
      {msg && <span className={cn("text-xs", msg.ok ? "text-emerald-700" : "text-red-600")}>{msg.ok && <Check size={12} className="inline" />} {msg.t}</span>}
    </div>

    <p className="text-[11px] text-slate-500">Lưu ý: Zalo đang dùng tài khoản cá nhân qua thư viện không chính thức — nhắn tự động nhiều có rủi ro bị Zalo hạn chế tài khoản. AI trả lời chậm 1–2 phút (chờ khách nhắn xong), tin đầu tiên luôn ghi rõ “[Trợ lý tự động của THLED]”, giá do hệ thống lấy từ catalog (AI không tự gõ giá). Anh hoặc nhân viên nhắn vào hội thoại nào thì AI tự đứng ngoài hội thoại đó 30 phút. Tắt riêng từng hội thoại: menu ⋯ trong hội thoại.</p>

    <div className="pt-1 border-t border-slate-100">
      <div className="flex items-center gap-2 mb-1"><b>Nhật ký ca trực</b><span className="text-xs text-slate-500">{runs.length ? `${runs.length} lượt gần nhất` : "chưa có lượt nào"}</span></div>
      {runs.length > 0 && <div className="max-h-[28rem] overflow-auto border border-slate-100 rounded-md divide-y divide-slate-100">
        {runs.map((x) => <div key={x.id} className="px-2 py-1.5 text-xs">
          <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => setOpen(open === x.id ? null : x.id)}>
            <span className="tabular-nums text-slate-400 shrink-0">{dt(x.created_at, "HH:mm dd/MM")}</span>
            <span className="font-medium truncate">{x.who || "—"}</span>
            <span className="min-w-0 flex-1 truncate text-slate-500">{x.need || x.reason || x.error || ""}</span>
            <span className={cn("lchip shrink-0", TONE[x.action] || "lchip-gray")}>{AWAY_ACTION_LABEL[x.action] || x.action}</span>
            <span className={cn("lchip shrink-0", x.sent ? "lchip-green" : "lchip-gray")}>{x.sent ? "đã gửi" : x.mode === "shadow" ? "nháp" : "không gửi"}</span>
          </button>
          {open === x.id && <div className="mt-1.5 space-y-1 pl-2 border-l-2 border-slate-200">
            {x.need && <div><b>Khách cần:</b> {x.need}</div>}
            {x.reason && <div><b>Lý do:</b> {x.reason}</div>}
            {x.reply && <div className="rounded bg-slate-50 p-1.5 whitespace-pre-wrap"><b>{x.sent ? "Đã gửi:" : "Sẽ gửi (nháp):"}</b>{"\n"}{x.reply}</div>}
            {x.error && <div className="text-red-600">{x.error}</div>}
            {x.conversation_id && <a className="text-blue-600" href={`/inbox?c=${x.conversation_id}`}>Mở hội thoại →</a>}
          </div>}
        </div>)}
      </div>}
    </div>
  </div>;
}
