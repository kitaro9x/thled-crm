"use client";
import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
function b64ToU8(b64: string) { const p = "=".repeat((4 - (b64.length % 4)) % 4); const s = (b64 + p).replace(/-/g, "+").replace(/_/g, "/"); const r = atob(s); return Uint8Array.from([...r].map((c) => c.charCodeAt(0))); }
export function PushToggle({ compact }: { compact?: boolean }) {
  const [state, setState] = useState<"unsupported" | "off" | "on" | "denied" | "busy">("busy");
  const [msg, setMsg] = useState("");
  useEffect(() => { (async () => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState("unsupported");
    if (Notification.permission === "denied") return setState("denied");
    const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription();
    setState(sub ? "on" : "off");
  })(); }, []);
  const enable = async () => {
    setState("busy"); setMsg("");
    try {
      const perm = await Notification.requestPermission(); if (perm !== "granted") { setState("denied"); return; }
      const { publicKey } = await fetch("/api/push/public-key").then((r) => r.json());
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(publicKey) });
      const r = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON() }) });
      if (!r.ok) throw new Error((await r.json()).error);
      setState("on"); setMsg("Đã bật. Thử gửi thông báo…");
      const t = await fetch("/api/push/test", { method: "POST" }).then((x) => x.json()); setMsg(t.sent ? "Đã bật thông báo ✅" : "Đã bật, nhưng gửi thử không thành công");
    } catch (e: any) { setState("off"); setMsg("Lỗi: " + e.message); }
  };
  const disable = async () => {
    setState("busy"); const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription();
    if (sub) { await fetch("/api/push/subscribe", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }); await sub.unsubscribe(); }
    setState("off"); setMsg("Đã tắt thông báo trên thiết bị này");
  };
  const cls = compact ? "flex-1 flex flex-col items-center gap-0.5 py-1.5 text-[10px] hover:text-white" : "w-16 flex flex-col items-center gap-0.5 rounded-md py-2 text-[10px] hover:bg-slate-800 hover:text-white";
  if (state === "unsupported") return null;
  if (state === "denied") return <button className={cls} title="Trình duyệt đang chặn thông báo — mở cài đặt trang web để cho phép" onClick={() => setMsg("Thông báo bị chặn: bấm ổ khoá cạnh địa chỉ → Thông báo → Cho phép, rồi tải lại.")}><BellOff size={18} /><span>Bị chặn</span></button>;
  return <button className={cls + (state === "on" ? " text-emerald-400" : "")} title={state === "on" ? "Đang bật thông báo (bấm để tắt)" : "Bật thông báo khi khách nhắn"} onClick={state === "on" ? disable : enable} disabled={state === "busy"}>
    {state === "on" ? <BellRing size={18} /> : <Bell size={18} />}<span>{state === "on" ? "Đang báo" : state === "busy" ? "…" : "Thông báo"}</span>
    {msg && <span className="sr-only">{msg}</span>}
  </button>;
}
