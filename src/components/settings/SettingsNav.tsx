"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
const groups = [
  { t: "HUB", items: [["/settings/channels", "Kết nối kênh"], ["/settings/labels", "Nhãn hội thoại"], ["/settings/bots", "Bot trả lời bình luận"], ["/settings/distribution?tab=conversation", "Phân phối hội thoại"], ["/settings/other?tab=conversation", "Cài đặt hội thoại"]] },
  { t: "CRM", items: [["/settings/sources", "Nguồn khách hàng"], ["/settings/pipelines", "Cài đặt phễu bán"], ["/settings/automation", "Luồng tự động hoá"], ["/settings/sequences", "Kịch bản nuôi"], ["/settings/distribution?tab=lead", "Phân phối cơ hội"], ["/settings/distribution?tab=user", "Ca làm việc"]] },
  { t: "CẤU HÌNH", items: [["/settings/members", "Nhân sự & Quyền"], ["/settings/other?tab=phone", "Số điện thoại"], ["/settings/other?tab=lost", "Lý do thất bại"], ["/settings/other?tab=emotions", "Cảm xúc khách hàng"], ["/settings/other?tab=company", "Thông tin công ty"]] },
];
export function SettingsNav() {
  const p = usePathname();
  return <div className="w-56 shrink-0 bg-white border-r border-slate-200 p-3 text-sm overflow-auto">{groups.map((g) => <div key={g.t} className="mb-4"><div className="text-[11px] font-semibold text-slate-400 mb-1">{g.t}</div>{g.items.map(([h, l]) => <Link key={h} href={h} className={cn("block rounded px-2 py-1.5 hover:bg-slate-50", p === h.split("?")[0] && "bg-blue-50 text-blue-700")}>{l}</Link>)}</div>)}</div>;
}
