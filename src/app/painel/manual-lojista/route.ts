import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { manualResponse } from "@/lib/manuais";

// Manual do Lojista: qualquer usuário logado no painel.
export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return NextResponse.redirect(new URL("/painel/login", req.url));
  return manualResponse("manual-lojista");
}
