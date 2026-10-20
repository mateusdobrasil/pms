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
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/admin" className="flex items-center gap-3">
            <PlatformMark size={36} />
            <span className="leading-tight">
              <span className="block font-semibold">PMS app</span>
              <span className="block text-xs text-primary-200">Super-admin</span>
            </span>
          </Link>
          <form action={signOut} className="flex items-center gap-3 text-sm text-primary-100">
            <span className="hidden sm:inline">{email}</span>
            <button type="submit" className="rounded-md px-2 py-1 hover:bg-white/10">Sair</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
