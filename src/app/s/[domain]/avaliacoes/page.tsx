import { notFound } from "next/navigation";
import { getStoreByDomain } from "@/lib/store";
import { createPublicClient } from "@/lib/supabase/public";
import { storeReviews } from "@/lib/reviews-server";
import { formatRating, starsText } from "@/lib/reviews";
import { ReviewCard } from "../reviews-ui";

export const revalidate = 60;
export const metadata = { title: "Avaliações" };

// Avaliações da loja: todas as visíveis (o lojista só oculta as ofensivas), com a média e as respostas.
export default async function ReviewsPage({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const store = await getStoreByDomain(domain);
  if (!store) notFound();
  const { summary, reviews } = await storeReviews(createPublicClient(), store.id, 200);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Avaliações de clientes</h1>
        {summary.count ? (
          <div className="flex flex-wrap items-center gap-6 rounded-xl border bg-white p-5 shadow-sm">
            <div className="text-center">
              <p className="text-4xl font-bold">{formatRating(summary.average)}</p>
              <p className="text-amber-400" aria-hidden="true">{starsText(summary.average)}</p>
              <p className="text-sm text-neutral-500">{summary.count} {summary.count === 1 ? "avaliação" : "avaliações"}</p>
            </div>
            <ul className="min-w-48 flex-1 space-y-1 text-sm">
              {([5, 4, 3, 2, 1] as const).map((n) => (
                <li key={n} className="flex items-center gap-2">
                  <span className="w-8 text-neutral-600">{n} ★</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
                    <span className="block h-full rounded-full bg-amber-400" style={{ width: `${(summary.byStars[n] / summary.count) * 100}%` }} />
                  </span>
                  <span className="w-8 text-right text-neutral-500">{summary.byStars[n]}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-neutral-600">Ainda não há avaliações. Depois de comprar ou ser atendido, você recebe um link para avaliar.</p>
        )}
      </header>
      <ul className="space-y-3">
        {reviews.map((r) => (
          <ReviewCard key={r.id} r={r} storeName={store.name} />
        ))}
      </ul>
    </div>
  );
}
