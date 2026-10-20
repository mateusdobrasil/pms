import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Domínios da plataforma (painel/site). Qualquer outro host é tratado como loja.
const ROOT_DOMAINS = (process.env.NEXT_PUBLIC_ROOT_DOMAINS ?? "localhost")
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

export const config = {
  // Não reescreve API, assets do Next nem arquivos estáticos.
  matcher: ["/((?!api|_next|.*\..*).*)"],
};

export function proxy(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const isRoot = ROOT_DOMAINS.some((root) => host === root || host === `www.${root}`);
  const { pathname, search } = req.nextUrl;

  if (isRoot) {
    // Só o painel e o super-admin usam sessão.
    if (pathname.startsWith("/painel") || pathname.startsWith("/admin")) return updateSession(req);
    return NextResponse.next();
  }

  // loja.com.br/produto  →  /s/loja.com.br/produto (rota interna)
  return NextResponse.rewrite(new URL(`/s/${host}${pathname}${search}`, req.url));
}
