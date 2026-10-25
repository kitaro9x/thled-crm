import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { connectPagesFromUserToken } from "@/lib/crm/fb-connect";

/** Kết nối Fanpage bằng user access token (đường dự phòng: JS SDK hoặc token dán tay từ Graph API Explorer) */
export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { user_token, page_ids } = await req.json();
  if (!user_token) return NextResponse.json({ error: "Thiếu user_token" }, { status: 400 });
  try { const pages = await connectPagesFromUserToken(user_token, page_ids); return NextResponse.json({ ok: true, pages }); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 400 }); }
}
