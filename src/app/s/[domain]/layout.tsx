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

  // --brand: cor da loja; --focus: anel de foco dos campos na mesma cor.
  const theme = { "--brand": store.primary_color, "--focus": store.primary_color } as CSSProperties;

  return (
    <div style={theme} className="flex min-h-screen flex-col bg-white">
      <div className="h-1" style={{ background: "var(--brand)" }} />
      <header className="sticky top-0 z-20 border-b bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-3">
            {store.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={store.logo_url} alt={store.name} className="h-10 w-auto" />
            ) : (
              <span
                className="grid h-10 w-10 place-items-center rounded-full text-lg font-bold text-white"
                style={{ background: "var(--brand)" }}
              >
                {store.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="text-xl font-bold tracking-tight">{store.name}</span>
          </Link>
          <form action="/busca" className="order-last w-full sm:order-none sm:w-auto sm:flex-1 sm:max-w-md">
            <input
              name="q"
              type="search"
              placeholder="Buscar produtos"
              aria-label="Buscar produtos"
              className="w-full rounded-full border bg-neutral-50 px-4 py-2 text-sm"
            />
          </form>
          <CartLink />
        </div>
        {categories.length > 0 && (
          <nav className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 pb-3 text-sm">
            {categories.map((c) => (
              <Link
                key={c.id}
                href={`/c/${c.slug}`}
                className="whitespace-nowrap rounded-full border px-3 py-1 font-medium text-neutral-700 transition hover:border-neutral-400 hover:text-neutral-900"
              >
                {c.name}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>

      <footer className="mt-12 bg-neutral-900 text-neutral-300">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 text-sm sm:grid-cols-3">
          <div>
            <p className="text-base font-semibold text-white">{store.name}</p>
            <p className="mt-2 text-neutral-400">Compra segura com Pix ou cartão.</p>
          </div>
          <div className="space-y-1">
            <p className="font-semibold text-white">Atendimento</p>
            {store.whatsapp && (
              <a href={`https://wa.me/${store.whatsapp}`} target="_blank" rel="noopener noreferrer" className="block hover:text-white">
                WhatsApp
              </a>
            )}
            {store.email && (
              <a href={`mailto:${store.email}`} className="block hover:text-white">{store.email}</a>
            )}
          </div>
          <div className="space-y-1">
            <p className="font-semibold text-white">Navegue</p>
            <Link href="/" className="block hover:text-white">Início</Link>
            <Link href="/carrinho" className="block hover:text-white">Carrinho</Link>
          </div>
        </div>
        <p className="border-t border-neutral-800 py-4 text-center text-xs text-neutral-500">
          Loja criada com PMS app
        </p>
      </footer>

      {store.whatsapp && (
        <a
          href={`https://wa.me/${store.whatsapp}`}
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full bg-[#25D366] px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:brightness-95"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-current">
            <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3Z" />
          </svg>
          WhatsApp
        </a>
      )}
    </div>
  );
}
