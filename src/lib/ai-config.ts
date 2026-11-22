/** Cấu hình Trợ lý AI dùng chung client + server (không import gì phía server ở đây). */
export type AiFeature = "summary" | "suggest" | "lookup";
export interface AiSettings {
  enabled: boolean;
  model: string;
  features: Record<AiFeature, boolean>;
  /** Trang THLED-Brain luôn nạp vào prompt (path trong 01-noi-bo-chung/) */
  brain_pinned: string[];
  /** Ghi chú thêm cho AI: giờ mở cửa, phí giao, khuyến mãi đang chạy… */
  shop_notes: string;
  /** Chế độ nhanh (fast mode) — chỉ Opus 5.5: sinh chữ nhanh ~2,5×, giá ×2 */
  fast: boolean;
  /** AI trực thay khi chủ shop nghỉ (tự trả lời khách trong phạm vi an toàn) */
  away: AwaySettings;
}
export interface AwaySettings {
  /** bật tay; `on_at` = lúc bật (mốc đầu ca), `until` = giờ tự tắt (null = tới khi tắt tay) */
  on: boolean; on_at: string | null; until: string | null;
  /** lịch hằng ngày theo giờ Việt Nam "HH:MM"; from > to = qua nửa đêm */
  schedule: { enabled: boolean; from: string; to: string };
  /** shadow = chạy thử: AI soạn nháp vào nhật ký, KHÔNG gửi · live = gửi thật */
  mode: "shadow" | "live";
  channels: { fb: boolean; zalo: boolean };
  /** Zalo: nhãn hội thoại chứng tỏ là khách (đủ để AI được gửi thật) */
  customer_labels: string[];
  max_per_conv: number; max_per_hour: number; max_per_day: number;
  /** câu giữ khách khi AI không được tự trả lời (mặc cả, chốt đơn, khiếu nại…) */
  handoff_text: string;
}
/** Bản gọn gửi xuống trình duyệt (inbox) */
export interface AiPublic { enabled: boolean; features: Record<AiFeature, boolean>; away: { active: boolean; on: boolean; mode: "shadow" | "live" } }

export const AWAY_DEFAULTS: AwaySettings = {
  on: false, on_at: null, until: null,
  schedule: { enabled: false, from: "21:00", to: "07:00" },
  mode: "shadow",
  channels: { fb: true, zalo: true },
  customer_labels: ["Khách hàng", "Thầu", "KHách VIP"],
  max_per_conv: 4, max_per_hour: 20, max_per_day: 100,
  handoff_text: "Dạ em đã ghi nhận ạ. Nhân viên THLED sẽ liên hệ lại anh/chị trong thời gian sớm nhất ạ.",
};

export const AI_DEFAULTS: AiSettings = {
  enabled: false,
  model: "claude-opus-5-5",
  features: { summary: true, suggest: true, lookup: true },
  brain_pinned: [
    "01-noi-bo-chung/tu-van-khach/cam-ket-dich-vu.md",
    "01-noi-bo-chung/dao-tao/so-tay-van-hoa-thled.md",
    "01-noi-bo-chung/tu-van-khach/chinh-sach-khach-thau.md",
  ],
  shop_notes: "",
  fast: false,
  away: AWAY_DEFAULTS,
};

/** Giá USD / 1 triệu token (bảng giá Anthropic 11/2026). cacheWrite tính cho TTL 1 giờ (= 2× input). */
export const AI_MODELS = [
  { id: "claude-opus-5-5", name: "Claude Opus 5.5", hint: "Tư vấn tốt nhất — mặc định", in: 4, out: 20, cacheRead: 0.2, fallback: true, fast: true },
  { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", hint: "Nhanh hơn, ~½ giá Opus", in: 2, out: 10, cacheRead: 0.1, fallback: true, fast: false },
  { id: "claude-haiku-5-5", name: "Claude Haiku 5.5", hint: "Rẻ & nhanh nhất, viết kém tinh tế hơn", in: 0.1, out: 0.5, cacheRead: 0.01, fallback: false, fast: false },
] as const;
export const USD_VND = 26000;

export function mergeAi(v: unknown): AiSettings {
  const o = (v && typeof v === "object" ? v : {}) as Partial<AiSettings>;
  return {
    enabled: !!o.enabled,
    model: AI_MODELS.some((m) => m.id === o.model) ? (o.model as string) : AI_DEFAULTS.model,
    features: { ...AI_DEFAULTS.features, ...(o.features || {}) },
    brain_pinned: Array.isArray(o.brain_pinned) ? o.brain_pinned.filter((x) => typeof x === "string") : AI_DEFAULTS.brain_pinned,
    shop_notes: typeof o.shop_notes === "string" ? o.shop_notes : "",
    fast: !!o.fast,
    away: mergeAway(o.away),
  };
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const clampInt = (v: unknown, lo: number, hi: number, d: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const isoOrNull = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);
export function mergeAway(v: unknown): AwaySettings {
  const o = (v && typeof v === "object" ? v : {}) as Partial<AwaySettings>; const d = AWAY_DEFAULTS;
  return {
    on: !!o.on, on_at: isoOrNull(o.on_at), until: isoOrNull(o.until),
    schedule: { enabled: !!o.schedule?.enabled, from: HHMM.test(o.schedule?.from || "") ? o.schedule!.from : d.schedule.from, to: HHMM.test(o.schedule?.to || "") ? o.schedule!.to : d.schedule.to },
    mode: o.mode === "live" ? "live" : "shadow",
    channels: { fb: o.channels?.fb !== false, zalo: o.channels?.zalo !== false },
    customer_labels: Array.isArray(o.customer_labels) ? o.customer_labels.filter((x) => typeof x === "string" && x.trim()).slice(0, 20) : d.customer_labels,
    max_per_conv: clampInt(o.max_per_conv, 1, 10, d.max_per_conv), max_per_hour: clampInt(o.max_per_hour, 1, 60, d.max_per_hour), max_per_day: clampInt(o.max_per_day, 1, 500, d.max_per_day),
    handoff_text: typeof o.handoff_text === "string" && o.handoff_text.trim() ? o.handoff_text.trim().slice(0, 400) : d.handoff_text,
  };
}

/** Phút trong ngày theo giờ Việt Nam (UTC+7 cố định — server Vercel chạy UTC) */
const vnMinutes = (t: Date) => (t.getUTCHours() * 60 + t.getUTCMinutes() + 7 * 60) % 1440;
const hhmm = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
const inSchedule = (a: AwaySettings, now: Date) => {
  if (!a.schedule.enabled) return false;
  const f = hhmm(a.schedule.from), t = hhmm(a.schedule.to), m = vnMinutes(now);
  if (f === t) return false;                       // khung rỗng: coi như không đặt lịch
  return f < t ? m >= f && m < t : m >= f || m < t; // f > t: qua nửa đêm
};
const manualOn = (a: AwaySettings, now: Date) => a.on && (!a.until || new Date(a.until).getTime() > now.getTime());
/** AI trực thay có đang chạy không: AI tổng phải bật, và (bật tay còn hạn hoặc đang trong khung giờ). */
export const awayActive = (s: AiSettings, now = new Date()) => s.enabled && (manualOn(s.away, now) || inSchedule(s.away, now));
/** Mốc đầu ca hiện tại (để đếm giới hạn / gắn dòng giới thiệu ở tin đầu). Không trực → null. */
export function awaySessionStart(s: AiSettings, now = new Date()): Date | null {
  if (!awayActive(s, now)) return null;
  const starts: number[] = [];
  if (manualOn(s.away, now)) starts.push(s.away.on_at ? new Date(s.away.on_at).getTime() : now.getTime() - 12 * 3600_000);
  if (inSchedule(s.away, now)) { const back = (vnMinutes(now) - hhmm(s.away.schedule.from) + 1440) % 1440; starts.push(now.getTime() - back * 60_000); }
  return new Date(Math.min(...starts));
}

export const aiPublic = (s: AiSettings, now = new Date()): AiPublic => ({ enabled: s.enabled, features: s.features, away: { active: awayActive(s, now), on: s.away.on, mode: s.away.mode } });

/** Chi phí ước tính (USD) của 1 dòng log. Chế độ nhanh (speed = fast) tính ×2. */
export function aiCostUsd(model: string | null | undefined, u: { input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_write_tokens: number; speed?: string | null }) {
  const m = AI_MODELS.find((x) => x.id === model) || AI_MODELS[0];
  const x = u.speed === "fast" ? 2 : 1;
  return x * (u.input_tokens * m.in + u.output_tokens * m.out + u.cache_read_tokens * m.cacheRead + u.cache_write_tokens * m.in * 2) / 1e6;
}

/** Tên file đính kèm theo đúng đuôi ảnh (Zalo nhận jpg/png/webp là ảnh) */
export const imageName = (code: string, url: string) => `${code.replace(/[^\p{L}\p{N}-]+/gu, "_")}.${(url.split("?")[0].split(".").pop() || "jpg").toLowerCase().slice(0, 5)}`;

/** Window events giữa Trợ lý AI (cột phải) và ô soạn tin (Thread) */
export const AI_EVENT_INSERT = "crm:ai-insert"; // detail: { text: string }
export const AI_EVENT_ATTACH = "crm:ai-attach"; // detail: { url: string; name?: string }
export const AI_HIDDEN_KEY = "thled.ai.hidden";
