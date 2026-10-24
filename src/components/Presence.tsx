"use client";
import { useEffect } from "react";
export function Presence() {
  useEffect(() => {
    const ping = () => fetch("/api/presence", { method: "POST" }).catch(() => {});
    ping(); const t = setInterval(ping, 60000); return () => clearInterval(t);
  }, []);
  return null;
}
