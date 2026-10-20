import Link from "next/link";
import { requireStore } from "@/lib/panel";
import { formatBRL } from "@/lib/money";
import { saoPauloBoundaries } from "@/lib/format";
import { SOLD_STATUSES } from "@/lib/order-status";

export default async function PanelHome() {
  const { supabase, store } = await requireStore();
  const { startOfDay, startOfMonth } = saoPauloBoundaries();

  const [{ data: sold }, { count: toShip }, { count: stockIssues }] = await Promise.all([
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
  ]);

  const month = (sold ?? []) as { total_cents: number; paid_at: string }[];
  const today = month.filter((o) => new Date(o.paid_at) >= startOfDay);
  const sum = (rows: { total_cents: number }[]) => rows.reduce((s, o) => s + o.total_cents, 0);

  const cards = [
    { label: "Vendas hoje", value: formatBRL(sum(today)), detail: `${today.length} pedido(s)` },
    { label: "Vendas no mês", value: formatBRL(sum(month)), detail: `${month.length} pedido(s)` },
    { label: "Para enviar", value: String(toShip ?? 0), detail: "pagos ou em preparação", href: "/painel/pedidos?status=paid" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Resumo</h1>

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
              <p className="mt-1 text-2xl font-semibold">{c.value}</p>
              <p className="text-xs text-neutral-500">{c.detail}</p>
            </>
          );
          return c.href ? (
            <Link key={c.label} href={c.href} className="rounded-md border bg-white p-4 hover:border-neutral-400">
              {body}
            </Link>
          ) : (
            <div key={c.label} className="rounded-md border bg-white p-4">
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}
