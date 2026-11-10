"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Cầu nối service worker ↔ app:
 *  - bấm thông báo khi app đang mở → mở đúng hội thoại, không tải lại trang
 *  - app hiện lên màn hình → xoá số đỏ trên icon app */
export function SwBridge() {
  const router = useRouter();
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const sw = navigator.serviceWorker;
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type !== "open-url" || typeof e.data.url !== "string") return;
      const u = new URL(e.data.url, location.origin);
      const c = u.searchParams.get("c");
      if (u.pathname === "/inbox" && location.pathname === "/inbox" && c) window.dispatchEvent(new CustomEvent("crm:open-conv", { detail: c }));
      else router.push(u.pathname + u.search);
    };
    const clearBadge = () => {
      if (document.visibilityState !== "visible") return;
      try { (navigator as any).clearAppBadge?.().catch?.(() => {}); } catch {}
      sw.controller?.postMessage({ type: "clear-badge" });
    };
    sw.addEventListener("message", onMsg); sw.startMessages();
    clearBadge(); document.addEventListener("visibilitychange", clearBadge);
    return () => { sw.removeEventListener("message", onMsg); document.removeEventListener("visibilitychange", clearBadge); };
  }, [router]);
  return null;
}
