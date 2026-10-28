import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageSquare, Target, CheckSquare, Users, BookOpen, ShoppingCart, BarChart3, Settings } from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import { Presence } from "@/components/Presence";
import { NavLink } from "@/components/NavLink";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PushToggle } from "@/components/PushToggle";

const nav = [
  { href: "/inbox", label: "Hội thoại", icon: MessageSquare },
  { href: "/leads", label: "Cơ hội", icon: Target },
  { href: "/activities", label: "Hành động", icon: CheckSquare },
  { href: "/cdp", label: "CDP", icon: Users },
  { href: "/knowledge", label: "Tri thức", icon: BookOpen },
  { href: "/orders", label: "Đơn hàng", icon: ShoppingCart },
  { href: "/reports", label: "Báo cáo", icon: BarChart3 },
  { href: "/settings", label: "Cài đặt", icon: Settings },
];

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await sb.from("crm_members").select("name,role,is_active").eq("id", user.id).maybeSingle();
  if (!me || !me.is_active) {
    return (
      <div className="min-h-screen grid place-items-center p-6 text-center">
        <div className="card p-6 max-w-md">
          <div className="font-semibold mb-2">Tài khoản chưa được thêm vào CRM</div>
          <p className="text-slate-600 text-sm">Nhờ admin thêm email <b>{user.email}</b> vào bảng <code>crm_members</code> (xem README).</p>
          <form action="/auth/signout" method="post" className="mt-4"><button className="btn">Đăng xuất</button></form>
        </div>
      </div>
    );
  }
  return (
    <div className="h-[100dvh] flex flex-col md:flex-row">
      <aside className="hidden md:flex w-[72px] shrink-0 bg-slate-900 text-slate-300 flex-col items-center py-3 gap-1">
        <Link href="/inbox" className="mb-2 text-white font-black text-lg">TH</Link>
        {nav.map((n) => <NavLink key={n.href} href={n.href} label={n.label} icon={<n.icon size={20} />} />)}
        <div className="mt-auto"><PushToggle /><ThemeToggle /></div>
        <div className="text-[10px] text-center px-1 leading-tight">
          <div className="w-8 h-8 mx-auto rounded-full bg-blue-600 text-white grid place-items-center font-bold mb-1">{me.name.slice(0, 1)}</div>
          <div className="truncate">{me.name}</div>
        </div>
      </aside>
      <main className="flex-1 min-w-0 min-h-0 overflow-hidden">{children}</main>
      {/* thanh điều hướng đáy cho điện thoại */}
      <nav className="md:hidden shrink-0 bg-slate-900 text-slate-300 flex justify-around border-t border-slate-800 pb-[env(safe-area-inset-bottom)]">
        {/* điện thoại chỉ dùng để chat/chốt: bỏ CDP, Tri thức, Cài đặt (chỉnh trên máy tính) */}
        {nav.filter((n) => ["/inbox", "/leads", "/activities", "/orders"].includes(n.href)).map((n) => <NavLink key={n.href} href={n.href} label={n.label} icon={<n.icon size={18} />} compact />)}
        <PushToggle compact />
        <ThemeToggle compact />
      </nav>
      <Presence />
    </div>
  );
}
