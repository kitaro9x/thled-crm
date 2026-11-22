import type { AwaySettings } from "@/lib/ai-config";

/** AI trực thay — các hàm thuần (không DB, không mạng) để kiểm thử được. Chốt chặn nằm ở đây, không phụ thuộc AI. */

export const AWAY_SIGNATURE = "[Trợ lý tự động của THLED]";
export type AwayLevel = "live" | "draft" | null;

const fold = (s: string) => (s || "").normalize("NFC").trim().toLowerCase();
const overlap = (a: string[], b: string[]) => { const set = new Set(b.map(fold)); return a.some((x) => set.has(fold(x))); };

/**
 * Hội thoại này AI trực thay được làm tới mức nào?
 * - "live": được gửi thật (nếu Cài đặt đang ở chế độ Gửi thật).
 * - "draft": chỉ soạn nháp vào Nhật ký ca trực, không bao giờ gửi (Zalo có hồ sơ nhưng chưa rõ là khách).
 * - null: không đụng tới (nhóm, bình luận, đã ẩn, nhãn cá nhân, người lạ trên Zalo, kênh tắt).
 */
export function awayLevel(a: AwaySettings, c: { channelType: string | null; kind: string; hidden: boolean; labels: string[]; skipLabels: string[]; hasCustomer: boolean; hasFb: boolean; hasOrder: boolean }): AwayLevel {
  if (c.kind !== "inbox" || c.hidden) return null;
  if (overlap(c.labels, c.skipLabels)) return null;
  if (c.channelType === "fb_page") return a.channels.fb ? "live" : null;
  if (c.channelType === "zalo_personal") {
    if (!a.channels.zalo) return null;
    if (overlap(c.labels, a.customer_labels)) return "live";
    if (c.hasCustomer && (c.hasFb || c.hasOrder)) return "live";
    return c.hasCustomer ? "draft" : null;
  }
  return null;
}

/** Tin của khách có nội dung để trả lời không (bỏ sticker, ảnh không lời, cuộc gọi nhỡ…) */
export const meaningfulText = (t?: string | null) => !!t && !/^[📞📵]/u.test(t.trim()) && (t.match(/[\p{L}\p{N}]/gu) || []).length >= 2;

/**
 * AI có tự gõ số tiền / phần trăm / ưu đãi không? Có → không gửi, chuyển cho người.
 * (Giá do server ghép từ dữ liệu sản phẩm, AI không được tự viết.) Trả về lý do, hoặc null nếu sạch.
 * Không bắt nhầm: 3000K (nhiệt độ màu), 24W, 1m4, Ø600, 5 năm, 30 tháng, hotline viết cách.
 */
export function moneyTalk(text: string): string | null {
  const t = ` ${(text || "").normalize("NFC").toLowerCase()} `;
  const pats: [RegExp, string][] = [
    [/\d{1,3}(?:[.,]\d{3})+/, "có số tiền"],
    [/\d\s*(?:đ|₫)(?![\p{L}])/u, "có số tiền"],
    [/\d\s*(?:vnd|vnđ|đồng|nghìn|nghin|ngàn|ngan|triệu|trieu|củ)(?![\p{L}])/u, "có số tiền"],
    [/\d\s*tr(?:\d|[^\p{L}])/u, "có số tiền"],
    [/[^\d.,]\d{1,3}\s*k(?![\p{L}\p{N}])/u, "có số tiền"],
    [/\d\s*%|phần trăm/, "có phần trăm"],
    [/giảm giá|giảm thêm|giảm còn|bớt giá|chiết khấu|khuyến mãi|khuyến mại|ưu đãi|sale off|tặng kèm|quà tặng|free ?ship|trả góp|đặt cọc|chuyển khoản/, "có nói ưu đãi / thanh toán"],
  ];
  for (const [re, why] of pats) if (re.test(t)) return why;
  return null;
}

/**
 * Chữ "miễn phí" chỉ được dùng khi đúng cụm đó có trong tài liệu cam kết đã nạp (vd "miễn phí bảo trì hậu mãi").
 * Trả về cụm không có căn cứ đầu tiên, hoặc null nếu ổn.
 */
export function ungroundedFree(text: string, knowledge: string): string | null {
  const k = (knowledge || "").normalize("NFC").toLowerCase().replace(/[*_`>|]/g, " ").replace(/\s+/g, " ");
  const t = (text || "").normalize("NFC").toLowerCase().replace(/\s+/g, " ");
  for (const m of t.matchAll(/miễn phí(?: [\p{L}\p{N}]+){0,2}/gu)) if (!k.includes(m[0])) return m[0];
  return null;
}

/** Dọn câu trả lời của AI: bỏ markdown, gộp dòng trống, cắt độ dài ở cuối câu. Zalo: bỏ "https://" (worker gửi link thành thẻ, khó khớp tin dội lại). */
export function cleanReply(text: string, channelType: string | null, max = 600): string {
  let t = (text || "").normalize("NFC")
    .replace(/```[\s\S]*?```/g, " ").replace(/[*_`]{1,3}/g, "").replace(/^\s{0,3}#{1,6}\s+/gm, "").replace(/^\s*[-•]\s+/gm, "- ")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (channelType === "zalo_personal") t = t.replace(/https?:\/\/(?:www\.)?/gi, "");
  if (t.length > max) {
    const cut = t.slice(0, max); const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("ạ."), cut.lastIndexOf("\n"), cut.lastIndexOf("? "));
    t = (end > max * 0.5 ? cut.slice(0, end + 1) : cut).trim();
  }
  return t;
}

/** Ghép tin gửi khách: dòng xưng danh (tin đầu của ca) + lời AI + các dòng "• mã: giá" lấy từ dữ liệu sản phẩm. */
export function composeReply(p: { text: string; first: boolean; products: { code: string; price: string | null }[] }): string {
  const lines = p.products.map((x) => `• ${x.code}: ${x.price ? x.price : "em báo giá sau ạ"}`);
  return [p.first ? AWAY_SIGNATURE : "", p.text, lines.join("\n")].filter(Boolean).join("\n");
}

export const AWAY_ACTION_LABEL: Record<string, string> = { answer: "trả lời", handoff: "giữ khách + báo anh", skip: "bỏ qua", blocked: "bị chặn", error: "lỗi" };
