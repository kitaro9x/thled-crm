"use client";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
export function applyTheme(t: "light" | "dark") { document.documentElement.classList.toggle("dark", t === "dark"); }
export function ThemeToggle({ compact }: { compact?: boolean }) {
  const [t, setT] = useState<"light" | "dark">("light");
  useEffect(() => { try { const v = (localStorage.getItem("theme") as "light" | "dark") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); setT(v); applyTheme(v); } catch {} }, []);
  const toggle = () => { const n = t === "dark" ? "light" : "dark"; setT(n); applyTheme(n); try { localStorage.setItem("theme", n); } catch {} };
  return <button onClick={toggle} title={t === "dark" ? "Chuyển giao diện sáng" : "Chuyển giao diện tối"} className={compact ? "flex-1 flex flex-col items-center gap-0.5 py-1.5 text-[10px] hover:text-white" : "w-16 flex flex-col items-center gap-0.5 rounded-md py-2 text-[10px] hover:bg-slate-800 hover:text-white"}>{t === "dark" ? <Sun size={18} /> : <Moon size={18} />}<span>{t === "dark" ? "Sáng" : "Tối"}</span></button>;
}
