import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { mergeAi } from "@/lib/ai-config";

/** Lưu cấu hình Trợ lý AI — chỉ admin (RLS crm_settings cho mọi member ghi nên không cho client upsert key này). */
export async function PUT(req: NextRequest) {
  const sb = await supabaseServer(); const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = supabaseAdmin();
  const { data: me } = await db.from("crm_members").select("role,is_active").eq("id", user.id).maybeSingle();
  if (me?.role !== "admin" || !me.is_active) return NextResponse.json({ error: "Chỉ admin" }, { status: 403 });
  const value = mergeAi(await req.json());
  // phần "AI trực thay" lưu qua /api/ai/away — ở đây giữ nguyên bản đang có trong DB (form này không gửi kèm, tránh ghi đè)
  const { data: cur } = await db.from("crm_settings").select("value").eq("key", "ai").maybeSingle();
  value.away = mergeAi(cur?.value).away;
  value.shop_notes = value.shop_notes.slice(0, 4000);
  value.brain_pinned = value.brain_pinned.filter((p) => p.startsWith("01-noi-bo-chung/")).slice(0, 10);
  const { error } = await db.from("crm_settings").upsert({ key: "ai", value, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, value });
}
