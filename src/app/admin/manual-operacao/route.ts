import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { manualResponse } from "@/lib/manuais";

// Manual de Operação: só super-admin (tem detalhes da infraestrutura). Os demais recebem 404.
export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return NextResponse.redirect(new URL("/painel/login", req.url));

  const { data: admin } = await createAdminClient().from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
  if (!admin) return new Response("Not found", { status: 404 });
  return manualResponse("manual-operacao");
}
