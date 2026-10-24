import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ingestMessage } from "@/lib/crm/ingest";
/** Worker (Zalo) đẩy tin nhắn vào CRM. Bảo vệ bằng CRON_SECRET. */
export async function POST(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return new NextResponse("forbidden", { status: 403 });
  try { const res = await ingestMessage(supabaseAdmin(), await req.json()); return NextResponse.json({ ok: true, ...res }); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 400 }); }
}
