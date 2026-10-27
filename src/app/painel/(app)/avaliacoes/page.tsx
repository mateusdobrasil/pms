import Link from "next/link";
import { requireStore } from "@/lib/panel";
import { formatDateTime } from "@/lib/format";
import { formatRating, ratingSummary, starsText } from "@/lib/reviews";
import { ReviewActions } from "./review-actions";

export const metadata = { title: "Avaliações · PMS app" };

type Row = {
  id: string;
  rating: number;
  comment: string | null;
  author_name: string;
  service_name: string | null;
  professional_name: string | null;
  reply: string | null;
  hidden: boolean;
  hidden_reason: string | null;
  created_at: string;
  order_id: string | null;
  orders: { code: string } | null;
};

// Avaliações dos clientes: todas aparecem na loja; o lojista responde e só oculta as ofensivas.
export default async function ReviewsAdminPage({ searchParams }: { searchParams: Promise<{ nota?: string }> }) {
  const { supabase, store } = await requireStore();
  const { nota } = await searchParams;
  const filter = Number(nota);
  const { data, error } = await supabase
    .from("reviews")
    .select("id, rating, comment, author_name, service_name, professional_name, reply, hidden, hidden_reason, created_at, order_id, orders(code)")
    .eq("store_id", store.id)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Avaliações</h1>
        <p className="text-sm text-neutral-600">Este recurso está sendo instalado. Volte em alguns minutos.</p>
      </div>
    );
  }
  const rows = (data ?? []) as unknown as Row[];
  const visible = rows.filter((r) => !r.hidden);
  const summary = ratingSummary(visible.map((r) => r.rating));
  const shown = filter >= 1 && filter <= 5 ? rows.filter((r) => r.rating === filter) : rows;
  const unanswered = visible.filter((r) => r.rating <= 3 && !r.reply).length;
  const chip = (active: boolean) => `rounded-full px-3 py-1 text-sm ${active ? "bg-neutral-900 text-white" : "border bg-white hover:border-neutral-400"}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Avaliações</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Depois da entrega ou do atendimento, o cliente recebe um link para dar nota e comentar. Todas aparecem na loja (na página de avaliações, na
          home e no link da bio). Responda: uma boa resposta a uma crítica conquista mais clientes do que esconder a crítica.
        </p>
      </div>

      {summary.count > 0 && (
        <div className="flex flex-wrap items-center gap-6 rounded-xl border bg-white p-5 shadow-sm">
          <div>
            <p className="text-4xl font-bold">{formatRating(summary.average)}</p>
            <p className="text-amber-400">{starsText(summary.average)}</p>
            <p className="text-sm text-neutral-500">{summary.count} {summary.count === 1 ? "avaliação" : "avaliações"} na loja</p>
          </div>
          {unanswered > 0 && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">{unanswered} {unanswered === 1 ? "avaliação de 1 a 3 estrelas ainda sem resposta" : "avaliações de 1 a 3 estrelas ainda sem resposta"}.</p>}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Link href="/painel/avaliacoes" className={chip(!(filter >= 1 && filter <= 5))}>Todas</Link>
        {[5, 4, 3, 2, 1].map((n) => (
          <Link key={n} href={`/painel/avaliacoes?nota=${n}`} className={chip(filter === n)}>
            {n} ★ ({rows.filter((r) => r.rating === n).length})
          </Link>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border bg-white px-4 py-6 text-sm text-neutral-500 shadow-sm">Nenhuma avaliação {filter ? "com essa nota" : "ainda"}.</p>
      ) : (
        <ul className="space-y-3">
          {shown.map((r) => (
            <li key={r.id} className={`space-y-2 rounded-xl border bg-white p-4 shadow-sm ${r.hidden ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span>
                  <span className="text-amber-400">{starsText(r.rating)}</span>
                  <span className="ml-2 font-medium">{r.author_name}</span>
                  <span className="text-neutral-500">
                    {" "}· {r.service_name ? `${r.service_name} com ${r.professional_name}` : r.orders ? <Link href={`/painel/pedidos/${r.order_id}`} className="underline">pedido {r.orders.code}</Link> : "compra"}
                  </span>
                </span>
                <span className="text-xs text-neutral-500">{formatDateTime(r.created_at)}</span>
              </div>
              {r.comment ? <p className="whitespace-pre-line text-sm text-neutral-800">{r.comment}</p> : <p className="text-sm text-neutral-400">Sem comentário.</p>}
              {r.reply && (
                <p className="rounded-lg bg-neutral-50 px-3 py-2 text-sm">
                  <span className="block text-xs font-semibold text-neutral-500">Sua resposta</span>
                  {r.reply}
                </p>
              )}
              {r.hidden && <p className="text-xs font-medium text-amber-800">Oculta da loja: {r.hidden_reason}</p>}
              <ReviewActions id={r.id} reply={r.reply} hidden={r.hidden} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
