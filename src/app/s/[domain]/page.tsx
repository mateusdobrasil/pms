import { notFound } from "next/navigation";
import { getStoreByDomain } from "@/lib/store";
import { ProductGrid, fetchProducts } from "./product-grid";

export const revalidate = 60;

export default async function StoreHome({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const store = await getStoreByDomain(domain);
  if (!store) notFound();

  const products = await fetchProducts(store.id, { limit: 24 });

  return (
    <div className="space-y-10">
      <section
        className="relative overflow-hidden rounded-2xl px-6 py-12 text-white sm:px-10 sm:py-16"
        style={{ background: "linear-gradient(135deg, var(--brand), color-mix(in oklab, var(--brand) 55%, black))" }}
      >
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10" aria-hidden="true" />
        <div className="absolute -bottom-20 right-24 h-48 w-48 rounded-full bg-white/10" aria-hidden="true" />
        <div className="relative max-w-xl">
          <p className="text-sm font-medium uppercase tracking-widest text-white/80">Bem-vindo à</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{store.name}</h1>
          <p className="mt-3 text-white/85">Compre com segurança e pague com Pix ou cartão.</p>
        </div>
      </section>

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
