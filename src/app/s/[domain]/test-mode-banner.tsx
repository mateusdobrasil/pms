"use client";

import { useSyncExternalStore } from "react";

const COOKIE = "acesso-teste"; // TEST_ACCESS_COOKIE (src/lib/test-mode.ts)

const hasAccess = () => document.cookie.split("; ").some((c) => c.startsWith(`${COOKIE}=`) && c.length > COOKIE.length + 1);
const subscribe = () => () => {};

// Faixa da loja em modo de teste. Visitante: "em preparação" (o servidor recusa pedidos).
// Quem abriu o link de acesso: aviso de que os pagamentos são simulados.
export function TestModeBanner() {
  const access = useSyncExternalStore(subscribe, hasAccess, () => false);
  return access ? (
    <p className="bg-amber-400 px-4 py-1.5 text-center text-xs font-semibold text-amber-950 sm:text-sm">
      Modo de teste: pagamentos simulados, use os cartões de teste do Mercado Pago.{" "}
      <a href="/acesso-teste?sair=1" className="underline">Sair do modo de teste</a>
    </p>
  ) : (
    <p className="bg-neutral-900 px-4 py-2 text-center text-xs font-medium text-white sm:text-sm">
      Loja em preparação: em breve você poderá comprar por aqui.
    </p>
  );
}
