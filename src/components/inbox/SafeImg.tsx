"use client";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Ảnh sản phẩm: lỗi tải / không có URL → ô "không có ảnh" thay vì chữ alt vỡ khung. */
export function SafeImg({ src, alt = "", title, className }: { src?: string | null; alt?: string; title?: string; className?: string }) {
  const [bad, setBad] = useState(false);
  useEffect(() => { setBad(false); }, [src]);
  if (!src || bad) return <div className={cn(className, "grid place-items-center bg-slate-100 text-[10px] leading-tight text-slate-400 text-center")} title={title}>không có ảnh</div>;
  return <img src={src} alt={alt} title={title} className={className} loading="lazy" onError={() => setBad(true)} />;
}

/** Đếm giây khi AI đang xử lý — để nhân viên biết vẫn đang chạy */
export function useElapsed(running: boolean) {
  const [s, setS] = useState(0);
  useEffect(() => {
    if (!running) return;
    setS(0); const t0 = Date.now();
    const id = setInterval(() => setS(Math.floor((Date.now() - t0) / 1000)), 500);
    return () => clearInterval(id);
  }, [running]);
  return s;
}
