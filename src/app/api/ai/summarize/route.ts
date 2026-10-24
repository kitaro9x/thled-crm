import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** AI tóm tắt hội thoại + nhận diện cảm xúc (dùng Anthropic API). Cần ANTHROPIC_API_KEY. */
export async function POST(req: NextRequest) {
  const sb = await supabaseServer(); const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "missing ANTHROPIC_API_KEY" }, { status: 400 });
  const { conversation_id } = await req.json();
  const db = supabaseAdmin();
  const [{ data: msgs }, { data: emotions }] = await Promise.all([
    db.from("crm_messages").select("direction,text,sent_at").eq("conversation_id", conversation_id).order("created_at", { ascending: false }).limit(60),
    db.from("crm_emotions").select("key,name,prompt").order("sort_order"),
  ]);
  const transcript = (msgs || []).reverse().map((m) => `${m.direction === "in" ? "Khách" : "Shop"}: ${m.text || "[file]"}`).join("\n");
  const emoList = (emotions || []).map((e) => `- ${e.key} (${e.name}): ${e.prompt}`).join("\n");
  const prompt = `Bạn là trợ lý CRM của showroom đèn & quạt THLED Đồng Nai. Đọc hội thoại và trả về JSON {"summary": "...", "emotion": "<key>", "phone": "<sđt nếu có>", "product_interest": "..."}.
Tóm tắt ≤ 3 câu tiếng Việt: khách cần gì, đã báo giá chưa, việc cần làm tiếp.
Danh sách cảm xúc (chọn đúng 1 key):\n${emoList}\n\nHội thoại:\n${transcript}`;
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: 400, messages: [{ role: "user", content: prompt }] }) });
  const j = await r.json(); const text: string = j?.content?.[0]?.text || "{}";
  let out: any = {}; try { out = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch {}
  await db.from("crm_conversations").update({ ai_summary: out.summary, emotion: out.emotion }).eq("id", conversation_id);
  const { data: conv } = await db.from("crm_conversations").select("customer_id").eq("id", conversation_id).single();
  if (conv?.customer_id) { const patch: any = { emotion: out.emotion }; if (out.product_interest) patch.custom = { sp_quan_tam: out.product_interest }; await db.from("crm_customers").update(patch).eq("id", conv.customer_id); }
  return NextResponse.json({ ok: true, ...out });
}
