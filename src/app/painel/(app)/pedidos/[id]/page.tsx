import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStore } from "@/lib/panel";
import { formatBRL } from "@/lib/money";
import { formatCPF, formatDateTime, formatPhone } from "@/lib/format";
import { isUuid } from "@/lib/validation";
import { MEMBER_TRANSITIONS, SOLD_STATUSES, statusLabel, statusTone, type OrderStatus } from "@/lib/order-status";
import { OrderActions, RefundSection } from "./order-actions";
import { FEE_FIELDS, feePercent, paymentFees } from "@/lib/payments/fees";
import { isPaymentLink } from "@/lib/payment-links";
import { COUNTER_PAYMENTS, type CounterPayment, isCounterSale } from "@/lib/counter";
import { CancelSale } from "../../vender/cancel-sale";
import { emailStatusLabel, isProblem } from "@/lib/resend-webhook";

type Order = {
  id: string;
  code: string;
  status: OrderStatus;
  customer_name: string;
  customer_email: string;
  customer_cpf: string;
  customer_phone: string | null;
  shipping_address: Record<string, string> | null;
  shipping_method: string;
  subtotal_cents: number;
  shipping_cents: number;
  total_cents: number;
  discount_cents: number;
  tracking_code: string | null;
  stock_issue: boolean;
  paid_at: string | null;
  created_at: string;
  order_items: { id: string; product_name: string; variant_name: string; unit_price_cents: number; quantity: number }[];
  payments: { id: string; method: "pix" | "card"; status: string; amount_cents: number; created_at: string; fee: unknown; net: unknown }[];
};

const PAYMENT_STATUS: Record<string, string> = {
  pending: "Pendente",
  approved: "Aprovado",
  rejected: "Recusado",
  refunded: "Estornado",
  expired: "Expirado",
};

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase, store } = await requireStore();

  const { data } = await supabase
    .from("orders")
    .select(
      `id, code, status, customer_name, customer_email, customer_cpf, customer_phone, shipping_address, shipping_method, subtotal_cents, shipping_cents, total_cents, discount_cents, tracking_code, stock_issue, paid_at, created_at, order_items(id, product_name, variant_name, unit_price_cents, quantity), payments(id, method, status, amount_cents, created_at, ${FEE_FIELDS})`,
    )
    .eq("id", id)
    .eq("store_id", store.id)
    .maybeSingle();
  if (!data) notFound();
  const order = data as Order;
  const isPickup = order.shipping_method === "pickup";
  const fromLink = isPaymentLink(order.shipping_method);
  // Venda no balcão: forma de pagamento lida à parte (coluna do SQL 20261114000000).
  const counter = isCounterSale(order.shipping_method);
  const { data: counterRow } = counter ? await supabase.from("orders").select("counter_payment").eq("id", order.id).maybeSingle() : { data: null };
  const counterPayment = (counterRow as { counter_payment: CounterPayment | null } | null)?.counter_payment ?? null;
  const phone = order.customer_phone ? `55${order.customer_phone}` : null;
  const address = order.shipping_address;
  const approved = order.payments.find((p) => p.status === "approved");
  // Estorno pelo painel (coluna do SQL 20261027000000, lida à parte).
  const { data: refund } = await supabase.from("orders").select("refunded_at").eq("id", order.id).maybeSingle();
  const refundedAt = (refund as { refunded_at: string | null } | null)?.refunded_at ?? null;
  // E-mails ao cliente que voltaram ou viraram spam (SQL 20261029000000; sem a tabela, nada aparece).
  const { data: mails } = await supabase.from("sent_emails").select("subject, status, detail").eq("kind", "order").eq("ref_id", order.id);
  const badMails = (mails ?? []).filter((m) => isProblem(m.status));
  const refundable = SOLD_STATUSES.includes(order.status) && !!approved;
  // O que o lojista de fato recebe: pago menos a taxa do Mercado Pago (pedido cancelado/estornado não conta).
  const fees = refundable && approved ? paymentFees(approved.amount_cents, approved.fee, approved.net) : null;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/painel/pedidos" className="text-sm text-neutral-500 underline">← Pedidos</Link>
        <div className="mt-2 flex flex-wrap items-baseline gap-3">
          <h1 className="font-mono text-2xl font-semibold tracking-tight">{order.code}</h1>
          <span className={statusTone(order.status)}>{statusLabel(order.status, order.shipping_method)}</span>
          <a
            href={`/painel/imprimir/${order.id}`}
            target="_blank"
            rel="noopener"
            className="ml-auto rounded-md border bg-white px-3 py-1.5 text-sm hover:border-neutral-400"
          >
            Imprimir pedido
          </a>
        </div>
        <p className="text-sm text-neutral-500">
          Criado em {formatDateTime(order.created_at)}
          {order.paid_at && ` · pago em ${formatDateTime(order.paid_at)}`}
          {refundedAt && ` · estornado em ${formatDateTime(refundedAt)}`}
        </p>
      </div>

      {badMails.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {badMails.map((m) => (
            <p key={m.subject}>
              O e-mail &quot;{m.subject}&quot; para {order.customer_email} {emailStatusLabel(m.status, m.detail)}.
            </p>
          ))}
          <p className="mt-1">Confira o endereço com o cliente{order.customer_phone ? " pelo WhatsApp (ao lado)" : ""} e passe as informações do pedido por lá.</p>
        </div>
      )}

      {refundedAt && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Pedido cancelado e estornado em {formatDateTime(refundedAt)}. O cliente foi avisado por e-mail.
        </p>
      )}

      {order.stock_issue && !refundedAt && (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Este pedido foi pago, mas faltou estoque de algum item no momento da confirmação. Confira antes de enviar e,
          se preciso, combine com o cliente.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-xl border bg-white shadow-sm">
            <h2 className="border-b px-4 py-3 font-medium">Itens</h2>
            <ul className="divide-y text-sm">
              {order.order_items.map((i) => (
                <li key={i.id} className="flex justify-between gap-4 px-4 py-3">
                  <span>
                    {i.quantity}× {i.product_name}
                    {i.variant_name !== "Único" && <span className="text-neutral-500"> · {i.variant_name}</span>}
                    <span className="text-neutral-500"> ({formatBRL(i.unit_price_cents)} cada)</span>
                  </span>
                  <span>{formatBRL(i.unit_price_cents * i.quantity)}</span>
                </li>
              ))}
            </ul>
            <div className="space-y-1 border-t px-4 py-3 text-sm">
              <p className="flex justify-between"><span>Subtotal</span><span>{formatBRL(order.subtotal_cents)}</span></p>
              {!fromLink && !counter && (
                <p className="flex justify-between">
                  <span>{isPickup ? "Retirada na loja" : order.shipping_method}</span>
                  <span>{formatBRL(order.shipping_cents)}</span>
                </p>
              )}
              {order.discount_cents > 0 && (
                <p className="flex justify-between text-emerald-700"><span>{counter ? "Desconto" : "Desconto Pix"}</span><span>−{formatBRL(order.discount_cents)}</span></p>
              )}
              <p className="flex justify-between font-semibold"><span>Total</span><span>{formatBRL(order.total_cents)}</span></p>
            </div>
            {fees && (
              <div className="space-y-1 border-t bg-neutral-50 px-4 py-3 text-sm">
                <p className="flex justify-between text-neutral-600">
                  <span>Taxa do Mercado Pago ({feePercent(fees)})</span>
                  <span>−{formatBRL(fees.feeCents)}</span>
                </p>
                <p className="flex justify-between font-semibold text-emerald-700">
                  <span>Você recebe</span>
                  <span>{formatBRL(fees.netCents)}</span>
                </p>
              </div>
            )}
          </section>

          <section className="rounded-xl border bg-white shadow-sm">
            <h2 className="border-b px-4 py-3 font-medium">Pagamentos</h2>
            {order.payments.length === 0 ? (
              <p className="px-4 py-3 text-sm text-neutral-500">Nenhuma tentativa de pagamento ainda.</p>
            ) : (
              <ul className="divide-y text-sm">
                {[...order.payments]
                  .sort((a, b) => b.created_at.localeCompare(a.created_at))
                  .map((p) => (
                    <li key={p.id} className="flex justify-between gap-4 px-4 py-3">
                      <span>
                        {p.method === "pix" ? "Pix" : "Cartão"} · {PAYMENT_STATUS[p.status] ?? p.status}
                        <span className="text-neutral-500"> · {formatDateTime(p.created_at)}</span>
                      </span>
                      <span>{formatBRL(p.amount_cents)}</span>
                    </li>
                  ))}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <OrderActions
            orderId={order.id}
            status={order.status}
            shippingMethod={order.shipping_method}
            trackingCode={order.tracking_code}
            transitions={MEMBER_TRANSITIONS[order.status]}
            refundable={refundable}
          />
          {refundable && approved && (
            <RefundSection orderId={order.id} totalLabel={formatBRL(order.total_cents)} method={approved.method} stockIssue={order.stock_issue} />
          )}

          <section className="space-y-1 rounded-xl border bg-white shadow-sm px-4 py-3 text-sm">
            <h2 className="mb-2 font-medium">Cliente</h2>
            <p>{order.customer_name}</p>
            {order.customer_email && (
              <p><a href={`mailto:${order.customer_email}`} className="font-medium text-primary-700 hover:underline">{order.customer_email}</a></p>
            )}
            {order.customer_phone && (
              <p>
                {formatPhone(order.customer_phone)}
                {phone && (
                  <a href={`https://wa.me/${phone}`} target="_blank" rel="noopener noreferrer" className="ml-2 underline">
                    WhatsApp
                  </a>
                )}
              </p>
            )}
            {order.customer_cpf && <p className="text-neutral-500">CPF {formatCPF(order.customer_cpf)}</p>}
          </section>

          <section className="space-y-1 rounded-xl border bg-white shadow-sm px-4 py-3 text-sm">
            <h2 className="mb-2 font-medium">Entrega</h2>
            {counter ? (
              <div className="space-y-2">
                <p className="text-neutral-600">
                  Venda no balcão{counterPayment ? `, paga em ${COUNTER_PAYMENTS[counterPayment].toLowerCase()}` : ""}. Entregue na hora.
                </p>
                {order.status !== "canceled" && <CancelSale orderId={order.id} code={order.code} />}
              </div>
            ) : fromLink ? (
              <p className="text-neutral-600">
                Pago por <Link href="/painel/links" className="font-medium text-primary-700 hover:underline">link de pagamento</Link>. Se houver
                entrega, combine com o cliente.
              </p>
            ) : isPickup ? (
              <p>Retirada na loja</p>
            ) : address ? (
              <>
                <p>{order.shipping_method}</p>
                <p>
                  {address.street}, {address.number}
                  {address.complement && ` - ${address.complement}`}
                </p>
                <p>{address.district} · {address.city}/{address.state}</p>
                <p>CEP {address.cep}</p>
              </>
            ) : (
              <p>{order.shipping_method}</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
