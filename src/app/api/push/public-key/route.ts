import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
export async function GET() {
  const sb = await supabaseServer(); const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data } = await supabaseAdmin().from("crm_secrets").select("value").eq("key", "vapid").maybeSingle();
  return NextResponse.json({ publicKey: (data?.value as any)?.publicKey || null });
}
