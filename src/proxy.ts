import { NextResponse, type NextRequest } from "next/server";

// Domínios da plataforma (painel/site). Qualquer outro host é tratado como loja.
const ROOT_DOMAINS = (process.env.NEXT_PUBLIC_ROOT_DOMAINS ?? "localhost")
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

export const config = {
  // Não reescreve API, assets do Next nem arquivos estáticos.
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};

export function proxy(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const isRoot = ROOT_DOMAINS.some((root) => host === root || host === `www.${root}`);

  if (isRoot) return NextResponse.next();

  // loja.com.br/produto  →  /s/loja.com.br/produto (rota interna)
  const { pathname, search } = req.nextUrl;
  return NextResponse.rewrite(new URL(`/s/${host}${pathname}${search}`, req.url));
}
