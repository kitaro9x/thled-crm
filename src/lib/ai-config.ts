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
}
/** Bản gọn gửi xuống trình duyệt (inbox) */
export interface AiPublic { enabled: boolean; features: Record<AiFeature, boolean> }

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
};

/** Giá USD / 1 triệu token (bảng giá Anthropic 11/2026). cacheWrite tính cho TTL 1 giờ (= 2× input). */
export const AI_MODELS = [
  { id: "claude-opus-5-5", name: "Claude Opus 5.5", hint: "Tư vấn tốt nhất — mặc định", in: 4, out: 20, cacheRead: 0.2, fallback: true },
  { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", hint: "Nhanh hơn, ~½ giá Opus", in: 2, out: 10, cacheRead: 0.1, fallback: true },
  { id: "claude-haiku-5-5", name: "Claude Haiku 5.5", hint: "Rẻ nhất, viết kém tinh tế hơn", in: 0.1, out: 0.5, cacheRead: 0.01, fallback: false },
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
  };
}

export const aiPublic = (s: AiSettings): AiPublic => ({ enabled: s.enabled, features: s.features });

/** Chi phí ước tính (USD) của 1 dòng log */
export function aiCostUsd(model: string | null | undefined, u: { input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_write_tokens: number }) {
  const m = AI_MODELS.find((x) => x.id === model) || AI_MODELS[0];
  return (u.input_tokens * m.in + u.output_tokens * m.out + u.cache_read_tokens * m.cacheRead + u.cache_write_tokens * m.in * 2) / 1e6;
}

/** Window events giữa Trợ lý AI (cột phải) và ô soạn tin (Thread) */
export const AI_EVENT_INSERT = "crm:ai-insert"; // detail: { text: string }
export const AI_EVENT_ATTACH = "crm:ai-attach"; // detail: { url: string; name?: string }
export const AI_HIDDEN_KEY = "thled.ai.hidden";
