import Link from "next/link";
import { notFound } from "next/navigation";
import { getStoreByDomain } from "@/lib/store";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatBRL } from "@/lib/money";
import { isUuid } from "@/lib/validation";
import { statusLabel } from "@/lib/order-status";
import { PaymentPanel } from "./payment-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Seu pedido", robots: { index: false } };

type Item = { id: string; product_name: string; variant_name: string; unit_price_cents: number; quantity: number };

// Página única do pedido: pagamento, confirmação e acompanhamento (link com public_token, sem login).
export default async function OrderPage({ params }: { params: Promise<{ domain: string; token: string }> }) {
  const { domain, token } = await params;
  if (!isUuid(token)) notFound();
  const store = await getStoreByDomain(domain);
  if (!store) notFound();

  const db = createAdminClient();
  const { data: order } = await db
    .from("orders")
    .select(
      "id, code, status, customer_email, shipping_method, subtotal_cents, shipping_cents, total_cents, tracking_code, expires_at, order_items(id, product_name, variant_name, unit_price_cents, quantity)",
    )
    .eq("store_id", store.id)
    .eq("public_token", token)
    .maybeSingle();
  if (!order) notFound();

  const expired =
    order.status === "expired" ||
    (order.status === "pending_payment" && order.expires_at && new Date(order.expires_at) < new Date());
  const awaitingPayment = order.status === "pending_payment" && !expired;

  let publicKey: string | null = null;
  if (awaitingPayment) {
    const { data: secret } = await db
      .from("store_secrets")
      .select("gateway_public_key")
      .eq("store_id", store.id)
      .maybeSingle();
    publicKey = secret?.gateway_public_key ?? null;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header>
        <p className="text-sm text-neutral-500">Pedido {order.code}</p>
        <h1 className="text-2xl font-semibold">{expired ? statusLabel("expired") : order.status === "paid" ? "Pagamento confirmado" : statusLabel(order.status, order.shipping_method)}</h1>
        {order.status === "paid" && (
          <p className="mt-2 text-neutral-600">
            Obrigado! Enviamos a confirmação para {order.customer_email}. Guarde este link para acompanhar o pedido.
          </p>
        )}
        {expired && <p className="mt-2 text-neutral-600">O prazo para pagamento acabou. <Link href="/" className="underline">Faça um novo pedido</Link>.</p>}
        {order.tracking_code && (
          <p className="mt-2 text-sm">
            Código de rastreio: <span className="font-mono">{order.tracking_code}</span>
          </p>
        )}
      </header>

      {awaitingPayment && (
        <PaymentPanel
          token={token}
          totalCents={order.total_cents}
          publicKey={publicKey}
          payerEmail={order.customer_email}
        />
      )}

      <section>
        <h2 className="mb-3 font-medium">Itens</h2>
        <ul className="divide-y rounded-md border text-sm">
          {(order.order_items as Item[]).map((i) => (
            <li key={i.id} className="flex justify-between gap-4 px-4 py-3">
              <span>
                {i.quantity}× {i.product_name}
                {i.variant_name !== "Único" && <span className="text-neutral-500"> · {i.variant_name}</span>}
              </span>
              <span>{formatBRL(i.unit_price_cents * i.quantity)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-1 text-sm">
          <p className="flex justify-between"><span>Subtotal</span><span>{formatBRL(order.subtotal_cents)}</span></p>
          <p className="flex justify-between">
            <span>{order.shipping_method === "pickup" ? "Retirada na loja" : order.shipping_method}</span>
            <span>{formatBRL(order.shipping_cents)}</span>
          </p>
          <p className="flex justify-between text-base font-semibold"><span>Total</span><span>{formatBRL(order.total_cents)}</span></p>
        </div>
      </section>
    </div>
  );
}
