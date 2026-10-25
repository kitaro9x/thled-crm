import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { fbAuthUrl } from "@/lib/crm/fb-connect";
import { randomBytes } from "crypto";

/** Bắt đầu OAuth redirect tới Facebook (thay cho popup JS SDK) */
export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  if (!process.env.FB_APP_ID || !process.env.FB_APP_SECRET) return NextResponse.redirect(new URL("/settings/channels?fb_error=" + encodeURIComponent("Server chưa có FB_APP_ID / FB_APP_SECRET (Vercel env + redeploy)"), req.url));
  const origin = process.env.APP_URL || req.nextUrl.origin;
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(fbAuthUrl(origin, state));
  res.cookies.set("fb_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
