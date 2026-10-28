import Link from "next/link";
import { requireStore } from "@/lib/panel";
import { formatBRL } from "@/lib/money";
import { saoPauloBoundaries } from "@/lib/format";
import { COUNTER_PAYMENTS, type CounterPayment, cashSummary } from "@/lib/counter";
import { CounterPos, type PosPackage, type PosService, type PosVariant } from "./counter-pos";
import { CancelSale } from "./cancel-sale";

export const metadata = { title: "Vender · PMS app" };

type VariantRow = { id: string; name: string; price_cents: number; stock: number; products: { name: string; product_images: { path: string; position: number }[] } };
type SaleRow = { id: string; code: string; status: string; total_cents: number; paid_at: string; counter_payment: CounterPayment; customer_name: string };

// Venda no balcão: caixa simples para vendas presenciais, que baixam o estoque e entram nos relatórios.
export default async function SellPage() {
  const { supabase, store } = await requireStore("vendas");
  const { startOfDay } = saoPauloBoundaries();
  const [{ data: rows }, { data: sales, error }, { data: svcRows }, { data: pkgRows }] = await Promise.all([
    supabase
      .from("product_variants")
      .select("id, name, price_cents, stock, products!inner(name, product_images(path, position))")
      .eq("store_id", store.id)
      .eq("active", true)
      .eq("products.active", true)
      .order("name", { referencedTable: "products" })
      .limit(1000),
    supabase
      .from("orders")
      .select("id, code, status, total_cents, paid_at, counter_payment, customer_name")
      .eq("store_id", store.id)
      .not("counter_payment", "is", null)
      .gte("paid_at", startOfDay.toISOString())
      .order("paid_at", { ascending: false }),
    // Serviços da agenda (atendimento sem horário): quem faz cada um. Sem a agenda, a lista vem vazia.
    supabase
      .from("services")
      .select("id, name, price_cents, active, professional_services(professionals(id, name, active))")
      .eq("store_id", store.id)
      .eq("active", true)
      .order("position")
      .order("name"),
    // Pacotes de sessões à venda (sem o SQL dos pacotes, a lista vem vazia).
    supabase.from("service_packages").select("id, name, sessions, price_cents").eq("store_id", store.id).eq("active", true).order("name"),
  ]);
  const packages: PosPackage[] = ((pkgRows ?? []) as { id: string; name: string; sessions: number; price_cents: number }[]).map((p) => ({ id: p.id, name: p.name, sessions: p.sessions, priceCents: p.price_cents }));

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Vender</h1>
        <p className="text-sm text-neutral-600">Este recurso está sendo instalado. Volte em alguns minutos.</p>
      </div>
    );
  }

  const variants: PosVariant[] = ((rows ?? []) as unknown as VariantRow[])
    .map((v) => ({
      variantId: v.id,
      label: v.name === "Único" ? v.products.name : `${v.products.name} · ${v.name}`,
      priceCents: v.price_cents,
      stock: v.stock,
      image: [...v.products.product_images].sort((a, b) => a.position - b.position)[0]?.path ?? null,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  const services: PosService[] = ((svcRows ?? []) as unknown as { id: string; name: string; price_cents: number; professional_services: { professionals: { id: string; name: string; active: boolean } | null }[] }[])
    .map((sv) => ({
      id: sv.id,
      name: sv.name,
      priceCents: sv.price_cents,
      pros: sv.professional_services.map((ps) => ps.professionals).filter((p): p is { id: string; name: string; active: boolean } => !!p?.active).map((p) => ({ id: p.id, name: p.name })),
    }))
    .filter((sv) => sv.pros.length > 0);
  const today = ((sales ?? []) as SaleRow[]);
  const valid = today.filter((s) => s.status !== "canceled");
  const cash = cashSummary(valid);
  const hm = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Vender no balcão</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Registre as vendas da loja física (dinheiro, Pix, maquininha): o estoque baixa na hora e a venda entra no Resumo junto com as vendas
          online.{services.length > 0 && " Serviços para quem chegou sem horário entram na comissão do profissional; cliente agendado se recebe pela Agenda."}
        </p>
      </div>

      <CounterPos variants={variants} services={services} packages={packages} />

      <section className="rounded-xl border bg-white shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
          <h2 className="font-medium">Caixa de hoje</h2>
          <p className="text-sm">
            <strong>{formatBRL(cash.totalCents)}</strong> em {cash.count} {cash.count === 1 ? "venda" : "vendas"}
            {cash.methods.length > 0 && <span className="text-neutral-500"> · {cash.methods.map((m) => `${m.label} ${formatBRL(m.cents)}`).join(" · ")}</span>}
          </p>
        </div>
        {today.length === 0 ? (
          <p className="px-4 py-4 text-sm text-neutral-500">Nenhuma venda no balcão hoje.</p>
        ) : (
          <ul className="divide-y text-sm">
            {today.map((s) => (
              <li key={s.id} className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2 ${s.status === "canceled" ? "text-neutral-400 line-through" : ""}`}>
                <span>
                  {hm(s.paid_at)} · <Link href={`/painel/pedidos/${s.id}`} className="font-medium text-primary-700 hover:underline">{s.code}</Link> · {COUNTER_PAYMENTS[s.counter_payment]}
                  {s.customer_name !== "Cliente do balcão" && ` · ${s.customer_name}`}
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-medium">{formatBRL(s.total_cents)}</span>
                  {s.status !== "canceled" && <CancelSale orderId={s.id} code={s.code} />}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
