import Link from "next/link";
import { requireStore } from "@/lib/panel";
import { formatBRL } from "@/lib/money";
import { formatDateTime } from "@/lib/format";
import { ORDER_STATUSES, statusLabel, type OrderStatus } from "@/lib/order-status";

const PAGE_SIZE = 30;

type Row = {
  id: string;
  code: string;
  status: OrderStatus;
  customer_name: string;
  shipping_method: string;
  total_cents: number;
  stock_issue: boolean;
  created_at: string;
};

// Por padrão esconde pedidos expirados (Pix não pago), que só poluem a lista.
const DEFAULT_STATUSES = ORDER_STATUSES.filter((s) => s !== "expired");

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const { supabase, store } = await requireStore();
  const sp = await searchParams;
  const status = ORDER_STATUSES.includes(sp.status as OrderStatus) ? (sp.status as OrderStatus) : null;
  const q = (sp.q ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  let query = supabase
    .from("orders")
    .select("id, code, status, customer_name, shipping_method, total_cents, stock_issue, created_at", {
      count: "exact",
    })
    .eq("store_id", store.id)
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  query = status ? query.eq("status", status) : query.in("status", DEFAULT_STATUSES);
  if (q) query = query.ilike("code", `%${q}%`);

  const { data, count } = await query;
  const orders = (data ?? []) as Row[];
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const href = (params: Record<string, string | number | null>) => {
    const next = new URLSearchParams();
    const merged = { status, q: q || null, page: null, ...params };
    for (const [k, v] of Object.entries(merged)) if (v != null && v !== "") next.set(k, String(v));
    const s = next.toString();
    return s ? `/painel/pedidos?${s}` : "/painel/pedidos";
  };

  const filters: { label: string; value: OrderStatus | null }[] = [
    { label: "Todos", value: null },
    { label: "Pagos", value: "paid" },
    { label: "Em preparação", value: "preparing" },
    { label: "Enviados", value: "shipped" },
    { label: "Aguardando pagamento", value: "pending_payment" },
    { label: "Entregues", value: "delivered" },
    { label: "Cancelados", value: "canceled" },
    { label: "Expirados", value: "expired" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Pedidos</h1>
        <form action="/painel/pedidos" className="flex gap-2">
          {status && <input type="hidden" name="status" value={status} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar código"
            className="w-40 rounded-md border bg-white px-3 py-1.5 text-sm"
          />
          <button type="submit" className="rounded-md border bg-white px-3 py-1.5 text-sm">Buscar</button>
        </form>
      </div>

      <nav className="flex flex-wrap gap-2 text-sm">
        {filters.map((f) => (
          <Link
            key={f.label}
            href={href({ status: f.value })}
            className={`rounded-full border px-3 py-1 ${status === f.value ? "border-neutral-900 bg-neutral-900 text-white" : "bg-white"}`}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {orders.length === 0 ? (
        <p className="rounded-md border bg-white px-4 py-8 text-center text-neutral-500">Nenhum pedido encontrado.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Pedido</th>
                <th className="px-4 py-2 font-medium">Data</th>
                <th className="px-4 py-2 font-medium">Cliente</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-2 font-mono">
                    <Link href={`/painel/pedidos/${o.id}`} className="underline">{o.code}</Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2">{formatDateTime(o.created_at)}</td>
                  <td className="px-4 py-2">{o.customer_name}</td>
                  <td className="whitespace-nowrap px-4 py-2">
                    {statusLabel(o.status, o.shipping_method)}
                    {o.stock_issue && <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-800">sem estoque</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">{formatBRL(o.total_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          {page > 1 ? <Link href={href({ page: page - 1 })} className="underline">← Anteriores</Link> : <span />}
          <span className="text-neutral-500">Página {page} de {pages}</span>
          {page < pages ? <Link href={href({ page: page + 1 })} className="underline">Próximos →</Link> : <span />}
        </div>
      )}
    </div>
  );
}
