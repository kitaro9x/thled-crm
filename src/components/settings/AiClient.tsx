"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, KeyRound, BookOpen, BarChart3, Check, AlertTriangle } from "lucide-react";
import { AI_MODELS, USD_VND, type AiFeature, type AiSettings } from "@/lib/ai-config";
import { cn, dt, ago } from "@/lib/utils";

export interface AiStats { calls: number; failed: number; usd: number; avgMs: number; byFeature: Record<string, { calls: number; usd: number }>; errors: { at: string; feature: string; error: string }[] }
interface BrainSync { commit?: string | null; at?: string; pages?: number; chunks?: number; skipped?: { path: string; reason: string }[]; warnings?: { path: string; warning: string }[] }
interface BrainPageRow { path: string; title: string; status: string | null; updated: string | null }

const FEATURES: { k: AiFeature; l: string; d: string }[] = [
  { k: "suggest", l: "Gợi ý trả lời khách", d: "Nút ✨ Gợi ý AI trong ô soạn tin: 3 phương án dựa trên đoạn chat + THLED-Brain + giá sản phẩm. Nhân viên chọn, sửa rồi mới gửi." },
  { k: "lookup", l: "Trợ lý tra giá / ảnh / chính sách", d: "Khung hỏi đáp ở cột phải hội thoại: tra mẫu theo nhu cầu, giá, ảnh (đính kèm được), bảo hành, chính sách thầu." },
  { k: "summary", l: "Tóm tắt hội thoại", d: "Nút AI tóm tắt: nhu cầu khách, việc cần làm tiếp, cảm xúc, sản phẩm quan tâm." },
];
const STATUS: Record<string, [string, string]> = { "on-dinh": ["lchip-green", "ổn định"], "can-bo-sung": ["lchip-amber", "cần bổ sung"], "chua-xac-minh": ["lchip-amber", "chưa xác minh"], "mau-thuan": ["lchip-red", "mâu thuẫn"] };
const vnd = (usd: number) => new Intl.NumberFormat("vi-VN").format(Math.round(usd * USD_VND)) + "đ";
/** ước tính 1 lần gợi ý: ~10K token vào (hội thoại + kho tri thức + kết quả tra cứu), ~1,2K ra */
const perSuggest = (m: (typeof AI_MODELS)[number]) => (10_000 * m.in + 1_200 * m.out) / 1e6;

export function AiClient({ initial, brainSync, pages, stats, hasKey, hasSyncSecret }: { initial: AiSettings; brainSync: BrainSync | null; pages: BrainPageRow[]; stats: AiStats; hasKey: boolean; hasSyncSecret: boolean }) {
  const r = useRouter();
  const [s, setS] = useState<AiSettings>(initial);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [test, setTest] = useState<any>(null); const [testing, setTesting] = useState(false);
  const runTest = async () => {
    setTesting(true); setTest(null);
    const res = await fetch("/api/ai/test", { method: "POST" }).catch(() => null);
    setTest(res ? await res.json().catch(() => ({ ok: false, error: `Lỗi ${res.status}` })) : { ok: false, error: "Mất kết nối" }); setTesting(false);
  };
  const dirty = JSON.stringify(s) !== JSON.stringify(initial);
  const save = async (next = s) => {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/ai/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(next) });
    const j = await res.json().catch(() => ({})); setBusy(false);
    if (!res.ok) { setMsg({ ok: false, t: j.error || "Lưu thất bại" }); return; }
    setS(j.value); setMsg({ ok: true, t: "Đã lưu" }); r.refresh();
  };
  const pinned = new Set(s.brain_pinned);
  const togglePin = (p: string) => setS({ ...s, brain_pinned: pinned.has(p) ? s.brain_pinned.filter((x) => x !== p) : [...s.brain_pinned, p] });
  const missingPinned = s.brain_pinned.filter((p) => !pages.some((x) => x.path === p));

  return <div className="text-sm space-y-3 max-w-3xl">
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-3">
        <Sparkles className="text-violet-500" size={20} />
        <div className="flex-1"><b>Trợ lý AI (Claude)</b><div className="text-xs text-slate-500">Tóm tắt hội thoại, gợi ý trả lời khách, tra giá – ảnh – chính sách từ THLED-Brain. Tắt là ẩn hết nút AI và server chặn mọi lệnh gọi.</div></div>
        <label className="flex items-center gap-2 cursor-pointer select-none font-semibold">
          <input type="checkbox" className="w-5 h-5" checked={s.enabled} disabled={busy} onChange={(e) => { const next = { ...s, enabled: e.target.checked }; setS(next); save(next); }} />
          {s.enabled ? <span className="text-emerald-700">Đang BẬT</span> : <span className="text-slate-500">Đang TẮT</span>}
        </label>
      </div>
      <div className={cn("text-xs rounded-md px-2 py-1.5 flex items-center gap-1.5 flex-wrap", hasKey ? "bg-green-50 text-emerald-700" : "bg-amber-50 text-amber-900")}>
        <KeyRound size={13} /> {hasKey ? "Đã có ANTHROPIC_API_KEY trên server." : "Chưa có ANTHROPIC_API_KEY — thêm ở Vercel → Settings → Environment Variables rồi Redeploy. Chưa có key thì bật cũng không chạy."}
      <button className="btn ml-auto px-2 py-0.5 text-xs" style={{ minHeight: 26 }} disabled={testing} onClick={runTest}>{testing ? "Đang kiểm tra…" : "Kiểm tra kết nối Claude"}</button></div>
      {test && <div className={cn("text-xs rounded-md px-2 py-1.5 space-y-0.5", test.ok ? "bg-green-50 text-emerald-700" : "bg-red-50 text-red-600")}>
        <div className="font-semibold">{test.ok ? `✓ Kết nối Claude OK — model ${test.model_name || test.model}` : `✗ Chưa kết nối được${test.status ? ` (lỗi ${test.status})` : ""}`}</div>
        {test.key && <div>Key trên server: <code>{test.key.prefix}…{test.key.last4}</code> · {test.key.length} ký tự{test.key.had_spaces ? " · có dấu cách/xuống dòng thừa (đã tự cắt)" : ""}{test.key.had_quotes ? " · có dấu ngoặc kép thừa (đã tự bỏ)" : ""} — {test.key.hint}</div>}
        {test.hint && <div>👉 {test.hint}</div>}
        {test.error && <div className="opacity-80">Anthropic: {test.error}</div>}
      </div>}
    </div>

    <div className="card p-4 space-y-2">
      <b>Tính năng</b>
      {FEATURES.map((f) => <label key={f.k} className={cn("flex gap-2 items-start", !s.enabled && "opacity-60")}>
        <input type="checkbox" className="mt-0.5" checked={s.features[f.k]} onChange={(e) => setS({ ...s, features: { ...s.features, [f.k]: e.target.checked } })} />
        <span><span className="font-medium">{f.l}</span><span className="block text-xs text-slate-500">{f.d}</span></span>
      </label>)}
      <p className="text-xs text-slate-500">Mỗi nhân viên còn tự ẩn được AI cho riêng mình bằng ô “Trợ lý AI cho tôi” ở đầu danh sách hội thoại.</p>
    </div>

    <div className="card p-4 space-y-2">
      <b>Model</b>
      <div className="grid gap-2 md:grid-cols-3">
        {AI_MODELS.map((m) => <label key={m.id} className={cn("rounded-md border p-2 cursor-pointer", s.model === m.id ? "border-blue-500 bg-blue-50" : "border-slate-200")}>
          <div className="flex items-center gap-1.5"><input type="radio" name="model" checked={s.model === m.id} onChange={() => setS({ ...s, model: m.id })} /><b>{m.name}</b></div>
          <div className="text-xs text-slate-500 mt-0.5">{m.hint}</div>
          <div className="text-xs mt-1">≈ {vnd(perSuggest(m))} / lần gợi ý</div>
        </label>)}
      </div>
      <label className={cn("flex gap-2 items-start rounded-md border p-2", s.model === "claude-opus-5-5" ? "border-slate-200" : "border-slate-100 opacity-50")}>
        <input type="checkbox" className="mt-0.5" disabled={s.model !== "claude-opus-5-5"} checked={s.fast && s.model === "claude-opus-5-5"} onChange={(e) => setS({ ...s, fast: e.target.checked })} />
        <span><span className="font-medium">⚡ Chế độ nhanh (fast mode)</span><span className="block text-xs text-slate-500">Chỉ Opus 5.5: AI viết nhanh hơn ~2,5 lần (gợi ý thường còn ~5–7 giây), <b>giá ×2</b> (≈ {vnd(perSuggest(AI_MODELS[0]) * 2)} / lần gợi ý). Hết hạn mức chế độ nhanh thì tự chạy tốc độ thường.</span></span>
      </label>
      <p className="text-xs text-slate-500">Ước tính theo giá Anthropic (USD × {USD_VND.toLocaleString("vi-VN")}), thực tế tuỳ độ dài hội thoại. Opus/Sonnet 5.5 bật sẵn “model dự phòng” khi bị bộ lọc an toàn từ chối.</p>
    </div>

    <div className="card p-4 space-y-2">
      <b>Ghi chú cho AI</b>
      <p className="text-xs text-slate-500">Thông tin AI cần biết mà THLED-Brain chưa có: khuyến mãi đang chạy, giờ mở cửa, phí giao hàng ngoại tỉnh, câu chào riêng… (không ghi giá vốn, mật khẩu).</p>
      <textarea className="input" rows={5} maxLength={4000} value={s.shop_notes} onChange={(e) => setS({ ...s, shop_notes: e.target.value })} placeholder="VD: Tháng 11 giảm thêm 5% quạt trần DC khi mua kèm đèn. Mở cửa 7h30–21h mỗi ngày." />
    </div>

    <div className="flex items-center gap-2">
      <button className="btn btn-primary" disabled={busy || !dirty} onClick={() => save()}>{busy ? "Đang lưu…" : "Lưu cài đặt"}</button>
      {msg && <span className={cn("text-xs", msg.ok ? "text-emerald-700" : "text-red-600")}>{msg.ok && <Check size={12} className="inline" />} {msg.t}</span>}
    </div>

    <div className="card p-4 space-y-2">
      <div className="flex items-center gap-2"><BookOpen size={16} className="text-blue-600" /><b>Kho tri thức THLED-Brain</b>
        <span className="ml-auto text-xs text-slate-500">{brainSync?.at ? <>Đồng bộ {ago(brainSync.at)} ({dt(brainSync.at, "HH:mm dd/MM")}){brainSync.commit ? ` · commit ${brainSync.commit.slice(0, 7)}` : ""} · {brainSync.pages} trang / {brainSync.chunks} đoạn</> : "Chưa đồng bộ lần nào"}</span></div>
      <p className="text-xs text-slate-500">Chỉ nhận vùng chung <code>01-noi-bo-chung/</code> (lọc ngay từ GitHub, server kiểm lại lần 2). Vùng riêng — giá vốn, chiết khấu NCC, lãi gộp — không bao giờ vào CRM. Tick “Luôn nạp” cho trang AI phải đọc ở mọi lần (cam kết dịch vụ, văn hoá, chính sách thầu); các trang khác AI tự tra khi cần.</p>
      {!hasSyncSecret && <div className="text-xs rounded-md bg-amber-50 text-amber-900 px-2 py-1.5"><AlertTriangle size={12} className="inline" /> Chưa đặt <code>BRAIN_SYNC_SECRET</code> (≥16 ký tự) trên Vercel — repo THLED-Brain chưa đẩy được dữ liệu sang.</div>}
      {missingPinned.length > 0 && <div className="text-xs text-amber-700">Trang “luôn nạp” chưa có trong kho (sẽ tự dùng khi có): {missingPinned.map((p) => p.split("/").pop()).join(", ")}</div>}
      {(brainSync?.skipped?.length || 0) > 0 && <div className="text-xs rounded-md bg-red-50 text-red-600 px-2 py-1.5">Bị từ chối ở lần đồng bộ gần nhất:{brainSync!.skipped!.map((x) => <div key={x.path}>• {x.path} — {x.reason}</div>)}</div>}
      {(brainSync?.warnings?.length || 0) > 0 && <div className="text-xs text-amber-700">Cảnh báo: {brainSync!.warnings!.map((x) => `${x.path.split("/").pop()} (${x.warning})`).join(" · ")}</div>}
      {pages.length > 0 && <div className="max-h-80 overflow-auto border border-slate-100 rounded-md divide-y divide-slate-100">
        {pages.map((p) => { const [tone, label] = STATUS[p.status || ""] || ["lchip-gray", p.status || "—"]; return <div key={p.path} className="flex items-center gap-2 px-2 py-1.5">
          <div className="min-w-0 flex-1"><div className="truncate">{p.title}</div><div className="text-[11px] text-slate-400 truncate">{p.path.replace("01-noi-bo-chung/", "")}{p.updated ? ` · ${p.updated}` : ""}</div></div>
          <span className={cn("lchip", tone)}>{label}</span>
          <label className="flex items-center gap-1 text-xs text-slate-600 shrink-0"><input type="checkbox" checked={pinned.has(p.path)} onChange={() => togglePin(p.path)} /> Luôn nạp</label>
        </div>; })}
      </div>}
      <details className="text-xs text-slate-600"><summary className="cursor-pointer font-medium">Cách nối THLED-Brain (làm 1 lần)</summary>
        <ol className="list-decimal ml-5 mt-1 space-y-1">
          <li>Tự đặt 1 chuỗi bí mật dài (vd 32 ký tự ngẫu nhiên). Vercel → Settings → Environment Variables: <code>BRAIN_SYNC_SECRET</code> = chuỗi đó → Redeploy.</li>
          <li>GitHub repo <b>THLED-Brain</b> → Settings → Secrets and variables → Actions → New repository secret: <code>BRAIN_SYNC_SECRET</code> (cùng chuỗi) và <code>CRM_URL</code> (vd <code>https://thled-crm.vercel.app</code>).</li>
          <li>Merge nhánh có file <code>.github/workflows/dong-bo-crm.yml</code>. Từ đó mỗi lần vault được push lên <code>main</code> có đổi <code>01-noi-bo-chung/</code> → tự đồng bộ. Đồng bộ tay: tab Actions → “Đồng bộ THLED-Brain → CRM” → Run workflow.</li>
        </ol>
      </details>
    </div>

    <div className="card p-4 space-y-2">
      <div className="flex items-center gap-2"><BarChart3 size={16} className="text-blue-600" /><b>Sử dụng 30 ngày qua</b></div>
      {stats.calls === 0 ? <div className="text-xs text-slate-500">Chưa có lần gọi nào.</div> : <>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="rounded-md bg-slate-50 p-2"><div className="text-xs text-slate-500">Lần gọi</div><div className="text-lg font-semibold tabular-nums">{stats.calls}</div></div>
          <div className="rounded-md bg-slate-50 p-2"><div className="text-xs text-slate-500">Chi phí ước tính</div><div className="text-lg font-semibold tabular-nums">{vnd(stats.usd)}</div><div className="text-[11px] text-slate-400">${stats.usd.toFixed(2)}</div></div>
          <div className="rounded-md bg-slate-50 p-2"><div className="text-xs text-slate-500">Thời gian TB</div><div className="text-lg font-semibold tabular-nums">{(stats.avgMs / 1000).toFixed(1)}s</div></div>
          <div className="rounded-md bg-slate-50 p-2"><div className="text-xs text-slate-500">Lỗi</div><div className={cn("text-lg font-semibold tabular-nums", stats.failed ? "text-red-600" : "")}>{stats.failed}</div></div>
        </div>
        <div className="text-xs text-slate-600">{Object.entries(stats.byFeature).map(([k, v]) => `${({ suggest: "Gợi ý", ask: "Tra cứu", summary: "Tóm tắt" } as Record<string, string>)[k] || k}: ${v.calls} lần · ${vnd(v.usd)}`).join("  ·  ")}</div>
        {stats.errors.length > 0 && <div className="text-xs text-red-600">{stats.errors.map((e, i) => <div key={i}>{dt(e.at, "HH:mm dd/MM")} · {e.feature}: {e.error}</div>)}</div>}
      </>}
    </div>
  </div>;
}
