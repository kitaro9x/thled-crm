import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { absImage } from "@/lib/utils";
export const dynamic = "force-dynamic";

export type ProductPick = { key: string; source: string; product_id?: number | null; code?: string | null; name: string; price: number; price_text?: string | null; image?: string | null };

/**
 * Tìm sản phẩm cho form đơn hàng: gộp catalogue landing thled.vn (mã THLED-…, có ảnh, giá) + bảng products cũ.
 * Catalogue landing chỉ đọc được bằng service role (hàm crm_ai_search_products_v2) → đi qua route này, chỉ cho nhân sự CRM đang hoạt động.
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ items: [] });
  const sb = await supabaseServer(); const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await sb.from("crm_members").select("is_active").eq("id", user.id).maybeSingle();
  if (!me?.is_active) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const [cat, old] = await Promise.all([
    supabaseAdmin().rpc("crm_ai_search_products_v2", { q, p_line: null, p_min: null, p_max: null, p_limit: 8, p_co_den: null }).then((r) => (r.data as any[]) || [], () => []),
    sb.from("products").select("id,name,actualPrice,regularPrice,image").ilike("name", `%${q}%`).limit(8).then((r) => (r.data as any[]) || [], () => []),
  ]);
  const items: ProductPick[] = [
    ...cat.map((p) => ({ key: "c:" + p.code, source: "catalog", code: p.code, name: [p.line_name, p.code].filter(Boolean).join(" "), price: Number(p.price_from) || 0, price_text: p.price_text || null, image: absImage(p.image_url) })),
    ...old.map((p) => ({ key: "p:" + p.id, source: "products", product_id: p.id, name: p.name, price: Number(p.actualPrice || p.regularPrice) || 0, image: absImage(p.image) })),
  ];
  return NextResponse.json({ items });
}
