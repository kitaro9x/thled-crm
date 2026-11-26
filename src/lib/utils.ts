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

/** Trạng thái đơn hàng: giá trị lưu DB → nhãn tiếng Việt */
export const ORDER_STATUS: Record<string, string> = { new: "Mới", confirmed: "Đã xác nhận", delivering: "Đang giao", done: "Hoàn thành", cancelled: "Huỷ" };

/** Ảnh sản phẩm: đường dẫn tương đối của web thled.vn ("/thietbidien/sp/…") → URL tuyệt đối */
export function absImage(v: unknown): string | null {
  let u: any = v;
  if (typeof u === "string" && /^\s*[[{]/.test(u)) { try { u = JSON.parse(u); } catch { /* giữ nguyên chuỗi */ } }
  if (Array.isArray(u)) u = u[0];
  if (u && typeof u === "object") u = u.src || u.url || null;
  if (typeof u !== "string" || !u.trim()) return null;
  u = u.trim();
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("//")) return "https:" + u;
  return "https://www.thled.vn" + (u.startsWith("/") ? u : "/" + u);
}
