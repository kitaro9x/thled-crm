import type { ChannelType } from "@/lib/types";
const map: Record<string, { label: string; cls: string }> = {
  fb_page: { label: "f", cls: "bg-[#1877f2]" }, zalo_personal: { label: "Z", cls: "bg-[#0068ff]" }, zalo_oa: { label: "OA", cls: "bg-[#0068ff]" },
  web_widget: { label: "W", cls: "bg-emerald-600" }, email: { label: "@", cls: "bg-slate-500" }, tiktok: { label: "T", cls: "bg-black" }, instagram: { label: "IG", cls: "bg-pink-600" },
};
export function ChannelIcon({ type, size = 16 }: { type?: ChannelType | string | null; size?: number }) {
  const m = map[type || ""] || { label: "?", cls: "bg-slate-400" };
  return <span className={`${m.cls} text-white rounded-full grid place-items-center font-bold`} style={{ width: size, height: size, fontSize: size * 0.55 }}>{m.label}</span>;
}
