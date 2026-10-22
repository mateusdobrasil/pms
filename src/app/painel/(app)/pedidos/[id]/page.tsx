import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStore } from "@/lib/panel";
import { formatBRL } from "@/lib/money";
import { formatCPF, formatDateTime, formatPhone } from "@/lib/format";
import { isUuid } from "@/lib/validation";
import { MEMBER_TRANSITIONS, statusLabel, statusTone, type OrderStatus } from "@/lib/order-status";
import { OrderActions } from "./order-actions";

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
  payments: { id: string; method: "pix" | "card"; status: string; amount_cents: number; created_at: string }[];
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
      "id, code, status, customer_name, customer_email, customer_cpf, customer_phone, shipping_address, shipping_method, subtotal_cents, shipping_cents, total_cents, discount_cents, tracking_code, stock_issue, paid_at, created_at, order_items(id, product_name, variant_name, unit_price_cents, quantity), payments(id, method, status, amount_cents, created_at)",
    )
    .eq("id", id)
    .eq("store_id", store.id)
    .maybeSingle();
  if (!data) notFound();
  const order = data as Order;
  const isPickup = order.shipping_method === "pickup";
  const phone = order.customer_phone ? `55${order.customer_phone}` : null;
  const address = order.shipping_address;

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
        </p>
      </div>

      {order.stock_issue && (
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
              <p className="flex justify-between">
                <span>{isPickup ? "Retirada na loja" : order.shipping_method}</span>
                <span>{formatBRL(order.shipping_cents)}</span>
              </p>
              {order.discount_cents > 0 && (
                <p className="flex justify-between text-emerald-700"><span>Desconto Pix</span><span>−{formatBRL(order.discount_cents)}</span></p>
              )}
              <p className="flex justify-between font-semibold"><span>Total</span><span>{formatBRL(order.total_cents)}</span></p>
            </div>
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
          />

          <section className="space-y-1 rounded-xl border bg-white shadow-sm px-4 py-3 text-sm">
            <h2 className="mb-2 font-medium">Cliente</h2>
            <p>{order.customer_name}</p>
            <p><a href={`mailto:${order.customer_email}`} className="font-medium text-primary-700 hover:underline">{order.customer_email}</a></p>
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
            <p className="text-neutral-500">CPF {formatCPF(order.customer_cpf)}</p>
          </section>

          <section className="space-y-1 rounded-xl border bg-white shadow-sm px-4 py-3 text-sm">
            <h2 className="mb-2 font-medium">Entrega</h2>
            {isPickup ? (
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
