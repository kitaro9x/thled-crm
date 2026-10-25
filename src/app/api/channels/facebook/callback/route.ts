import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { connectPagesFromUserToken, fbExchangeCode } from "@/lib/crm/fb-connect";

/** Facebook gọi về sau khi người dùng cấp quyền */
export async function GET(req: NextRequest) {
  const back = (q: string) => NextResponse.redirect(new URL(`/settings/channels?${q}`, req.url));
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  const sp = req.nextUrl.searchParams;
  if (sp.get("error")) return back("fb_error=" + encodeURIComponent(sp.get("error_description") || sp.get("error_reason") || sp.get("error")!));
  const code = sp.get("code"); const state = sp.get("state");
  if (!code || !state || state !== req.cookies.get("fb_oauth_state")?.value) return back("fb_error=" + encodeURIComponent("Phiên đăng nhập không hợp lệ, thử lại."));
  try {
    const origin = process.env.APP_URL || req.nextUrl.origin;
    const token = await fbExchangeCode(origin, code);
    const pages = await connectPagesFromUserToken(token);
    const res = back("fb_ok=" + encodeURIComponent(pages.map((p) => p.name + (p.subscribed ? "" : " (chưa subscribe webhook)")).join(", ")));
    res.cookies.delete("fb_oauth_state");
    return res;
  } catch (e: any) { return back("fb_error=" + encodeURIComponent(e.message)); }
}
