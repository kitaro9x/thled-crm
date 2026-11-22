"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BrainCircuit } from "lucide-react";
import type { Lesson, LessonFields, LessonStatus } from "@/lib/lessons";
import { cn, dt } from "@/lib/utils";

const STATUS: Record<LessonStatus, [string, string]> = { pending: ["lchip-amber", "chờ duyệt"], approved: ["lchip-green", "AI đang dùng"], off: ["lchip-gray", "đã tắt"], rejected: ["lchip-red", "từ chối"] };
const ORDER: LessonStatus[] = ["pending", "approved", "off", "rejected"];
const AREAS: [keyof Pick<LessonFields, "situation" | "handling" | "outcome" | "takeaway" | "sample_reply">, string][] = [["situation", "Tình huống"], ["handling", "Cách xử lý"], ["outcome", "Kết quả"], ["takeaway", "Quy tắc rút ra ⭐"], ["sample_reply", "Câu trả lời mẫu"]];

/** Cài đặt → Trợ lý AI: duyệt / sửa / tắt các bài học rút từ hội thoại ("Đưa vào Brain"). Chỉ bài "AI đang dùng" mới tới được AI và THLED-Brain. */
export function LessonsCard({ lessons, members }: { lessons: Lesson[]; members: Record<string, string> }) {
  const r = useRouter();
  const [busy, setBusy] = useState(""); const [err, setErr] = useState("");
  const [edit, setEdit] = useState<{ id: string; f: LessonFields; tags: string } | null>(null);
  const call = async (id: string, body: Record<string, unknown>) => {
    setBusy(id); setErr("");
    const res = await fetch(`/api/ai/lessons/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const j = res ? await res.json().catch(() => ({})) : {};
    setBusy("");
    if (!res?.ok) { setErr(j.error || "Cập nhật thất bại"); return false; }
    r.refresh(); return true;
  };
  const sorted = [...lessons].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || (b.created_at || "").localeCompare(a.created_at || ""));
  const n = (s: LessonStatus) => lessons.filter((l) => l.status === s).length;

  return <div id="lessons" className="card p-4 space-y-2 text-sm max-w-3xl">
    <div className="flex items-center gap-2"><BrainCircuit size={16} className="text-violet-500" /><b>Bài học từ hội thoại</b>
      <span className="ml-auto text-xs text-slate-500">{n("approved")} đang dùng{n("pending") ? ` · ${n("pending")} chờ duyệt` : ""}</span></div>
    <p className="text-xs text-slate-500">Trong hội thoại, bấm <b>⋯ → Đưa vào Brain</b> (hoặc chọn vài tin → <b>Đưa vào Brain</b>): AI chắt thành bài học đã ẩn danh. Bài <b>AI đang dùng</b> được Trợ lý AI áp dụng ngay khi gợi ý, và tự chép sang THLED-Brain (<code>raw/inbox/</code>, mỗi ngày 1 lần) để anh ingest thành trang wiki. Bài sai sẽ làm AI gợi ý sai theo — thấy không còn đúng thì bấm <b>Tắt</b>.</p>
    {err && <div className="text-xs text-red-600">{err}</div>}
    {!lessons.length && <div className="text-xs text-slate-500">Chưa có bài học nào.</div>}
    {sorted.length > 0 && <div className="max-h-[32rem] overflow-auto border border-slate-100 rounded-md divide-y divide-slate-100">
      {sorted.map((l) => { const [tone, label] = STATUS[l.status]; const on = edit?.id === l.id; return <div key={l.id} className="px-2 py-2 space-y-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="font-medium">{l.title}{l.customer_type && <span className="lchip lchip-blue ml-1">{l.customer_type === "thau" ? "thầu" : "lẻ"}</span>}</div>
            {!on && l.takeaway && <div className="text-xs text-slate-600">⭐ {l.takeaway}</div>}
            <div className="text-[11px] text-slate-400">{members[l.created_by || ""] || "—"} · {dt(l.created_at, "HH:mm dd/MM")}{l.tags.length ? ` · ${l.tags.join(", ")}` : ""}{l.status === "approved" ? (l.brain_exported_at ? ` · đã chép sang Brain ${dt(l.brain_exported_at, "dd/MM")}` : " · chờ chép sang Brain") : ""}{l.conversation_id && <> · <a className="text-blue-600" href={`/inbox?c=${l.conversation_id}`}>mở hội thoại</a></>}</div>
          </div>
          <span className={cn("lchip shrink-0", tone)}>{label}</span>
        </div>
        {on && edit && <div className="space-y-1.5 pt-1">
          <input className="input" maxLength={140} value={edit.f.title} onChange={(e) => setEdit({ ...edit, f: { ...edit.f, title: e.target.value } })} />
          {AREAS.map(([k, lab]) => <div key={k}><div className="text-[11px] text-slate-500">{lab}</div><textarea className="input resize-y text-xs" rows={2} value={edit.f[k]} onChange={(e) => setEdit({ ...edit, f: { ...edit.f, [k]: e.target.value } })} /></div>)}
          <div className="grid grid-cols-2 gap-2">
            <select className="input text-xs" value={edit.f.customer_type || ""} onChange={(e) => setEdit({ ...edit, f: { ...edit.f, customer_type: (e.target.value || null) as LessonFields["customer_type"] } })}><option value="">Chung</option><option value="le">Khách lẻ</option><option value="thau">Nhà thầu</option></select>
            <input className="input text-xs" value={edit.tags} onChange={(e) => setEdit({ ...edit, tags: e.target.value })} placeholder="thẻ, cách nhau dấu phẩy" />
          </div>
        </div>}
        <div className="flex flex-wrap gap-1">
          {on && edit ? <>
            <button className="btn btn-primary px-2 py-0.5 text-xs" style={{ minHeight: 26 }} disabled={busy === l.id} onClick={async () => { if (await call(l.id, { fields: { ...edit.f, tags: edit.tags.split(",").map((t) => t.trim()).filter(Boolean) } })) setEdit(null); }}>Lưu sửa</button>
            <button className="btn px-2 py-0.5 text-xs" style={{ minHeight: 26 }} onClick={() => setEdit(null)}>Huỷ</button>
          </> : <>
            {l.status === "pending" && <button className="btn btn-primary px-2 py-0.5 text-xs" style={{ minHeight: 26 }} disabled={busy === l.id} onClick={() => call(l.id, { action: "approve" })}>Duyệt</button>}
            {l.status === "pending" && <button className="btn px-2 py-0.5 text-xs" style={{ minHeight: 26 }} disabled={busy === l.id} onClick={() => call(l.id, { action: "reject" })}>Từ chối</button>}
            {l.status === "approved" && <button className="btn px-2 py-0.5 text-xs" style={{ minHeight: 26 }} disabled={busy === l.id} onClick={() => call(l.id, { action: "off" })}>Tắt</button>}
            {(l.status === "off" || l.status === "rejected") && <button className="btn px-2 py-0.5 text-xs" style={{ minHeight: 26 }} disabled={busy === l.id} onClick={() => call(l.id, { action: "on" })}>Bật cho AI dùng</button>}
            <button className="btn px-2 py-0.5 text-xs" style={{ minHeight: 26 }} onClick={() => setEdit({ id: l.id, f: { title: l.title, situation: l.situation, handling: l.handling, outcome: l.outcome, takeaway: l.takeaway, sample_reply: l.sample_reply, customer_type: l.customer_type, tags: l.tags }, tags: l.tags.join(", ") })}>Xem / sửa</button>
          </>}
        </div>
      </div>; })}
    </div>}
  </div>;
}
