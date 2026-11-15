import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { anthropic, getAiSettings, keyInfo } from "@/lib/crm/ai";

const KIND_HINT: Record<string, string> = {
  missing: "Chưa có ANTHROPIC_API_KEY trong bản deploy đang chạy (thêm ở Vercel → Environment Variables, môi trường Production, rồi Redeploy).",
  api: "Đúng loại API key (sk-ant-api…).",
  oauth: "Đây là token đăng nhập Claude (sk-ant-oat…), KHÔNG dùng được cho API. Tạo API key ở console.anthropic.com → API Keys.",
  admin: "Đây là Admin key (sk-ant-admin…), không gọi được model. Tạo API key thường ở console.anthropic.com → API Keys.",
  unknown: "Không giống API key của Anthropic (phải bắt đầu bằng sk-ant-api…). Kiểm tra lại đã dán đúng chưa.",
};

/** Admin bấm "Kiểm tra kết nối": xem key dạng gì + thử gọi Anthropic (models.retrieve — miễn phí, không tốn token). */
export async function POST() {
  const sb = await supabaseServer(); const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = supabaseAdmin();
  const { data: me } = await db.from("crm_members").select("role,is_active").eq("id", user.id).maybeSingle();
  if (me?.role !== "admin" || !me.is_active) return NextResponse.json({ error: "Chỉ admin" }, { status: 403 });

  const info = keyInfo();
  const out: Record<string, unknown> = { key: { ...info, hint: KIND_HINT[info.kind] } };
  if (!info.present) return NextResponse.json({ ok: false, ...out });
  const { model } = await getAiSettings(db);
  try {
    const m = await anthropic().models.retrieve(model);
    return NextResponse.json({ ok: true, ...out, model: m.id, model_name: m.display_name });
  } catch (e: any) {
    const status = e instanceof Anthropic.APIError ? e.status : null;
    const hint = status === 401 ? "Anthropic từ chối key: key sai, đã bị xoá/vô hiệu hoá, hoặc thiếu ký tự. Tạo key mới ở console.anthropic.com → API Keys, dán lại vào Vercel (Production) rồi Redeploy."
      : status === 403 ? "Key không có quyền dùng model này (workspace / tổ chức bị giới hạn)."
      : status === 404 ? `Tài khoản chưa dùng được model ${model} — thử chọn model khác trong trang này.`
      : status === 429 ? "Bị giới hạn tốc độ / hết hạn mức — thử lại sau ít phút, kiểm tra Billing trong Console."
      : "Không kết nối được tới Anthropic.";
    return NextResponse.json({ ok: false, ...out, status, error: String(e?.message || e).slice(0, 300), hint });
  }
}
