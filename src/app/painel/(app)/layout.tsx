import type { ReactNode } from "react";
import Link from "next/link";
import { requireStore } from "@/lib/panel";
import { signOut } from "../actions";

export const metadata = { title: "Painel · PMS app", robots: { index: false } };

export default async function PanelLayout({ children }: { children: ReactNode }) {
  const { store, email } = await requireStore();

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="font-semibold">{store.name}</span>
            <nav className="flex gap-4 text-sm">
              <Link href="/painel">Resumo</Link>
              <Link href="/painel/pedidos">Pedidos</Link>
              <Link href="/painel/produtos">Produtos</Link>
              <Link href="/painel/categorias">Categorias</Link>
            </nav>
          </div>
          <form action={signOut} className="flex items-center gap-3 text-sm text-neutral-600">
            <span className="hidden sm:inline">{email}</span>
            <button type="submit" className="underline">Sair</button>
          </form>
        </div>
      </header>
      {store.status === "suspended" && (
        <p className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">
          Sua loja está suspensa e não aparece para os clientes. Fale com o suporte.
        </p>
      )}
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
