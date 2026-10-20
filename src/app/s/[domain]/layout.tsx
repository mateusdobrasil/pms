import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCategories, getStoreByDomain } from "@/lib/store";
import { CartLink } from "./cart-link";

export async function generateMetadata({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const store = await getStoreByDomain(domain);
  const name = store?.name ?? "Loja";
  return { title: { default: name, template: `%s · ${name}` } };
}

export default async function StoreLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ domain: string }>;
}) {
  const { domain } = await params;
  const store = await getStoreByDomain(domain);
  if (!store) notFound();
  const categories = await getCategories(store.id);

  return (
    <div style={{ "--brand": store.primary_color } as CSSProperties} className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <Link href="/" className="text-lg font-semibold">{store.name}</Link>
          <form action="/busca" className="order-last w-full sm:order-none sm:w-auto">
            <input
              name="q"
              type="search"
              placeholder="Buscar produtos"
              aria-label="Buscar produtos"
              className="w-full rounded-md border px-3 py-1.5 text-sm sm:w-64"
            />
          </form>
          <CartLink />
        </div>
        {categories.length > 0 && (
          <nav className="mx-auto flex max-w-6xl gap-5 overflow-x-auto px-4 pb-3 text-sm text-neutral-600">
            {categories.map((c) => (
              <Link key={c.id} href={`/c/${c.slug}`} className="whitespace-nowrap hover:text-neutral-900">
                {c.name}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>

      {store.whatsapp && (
        <a
          href={`https://wa.me/${store.whatsapp}`}
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-5 right-5 rounded-full px-5 py-3 text-sm font-medium text-white shadow-lg"
          style={{ background: "var(--brand)" }}
        >
          Falar no WhatsApp
        </a>
      )}
    </div>
  );
}
