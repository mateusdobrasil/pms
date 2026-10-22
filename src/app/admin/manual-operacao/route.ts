import { NextResponse } from "next/server";
import { ADMIN_2FA_PATH, getAdminSession } from "@/lib/admin";
import { manualResponse } from "@/lib/manuais";

// Manual de Operação: só super-admin com a verificação em duas etapas feita (tem detalhes da infraestrutura).
export async function GET(req: Request) {
  const session = await getAdminSession();
  if (session.status === "anonymous") return NextResponse.redirect(new URL("/painel/login", req.url));
  if (session.status === "not-admin") return new Response("Not found", { status: 404 });
  if (!session.verified) return NextResponse.redirect(new URL(ADMIN_2FA_PATH, req.url));
  return manualResponse("manual-operacao");
}
