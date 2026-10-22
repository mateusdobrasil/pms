import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCategories, getStoreByDomain } from "@/lib/store";
import { getPromotions } from "@/lib/promotions";
import { formatBRL } from "@/lib/money";
import { storeBaseUrl } from "@/lib/urls";
import { CartLink } from "./cart-link";
import { StoreWhatsappButton } from "./store-whatsapp";

export async function generateMetadata({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const store = await getStoreByDomain(domain);
  const name = store?.name ?? "Loja";
  const description = `Compre na ${name} com Pix ou cartão. Entrega para todo o Brasil.`;
  return {
    // Torna absolutos os links canônicos e de compartilhamento (cada loja no seu domínio).
    metadataBase: new URL(storeBaseUrl(decodeURIComponent(domain).toLowerCase())),
    title: { default: name, template: `%s · ${name}` },
    description,
    alternates: { canonical: "/" },
    openGraph: { siteName: name, type: "website", locale: "pt_BR", title: name, description },
  };
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
  const [categories, promotions] = await Promise.all([getCategories(store.id), getPromotions(store.id)]);
  // Faixa no topo anunciando as promoções da loja (some quando não há nenhuma).
  const promoText = [
    promotions.freeShippingMinCents && `Frete grátis acima de ${formatBRL(promotions.freeShippingMinCents)}`,
    promotions.pixDiscountPercent > 0 && `${promotions.pixDiscountPercent}% de desconto no Pix`,
  ]
    .filter(Boolean)
    .join(" · ");

  // --brand: cor da loja; --focus: anel de foco dos campos na mesma cor.
  const theme = { "--brand": store.primary_color, "--focus": store.primary_color } as CSSProperties;

  return (
    <div style={theme} className="flex min-h-screen flex-col bg-white">
      {promoText ? (
        <p className="px-4 py-1.5 text-center text-xs font-medium text-white sm:text-sm" style={{ background: "var(--brand)" }}>
          {promoText}
        </p>
      ) : (
        <div className="h-1" style={{ background: "var(--brand)" }} />
      )}
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
              className="w-full rounded-full border bg-neutral-50 px-4 py-2.5 text-sm"
            />
          </form>
          <div className="flex items-center gap-2">
            <Link
              href="/meus-pedidos"
              aria-label="Meus pedidos"
              className="flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition hover:border-neutral-400"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current" strokeWidth={1.8}>
                <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" strokeLinejoin="round" />
                <path d="m3 8 9 5 9-5M12 13v8" strokeLinejoin="round" />
              </svg>
              <span className="sm:hidden">Pedidos</span>
              <span className="hidden sm:inline">Meus pedidos</span>
            </Link>
            <CartLink />
          </div>
        </div>
        {categories.length > 0 && (
          <nav className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 pb-3 text-sm">
            {categories.map((c) => (
              <Link
                key={c.id}
                href={`/c/${c.slug}`}
                className="whitespace-nowrap rounded-full border px-4 py-2 font-medium text-neutral-700 transition hover:border-neutral-400 hover:text-neutral-900"
              >
                {c.name}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>

      <footer className="mt-12 bg-neutral-900 pb-16 text-neutral-300 sm:pb-0">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 text-sm sm:grid-cols-3">
          <div>
            <p className="text-base font-semibold text-white">{store.name}</p>
            <p className="mt-2 text-neutral-400">Compra segura com Pix ou cartão.</p>
          </div>
          <div className="space-y-1">
            <p className="font-semibold text-white">Atendimento</p>
            {store.whatsapp && (
              <a href={`https://wa.me/${store.whatsapp}`} target="_blank" rel="noopener noreferrer" className="block py-1.5 hover:text-white">
                WhatsApp
              </a>
            )}
            {store.email && (
              <a href={`mailto:${store.email}`} className="block break-all py-1.5 hover:text-white">{store.email}</a>
            )}
          </div>
          <div className="space-y-1">
            <p className="font-semibold text-white">Navegue</p>
            <Link href="/" className="block py-1.5 hover:text-white">Início</Link>
            <Link href="/carrinho" className="block py-1.5 hover:text-white">Carrinho</Link>
            <Link href="/meus-pedidos" className="block py-1.5 hover:text-white">Meus pedidos</Link>
          </div>
        </div>
        <p className="border-t border-neutral-800 py-4 text-center text-xs text-neutral-500">
          Loja criada com PMS app
        </p>
      </footer>

      {store.whatsapp && <StoreWhatsappButton whatsapp={store.whatsapp} />}
    </div>
  );
}
