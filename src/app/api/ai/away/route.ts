import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentMember } from "@/lib/crm/work-items-server";
import { awayActive, mergeAi, mergeAway } from "@/lib/ai-config";

/**
 * Lưu cấu hình "AI trực thay khi nghỉ" (chỉ admin). Body = một phần của AwaySettings — chỉ ghi đè các trường được gửi.
 * Bật tay (on: false → true) thì ghi `on_at` = bây giờ: đó là mốc đầu ca để đếm giới hạn và gắn dòng xưng danh.
 */
export async function PUT(req: NextRequest) {
  const me = await currentMember();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (me.role !== "admin") return NextResponse.json({ error: "Chỉ admin" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const db = supabaseAdmin();
  const { data: cur } = await db.from("crm_settings").select("value").eq("key", "ai").maybeSingle();
  const settings = mergeAi(cur?.value);
  const prev = settings.away;
  const next = mergeAway({ ...prev, ...(body && typeof body === "object" ? body : {}), schedule: { ...prev.schedule, ...(body?.schedule || {}) }, channels: { ...prev.channels, ...(body?.channels || {}) } });
  next.on_at = next.on ? (prev.on && prev.on_at ? prev.on_at : new Date().toISOString()) : null;
  if (!next.on) next.until = null;
  if (next.until && new Date(next.until).getTime() <= Date.now()) return NextResponse.json({ error: "Giờ tự tắt phải ở tương lai" }, { status: 400 });
  const value = { ...settings, away: next };
  const { error } = await db.from("crm_settings").upsert({ key: "ai", value, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, away: next, active: awayActive(value), ai_enabled: settings.enabled });
}
