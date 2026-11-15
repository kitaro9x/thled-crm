import { NextRequest, NextResponse } from "next/server";
import * as z from "zod/v4";
import { aiGuard, aiErrorResponse, loadBrainCore, loadConversation, lookupTools, runClaude, salesSystem, Seen, sourcesFrom, wrapTranscript, type CustomerMode } from "@/lib/crm/ai";

export const maxDuration = 60;

const Out = z.object({
  answer: z.string().describe("Câu trả lời cho NHÂN VIÊN, tiếng Việt, ngắn gọn, có thể xuống dòng / gạch đầu dòng '- '"),
  products: z.array(z.object({ code: z.string(), note: z.string().describe("vì sao hợp, vd 'đúng 1m4, có đèn, 3,98tr'") })).describe("Mã sản phẩm phù hợp — chỉ mã có trong kết quả search_products, tối đa 6"),
  notes: z.array(z.string()).describe("Cảnh báo: mâu thuẫn, chưa xác minh, giá lệch, cần hỏi quản lý"),
  sources: z.array(z.string()).describe("path các trang THLED-Brain đã dựa vào"),
});

/** Nhân viên hỏi AI: giá / mẫu / ảnh / chính sách. Trả lời + thẻ sản phẩm thật (giá, ảnh lấy từ DB, không để AI tự viết). */
export async function POST(req: NextRequest) {
  const g = await aiGuard("lookup");
  if ("res" in g) return g.res;
  const { user, db, settings } = g;
  try {
    const body = await req.json();
    const question = String(body.question || "").trim().slice(0, 1000);
    if (!question) return NextResponse.json({ error: "Nhập câu hỏi" }, { status: 400 });
    const conversationId = body.conversation_id ? String(body.conversation_id) : null;
    const ctx = conversationId ? await loadConversation(db, conversationId, 20).catch(() => null) : null;
    const mode: CustomerMode = body.mode === "thau" || body.mode === "le" ? body.mode : ctx?.mode || "le";
    const seen = new Seen();
    const core = await loadBrainCore(db, settings.brain_pinned, seen);
    const prompt = [
      `Nhân viên THLED hỏi bạn (đây là câu hỏi nội bộ, KHÔNG phải tin gửi khách — được nêu mã NCC nếu kho tri thức có).`,
      `Đối tượng khách đang tư vấn: ${mode === "thau" ? "nhà thầu" : "khách lẻ"}.`,
      ctx ? `Ngữ cảnh hội thoại đang mở (tham khảo):\n${wrapTranscript(ctx.lastMessages.join("\n"))}` : "",
      `Câu hỏi: ${question}`,
      `Tra cứu bằng tool trước khi trả lời về giá / mẫu / chính sách. Gợi ý mẫu thì liệt kê mã trong "products" (server tự lấy giá + ảnh thật).`,
    ].filter(Boolean).join("\n\n");

    const { out, model } = await runClaude({
      db, settings, feature: "ask", memberId: user.id, conversationId,
      system: salesSystem(core, settings.shop_notes), prompt, schema: Out, effort: "medium",
      tools: lookupTools(db, seen),
    });
    const products = out.products.map((p) => ({ hit: seen.product(p.code), note: p.note })).filter((x) => x.hit).slice(0, 6)
      .map(({ hit, note }) => ({ code: hit!.code, line: hit!.line_name, price: hit!.price_text, image_url: hit!.image_url, url: hit!.url, specs: hit!.specs, note }));
    return NextResponse.json({ ok: true, mode, model, answer: out.answer, products, notes: out.notes, sources: sourcesFrom(seen, out.sources) });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
