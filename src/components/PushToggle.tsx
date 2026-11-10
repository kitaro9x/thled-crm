"use client";
import { useEffect, useRef, useState } from "react";
import { Bell, BellOff, BellRing, X } from "lucide-react";
function b64ToU8(b64: string) { const p = "=".repeat((4 - (b64.length % 4)) % 4); const s = (b64 + p).replace(/-/g, "+").replace(/_/g, "/"); const r = atob(s); return Uint8Array.from([...r].map((c) => c.charCodeAt(0))); }
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
/** navigator.serviceWorker.ready treo mãi nếu SW chưa đăng ký được → giới hạn thời gian chờ */
async function swReady(ms = 8000) {
  const r = await Promise.race([navigator.serviceWorker.ready, new Promise<null>((res) => setTimeout(() => res(null), ms))]);
  if (!r) throw new Error("Service worker chưa sẵn sàng — tải lại trang rồi thử lại");
  return r;
}
const saveSub = (sub: PushSubscription) => fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON() }) });

type State = "unsupported" | "ios-install" | "off" | "on" | "denied" | "busy";
type Msg = { text: string; tone: "ok" | "warn" | "err" } | null;

export function PushToggle({ compact }: { compact?: boolean }) {
  const [state, setState] = useState<State>("busy");
  const [msg, setMsgRaw] = useState<Msg>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setMsg = (m: Msg, autoHideMs = 6000) => { setMsgRaw(m); if (timer.current) clearTimeout(timer.current); if (m && autoHideMs) timer.current = setTimeout(() => setMsgRaw(null), autoHideMs); };

  useEffect(() => { (async () => {
    if (typeof window === "undefined") return;
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    // iPhone/iPad: chỉ nhận thông báo khi đã "Thêm vào Màn hình chính" và mở app từ icon (iOS 16.4+)
    if (!supported) return setState(isIOS() && !isStandalone() ? "ios-install" : "unsupported");
    if (Notification.permission === "denied") return setState("denied");
    try {
      const reg = await swReady(); const sub = await reg.pushManager.getSubscription();
      // đã cấp quyền + có subscription → gửi lại cho server (phòng khi server đã xoá do hết hạn / đổi tài khoản đăng nhập)
      if (sub && Notification.permission === "granted") saveSub(sub).catch(() => {});
      setState(sub && Notification.permission === "granted" ? "on" : "off");
    } catch { setState("off"); }
  })(); return () => { if (timer.current) clearTimeout(timer.current); }; }, []);

  const enable = async () => {
    setState("busy"); setMsg({ text: "Đang bật thông báo…", tone: "ok" }, 0);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setState(perm === "denied" ? "denied" : "off"); setMsg({ text: perm === "denied" ? "Bạn đã chặn thông báo. Mở cài đặt trang web → Thông báo → Cho phép, rồi tải lại." : "Chưa cấp quyền thông báo.", tone: "warn" }, 10000); return; }
      const { publicKey } = await fetch("/api/push/public-key").then((r) => r.json());
      if (!publicKey) throw new Error("Server chưa cấu hình khoá VAPID");
      const reg = await swReady();
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(publicKey) });
      const r = await saveSub(sub);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Không lưu được đăng ký");
      setState("on");
      const t = await fetch("/api/push/test", { method: "POST" }).then((x) => x.json()).catch(() => ({ sent: 0 }));
      setMsg(t.sent ? { text: "Đã bật thông báo ✅ Bạn sẽ thấy 1 thông báo thử ngay bây giờ.", tone: "ok" } : { text: "Đã bật, nhưng gửi thử không thành công" + (t.error ? `: ${t.error}` : "") + ". Thử tắt rồi bật lại.", tone: "warn" }, 10000);
    } catch (e: any) { setState("off"); setMsg({ text: "Lỗi: " + (e?.message || e), tone: "err" }, 10000); }
  };
  const disable = async () => {
    if (!confirm("Tắt thông báo khách nhắn trên thiết bị này?")) return;
    setState("busy");
    try {
      const reg = await swReady(); const sub = await reg.pushManager.getSubscription();
      if (sub) { await fetch("/api/push/subscribe", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {}); await sub.unsubscribe(); }
      setState("off"); setMsg({ text: "Đã tắt thông báo trên thiết bị này", tone: "ok" });
    } catch (e: any) { setState("on"); setMsg({ text: "Không tắt được: " + (e?.message || e), tone: "err" }, 10000); }
  };

  const cls = compact ? "flex-1 flex flex-col items-center gap-0.5 py-1.5 text-[11px] hover:text-white" : "w-16 flex flex-col items-center gap-0.5 rounded-md py-2 text-[11px] hover:bg-slate-800 hover:text-white";
  if (state === "unsupported") return null;

  const popup = msg && (
    <div role="status" aria-live="polite" className={(compact ? "fixed left-3 right-3 bottom-[calc(64px+env(safe-area-inset-bottom))]" : "fixed left-[80px] bottom-4 w-80") + " z-[100] rounded-lg shadow-lg px-3 py-2.5 text-[13px] leading-5 text-white flex items-start gap-2 " + (msg.tone === "err" ? "bg-red-600" : msg.tone === "warn" ? "bg-amber-600" : "bg-slate-800")}>
      <div className="flex-1 whitespace-pre-line">{msg.text}</div>
      <button onClick={() => setMsg(null)} aria-label="Đóng" className="shrink-0 opacity-80 hover:opacity-100"><X size={16} /></button>
    </div>
  );

  if (state === "ios-install") return <>
    <button className={cls} title="Cách bật thông báo trên iPhone" onClick={() => setMsg({ text: "iPhone chỉ nhận thông báo khi dùng app cài trên màn hình:\n1. Mở trang này bằng Safari\n2. Bấm nút Chia sẻ ⬆ → \"Thêm vào MH chính\"\n3. Mở THLED CRM từ icon ngoài màn hình → bấm \"Thông báo\"", tone: "warn" }, 0)}><Bell size={18} /><span>Thông báo</span></button>
    {popup}
  </>;
  if (state === "denied") return <>
    <button className={cls} title="Trình duyệt đang chặn thông báo" onClick={() => setMsg({ text: isIOS() ? "Thông báo đang bị chặn: vào Cài đặt iPhone → Thông báo → THLED CRM → bật Cho phép thông báo, rồi mở lại app." : "Thông báo đang bị chặn: bấm biểu tượng ổ khoá/⋮ cạnh thanh địa chỉ → Quyền trang web → Thông báo → Cho phép, rồi tải lại trang.", tone: "warn" }, 0)}><BellOff size={18} /><span>Bị chặn</span></button>
    {popup}
  </>;
  return <>
    <button className={cls + (state === "on" ? " text-emerald-400" : "")} title={state === "on" ? "Đang bật thông báo (bấm để tắt)" : "Bật thông báo khi khách nhắn"} onClick={state === "on" ? disable : enable} disabled={state === "busy"}>
      {state === "on" ? <BellRing size={18} /> : <Bell size={18} />}<span>{state === "on" ? "Đang báo" : state === "busy" ? "…" : "Thông báo"}</span>
    </button>
    {popup}
  </>;
}
