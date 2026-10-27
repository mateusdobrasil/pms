import Link from "next/link";
import { notFound } from "next/navigation";
import { getStoreByDomain } from "@/lib/store";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/validation";
import { reviewTarget } from "@/lib/reviews-server";
import { starsText } from "@/lib/reviews";
import { ReviewForm } from "./review-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Avaliar", robots: { index: false } };

// Avaliação da compra ou do atendimento (link do e-mail, do WhatsApp ou da página do pedido/agendamento).
export default async function ReviewPage({ params, searchParams }: { params: Promise<{ domain: string; token: string }>; searchParams: Promise<{ nota?: string }> }) {
  const { domain, token } = await params;
  const { nota } = await searchParams;
  if (!isUuid(token)) notFound();
  const store = await getStoreByDomain(domain);
  if (!store) notFound();
  const t = await reviewTarget(createAdminClient(), store.id, token);
  if (!t?.kind) notFound();
  const initial = Number(nota);

  return (
    <div className="mx-auto max-w-md space-y-6 py-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">{t.kind === "order" ? "Como foi a sua compra?" : "Como foi o seu atendimento?"}</h1>
        <p className="mt-1 text-neutral-600">
          {store.name}
          {t.serviceName && ` · ${t.serviceName} com ${t.professionalName}`}
        </p>
      </div>
      {t.review ? (
        <div className="space-y-2 rounded-xl border p-5 text-center">
          <p className="text-2xl text-amber-400">{starsText(t.review.rating)}</p>
          {t.review.comment && <p className="whitespace-pre-line text-neutral-700">{t.review.comment}</p>}
          <p className="text-sm text-neutral-500">Você já avaliou. Obrigado!</p>
        </div>
      ) : !t.reviewable ? (
        <p className="rounded-xl bg-neutral-100 p-5 text-center text-neutral-700">
          {t.kind === "order" ? "Você poderá avaliar depois que a compra for confirmada." : "Você poderá avaliar depois do atendimento."}
        </p>
      ) : (
        <ReviewForm token={token} initial={Number.isInteger(initial) && initial >= 1 && initial <= 5 ? initial : null} />
      )}
      <p className="text-center text-sm">
        <Link href="/avaliacoes" className="underline">Ver as avaliações da loja</Link>
      </p>
    </div>
  );
}
