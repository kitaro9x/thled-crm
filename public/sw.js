// Service worker tối thiểu để cài được PWA. Không cache trang (CRM cần dữ liệu realtime).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => { if (e.request.mode === "navigate") e.respondWith(fetch(e.request).catch(() => new Response("<h1>Mất kết nối</h1><p>Kiểm tra mạng rồi mở lại THLED CRM.</p>", { headers: { "content-type": "text/html; charset=utf-8" } }))); });
