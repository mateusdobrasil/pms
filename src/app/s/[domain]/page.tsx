import Link from "next/link";
import { notFound } from "next/navigation";
import { getStoreByDomain, type Store } from "@/lib/store";
import { getBanner, type Banner } from "@/lib/banner";
import { ProductGrid, fetchProducts } from "./product-grid";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBookingSettings, loadCatalog, type BookableService } from "@/lib/booking-server";
import { formatDuration, onlineCents } from "@/lib/booking";
import { formatBRL } from "@/lib/money";

export const revalidate = 60;

export default async function StoreHome({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const store = await getStoreByDomain(domain);
  if (!store) notFound();

  const db = createAdminClient();
  const [products, banner, booking] = await Promise.all([fetchProducts(store.id, { limit: 24 }), getBanner(store.id), getBookingSettings(db, store.id)]);
  // Loja só de serviços (agenda ligada e nenhum produto): a home mostra os serviços para agendar.
  const servicesOnly = !!booking?.enabled && products.length === 0;
  const services = servicesOnly ? (await loadCatalog(db, store.id)).services : [];

  return (
    <div className="space-y-10">
      <Hero store={store} banner={banner} servicesOnly={servicesOnly} />

      {servicesOnly ? (
        <ServicesSection services={services} />
      ) : (
        <section className="space-y-5">
          <h2 className="text-xl font-bold tracking-tight">Produtos</h2>
          {products.length === 0 ? <p className="text-neutral-600">Nenhum produto cadastrado ainda.</p> : <ProductGrid products={products} />}
        </section>
      )}
    </div>
  );
}

function paymentNote(s: BookableService) {
  const online = onlineCents(s.price_cents, s.payment_mode, s.deposit_percent);
  if (s.payment_mode === "full") return "pagamento online";
  if (s.payment_mode === "deposit") return `sinal de ${formatBRL(online)} ao agendar`;
  return "pagamento no local";
}

// Serviços da agenda no lugar dos produtos (cada cartão abre o agendamento já com o serviço escolhido).
function ServicesSection({ services }: { services: BookableService[] }) {
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight">Serviços</h2>
        <Link
          href="/agendar"
          className="rounded-full px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
          style={{ background: "var(--brand)" }}
        >
          Agendar horário
        </Link>
      </div>
      {services.length === 0 && <p className="text-neutral-600">Nenhum serviço disponível para agendar no momento.</p>}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((s) => (
          <li key={s.id}>
            <Link
              href={`/agendar?servico=${s.id}`}
              className="group flex h-full flex-col rounded-xl border bg-white p-5 shadow-sm ring-1 ring-transparent transition hover:shadow-md"
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">{s.name}</span>
                <span className="shrink-0 text-lg font-bold">{formatBRL(s.price_cents)}</span>
              </span>
              <span className="mt-1 text-sm text-neutral-500">{formatDuration(s.duration_minutes)} · {paymentNote(s)}</span>
              {s.description && <span className="mt-2 text-sm text-neutral-600">{s.description}</span>}
              <span className="mt-auto pt-4 text-sm font-semibold" style={{ color: "var(--brand)" }}>
                Agendar →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Topo da home: a imagem do banner (com título por cima, se houver); só o texto sobre a cor da loja;
// ou, sem banner configurado, a saudação padrão.
function Hero({ store, banner, servicesOnly }: { store: Store; banner: Banner | null; servicesOnly: boolean }) {
  const title = banner?.title ?? store.name;
  const subtitle = banner ? banner.subtitle : servicesOnly ? "Agende seu horário online, com confirmação na hora." : "Compre com segurança e pague com Pix ou cartão.";
  const text = (
    <div className="relative max-w-xl">
      {!banner && <p className="text-sm font-medium uppercase tracking-widest text-white/80">Bem-vindo à</p>}
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
      {subtitle && <p className="mt-3 text-white/85">{subtitle}</p>}
      {banner?.link && (
        <span className="mt-5 inline-block rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-neutral-900 shadow-sm">
          Confira
        </span>
      )}
    </div>
  );

  const content = banner?.image_url ? (
    <section className="relative overflow-hidden rounded-2xl bg-neutral-900">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={banner.image_url} alt={banner.title ?? store.name} className="aspect-[4/3] w-full object-cover sm:aspect-[3/1]" />
      {banner.title && (
        <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/70 via-black/20 to-transparent p-6 text-white sm:p-10">
          {text}
        </div>
      )}
    </section>
  ) : (
    <section
      className="relative overflow-hidden rounded-2xl px-6 py-12 text-white sm:px-10 sm:py-16"
      style={{ background: "linear-gradient(135deg, var(--brand), color-mix(in oklab, var(--brand) 55%, black))" }}
    >
      <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10" aria-hidden="true" />
      <div className="absolute -bottom-20 right-24 h-48 w-48 rounded-full bg-white/10" aria-hidden="true" />
      {text}
    </section>
  );

  if (!banner?.link) return content;
  return banner.link.startsWith("/") ? (
    <Link href={banner.link} className="block transition hover:opacity-95">{content}</Link>
  ) : (
    <a href={banner.link} className="block transition hover:opacity-95">{content}</a>
  );
}
