import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { lessonMarkdown, scrubPii, type Lesson } from "@/lib/lessons";
import { shopPhones } from "@/lib/crm/lessons-server";

/**
 * Cổng cho GitHub Action của repo THLED-Brain (`_tools/lay-bai-hoc-crm.py`) kéo bài học đã duyệt về `raw/inbox/`.
 * Cùng bí mật với brain-sync: header x-brain-secret = BRAIN_SYNC_SECRET.
 * GET  → { lessons: [{ id, date, slug, markdown }] } — chỉ bài `approved`, chưa xuất, đã ẩn danh.
 * POST → { ids: [...] } đánh dấu đã chép (brain_exported_at).
 */
const sameSecret = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
function denied(req: NextRequest) {
  const secret = process.env.BRAIN_SYNC_SECRET || "";
  if (secret.length < 16) return NextResponse.json({ error: "Chưa cấu hình BRAIN_SYNC_SECRET trên server" }, { status: 503 });
  if (!sameSecret(req.headers.get("x-brain-secret") || "", secret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return null;
}
const slugify = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "bai-hoc";

export async function GET(req: NextRequest) {
  const no = denied(req); if (no) return no;
  const db = supabaseAdmin();
  const { data, error } = await db.from("crm_ai_lessons")
    .select("id,approved_at,title,situation,handling,outcome,takeaway,sample_reply,customer_type,tags")
    .eq("status", "approved").is("brain_exported_at", null).order("approved_at", { ascending: true }).limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const keep = await shopPhones(db);
  // ẩn danh lần 2 trước khi rời CRM (lần 1 lúc lưu). SĐT của chính shop (hotline) được giữ — gửi kèm danh sách này
  // để script bên THLED-Brain kiểm độc lập lần 3 và từ chối file còn chuỗi giống SĐT khác.
  const lessons = ((data || []) as Lesson[]).map((l) => ({
    id: l.id, date: (l.approved_at || new Date().toISOString()).slice(0, 10), slug: slugify(l.title), markdown: scrubPii(lessonMarkdown(l), keep),
  }));
  return NextResponse.json({ ok: true, lessons, shop_phones: keep });
}

export async function POST(req: NextRequest) {
  const no = denied(req); if (no) return no;
  const body = await req.json().catch(() => ({}));
  const ids: string[] = (Array.isArray(body.ids) ? body.ids : []).filter((x: unknown) => typeof x === "string").slice(0, 100);
  if (!ids.length) return NextResponse.json({ ok: true, marked: 0 });
  const { data, error } = await supabaseAdmin().from("crm_ai_lessons").update({ brain_exported_at: new Date().toISOString() }).in("id", ids).eq("status", "approved").select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, marked: data?.length || 0 });
}
