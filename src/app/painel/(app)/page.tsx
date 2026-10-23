import Link from "next/link";
import { requireStore } from "@/lib/panel";
import { formatBRL } from "@/lib/money";
import { saoPauloBoundaries } from "@/lib/format";
import { SOLD_STATUSES } from "@/lib/order-status";
import { LOW_STOCK } from "@/lib/stock";
import { todayBR } from "@/lib/billing";
import { dailySales, topProducts, windowStart } from "@/lib/sales";
import { SalesChart, TopProducts } from "./sales-chart";
import { FEE_FIELDS, paymentFees } from "@/lib/payments/fees";

const CHART_DAYS = 30;

type LowStock = { id: string; name: string; stock: number; products: { id: string; name: string } };

export default async function PanelHome() {
  const { supabase, store } = await requireStore();
  const { startOfDay, startOfMonth } = saoPauloBoundaries();
  const today = todayBR();
  const chartFrom = new Date(`${windowStart(today, CHART_DAYS)}T00:00:00-03:00`).toISOString();

  const [{ data: sold }, { count: toShip }, { count: stockIssues }, { data: lowData, count: lowCount }, { data: recent }, { data: recentItems }, { data: monthPayments }] = await Promise.all([
    supabase
      .from("orders")
      .select("total_cents, paid_at")
      .eq("store_id", store.id)
      .in("status", SOLD_STATUSES)
      .gte("paid_at", startOfMonth.toISOString()),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("store_id", store.id)
      .in("status", ["paid", "preparing"]),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("store_id", store.id)
      .eq("stock_issue", true)
      .in("status", ["paid", "preparing"]),
    // Variações à venda (produto visível e variação ativa) com estoque baixo ou zerado.
    supabase
      .from("product_variants")
      .select("id, name, stock, products!inner(id, name)", { count: "exact" })
      .eq("store_id", store.id)
      .eq("active", true)
      .eq("products.active", true)
      .lte("stock", LOW_STOCK)
      .order("stock")
      .limit(10),
    // Últimos 30 dias: vendas por dia e itens vendidos (mais vendidos).
    supabase
      .from("orders")
      .select("total_cents, paid_at")
      .eq("store_id", store.id)
      .in("status", SOLD_STATUSES)
      .gte("paid_at", chartFrom),
    supabase
      .from("order_items")
      .select("product_name, unit_price_cents, quantity, orders!inner(status, paid_at)")
      .eq("store_id", store.id)
      .in("orders.status", SOLD_STATUSES)
      .gte("orders.paid_at", chartFrom),
    // Pagamentos aprovados das vendas do mês: taxa do Mercado Pago e valor líquido.
    supabase
      .from("payments")
      .select(`order_id, amount_cents, ${FEE_FIELDS}, orders!inner(status, paid_at)`)
      .eq("store_id", store.id)
      .eq("status", "approved")
      .in("orders.status", SOLD_STATUSES)
      .gte("orders.paid_at", startOfMonth.toISOString()),
  ]);

  // Você recebe = pago menos a taxa do Mercado Pago (um pagamento por pedido).
  let monthNet = 0;
  let monthFees = 0;
  const counted = new Set<string>();
  for (const p of (monthPayments ?? []) as { order_id: string; amount_cents: number; fee: unknown; net: unknown }[]) {
    const f = counted.has(p.order_id) ? null : paymentFees(p.amount_cents, p.fee, p.net);
    if (!f) continue;
    counted.add(p.order_id);
    monthNet += f.netCents;
    monthFees += f.feeCents;
  }
  const days = dailySales((recent ?? []) as { total_cents: number; paid_at: string }[], today, CHART_DAYS);
  const best = topProducts((recentItems ?? []) as { product_name: string; unit_price_cents: number; quantity: number }[]);
  const periodCents = days.reduce((s, d) => s + d.cents, 0);
  const periodOrders = days.reduce((s, d) => s + d.orders, 0);
  const lowStock = (lowData ?? []) as unknown as LowStock[];
  // "Avise-me" pendentes nas opções com estoque baixo (ajuda a decidir o que repor).
  const { data: waitingRows } = lowStock.length
    ? await supabase.from("stock_alerts").select("variant_id").is("notified_at", null).in("variant_id", lowStock.map((v) => v.id))
    : { data: [] };
  const waitingFor = (id: string) => (waitingRows ?? []).filter((a) => a.variant_id === id).length;

  // E-mails a clientes que não chegaram nos últimos 30 dias (voltaram ou viraram spam).
  const { data: badMailRows } = await supabase
    .from("sent_emails")
    .select("ref_id, to_email")
    .eq("store_id", store.id)
    .eq("kind", "order")
    .in("status", ["bounced", "complained"])
    .gte("created_at", chartFrom);
  const badMailOrders = [...new Map((badMailRows ?? []).map((m) => [m.ref_id as string, m.to_email as string])).entries()];
  const { data: badMailCodes } = badMailOrders.length
    ? await supabase.from("orders").select("id, code").in("id", badMailOrders.map(([id]) => id))
    : { data: [] };

  const month = (sold ?? []) as { total_cents: number; paid_at: string }[];
  const todays = month.filter((o) => new Date(o.paid_at) >= startOfDay);
  // Vendas do mês sem a taxa informada pelo Mercado Pago ficam fora do "Você recebe" (e o cartão avisa quantas).
  const unknownFees = Math.max(0, month.length - counted.size);
  const sum = (rows: { total_cents: number }[]) => rows.reduce((s, o) => s + o.total_cents, 0);

  const cards = [
    { label: "Vendas hoje", value: formatBRL(sum(todays)), detail: `${todays.length} pedido(s)`, accent: "border-t-primary-500" },
    { label: "Vendas no mês", value: formatBRL(sum(month)), detail: `${month.length} pedido(s)`, accent: "border-t-sky-500" },
    {
      label: "Você recebe no mês",
      value: formatBRL(monthNet),
      detail: `${formatBRL(monthFees)} de taxas do Mercado Pago${unknownFees ? ` · ${unknownFees} pedido(s) sem taxa informada` : ""}`,
      accent: "border-t-emerald-500",
    },
    { label: "Para enviar", value: String(toShip ?? 0), detail: "pagos ou em preparação", href: "/painel/pedidos?status=paid", accent: "border-t-amber-500" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Resumo</h1>

      {(stockIssues ?? 0) > 0 && (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {stockIssues} pedido(s) pago(s) sem estoque suficiente. Confira antes de enviar.
        </p>
      )}

      {(badMailCodes ?? []).length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          E-mail não chegou ao cliente (endereço errado ou caixa cheia) nos pedidos{" "}
          {(badMailCodes ?? []).map((o, i) => (
            <span key={o.id}>
              {i > 0 && ", "}
              <Link href={`/painel/pedidos/${o.id}`} className="font-mono font-semibold underline">{o.code}</Link>
            </span>
          ))}
          . Fale com o cliente pelo WhatsApp.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => {
          const body = (
            <>
              <p className="text-sm text-neutral-500">{c.label}</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight">{c.value}</p>
              <p className="text-xs text-neutral-500">{c.detail}</p>
            </>
          );
          return c.href ? (
            <Link key={c.label} href={c.href} className={`rounded-xl border border-t-4 bg-white p-5 shadow-sm transition hover:shadow-md ${c.accent}`}>
              {body}
            </Link>
          ) : (
            <div key={c.label} className={`rounded-xl border border-t-4 bg-white p-5 shadow-sm ${c.accent}`}>
              {body}
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border bg-white p-5 shadow-sm lg:col-span-2">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <div>
              <h2 className="font-medium">Vendas dos últimos {CHART_DAYS} dias</h2>
              <p className="text-sm text-neutral-500">
                {periodOrders === 1 ? "1 pedido" : `${periodOrders} pedidos`}
                {periodOrders > 0 && ` · ticket médio ${formatBRL(Math.round(periodCents / periodOrders))}`}
              </p>
            </div>
            <p className="text-2xl font-semibold tracking-tight">{formatBRL(periodCents)}</p>
          </div>
          {periodOrders > 0 ? (
            <SalesChart points={days} />
          ) : (
            <p className="py-12 text-center text-sm text-neutral-500">Nenhuma venda nos últimos {CHART_DAYS} dias. Quando chegarem, o gráfico aparece aqui.</p>
          )}
        </section>

        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="font-medium">Mais vendidos</h2>
          <p className="mb-4 text-sm text-neutral-500">Últimos {CHART_DAYS} dias, pelo valor vendido</p>
          {best.length > 0 ? <TopProducts products={best} /> : <p className="py-8 text-center text-sm text-neutral-500">Nenhuma venda ainda.</p>}
        </section>
      </div>

      {lowStock.length > 0 && (
        <section className="rounded-xl border bg-white shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b px-4 py-3">
            <h2 className="shrink-0 font-medium">Estoque baixo</h2>
            <span className="text-xs text-neutral-500">
              {(lowCount ?? lowStock.length) === 1 ? "1 opção" : `${lowCount ?? lowStock.length} opções`} com {LOW_STOCK} unidades ou menos
            </span>
          </div>
          <ul className="divide-y text-sm">
            {lowStock.map((v) => (
              <li key={v.id}>
                <Link
                  href={`/painel/produtos/${v.products.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-2.5 hover:bg-neutral-50"
                >
                  <span className="min-w-0 truncate">
                    {v.products.name}
                    {v.name !== "Único" && <span className="text-neutral-500"> · {v.name}</span>}
                  </span>
                  {waitingFor(v.id) > 0 && (
                    <span className="ml-auto shrink-0 text-xs text-sky-700">
                      {waitingFor(v.id)} {waitingFor(v.id) === 1 ? "pessoa esperando" : "pessoas esperando"}
                    </span>
                  )}
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      v.stock === 0 ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {v.stock === 0 ? "Esgotado" : `${v.stock} ${v.stock === 1 ? "unidade" : "unidades"}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
