import Link from "next/link";
import { requireStore } from "@/lib/panel";
import { formatBRL } from "@/lib/money";
import { formatDateTime } from "@/lib/format";
import { storeBaseUrl } from "@/lib/urls";
import { SOLD_STATUSES } from "@/lib/order-status";
import { linkState, linkStateLabel, linkStateTone, whatsappShareText } from "@/lib/payment-links";
import { PAYMENT_LINK_FIELDS, type PaymentLink } from "@/lib/payment-links-server";
import { cancelPaymentLink } from "./actions";
import { LinkForm } from "./link-form";
import { LinkShare } from "./link-share";

export const metadata = { title: "Links de pagamento · PMS app" };

type PaidOrder = { id: string; code: string; customer_name: string; payment_link_id: string };

// Cobranças avulsas: o lojista cria, manda no WhatsApp/Instagram e acompanha quem pagou.
export default async function LinksPage() {
  const { supabase, store } = await requireStore();
  const [{ data: rows, error }, { data: domains }] = await Promise.all([
    supabase.from("payment_links").select(PAYMENT_LINK_FIELDS).eq("store_id", store.id).order("created_at", { ascending: false }).limit(100),
    supabase.from("store_domains").select("domain, is_primary").eq("store_id", store.id),
  ]);
  const domain = (domains ?? []).find((d) => d.is_primary)?.domain ?? domains?.[0]?.domain;

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Links de pagamento</h1>
        <p className="text-sm text-neutral-600">Este recurso está sendo instalado. Volte em alguns minutos.</p>
      </div>
    );
  }
  const links = (rows ?? []) as PaymentLink[];

  // Quem pagou cada link (pedidos pagos que vieram dele).
  const { data: paidRows } = links.length
    ? await supabase
        .from("orders")
        .select("id, code, customer_name, payment_link_id")
        .eq("store_id", store.id)
        .in("payment_link_id", links.map((l) => l.id))
        .in("status", SOLD_STATUSES)
        .order("paid_at", { ascending: false })
    : { data: [] };
  const paidBy = new Map<string, PaidOrder[]>();
  for (const o of (paidRows ?? []) as PaidOrder[]) paidBy.set(o.payment_link_id, [...(paidBy.get(o.payment_link_id) ?? []), o]);

  const baseUrl = domain ? storeBaseUrl(domain) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Links de pagamento</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Cobre por Pix ou cartão sem cadastrar produto: crie o link e mande no WhatsApp ou no Instagram. Quando o cliente
          paga, a venda aparece em Pedidos e você recebe o aviso.
        </p>
      </div>

      {baseUrl ? (
        <LinkForm baseUrl={baseUrl} storeName={store.name} />
      ) : (
        <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">A loja ainda não tem endereço. Fale com o suporte.</p>
      )}

      <section className="rounded-xl border bg-white shadow-sm">
        <h2 className="border-b px-4 py-3 font-medium">Seus links</h2>
        {links.length === 0 ? (
          <p className="px-4 py-6 text-sm text-neutral-500">Nenhum link criado ainda.</p>
        ) : (
          <ul className="divide-y">
            {links.map((l) => {
              const state = linkState(l);
              const url = baseUrl ? `${baseUrl}/pagar/${l.public_token}` : "";
              const paid = paidBy.get(l.id) ?? [];
              return (
                <li key={l.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium">
                      {l.title} · {formatBRL(l.amount_cents)}
                    </p>
                    <p className="flex flex-wrap items-center gap-2 text-neutral-500">
                      <span className={linkStateTone(state)}>{linkStateLabel(state, l.reusable)}</span>
                      <span>criado em {formatDateTime(l.created_at)}</span>
                      {l.expires_at && state === "active" && <span>· vale até {formatDateTime(l.expires_at)}</span>}
                      {l.reusable && <span>· pode ser pago várias vezes</span>}
                    </p>
                    {paid.length > 0 && (
                      <p className="text-neutral-600">
                        Pago por{" "}
                        {paid.slice(0, 5).map((o, i) => (
                          <span key={o.id}>
                            {i > 0 && ", "}
                            <Link href={`/painel/pedidos/${o.id}`} className="font-medium text-primary-700 hover:underline">
                              {o.customer_name} ({o.code})
                            </Link>
                          </span>
                        ))}
                        {paid.length > 5 && ` e mais ${paid.length - 5}`}
                      </p>
                    )}
                  </div>
                  {state === "active" && url && (
                    <div className="flex flex-wrap items-center gap-2">
                      <LinkShare compact url={url} whatsappText={whatsappShareText(store.name, l.title, formatBRL(l.amount_cents), url)} />
                      <Link href={`/painel/imprimir/qr?alvo=link&id=${l.public_token}&formato=cartaz`} target="_blank" className="rounded-md border px-2.5 py-1.5 text-xs font-medium transition hover:border-neutral-400">
                        QR Code
                      </Link>
                      <form action={cancelPaymentLink}>
                        <input type="hidden" name="id" value={l.id} />
                        <button type="submit" className="rounded-md px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50">
                          Cancelar link
                        </button>
                      </form>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
