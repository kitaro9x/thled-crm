import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { keywords, lessonForAi, lessonScore, type Lesson } from "@/lib/lessons";

/** Bài học từ hội thoại — phần đọc DB cho Trợ lý AI. Chỉ bài `approved` mới tới được AI. */

const COLS = "id,created_at,status,created_by,conversation_id,approved_at,brain_exported_at,title,situation,handling,outcome,takeaway,sample_reply,customer_type,tags";

async function approved(db: SupabaseClient): Promise<Lesson[]> {
  const { data } = await db.from("crm_ai_lessons").select(COLS).eq("status", "approved").order("approved_at", { ascending: false }).limit(300);
  return (data || []) as Lesson[];
}

/** SĐT của shop (hotline, số nhân viên) — không bị xoá khi ẩn danh bài học */
export async function shopPhones(db: SupabaseClient): Promise<string[]> {
  const { data } = await db.from("crm_settings").select("key,value").in("key", ["phone", "company"]);
  const out: string[] = [];
  for (const r of data || []) {
    if (r.key === "phone" && Array.isArray(r.value?.blacklist)) out.push(...r.value.blacklist.map(String));
    if (r.key === "company" && r.value?.phone) out.push(String(r.value.phone));
  }
  return out;
}

/**
 * Tri thức từ bài học cho 1 lượt AI:
 * - `rules`: các "quy tắc rút ra" mới nhất (ngắn) → đặt trong system prompt (cache được, chỉ đổi khi có bài mới).
 * - `similar`: tối đa 3 bài khớp nhất với nội dung khách đang hỏi → đặt trong prompt của lượt này.
 * Tra hoàn toàn phía server (không thêm lượt gọi tool) nên không làm AI chậm hơn.
 */
export async function lessonContext(db: SupabaseClient, queryText: string): Promise<{ rules: string; similar: string; used: string[] }> {
  const all = await approved(db).catch(() => [] as Lesson[]);
  if (!all.length) return { rules: "", similar: "", used: [] };
  let budget = 4000; const rules: string[] = [];
  for (const l of all) {
    if (!l.takeaway) continue;
    const line = `- ${l.takeaway}${l.customer_type === "thau" ? " (khách thầu)" : ""}`;
    if (line.length > budget) break;
    budget -= line.length; rules.push(line);
  }
  const qw = keywords(queryText);
  const top = all.map((l) => ({ l, s: lessonScore(qw, l) })).filter((x) => x.s >= 2).sort((a, b) => b.s - a.s).slice(0, 3);
  return { rules: rules.join("\n"), similar: top.map((x) => lessonForAi(x.l)).join("\n"), used: top.map((x) => x.l.id) };
}
