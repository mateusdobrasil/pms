import Link from "next/link";
import { notFound } from "next/navigation";
import { getStoreByDomain } from "@/lib/store";
import { createPublicClient } from "@/lib/supabase/public";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBookingSettings } from "@/lib/booking-server";
import { packagesForSale } from "@/lib/packages-server";
import { getPromotions } from "@/lib/promotions";
import { getStoreMarketing } from "@/lib/store-marketing";
import { readBioLinks } from "@/lib/bio-links";
import { formatBRL } from "@/lib/money";
import { ThumbImage } from "@/lib/thumb-image";
import { fetchProducts } from "../product-grid";
import { NoPhoto } from "../no-photo";

export const revalidate = 60;
export const metadata = { title: "Links" };

// Página para o link da bio do Instagram: os caminhos da loja em botões grandes, os links extras do lojista
// (Painel → Divulgar) e alguns produtos em destaque.
export default async function BioPage({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const store = await getStoreByDomain(domain);
  if (!store) notFound();
  const db = createAdminClient();
  const [products, booking, packages, promotions, marketing, { data: bio }] = await Promise.all([
    fetchProducts(store.id, { limit: 6 }),
    getBookingSettings(db, store.id),
    packagesForSale(db, store.id),
    getPromotions(store.id),
    getStoreMarketing(store.id),
    createPublicClient().from("stores").select("bio_text, bio_links").eq("id", store.id).maybeSingle(), // SQL 20261120000000
  ]);
  const extra = readBioLinks(bio?.bio_links);
  const bookingOn = !!booking?.enabled;
  const promo = [
    promotions.pixDiscountPercent > 0 && `${promotions.pixDiscountPercent}% de desconto no Pix`,
    promotions.freeShippingMinCents && `Frete grátis acima de ${formatBRL(promotions.freeShippingMinCents)}`,
  ].filter(Boolean);

  const main = "block rounded-2xl px-5 py-4 text-center font-semibold text-white shadow-sm transition hover:brightness-110";
  const outline = "block rounded-2xl border-2 bg-white px-5 py-4 text-center font-semibold transition hover:bg-neutral-50";
  const buttons: { href: string; label: string; primary?: boolean; external?: boolean }[] = [];
  if (bookingOn) buttons.push({ href: "/agendar", label: "📅 Agendar horário", primary: true });
  if (products.length) buttons.push({ href: "/", label: "🛍️ Ver produtos e comprar", primary: !bookingOn });
  if (packages.length) buttons.push({ href: "/pacotes", label: "✨ Pacotes com desconto" });
  if (store.whatsapp) buttons.push({ href: `https://wa.me/${store.whatsapp}?text=${encodeURIComponent(`Olá! Vim pelo Instagram da ${store.name}.`)}`, label: "💬 Falar no WhatsApp", external: true });
  for (const l of extra) buttons.push({ href: l.url, label: l.title, external: !l.url.startsWith("/") });

  return (
    <div className="mx-auto max-w-md space-y-8 py-2">
      <div className="space-y-2 text-center">
        {store.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={store.logo_url} alt={store.name} className="mx-auto h-20 w-auto" />
        ) : (
          <span className="mx-auto grid h-20 w-20 place-items-center rounded-full text-3xl font-bold text-white" style={{ background: "var(--brand)" }}>
            {store.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <h1 className="text-2xl font-bold tracking-tight">{store.name}</h1>
        {marketing.instagram && <p className="text-sm text-neutral-500">@{marketing.instagram}</p>}
        {bio?.bio_text && <p className="text-neutral-700">{bio.bio_text}</p>}
        {promo.length > 0 && (
          <p className="inline-block rounded-full px-3 py-1 text-xs font-semibold text-white" style={{ background: "var(--brand)" }}>
            {promo.join(" · ")}
          </p>
        )}
      </div>

      <ul className="space-y-3">
        {buttons.map((b) => (
          <li key={b.href + b.label}>
            {b.external ? (
              <a href={b.href} target="_blank" rel="noopener noreferrer" className={b.primary ? main : outline} style={b.primary ? { background: "var(--brand)" } : { borderColor: "var(--brand)", color: "var(--brand)" }}>
                {b.label}
              </a>
            ) : (
              <Link href={b.href} className={b.primary ? main : outline} style={b.primary ? { background: "var(--brand)" } : { borderColor: "var(--brand)", color: "var(--brand)" }}>
                {b.label}
              </Link>
            )}
          </li>
        ))}
      </ul>

      {products.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-center text-sm font-semibold uppercase tracking-wide text-neutral-500">Destaques</h2>
          <ul className="grid grid-cols-3 gap-2">
            {products.map((p) => {
              const cover = [...p.product_images].sort((a, b) => a.position - b.position)[0];
              const price = Math.min(...p.product_variants.map((v) => v.price_cents));
              return (
                <li key={p.id}>
                  <Link href={`/p/${p.slug}`} className="group block">
                    <div className="aspect-square overflow-hidden rounded-lg bg-neutral-100 ring-1 ring-neutral-200">
                      {cover ? <ThumbImage path={cover.path} alt={p.name} lazy className="h-full w-full object-cover transition group-hover:scale-105" /> : <NoPhoto />}
                    </div>
                    <p className="mt-1 truncate text-xs text-neutral-700">{p.name}</p>
                    <p className="text-xs font-bold">{formatBRL(price)}</p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
