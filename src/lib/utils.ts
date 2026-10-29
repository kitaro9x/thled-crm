import { clsx, type ClassValue } from "clsx";
import { formatDistanceToNowStrict, format } from "date-fns";
import { vi } from "date-fns/locale";
export const cn = (...a: ClassValue[]) => clsx(a);
export const money = (n?: number | string | null) =>
  new Intl.NumberFormat("vi-VN").format(Number(n ?? 0)) + "đ";
export const ago = (d?: string | null) => (d ? formatDistanceToNowStrict(new Date(d), { locale: vi, addSuffix: true }) : "");
export const dt = (d?: string | null, f = "HH:mm dd/MM") => (d ? format(new Date(d), f) : "");
export const initials = (s?: string | null) => (s || "?").trim().split(/\s+/).slice(-2).map((w) => w[0]).join("").toUpperCase();

/** Tên hiển thị hội thoại: tên đặt trong CRM (meta.alias) > tên khách > tên trên kênh */
export function convName(c: { meta?: any; person_name?: string | null; display_name?: string | null; external_id?: string } | null | undefined) {
  if (!c) return "";
  return c.meta?.alias || c.person_name || c.display_name || c.external_id || "";
}
