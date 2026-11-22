/** Bài học từ hội thoại — phần dùng chung client + server (hàm thuần, không gọi DB). */

export type LessonStatus = "pending" | "approved" | "rejected" | "off";
export interface LessonFields {
  title: string;
  situation: string;
  handling: string;
  outcome: string;
  takeaway: string;
  sample_reply: string;
  customer_type: "le" | "thau" | null;
  tags: string[];
}
export interface Lesson extends LessonFields {
  id: string; created_at: string; status: LessonStatus; created_by: string | null; conversation_id: string | null;
  approved_at: string | null; brain_exported_at: string | null;
}

export const LESSON_TEXT_KEYS = ["title", "situation", "handling", "outcome", "takeaway", "sample_reply"] as const;
const LIMITS: Record<(typeof LESSON_TEXT_KEYS)[number], number> = { title: 140, situation: 1200, handling: 2000, outcome: 600, takeaway: 600, sample_reply: 1200 };

/**
 * Xoá dữ liệu cá nhân của khách trước khi lưu / chép sang THLED-Brain (vault cấm lưu SĐT, địa chỉ khách lẻ):
 * số điện thoại VN (kể cả viết cách bằng dấu chấm / cách / gạch), email, dãy ≥9 chữ số (STK, CCCD), link Zalo/Facebook cá nhân.
 * Giá tiền kiểu "2.980.000" KHÔNG bị xoá (không bắt đầu bằng 0 / +84 và có nhóm 3 số).
 * (Không dùng lookbehind: Safari cũ trên iPhone báo lỗi cú pháp cả file.)
 */
export function scrubPii(text: string, keepPhones: string[] = []): string {
  const keep = new Set(keepPhones.map(phoneDigits));
  return (text || "")
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]")
    .replace(/https?:\/\/(?:zalo\.me|(?:www\.|m\.)?facebook\.com|fb\.com|m\.me)\/\S+/gi, "[link cá nhân]")
    // SĐT của chính shop (hotline, số nhân viên — crm_settings.phone.blacklist) được giữ lại
    .replace(/(^|[^\d.,])((?:\+?84|0)(?:[\s.\-]?\d){9,10})(?!\d)/g, (m, pre: string, num: string) => (keep.has(phoneDigits(num)) ? m : `${pre}[SĐT]`))
    .replace(/(^|[^\d.,])(\d{9,})(?![\d.,]*\d)/g, (m, pre: string, num: string) => (keep.has(phoneDigits(num)) ? m : `${pre}[dãy số]`));
}
const phoneDigits = (p: string) => { const d = (p || "").replace(/\D/g, ""); return d.startsWith("84") && d.length >= 11 ? "0" + d.slice(2) : d; };

/** Còn sót chuỗi giống SĐT không? (kiểm lần cuối trước khi cho bài học rời CRM) */
export const hasPhoneLike = (text: string) => /(^|[^\d.,])(?:\+?84|0)(?:[\s.\-]?\d){9,10}(?!\d)/.test(text || "");

/** Chuẩn hoá bản nháp / bản sửa: cắt độ dài, xoá PII, lọc tag. */
export function cleanLesson(v: Partial<Record<keyof LessonFields, unknown>>, keepPhones: string[] = []): LessonFields {
  const s = (k: (typeof LESSON_TEXT_KEYS)[number]) => scrubPii(String(v[k] ?? "").trim(), keepPhones).slice(0, LIMITS[k]);
  const tags = (Array.isArray(v.tags) ? v.tags : []).map((t) => scrubPii(String(t)).trim().toLowerCase().slice(0, 30)).filter(Boolean);
  return {
    title: s("title"), situation: s("situation"), handling: s("handling"), outcome: s("outcome"), takeaway: s("takeaway"), sample_reply: s("sample_reply"),
    customer_type: v.customer_type === "le" || v.customer_type === "thau" ? v.customer_type : null,
    tags: Array.from(new Set(tags)).slice(0, 8),
  };
}

/** Bỏ dấu tiếng Việt + chữ thường — để so khớp "quat tran" với "quạt trần". */
export const fold = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");
const STOP = new Set(["anh", "chi", "em", "da", "a", "ah", "nha", "nhe", "oi", "la", "co", "khong", "ko", "k", "cho", "cua", "thi", "ma", "va", "voi", "duoc", "nay", "do", "kia", "shop", "ben", "minh", "khach", "the", "nao", "gi", "bao", "nhieu", "roi", "vay", "vang", "ok", "cam", "on", "hoi", "can", "muon", "mot", "cai", "nhung", "cac", "de", "se", "dang", "da", "tu", "trong", "ngoai", "tren", "duoi"]);
export const keywords = (text: string) => Array.from(new Set(fold(text).split(/[^a-z0-9-]+/).filter((w) => w.length >= 2 && !STOP.has(w))));

/** Điểm khớp giữa nội dung khách đang hỏi và 1 bài học (tag + tiêu đề nặng hơn nội dung). */
export function lessonScore(queryWords: string[], l: Pick<LessonFields, "title" | "situation" | "takeaway" | "tags">): number {
  if (!queryWords.length) return 0;
  const head = new Set(keywords(`${l.title} ${l.tags.join(" ")}`));
  const body = new Set(keywords(`${l.situation} ${l.takeaway}`));
  let score = 0;
  for (const w of queryWords) score += head.has(w) ? 2 : body.has(w) ? 1 : 0;
  return score;
}

/** Bài học → văn bản ngắn gọn cho AI */
export const lessonForAi = (l: LessonFields) => [
  `• ${l.title}${l.customer_type ? ` (${l.customer_type === "thau" ? "khách thầu" : "khách lẻ"})` : ""}`,
  l.situation && `  Tình huống: ${l.situation}`,
  l.handling && `  Cách xử lý: ${l.handling}`,
  l.outcome && `  Kết quả: ${l.outcome}`,
  l.takeaway && `  Rút ra: ${l.takeaway}`,
  l.sample_reply && `  Câu trả lời mẫu: ${l.sample_reply}`,
].filter(Boolean).join("\n");

/** Bài học → file markdown cho raw/inbox của THLED-Brain */
export function lessonMarkdown(l: LessonFields & { id: string; approved_at?: string | null }) {
  return [
    `# Bài học từ CRM: ${l.title}`,
    "",
    `> Nguồn: hội thoại trong CRM, AI chắt lọc + admin duyệt${l.approved_at ? ` ngày ${l.approved_at.slice(0, 10)}` : ""}. Đã ẩn danh (không tên, SĐT, địa chỉ khách). Mã bài học: ${l.id}`,
    `> Loại khách: ${l.customer_type === "thau" ? "nhà thầu" : l.customer_type === "le" ? "khách lẻ" : "chưa phân loại"}${l.tags.length ? ` · Thẻ: ${l.tags.join(", ")}` : ""}`,
    "",
    "## Tình huống", l.situation || "(trống)", "",
    "## Cách xử lý", l.handling || "(trống)", "",
    "## Kết quả", l.outcome || "(trống)", "",
    "## Quy tắc rút ra", l.takeaway || "(trống)", "",
    ...(l.sample_reply ? ["## Câu trả lời mẫu", l.sample_reply, ""] : []),
  ].join("\n");
}
