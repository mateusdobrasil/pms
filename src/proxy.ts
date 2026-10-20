import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Domínios da plataforma (painel/site). Qualquer outro host é tratado como loja.
// "*.vercel.app" aceita qualquer subdomínio (produção e previews da Vercel).
const ROOT_DOMAINS = (process.env.NEXT_PUBLIC_ROOT_DOMAINS ?? "localhost")
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

function isRootDomain(host: string) {
  return ROOT_DOMAINS.some((root) =>
    root.startsWith("*.") ? host.endsWith(root.slice(1)) : host === root || host === `www.${root}`,
  );
}

export const config = {
  // Não reescreve API, assets do Next nem arquivos estáticos.
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};

export function proxy(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const isRoot = isRootDomain(host);
  const { pathname, search } = req.nextUrl;

  if (isRoot) {
    // Só o painel e o super-admin usam sessão.
    if (pathname.startsWith("/painel") || pathname.startsWith("/admin")) return updateSession(req);
    return NextResponse.next();
  }

  // loja.com.br/produto  →  /s/loja.com.br/produto (rota interna)
  return NextResponse.rewrite(new URL(`/s/${host}${pathname}${search}`, req.url));
}
