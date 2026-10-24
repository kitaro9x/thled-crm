import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fbExchangePages, fbSubscribePage } from "@/lib/crm/facebook";

/** Kết nối Fanpage: client gửi user access token (từ Facebook Login JS SDK) → lưu page token + subscribe webhook */
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { user_token, page_ids } = await req.json();
  const pages = await fbExchangePages(user_token);
  const db = supabaseAdmin();
  const out = [];
  for (const p of pages) {
    if (page_ids?.length && !page_ids.includes(p.id)) continue;
    await fbSubscribePage(p.id, p.access_token);
    const { data } = await db.from("crm_channels").upsert({ type: "fb_page", external_id: p.id, name: p.name, avatar_url: p.picture?.data?.url, status: "connected", credentials: { page_access_token: p.access_token } }, { onConflict: "type,external_id" }).select("id,name").single();
    out.push(data);
  }
  return NextResponse.json({ ok: true, pages: out });
}
