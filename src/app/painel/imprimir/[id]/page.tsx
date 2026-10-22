import { notFound } from "next/navigation";
import { requireStore } from "@/lib/panel";
import { formatBRL } from "@/lib/money";
import { formatCPF, formatDateTime, formatPhone } from "@/lib/format";
import { isUuid } from "@/lib/validation";
import { statusLabel, type OrderStatus } from "@/lib/order-status";
import { PrintButton } from "./print-button";

export const metadata = { title: "Imprimir pedido", robots: { index: false } };

type Order = {
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
  created_at: string;
  paid_at: string | null;
  order_items: { id: string; product_name: string; variant_name: string; unit_price_cents: number; quantity: number }[];
};

// Folha de separação do pedido (A4, preto e branco), fora do layout do painel.
export default async function PrintOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase, store } = await requireStore();

  const { data } = await supabase
    .from("orders")
    .select(
      "code, status, customer_name, customer_email, customer_cpf, customer_phone, shipping_address, shipping_method, subtotal_cents, shipping_cents, total_cents, discount_cents, created_at, paid_at, order_items(id, product_name, variant_name, unit_price_cents, quantity)",
    )
    .eq("id", id)
    .eq("store_id", store.id)
    .maybeSingle();
  if (!data) notFound();
  const order = data as Order;
  const a = order.shipping_address;
  const isPickup = order.shipping_method === "pickup";
  const units = order.order_items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <div className="min-h-screen bg-neutral-100 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end gap-2 px-4 print:hidden">
        <PrintButton />
      </div>

      <article className="mx-auto max-w-[210mm] space-y-6 bg-white p-10 text-sm text-black shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b-2 border-black pb-4">
          <div>
            <p className="text-lg font-bold">{store.name}</p>
            <p>Pedido de separação</p>
          </div>
          <div className="text-right">
            <p className="font-mono text-2xl font-bold">{order.code}</p>
            <p>{statusLabel(order.status, order.shipping_method)}</p>
            <p>Feito em {formatDateTime(order.created_at)}</p>
            {order.paid_at && <p>Pago em {formatDateTime(order.paid_at)}</p>}
          </div>
        </header>

        <div className="grid grid-cols-2 gap-6">
          <section>
            <h2 className="mb-1 font-bold uppercase">Cliente</h2>
            <p>{order.customer_name}</p>
            <p>CPF {formatCPF(order.customer_cpf)}</p>
            {order.customer_phone && <p>{formatPhone(order.customer_phone)}</p>}
            <p>{order.customer_email}</p>
          </section>
          <section>
            <h2 className="mb-1 font-bold uppercase">Entrega</h2>
            {isPickup ? (
              <p className="font-semibold">Retirada na loja</p>
            ) : (
              <>
                <p className="font-semibold">{order.shipping_method}</p>
                {a && (
                  <>
                    <p>
                      {a.street}, {a.number}
                      {a.complement && ` - ${a.complement}`}
                    </p>
                    <p>{a.district}</p>
                    <p>{a.city}/{a.state}</p>
                    <p>CEP {a.cep.replace(/^(\d{5})(\d{3})$/, "$1-$2")}</p>
                  </>
                )}
              </>
            )}
          </section>
        </div>

        <section>
          <h2 className="mb-2 font-bold uppercase">Itens ({units} {units === 1 ? "unidade" : "unidades"})</h2>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-black text-left">
                <th className="w-10 py-1.5">OK</th>
                <th className="w-14 py-1.5">Qtd.</th>
                <th className="py-1.5">Produto</th>
                <th className="py-1.5 text-right">Unitário</th>
                <th className="py-1.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {order.order_items.map((i) => (
                <tr key={i.id} className="border-b border-neutral-400">
                  <td className="py-2"><span className="inline-block h-4 w-4 border border-black" /></td>
                  <td className="py-2 text-base font-bold">{i.quantity}</td>
                  <td className="py-2">
                    {i.product_name}
                    {i.variant_name !== "Único" && <span className="font-semibold"> · {i.variant_name}</span>}
                  </td>
                  <td className="py-2 text-right">{formatBRL(i.unit_price_cents)}</td>
                  <td className="py-2 text-right">{formatBRL(i.unit_price_cents * i.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="ml-auto mt-3 w-64 space-y-0.5">
            <p className="flex justify-between"><span>Subtotal</span><span>{formatBRL(order.subtotal_cents)}</span></p>
            <p className="flex justify-between"><span>Frete</span><span>{formatBRL(order.shipping_cents)}</span></p>
            {order.discount_cents > 0 && (
              <p className="flex justify-between"><span>Desconto Pix</span><span>−{formatBRL(order.discount_cents)}</span></p>
            )}
            <p className="flex justify-between border-t border-black pt-1 font-bold"><span>Total</span><span>{formatBRL(order.total_cents)}</span></p>
          </div>
        </section>

        <footer className="grid grid-cols-2 gap-6 pt-8">
          <p className="border-t border-black pt-1 text-center">Separado por</p>
          <p className="border-t border-black pt-1 text-center">Conferido por</p>
        </footer>
      </article>
    </div>
  );
}
