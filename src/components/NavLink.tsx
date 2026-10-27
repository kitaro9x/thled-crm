"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
export function NavLink({ href, label, icon, compact }: { href: string; label: string; icon: React.ReactNode; compact?: boolean }) {
  const p = usePathname(); const active = p === href || p.startsWith(href + "/");
  return (
    <Link href={href} className={cn("flex flex-col items-center gap-0.5 rounded-md text-[10px] hover:bg-slate-800 hover:text-white", compact ? "flex-1 py-1.5" : "w-16 py-2", active && (compact ? "text-blue-400" : "bg-blue-600 text-white"))}>
      {icon}<span>{label}</span>
    </Link>
  );
}
