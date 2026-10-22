import Link from "next/link";
import { notFound } from "next/navigation";
import { getStoreByDomain, type Store } from "@/lib/store";
import { getBanner, type Banner } from "@/lib/banner";
import { ProductGrid, fetchProducts } from "./product-grid";

export const revalidate = 60;

export default async function StoreHome({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const store = await getStoreByDomain(domain);
  if (!store) notFound();

  const [products, banner] = await Promise.all([fetchProducts(store.id, { limit: 24 }), getBanner(store.id)]);

  return (
    <div className="space-y-10">
      <Hero store={store} banner={banner} />

      <section className="space-y-5">
        <h2 className="text-xl font-bold tracking-tight">Produtos</h2>
        {products.length === 0 ? (
          <p className="text-neutral-600">Nenhum produto cadastrado ainda.</p>
        ) : (
          <ProductGrid products={products} />
        )}
      </section>
    </div>
  );
}

// Topo da home: a imagem do banner (com título por cima, se houver); só o texto sobre a cor da loja;
// ou, sem banner configurado, a saudação padrão.
function Hero({ store, banner }: { store: Store; banner: Banner | null }) {
  const title = banner?.title ?? store.name;
  const subtitle = banner ? banner.subtitle : "Compre com segurança e pague com Pix ou cartão.";
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
