import Link from "next/link";
import { requireStore } from "@/lib/panel";
import { formatBRL } from "@/lib/money";
import { saoPauloBoundaries } from "@/lib/format";
import { SOLD_STATUSES } from "@/lib/order-status";
import { LOW_STOCK } from "@/lib/stock";

type LowStock = { id: string; name: string; stock: number; products: { id: string; name: string } };

export default async function PanelHome() {
  const { supabase, store } = await requireStore();
  const { startOfDay, startOfMonth } = saoPauloBoundaries();

  const [{ data: sold }, { count: toShip }, { count: stockIssues }, { data: lowData, count: lowCount }] = await Promise.all([
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
  ]);
  const lowStock = (lowData ?? []) as unknown as LowStock[];

  const month = (sold ?? []) as { total_cents: number; paid_at: string }[];
  const today = month.filter((o) => new Date(o.paid_at) >= startOfDay);
  const sum = (rows: { total_cents: number }[]) => rows.reduce((s, o) => s + o.total_cents, 0);

  const cards = [
    { label: "Vendas hoje", value: formatBRL(sum(today)), detail: `${today.length} pedido(s)`, accent: "border-t-primary-500" },
    { label: "Vendas no mês", value: formatBRL(sum(month)), detail: `${month.length} pedido(s)`, accent: "border-t-emerald-500" },
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

      <div className="grid gap-4 sm:grid-cols-3">
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
