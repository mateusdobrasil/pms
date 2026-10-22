import type { ReactNode } from "react";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { signOut } from "../painel/actions";
import { PlatformMark } from "../painel/brand";

export const metadata = { title: "Super-admin · PMS app", robots: { index: false } };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { email } = await requireAdmin();

  return (
    <div className="min-h-screen bg-neutral-100">
      <header className="bg-primary-900 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
          <Link href="/admin" className="flex items-center gap-3">
            <PlatformMark size={36} />
            <span className="leading-tight">
              <span className="block font-semibold">PMS app</span>
              <span className="block text-xs text-primary-200">Super-admin</span>
            </span>
          </Link>
          {/* No celular, o menu desce para uma linha própria (rola de lado se precisar). */}
          <nav className="order-last flex w-full items-center gap-1 overflow-x-auto whitespace-nowrap text-sm text-primary-100 sm:order-none sm:w-auto">
            <Link href="/admin" className="rounded-md px-2 py-1 hover:bg-white/10">Lojas</Link>
            <Link href="/admin/propostas" className="rounded-md px-2 py-1 hover:bg-white/10">Propostas</Link>
            <Link href="/admin/financeiro" className="rounded-md px-2 py-1 hover:bg-white/10">Financeiro</Link>
            <Link href="/admin/ajuda" className="rounded-md px-2 py-1 hover:bg-white/10">Ajuda</Link>
          </nav>
          <form action={signOut} className="flex items-center gap-3 text-sm text-primary-100">
            <span className="hidden lg:inline">{email}</span>
            <button type="submit" className="rounded-md px-2 py-1 hover:bg-white/10">Sair</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
