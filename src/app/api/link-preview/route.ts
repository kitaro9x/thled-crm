import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Đọc OG tags của 1 URL (có cache 7 ngày) để hiện thẻ xem trước link trong inbox */
export async function GET(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const raw = req.nextUrl.searchParams.get("url") || "";
  let url: URL; try { url = new URL(raw.startsWith("http") ? raw : "https://" + raw); } catch { return NextResponse.json({ error: "bad url" }, { status: 400 }); }
  const key = url.toString();
  const db = supabaseAdmin();
  const { data: cached } = await db.from("crm_link_previews").select("*").eq("url", key).maybeSingle();
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < 7 * 86400000) return NextResponse.json(cached);
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(key, { signal: ctrl.signal, headers: { "user-agent": "Mozilla/5.0 (compatible; THLED-CRM/1.0; +https://crm.thled.vn)" }, redirect: "follow" });
    clearTimeout(t);
    const html = (await r.text()).slice(0, 300000);
    const meta = (p: string) => { const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]*content=["']([^"']*)["']`, "i")) || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${p}["']`, "i")); return m?.[1]?.trim() || null; };
    const title = meta("og:title") || html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || url.hostname;
    let image = meta("og:image") || meta("twitter:image"); if (image && image.startsWith("/")) image = url.origin + image;
    const row = { url: key, title, description: meta("og:description") || meta("description"), image, site: meta("og:site_name") || url.hostname, fetched_at: new Date().toISOString() };
    await db.from("crm_link_previews").upsert(row);
    return NextResponse.json(row);
  } catch (e: any) {
    const row = { url: key, title: url.hostname, description: null, image: null, site: url.hostname, fetched_at: new Date().toISOString() };
    await db.from("crm_link_previews").upsert(row);
    return NextResponse.json(row);
  }
}
