import { NextResponse } from "next/server";
import { getStoreByDomain } from "@/lib/store";
import { TEST_ACCESS_COOKIE, isValidTestAccess } from "@/lib/test-mode";

// Link de acesso ao modo de teste (painel e /admin mostram): loja.com.br/acesso-teste?c=<código>.
// Código certo → grava o cookie e libera as compras de teste neste navegador. ?sair=1 → volta a ser visitante.
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const url = new URL(req.url);
  const store = await getStoreByDomain(decodeURIComponent(domain));
  // Redireciona para a raiz do domínio da loja (não para o caminho interno /s/<domínio>).
  const res = NextResponse.redirect(new URL("/", `${url.protocol}//${req.headers.get("host") ?? url.host}`));
  const code = url.searchParams.get("c");
  const secure = url.protocol === "https:";

  if (url.searchParams.get("sair")) {
    res.cookies.set(TEST_ACCESS_COOKIE, "", { path: "/", maxAge: 0 });
  } else if (store && isValidTestAccess(store.id, code)) {
    // Sem httpOnly: a faixa da vitrine lê o cookie para mostrar "modo de teste". Quem decide é o servidor (confere o código).
    res.cookies.set(TEST_ACCESS_COOKIE, code!, { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax", secure });
  }
  return res;
}
