// Service worker: cài PWA + nhận thông báo đẩy. Không cache trang (CRM cần dữ liệu realtime).
// v5 — bấm thông báo mở đúng hội thoại không tải lại trang; tự đăng ký lại khi subscription đổi; số đỏ trên icon app
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => { if (e.request.mode === "navigate") e.respondWith(fetch(e.request).catch(() => new Response("<h1>Mất kết nối</h1><p>Kiểm tra mạng rồi mở lại THLED CRM.</p>", { headers: { "content-type": "text/html; charset=utf-8" } }))); });

let badge = 0; // đếm tin chưa xem để hiện số trên icon app (Android/iPhone PWA); app mở lên sẽ xoá

self.addEventListener("push", (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { title: "THLED CRM", body: e.data && e.data.text() }; }
  // iPhone bắt buộc: mỗi lần nhận push PHẢI hiện thông báo, nếu không Apple sẽ huỷ đăng ký → luôn showNotification
  e.waitUntil((async () => {
    await self.registration.showNotification(d.title || "THLED CRM", {
      body: d.body || "", icon: d.icon || "/icons/icon-192.png", badge: "/icons/badge-96.png",
      tag: d.tag, renotify: !!d.tag, timestamp: Date.now(),
      data: { url: d.url || "/inbox" }, vibrate: [200, 100, 200],
    });
    if (d.tag !== "test" && self.navigator && "setAppBadge" in self.navigator) { badge++; try { await self.navigator.setAppBadge(badge); } catch {} }
  })());
});

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "clear-badge") { badge = 0; if (self.navigator && "clearAppBadge" in self.navigator) self.navigator.clearAppBadge().catch(() => {}); }
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/inbox";
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    // app đang mở → đưa lên trước và bảo app tự chuyển tới hội thoại (không tải lại trang)
    const c = list.find((w) => w.visibilityState === "visible") || list[0];
    if (c) {
      try { await c.focus(); } catch {}
      c.postMessage({ type: "open-url", url });
      return;
    }
    await self.clients.openWindow(url);
  })());
});

// trình duyệt tự đổi/hết hạn subscription → đăng ký lại và báo server, tránh "tự nhiên không nhận thông báo nữa"
self.addEventListener("pushsubscriptionchange", (e) => {
  e.waitUntil((async () => {
    try {
      const { publicKey } = await fetch("/api/push/public-key", { credentials: "include" }).then((r) => r.json());
      if (!publicKey) return;
      const p = "=".repeat((4 - (publicKey.length % 4)) % 4); const raw = atob((publicKey + p).replace(/-/g, "+").replace(/_/g, "/"));
      const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from([...raw].map((ch) => ch.charCodeAt(0))) });
      await fetch("/api/push/subscribe", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON(), oldEndpoint: e.oldSubscription && e.oldSubscription.endpoint }) });
    } catch {}
  })());
});
