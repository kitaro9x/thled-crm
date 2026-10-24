"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Channel } from "@/lib/types";
import { ChannelIcon } from "@/components/ChannelIcon";
import { ago } from "@/lib/utils";
declare global { interface Window { FB: any; fbAsyncInit: any } }
export function ChannelsClient({ channels, worker, appId }: { channels: Channel[]; worker: any; appId: string }) {
  const r = useRouter(); const sb = supabaseBrowser(); const [msg, setMsg] = useState(""); const [w, setW] = useState(worker);
  useEffect(() => {
    if (!appId || window.FB) return;
    window.fbAsyncInit = () => window.FB.init({ appId, version: "v21.0", cookie: true, xfbml: false });
    const s = document.createElement("script"); s.src = "https://connect.facebook.net/vi_VN/sdk.js"; s.async = true; document.body.appendChild(s);
  }, [appId]);
  useEffect(() => { const ch = sb.channel("zw").on("postgres_changes", { event: "UPDATE", schema: "public", table: "crm_zalo_worker" }, (p) => setW(p.new)).subscribe(); return () => { sb.removeChannel(ch); }; /* eslint-disable-next-line */ }, []);
  const connectFb = () => {
    if (!window.FB) { setMsg("Chưa cấu hình FB_APP_ID"); return; }
    window.FB.login(async (res: any) => {
      if (!res.authResponse) return;
      const rr = await fetch("/api/channels/facebook", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ user_token: res.authResponse.accessToken }) });
      const j = await rr.json(); setMsg(rr.ok ? `Đã kết nối ${j.pages.map((p: any) => p.name).join(", ")}` : j.error); r.refresh();
    }, { scope: "pages_show_list,pages_messaging,pages_manage_metadata,pages_read_engagement,pages_manage_engagement,pages_read_user_content" });
  };
  const askZalo = async () => { await sb.from("crm_zalo_worker").update({ state: "need_qr", qr_image: null }).eq("id", 1); };
  return <div className="text-sm space-y-4">
    <div className="card p-4"><b className="text-base">Kết nối kênh</b><p className="text-xs text-slate-500">Fanpage qua Meta API chính thức. Zalo cá nhân qua worker riêng (quét QR), chạy trên VPS/máy tính của bạn.</p>
      <div className="grid grid-cols-3 gap-3 mt-3">
        <div className="card p-3"><div className="flex items-center gap-2 font-semibold"><ChannelIcon type="fb_page" size={22} /> Facebook Fanpage</div><div className="text-xs text-slate-500 my-2">text · photo · inbox · comment · bot bình luận</div><button className="btn btn-primary" onClick={connectFb}>Kết nối</button></div>
        <div className="card p-3"><div className="flex items-center gap-2 font-semibold"><ChannelIcon type="zalo_personal" size={22} /> Personal Zalo</div><div className="text-xs text-slate-500 my-2">chat · kết bạn tự động · nhãn Zalo. Trạng thái worker: <b>{w?.state || "offline"}</b>{w?.heartbeat_at && ` · ${ago(w.heartbeat_at)}`}</div><button className="btn btn-primary" onClick={askZalo}>Lấy mã QR đăng nhập</button>{w?.state === "need_qr" && <div className="text-xs mt-1 text-amber-700">Đang chờ worker tạo QR…</div>}{w?.qr_image && w?.state !== "online" && <img src={w.qr_image} alt="QR" className="w-48 mt-2 border" />}{w?.state === "online" && <div className="text-emerald-700 mt-1">Đã đăng nhập: {w.account_name}</div>}</div>
        <div className="card p-3 opacity-60"><div className="font-semibold">Zalo OA / Website widget</div><div className="text-xs text-slate-500 my-2">Sắp làm</div></div>
      </div>{msg && <div className="mt-2 text-blue-700">{msg}</div>}</div>
    <div className="card"><table className="w-full"><thead className="bg-slate-50 text-xs text-slate-500 text-left"><tr><th className="p-2">Kênh</th><th className="p-2">Loại</th><th className="p-2">ID</th><th className="p-2">Trạng thái</th><th className="p-2"></th></tr></thead><tbody>{channels.map((c) => <tr key={c.id} className="border-t border-slate-100"><td className="p-2 font-medium flex items-center gap-2"><ChannelIcon type={c.type} />{c.name}</td><td className="p-2">{c.type}</td><td className="p-2 text-slate-500">{c.external_id}</td><td className="p-2"><span className={`chip ${c.status === "connected" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{c.status}</span>{c.last_error && <div className="text-xs text-red-600">{c.last_error}</div>}</td><td className="p-2"><button className="text-red-600" onClick={async () => { if (confirm("Gỡ kênh? Hội thoại sẽ bị xoá.")) { await fetch(`/api/channels/${c.id}`, { method: "DELETE" }); r.refresh(); } }}>Gỡ</button></td></tr>)}{channels.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-400">Chưa kết nối kênh nào</td></tr>}</tbody></table></div>
  </div>;
}
