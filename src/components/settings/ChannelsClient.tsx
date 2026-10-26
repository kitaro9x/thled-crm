"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Channel } from "@/lib/types";
import { ChannelIcon } from "@/components/ChannelIcon";
import { ago } from "@/lib/utils";
export function ChannelsClient({ channels, worker, appId }: { channels: Channel[]; worker: any; appId: string }) {
  const r = useRouter(); const sp = useSearchParams(); const sb = supabaseBrowser(); const [w, setW] = useState(worker);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState(""); const [showToken, setShowToken] = useState(false); const [token, setToken] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { if (sp.get("fb_ok")) setMsg("Đã kết nối: " + sp.get("fb_ok")); if (sp.get("fb_error")) setErr("Facebook báo lỗi: " + sp.get("fb_error")); }, [sp]);
  useEffect(() => { const ch = sb.channel("zw").on("postgres_changes", { event: "UPDATE", schema: "public", table: "crm_zalo_worker" }, (p) => setW(p.new)).subscribe(); return () => { sb.removeChannel(ch); }; /* eslint-disable-next-line */ }, []);
  const connectFb = () => {
    if (!appId) { setErr("Server chưa có FB_APP_ID — thêm biến môi trường trên Vercel rồi Redeploy."); return; }
    setBusy(true); window.location.href = "/api/channels/facebook/start";
  };
  const connectByToken = async () => {
    if (!token.trim()) return; setBusy(true); setErr(""); setMsg("");
    const rr = await fetch("/api/channels/facebook", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ user_token: token.trim() }) });
    const j = await rr.json(); setBusy(false);
    if (rr.ok) { setMsg("Đã kết nối: " + j.pages.map((p: any) => p.name + (p.subscribed ? "" : " (chưa subscribe webhook)")).join(", ")); setToken(""); r.refresh(); } else setErr(j.error);
  };
  const askZalo = async () => { await sb.from("crm_zalo_worker").update({ state: "need_qr", qr_image: null }).eq("id", 1); };
  return <div className="text-sm space-y-4">
    <div className="card p-4"><b className="text-base">Kết nối kênh</b><p className="text-xs text-slate-500">Fanpage qua Meta API chính thức. Zalo cá nhân qua worker riêng (quét QR), chạy trên VPS/máy tính của bạn.</p>
      <div className="grid grid-cols-3 gap-3 mt-3">
        <div className="card p-3"><div className="flex items-center gap-2 font-semibold"><ChannelIcon type="fb_page" size={22} /> Facebook Fanpage</div><div className="text-xs text-slate-500 my-2">text · photo · inbox · comment · bot bình luận</div><div className="flex gap-2 items-center"><button className="btn btn-primary" onClick={connectFb} disabled={busy}>{busy ? "Đang chuyển sang Facebook…" : "Kết nối"}</button><button className="text-xs text-slate-500 underline" onClick={() => setShowToken(!showToken)}>Dùng token</button></div>
          {showToken && <div className="mt-2 space-y-1"><div className="text-xs text-slate-500">Dự phòng: dán User Access Token lấy từ Graph API Explorer (đã cấp quyền pages_show_list, pages_messaging, pages_manage_metadata).</div><div className="flex gap-2"><input className="input flex-1 text-xs" placeholder="EAAB…" value={token} onChange={(e) => setToken(e.target.value)} /><button className="btn" onClick={connectByToken} disabled={busy}>Kết nối bằng token</button></div></div>}
          {!appId && <div className="text-xs text-red-600 mt-1">Chưa cấu hình FB_APP_ID trên server.</div>}</div>
        <div className="card p-3"><div className="flex items-center gap-2 font-semibold"><ChannelIcon type="zalo_personal" size={22} /> Personal Zalo</div><div className="text-xs text-slate-500 my-2">chat · kết bạn tự động · nhãn Zalo. Trạng thái worker: <b>{w?.state || "offline"}</b>{w?.heartbeat_at && ` · ${ago(w.heartbeat_at)}`}</div><button className="btn btn-primary" onClick={askZalo}>Lấy mã QR đăng nhập</button>{w?.state === "need_qr" && <div className="text-xs mt-1 text-amber-700">Đang chờ worker tạo QR…</div>}{w?.qr_image && w?.state !== "online" && <img src={w.qr_image} alt="QR" className="w-48 mt-2 border" />}{w?.state === "online" && <div className="text-emerald-700 mt-1">Đã đăng nhập: {w.account_name}</div>}</div>
        <div className="card p-3 opacity-60"><div className="font-semibold">Zalo OA / Website widget</div><div className="text-xs text-slate-500 my-2">Sắp làm</div></div>
      </div>{msg && <div className="mt-2 text-emerald-700">{msg}</div>}{err && <div className="mt-2 text-red-600 break-all">{err}</div>}</div>
    <div className="card"><table className="w-full"><thead className="bg-slate-50 text-xs text-slate-500 text-left"><tr><th className="p-2">Kênh</th><th className="p-2">Loại</th><th className="p-2">ID</th><th className="p-2">Trạng thái</th><th className="p-2"></th></tr></thead><tbody>{channels.map((c) => <tr key={c.id} className="border-t border-slate-100"><td className="p-2 font-medium flex items-center gap-2"><ChannelIcon type={c.type} />{c.name}</td><td className="p-2">{c.type}</td><td className="p-2 text-slate-500">{c.external_id}</td><td className="p-2"><span className={`chip ${c.status === "connected" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{c.status}</span>{c.last_error && <div className="text-xs text-red-600">{c.last_error}</div>}</td><td className="p-2 space-x-3 whitespace-nowrap">{c.type === "fb_page" && <><button className="text-blue-600" onClick={async () => { const j = await fetch(`/api/channels/${c.id}`).then((x) => x.json()); const f = j.subscribed_apps?.data?.[0]?.subscribed_fields; setMsg(f ? "Page đang subscribe: " + f.join(", ") : "Meta trả về: " + JSON.stringify(j)); }}>Kiểm tra</button><button className="text-blue-600" onClick={async () => { const j = await fetch(`/api/channels/${c.id}`, { method: "POST" }).then((x) => x.json()); setMsg(j.success ? "Đã đăng ký lại webhook cho page" : "Lỗi: " + JSON.stringify(j)); r.refresh(); }}>Đăng ký lại</button></>}<button className="text-red-600" onClick={async () => { if (confirm("Gỡ kênh? Hội thoại sẽ bị xoá.")) { await fetch(`/api/channels/${c.id}`, { method: "DELETE" }); r.refresh(); } }}>Gỡ</button></td></tr>)}{channels.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-400">Chưa kết nối kênh nào</td></tr>}</tbody></table></div>
  </div>;
}
