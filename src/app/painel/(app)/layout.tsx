import type { ReactNode } from "react";
import Link from "next/link";
import { requireStore } from "@/lib/panel";
import { signOut } from "../actions";
import { PanelNav } from "./panel-nav";

export const metadata = { title: "Painel · PMS app", robots: { index: false } };

export default async function PanelLayout({ children }: { children: ReactNode }) {
  const { store, email } = await requireStore();

  return (
    <div className="min-h-screen bg-neutral-100">
      <header className="bg-neutral-900 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary-500 text-sm font-bold">
              {store.name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate font-semibold">{store.name}</p>
              <p className="text-xs text-neutral-400">Painel da loja</p>
            </div>
          </div>
          <form action={signOut} className="flex items-center gap-3 text-sm text-neutral-300 sm:order-last">
            <Link href="/painel/conta" className="hidden rounded-md px-2 py-1 hover:bg-white/10 hover:text-white md:inline" title="Minha conta">
              {email}
            </Link>
            <Link href="/painel/conta" className="rounded-md px-2 py-1 hover:bg-white/10 hover:text-white md:hidden">Conta</Link>
            <button type="submit" className="rounded-md px-2 py-1 hover:bg-white/10 hover:text-white">Sair</button>
          </form>
          <div className="w-full sm:w-auto sm:flex-1">
            <PanelNav />
          </div>
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
