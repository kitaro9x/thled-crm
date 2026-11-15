import { NextRequest, NextResponse } from "next/server";
import * as z from "zod/v4";
import { aiGuard, aiErrorResponse, loadBrainCore, loadConversation, lookupTools, productForAi, runClaude, salesSystem, searchProducts, Seen, sourcesFrom, wrapTranscript, type CustomerMode } from "@/lib/crm/ai";

export const maxDuration = 60;

const Out = z.object({
  need: z.string().describe("Khách đang cần gì (1 câu, cho nhân viên)"),
  missing: z.string().describe("Thông tin còn thiếu nên hỏi thêm (kích thước phòng, trần cao, ngân sách, địa chỉ lắp…); không thiếu thì chuỗi rỗng"),
  notes: z.array(z.string()).describe("Cảnh báo cho nhân viên: thông tin mâu thuẫn/chưa xác minh, giá lệch, cần hỏi quản lý…"),
  suggestions: z.array(z.object({
    style: z.string().describe("Nhãn ngắn: Ngắn gọn | Tư vấn kỹ | Chốt đơn | …"),
    text: z.string().describe("Nguyên văn tin nhắn gửi khách, không markdown"),
    attach_codes: z.array(z.string()).describe("Mã sản phẩm (đã tra được) nên gửi kèm ảnh, tối đa 4"),
  })),
  sources: z.array(z.string()).describe("path các trang THLED-Brain đã dựa vào"),
});

const CODE_RE = /\bTHLED-[A-Z0-9]{2,8}\b/gi;

/** AI gợi ý 2–3 câu trả lời cho tin gần nhất của khách. Nhân viên bấm chọn → vào ô soạn tin, KHÔNG tự gửi. */
export async function POST(req: NextRequest) {
  const g = await aiGuard("suggest");
  if ("res" in g) return g.res;
  const { user, db, settings } = g;
  try {
    const body = await req.json();
    const conversationId = String(body.conversation_id || "");
    const hint = typeof body.hint === "string" ? body.hint.slice(0, 300) : "";
    const ctx = await loadConversation(db, conversationId, 40);
    const mode: CustomerMode = body.mode === "thau" || body.mode === "le" ? body.mode : ctx.mode;
    const seen = new Seen();

    // mã THLED-xxxx khách/shop vừa nhắc → tra sẵn, đỡ 1 vòng gọi tool
    const codes = Array.from(new Set((ctx.lastMessages.join("\n").match(CODE_RE) || []).map((c) => c.toUpperCase()))).slice(-5);
    const pre = (await Promise.all(codes.map((c) => searchProducts(db, { q: c, limit: 3 }).catch(() => [])))).flat().filter((p) => codes.includes(p.code.toUpperCase()));
    seen.addProducts(pre);

    const core = await loadBrainCore(db, settings.brain_pinned, seen);
    const lastIsCustomer = ctx.lastDirection !== "out";
    const g2 = ctx.person?.gender ? String(ctx.person.gender).toLowerCase() : "";
    const prompt = [
      `Chế độ khách: ${mode === "thau" ? "THẦU (nhà thầu / công trình)" : "LẺ (khách mua cho nhà ở)"}`,
      `Kênh: ${ctx.conv.channel_type === "fb_page" ? "Facebook Messenger" : ctx.conv.channel_type?.startsWith("zalo") ? "Zalo" : ctx.conv.channel_type || "?"}${ctx.conv.kind === "group" ? " (nhóm)" : ""}`,
      `Khách: ${ctx.person?.name || ctx.conv.display_name || "chưa rõ tên"}${g2 ? ` · giới tính: ${g2}` : ""} · đã có SĐT: ${ctx.person?.has_phone ? "có" : "chưa"}${ctx.person?.sp_quan_tam ? ` · quan tâm: ${ctx.person.sp_quan_tam}` : ""}`,
      ctx.labelNames.length ? `Nhãn hội thoại: ${ctx.labelNames.join(", ")}` : "",
      ctx.conv.ai_summary ? `Tóm tắt trước đó:\n${ctx.conv.ai_summary}` : "",
      pre.length ? `Sản phẩm được nhắc trong chat (đã tra sẵn):\n${JSON.stringify(pre.map(productForAi))}` : "",
      hint ? `Nhân viên muốn hướng trả lời: ${hint}` : "",
      wrapTranscript(ctx.lastMessages.join("\n")),
      `Nhiệm vụ: ${lastIsCustomer ? "soạn câu trả lời cho (các) tin nhắn mới nhất của khách" : "tin cuối là của shop — soạn tin chăm sóc / nhắc lại phù hợp, không lặp lại ý shop vừa gửi"}.
- Tra cứu bằng tool khi cần giá / mẫu / chính sách (không đoán).
- Đưa 3 phương án khác nhau (vd Ngắn gọn / Tư vấn kỹ / Chốt đơn — hoặc theo hướng nhân viên muốn); mỗi phương án là nguyên văn tin gửi khách, 1–5 câu.
- Thiếu thông tin để báo giá chính xác thì phương án nên khéo léo hỏi thêm.
- attach_codes chỉ chứa mã đã có trong kết quả tra cứu.`,
    ].filter(Boolean).join("\n\n");

    const { out, model } = await runClaude({
      db, settings, feature: "suggest", memberId: user.id, conversationId,
      system: salesSystem(core, settings.shop_notes), prompt, schema: Out, effort: "low",
      tools: lookupTools(db, seen),
    });

    const suggestions = out.suggestions.slice(0, 3).map((s) => ({
      style: s.style, text: s.text.trim(),
      images: s.attach_codes.map((c) => seen.product(c)).filter((p) => p?.image_url).slice(0, 4).map((p) => ({ url: p!.image_url!, code: p!.code, price: p!.price_text })),
    })).filter((s) => s.text);
    return NextResponse.json({ ok: true, mode, model, need: out.need, missing: out.missing, notes: out.notes, suggestions, sources: sourcesFrom(seen, out.sources) });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
