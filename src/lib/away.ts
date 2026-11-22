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

/** Tin của khách có nội dung để trả lời không (bỏ sticker, ảnh không lời, cuộc gọi nhỡ, tin thoại, chỗ giữ kiểu "[Sticker]"…) */
export const meaningfulText = (t?: string | null) => {
  const x = (t || "").trim();
  if (!x || /^[📞📵📹🎤]/u.test(x) || /^\[[^\]]{0,60}\]$/.test(x)) return false;
  return (x.match(/[\p{L}\p{N}]/gu) || []).length >= 2;
};

/** Nhiệt độ màu hay gặp — "3000K", "6500K" không phải tiền; mọi "…k" khác đều coi là tiền. */
const CCT = new Set([2700, 3000, 3200, 3500, 4000, 4200, 4500, 5000, 5500, 5700, 6000, 6500, 7000, 7500]);
/** Đơn vị kỹ thuật đứng sau con số (1.200mm, 12.000lm, 50.000 giờ…) → không phải tiền */
const UNIT = "(?:mm|cm|lm|lumen|w|v|k|giờ|h|vòng|rpm|hz|inch|m2|m²|m3|m³)(?![\\p{L}\\p{N}])";
const NUMW = "(?:\\d|một|mốt|hai|ba|bốn|tư|năm|lăm|sáu|bảy|bẩy|tám|chín|mười|mươi|chục|vài|mấy|dăm|nửa)";
const MONEY: [RegExp, string][] = [
  [new RegExp(`(^|[^\\d])\\d{1,3}(?:[.,]\\d{3})+(?!\\d)(?!\\s*${UNIT})`, "u"), "có số tiền"],            // 2.480.000 · 850,000
  [new RegExp(`(^|[^\\p{L}\\p{N}.,\\-])[1-9]\\d{4,}(?![\\d.,]*\\s*${UNIT})`, "u"), "có số tiền"],        // 2480000 (không bắt mã THLED-79801)
  [/\d\s*(?:đ|₫|vnd|vnđ|đồng|dong|nghin|ngan|trieu)(?![\p{L}])/u, "có số tiền"],                          // 850đ · 2 trieu
  [/(^|[^\p{L}])(?:triệu|nghìn|ngàn)(?![\p{L}])/u, "có số tiền"],                                         // hai triệu rưỡi · vài trăm nghìn
  [new RegExp(`(^|[^\\p{L}])${NUMW}\\s*(?:trăm|củ|chai|lít|xị|tỷ|tỉ)(?![\\p{L}])`, "u"), "có số tiền"],   // 5 trăm · hai củ
  [/\d\s*tr(?:\d|(?![\p{L}]))/u, "có số tiền"],                                                           // 2tr · 2tr5
  [/(^|[^\p{L}])(?:\d|một|hai|ba|bốn|sáu|bảy|tám|chín|mười)\s*rưỡi/u, "có số tiền"],                      // hai rưỡi ("1 năm rưỡi" không bắt)
  [new RegExp(`(^|[^\\p{L}])giá\\s+(?:[\\p{L}]+\\s+){0,3}\\d{3,}(?![\\d.,]*\\s*${UNIT})`, "u"), "có số tiền"],                                             // giá chỉ còn 1850
  [new RegExp(`(^|[^\\p{L}])(?:chỉ|còn|hết|tổng|cộng|tầm|khoảng)\\s+(?:(?:có|là|tầm|khoảng|cộng|hết)\\s+)?\\d{3,}(?![\\d.,]*\\s*${UNIT})`, "u"), "có số tiền"], // còn 1850
  [/%|phần trăm/, "có phần trăm"],
  [/giảm\s+(?:giá|cho|thêm|còn|được|chút|xíu|ít|một|nửa|sâu|mạnh|tiền|\d)|bớt\s+(?:giá|cho|thêm|còn|được|chút|xíu|ít|một|tiền|\d)|nửa giá|chiết khấu|khuyến mãi|khuyến mại|ưu đãi|voucher|coupon|mã giảm|tặng|hoa hồng|giá (?:sỉ|gốc|vốn|nhập|đại lý|thầu|công trình|nội bộ)/u, "có nói ưu đãi"],
  [/trả góp|trả sau|công nợ|gối đầu|chuyển khoản|số tài khoản|hoàn tiền|không (?:tính|mất|thu|tốn|lấy)(?: thêm)? (?:phí|tiền|công)|(^|[^\p{L}])(?:cọc|free(?:\s?ship)?)(?![\p{L}])|(^|[^\p{L}\p{N}])(?:sale|stk|ck)(?![\p{L}\p{N}])/u, "có nói thanh toán / miễn phí"],
];

/**
 * AI có tự gõ số tiền / phần trăm / ưu đãi / chuyện thanh toán không? Có → không gửi, chuyển cho người.
 * (Giá do server ghép từ dữ liệu sản phẩm, AI không được tự viết.) Trả về lý do, hoặc null nếu sạch.
 * Nghi ngờ thì chặn: bắt nhầm chỉ làm tin chuyển sang cho người, còn bỏ lọt là AI tự báo giá.
 * Không bắt nhầm: 3000K (nhiệt độ màu), 24W, 1m4, Ø600, 1.200mm, 5 năm, 30 tháng, hotline, mã THLED-xxxx.
 */
export function moneyTalk(text: string): string | null {
  const t = ` ${(text || "").normalize("NFC").toLowerCase()} `
    .replace(/(^|[^\d])(?:(?:\+?84|0)\d(?:[ .\-]?\d){7,9}|1[89]00(?:[ .\-]?\d){4,6})(?!\d)/g, "$1 ☎ ") // SĐT / hotline
    .replace(/vàng\s*\d{1,2}\s*k(?![\p{L}\p{N}])/gu, " vàng ")                                          // mạ vàng 24K
    .replace(/quà tặng(?! kèm)/g, "quà");                                                                // "làm quà tặng tân gia"
  for (const m of t.matchAll(/(\d[\d.,]*)\s?k(?![\p{L}\p{N}])/gu)) if (!CCT.has(Number(m[1].replace(/[.,]/g, "")))) return "có số tiền"; // 500k · 1500k
  for (const [re, why] of MONEY) if (re.test(t)) return why;
  return null;
}

const DUR = /(\d+) (năm|tháng|tuần|ngày)(?![\p{L}])/gu;
const PARTICLE = new Set(["ạ", "à", "á", "ha", "nha", "nhé", "nhá", "nhen", "nghen", "nè", "luôn", "đó", "đấy", "ơi", "dạ", "vâng", "anh", "chị", "em", "mình", "cho", "ah", "a", "ak"]);
/** Chữ thường, bỏ ký hiệu markdown, mọi dấu câu thành " | " (ranh giới cụm) — để so cụm chữ liền nhau */
const flat = (s: string) => ` ${(s || "").normalize("NFC").toLowerCase().replace(/[*_`#>]/g, " ").replace(/[^\p{L}\p{N}\s]+/gu, " | ").replace(/\s+/g, " ").trim()} `;

/**
 * Lời hứa trong tin của AI có đúng nguyên văn trong tài liệu cam kết đã nạp không? Trả về cụm không có căn cứ đầu tiên, hoặc null nếu ổn.
 * 1. "miễn phí": phải khớp cụm trong tài liệu theo một trong hai chiều — "miễn phí + 2 chữ sau" (vd "miễn phí bảo trì hậu mãi")
 *    hoặc "3 chữ trước + miễn phí" (vd "khảo sát tận nhà miễn phí"). "giao hàng miễn phí", "dạ miễn phí ạ" → không có căn cứ.
 * 2. Thời hạn "N năm / tháng / tuần / ngày" (bảo hành, hẹn giao…): con số đó phải có trong tài liệu.
 * 3. Lời hứa tuyệt đối (trọn đời, vĩnh viễn, 1 đổi 1…): phải có trong tài liệu; "bảo trì / bảo dưỡng định kỳ" thì luôn chặn (tài liệu cấm tự thêm).
 * Giới hạn: chỉ so chữ, không hiểu nghĩa — không bắt được việc gán đúng cam kết cho sai dòng sản phẩm.
 */
export function ungroundedClaim(text: string, knowledge: string): string | null {
  const k = flat(knowledge);
  const t = flat(text);
  for (const clause of t.split("|")) {
    const w = clause.trim().split(" ").filter(Boolean);
    for (let i = 0; i + 1 < w.length; i++) {
      if (w[i] !== "miễn" || w[i + 1] !== "phí") continue;
      const after = w.slice(i + 2).filter((x) => !PARTICLE.has(x)).slice(0, 2);
      const before = w.slice(0, i).filter((x) => !PARTICLE.has(x)).slice(-3);
      const fwd = after.length > 0 && k.includes(` miễn phí ${after.join(" ")} `);
      const back = before.length === 3 && k.includes(` ${before.join(" ")} miễn phí `);
      if (!fwd && !back) return [...before.slice(-2), "miễn phí", ...after].join(" ");
    }
  }
  // thời hạn có trong tài liệu — bỏ những chỗ tài liệu nhắc để PHỦ ĐỊNH (vd "động cơ 5 năm (KHÔNG phải 10 năm)", "ảnh cũ từng ghi 10 năm — sai")
  const kDur = new Set<string>();
  for (const m of k.matchAll(DUR)) {
    const pre = k.slice(Math.max(0, m.index - 32), m.index), post = k.slice(m.index + m[0].length, m.index + m[0].length + 10);
    if (!/không phải|không còn|không được|không tự|từng ghi|ghi sai|đừng/.test(pre) && !/^[\s|]*sai(?![\p{L}])/u.test(post)) kDur.add(`${m[1]} ${m[2]}`);
  }
  for (const m of t.matchAll(DUR)) if (!kDur.has(`${m[1]} ${m[2]}`)) return m[0];
  const always = t.match(/(?:bảo trì|bảo dưỡng|kiểm tra) định kỳ/);
  if (always) return always[0];
  for (const m of t.matchAll(/trọn đời|vĩnh viễn|suốt đời|mãi mãi|1 đổi 1|một đổi một/g)) if (!k.includes(` ${m[0]} `)) return m[0];
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
