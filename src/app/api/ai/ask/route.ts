import { NextRequest, NextResponse } from "next/server";
import * as z from "zod/v4";
import { aiGuard, aiErrorResponse, loadBrainCore, loadConversation, lookupTools, runClaude, salesSystem, searchProducts, Seen, sourcesFrom, wrapTranscript, type CustomerMode } from "@/lib/crm/ai";

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
    // khung chat: tối đa 4 lượt hỏi đáp trước (cắt ngắn) để AI hiểu câu hỏi tiếp theo
    const history = (Array.isArray(body.history) ? body.history : []).slice(-4)
      .filter((h: any) => h && typeof h.q === "string" && typeof h.a === "string")
      .map((h: any) => ({ q: h.q.slice(0, 1000), a: h.a.slice(0, 2000), codes: (Array.isArray(h.codes) ? h.codes : []).filter((c: any) => typeof c === "string").slice(0, 6) as string[] }));
    // mã sản phẩm đã gợi ý ở các câu trước → tra sẵn để câu hỏi tiếp ("gửi ảnh mẫu thứ 2", "Sunny 04 bảo hành?") có giá + ảnh thật
    const prevCodes = Array.from(new Set(history.flatMap((h: { codes: string[] }) => h.codes))).slice(-10) as string[];
    if (prevCodes.length) {
      const hits = (await Promise.all(prevCodes.map((c) => searchProducts(db, { q: c, limit: 3 }).catch(() => [])))).flat();
      seen.addProducts(hits.filter((p) => prevCodes.some((c) => c.toLowerCase() === p.code.toLowerCase())));
    }
    const core = await loadBrainCore(db, settings.brain_pinned, seen);
    const prompt = [
      `Nhân viên THLED hỏi bạn (đây là câu hỏi nội bộ, KHÔNG phải tin gửi khách — được nêu mã NCC nếu kho tri thức có).`,
      `Đối tượng khách đang tư vấn: ${mode === "thau" ? "nhà thầu" : "khách lẻ"}.`,
      ctx ? `Ngữ cảnh hội thoại đang mở (tham khảo):\n${wrapTranscript(ctx.lastMessages.join("\n"))}` : "",
      history.length ? `Đây là câu hỏi TIẾP THEO trong cuộc hỏi đáp ở trên — hiểu theo ngữ cảnh các câu trước (vd "loại đó", "mẫu thứ 2", "còn màu khác không"). Mã sản phẩm đã gợi ý trước đó: ${prevCodes.join(", ") || "không có"} (dùng lại được trong "products" mà không cần tra lại).` : "",
      `Câu hỏi: ${question}`,
      `Giá / mẫu / ảnh: tra bằng search_products (gọi song song nếu cần nhiều nhóm). Chính sách đã có trong kho tri thức nạp sẵn thì trả lời luôn; chưa có mới gọi search_brain. Gợi ý mẫu thì liệt kê mã trong "products" (server tự lấy giá + ảnh thật). answer ngắn gọn, tối đa ~8 dòng.`,
    ].filter(Boolean).join("\n\n");

    const { out, model } = await runClaude({
      db, settings, feature: "ask", memberId: user.id, conversationId,
      system: salesSystem(core, settings.shop_notes), prompt, schema: Out, effort: "low", maxIterations: 3,
      tools: lookupTools(db, seen), history: history.map((h: { q: string; a: string }) => ({ q: h.q, a: h.a })),
    });
    const products = out.products.map((p) => ({ hit: seen.product(p.code), note: p.note })).filter((x) => x.hit).slice(0, 6)
      .map(({ hit, note }) => ({ code: hit!.code, line: hit!.line_name, price: hit!.price_text, image_url: hit!.image_url, url: hit!.url, specs: hit!.specs, note }));
    return NextResponse.json({ ok: true, mode, model, answer: out.answer, products, notes: out.notes, sources: sourcesFrom(seen, out.sources) });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
