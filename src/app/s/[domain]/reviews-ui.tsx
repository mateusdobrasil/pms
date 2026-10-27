import Link from "next/link";
import { type RatingSummary, formatRating, starsText } from "@/lib/reviews";
import type { PublicReview } from "@/lib/reviews-server";

const when = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", month: "long", year: "numeric" });

// "★★★★★ 4,8 · 32 avaliações" (com link para a página de avaliações, se pedido).
export function RatingLine({ summary, href, className = "" }: { summary: RatingSummary; href?: string; className?: string }) {
  if (!summary.count) return null;
  const body = (
    <>
      <span className="text-amber-400" aria-hidden="true">{starsText(summary.average)}</span>{" "}
      <strong>{formatRating(summary.average)}</strong>
      <span className="text-neutral-500"> · {summary.count} {summary.count === 1 ? "avaliação" : "avaliações"}</span>
    </>
  );
  return href ? (
    <Link href={href} className={`inline-block hover:underline ${className}`} aria-label={`Nota ${formatRating(summary.average)} de 5 em ${summary.count} avaliações`}>
      {body}
    </Link>
  ) : (
    <span className={className}>{body}</span>
  );
}

export function ReviewCard({ r, storeName }: { r: PublicReview; storeName: string }) {
  return (
    <li className="space-y-2 rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span>
          <span className="text-amber-400" aria-label={`${r.rating} de 5`}>{starsText(r.rating)}</span>
          <span className="ml-2 font-medium">{r.author_name}</span>
        </span>
        <span className="text-xs text-neutral-500">{r.service_name ? `${r.service_name} · ` : ""}{when(r.created_at)}</span>
      </div>
      {r.comment && <p className="whitespace-pre-line text-sm text-neutral-700">{r.comment}</p>}
      {r.reply && (
        <p className="rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
          <span className="block text-xs font-semibold text-neutral-500">Resposta da {storeName}</span>
          {r.reply}
        </p>
      )}
    </li>
  );
}
