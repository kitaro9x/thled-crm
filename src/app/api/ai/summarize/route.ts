import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** AI tóm tắt hội thoại + nhận diện cảm xúc (dùng Anthropic API). Cần ANTHROPIC_API_KEY. */
export async function POST(req: NextRequest) {
  const sb = await supabaseServer(); const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "Chưa cấu hình ANTHROPIC_API_KEY trên Vercel" }, { status: 400 });
  const { conversation_id } = await req.json();
  const db = supabaseAdmin();
  // gom mọi hội thoại của cùng khách (FB + Zalo) để tóm tắt đủ ngữ cảnh
  const { data: cv } = await db.from("crm_conversations").select("id,customer_id,kind").eq("id", conversation_id).single();
  let ids = [conversation_id];
  if (cv?.customer_id) { const { data: sib } = await db.from("crm_conversations").select("id").eq("customer_id", cv.customer_id); ids = (sib || []).map((x) => x.id); }
  const [{ data: msgs }, { data: emotions }] = await Promise.all([
    db.from("crm_messages").select("direction,text,sent_at,attachments,sender_name").in("conversation_id", ids).order("sent_at", { ascending: false }).limit(120),
    db.from("crm_emotions").select("key,name,prompt").order("sort_order"),
  ]);
  const dd = (iso: string) => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours() + 7 > 23 ? (d.getHours() + 7) % 24 : d.getHours() + 7).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
  const transcript = (msgs || []).reverse().map((m: any) => `[${dd(m.sent_at)}] ${m.direction === "in" ? (cv?.kind === "group" && m.sender_name ? m.sender_name : "Khách") : "Shop"}: ${m.text || (m.attachments?.length ? `[${m.attachments[0].type === "image" ? "ảnh" : "tệp"}]` : "[tin nhắn]")}`).join("\n");
  const emoList = (emotions || []).map((e) => `- ${e.key} (${e.name}): ${e.prompt}`).join("\n");
  const prompt = `Bạn là trợ lý CRM của showroom đèn trang trí & quạt trần THLED (Đồng Nai). Đọc hội thoại (mới nhất ở cuối) và trả về DUY NHẤT một JSON:
{"summary": "...", "next_action": "...", "emotion": "<key>", "phone": "<sđt khách nếu có, else null>", "product_interest": "<sản phẩm/mã THLED khách quan tâm, else null>", "stage": "<hỏi giá|đang tư vấn|đã báo giá|chốt đơn|đã giao|bảo hành|khác>"}
- summary: 2–4 câu tiếng Việt, nói đủ: khách cần gì (loại đèn/quạt, số lượng, kích thước, ngân sách nếu có), shop đã tư vấn/báo giá gì, đã chốt hay chưa, có vướng mắc gì.
- next_action: 1 câu — việc cụ thể shop cần làm tiếp (vd "Gửi báo giá mâm pha lê 80cm", "Gọi xác nhận lịch lắp thứ 5"); nếu không có thì "Không cần làm gì".
- Nếu là nhóm Zalo (nhiều người), tóm tắt theo chủ đề chung của nhóm.
Danh sách cảm xúc (chọn đúng 1 key):\n${emoList}\n\nHội thoại:\n${transcript}`;
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: 600, messages: [{ role: "user", content: prompt }] }) });
  const j = await r.json();
  if (!r.ok) return NextResponse.json({ error: "Anthropic: " + (j?.error?.message || r.status) }, { status: 400 });
  const text: string = j?.content?.[0]?.text || "{}";
  let out: any = {}; try { out = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch {}
  const summaryText = [out.summary, out.next_action && out.next_action !== "Không cần làm gì" ? "👉 " + out.next_action : null].filter(Boolean).join("\n");
  await db.from("crm_conversations").update({ ai_summary: summaryText, emotion: out.emotion }).in("id", ids);
  const { data: conv } = await db.from("crm_conversations").select("customer_id").eq("id", conversation_id).single();
  if (conv?.customer_id) { const patch: any = { emotion: out.emotion }; if (out.product_interest) patch.custom = { sp_quan_tam: out.product_interest }; await db.from("crm_customers").update(patch).eq("id", conv.customer_id); }
  return NextResponse.json({ ok: true, ...out, summary: summaryText, at: new Date().toISOString() });
}
