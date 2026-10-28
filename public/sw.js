// Service worker: cài PWA + nhận thông báo đẩy. Không cache trang (CRM cần dữ liệu realtime).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => { if (e.request.mode === "navigate") e.respondWith(fetch(e.request).catch(() => new Response("<h1>Mất kết nối</h1><p>Kiểm tra mạng rồi mở lại THLED CRM.</p>", { headers: { "content-type": "text/html; charset=utf-8" } }))); });
self.addEventListener("push", (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { title: "THLED CRM", body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "THLED CRM", { body: d.body || "", icon: d.icon || "/icons/icon-192.png", badge: "/icons/icon-192.png", tag: d.tag, renotify: true, data: { url: d.url || "/inbox" }, vibrate: [100, 50, 100] }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/inbox";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ("focus" in c) { c.navigate(url); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
