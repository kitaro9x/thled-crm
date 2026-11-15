import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { prepareBrainFile, type BrainChunk, type BrainPage } from "@/lib/crm/brain";

export const maxDuration = 60;

const MAX_BYTES = 3_000_000;
const sameSecret = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/**
 * Nhận bản chụp vùng chung của THLED-Brain do GitHub Action (repo kitaro9x/thled-brain, _tools/dong-bo-crm.py) gửi sang.
 * Body: { commit, files: [{ path, content }] } — header x-brain-secret = BRAIN_SYNC_SECRET.
 * Thay toàn bộ kho (trang không còn trong vault bị xoá). Mọi file ngoài 01-noi-bo-chung/ hoặc vung≠chung bị từ chối.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.BRAIN_SYNC_SECRET || "";
  if (secret.length < 16) return NextResponse.json({ error: "Chưa cấu hình BRAIN_SYNC_SECRET (≥16 ký tự) trên server" }, { status: 503 });
  if (!sameSecret(req.headers.get("x-brain-secret") || "", secret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const raw = await req.text();
  if (raw.length > MAX_BYTES) return NextResponse.json({ error: "payload quá lớn" }, { status: 413 });
  let body: { commit?: string; files?: { path: string; content: string }[]; dry_run?: boolean };
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "JSON không hợp lệ" }, { status: 400 }); }
  if (!Array.isArray(body.files)) return NextResponse.json({ error: "thiếu files[]" }, { status: 400 });

  const pages: BrainPage[] = []; const chunks: BrainChunk[] = [];
  const skipped: { path: string; reason: string }[] = []; const warnings: { path: string; warning: string }[] = [];
  for (const f of body.files) {
    const r = prepareBrainFile(String(f?.path || ""), String(f?.content || ""));
    if (!r.ok) { skipped.push({ path: String(f?.path || "").slice(0, 200), reason: r.reason }); continue; }
    if (pages.some((p) => p.path === r.page.path)) continue;
    pages.push(r.page); chunks.push(...r.chunks);
    for (const w of r.warnings) warnings.push({ path: r.page.path, warning: w });
  }
  if (!pages.length) return NextResponse.json({ error: "Không có trang vùng chung hợp lệ nào — không thay kho", skipped }, { status: 400 });
  const summary = { commit: String(body.commit || "").slice(0, 40) || null, at: new Date().toISOString(), pages: pages.length, chunks: chunks.length, skipped, warnings };
  if (body.dry_run) return NextResponse.json({ ok: true, dry_run: true, ...summary });

  const db = supabaseAdmin();
  const { error } = await db.rpc("crm_brain_replace", { p_pages: pages, p_chunks: chunks });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await db.from("crm_settings").upsert({ key: "brain_sync", value: summary, updated_at: summary.at });
  return NextResponse.json({ ok: true, ...summary });
}
