// Service worker tối thiểu để cài được PWA; không cache trang (CRM cần dữ liệu realtime)
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
