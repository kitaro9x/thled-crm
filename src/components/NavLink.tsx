"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
export function NavLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  const p = usePathname(); const active = p === href || p.startsWith(href + "/");
  return (
    <Link href={href} className={cn("w-16 flex flex-col items-center gap-0.5 rounded-md py-2 text-[10px] hover:bg-slate-800 hover:text-white", active && "bg-blue-600 text-white")}>
      {icon}<span>{label}</span>
    </Link>
  );
}
