import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { formatBRL } from "@/lib/money";
import { formatDateTime } from "@/lib/format";
import { daysLate, formatDay, invoiceTitle, todayBR } from "@/lib/billing";
import { ColumnChart } from "@/lib/column-chart";
import {
  type FinanceInvoice,
  type FinanceStore,
  type StoreBilling,
  financeSummary,
  monthLabel,
  receivedByMonth,
  storeBillingStatus,
} from "@/lib/finance";

export const metadata = { title: "Financeiro · PMS app" };

const STATUS_TONE: Record<StoreBilling, string> = {
  "em dia": "bg-emerald-100 text-emerald-800 ring-emerald-200",
  "a iniciar": "bg-blue-100 text-blue-800 ring-blue-200",
  isenta: "bg-neutral-100 text-neutral-700 ring-neutral-200",
  vencida: "bg-amber-100 text-amber-900 ring-amber-200",
  suspensa: "bg-red-100 text-red-800 ring-red-200",
};
const METHODS: Record<string, string> = { pix: "Pix", manual: "baixa manual", account_money: "saldo MP", bolbradesco: "boleto", pec: "boleto" };
const method = (m: string | null) => (m ? (METHODS[m] ?? "cartão") : "");
const fee = (cents: number) => (cents ? formatBRL(cents) : "isenta");

export default async function FinancePage() {
  const { db } = await requireAdmin();
  const [{ data: storeRows }, { data: invoiceRows, error }] = await Promise.all([
    db.from("stores").select("id, name, status, setup_fee_cents, monthly_fee_cents, billing_starts_on, suspended_for_billing").order("name"),
    db.from("store_invoices").select("id, store_id, kind, reference_month, amount_cents, due_date, status, paid_at, payment_method"),
  ]);
  if (error) return <p className="rounded-xl border bg-white p-5 text-sm text-neutral-500">Rode o SQL da cobrança (20261024000000) para ver o financeiro.</p>;

  const stores = (storeRows ?? []) as FinanceStore[];
  const invoices = (invoiceRows ?? []) as FinanceInvoice[];
  const names = new Map(stores.map((s) => [s.id, s.name]));
  const today = todayBR();
  const s = financeSummary(stores, invoices, today);
  const months = receivedByMonth(invoices, today, 12);
  const yearCents = months.reduce((sum, m) => sum + m.total, 0);
  const open = invoices.filter((i) => i.status === "open").sort((a, b) => a.due_date.localeCompare(b.due_date));
  const recent = invoices
    .filter((i) => i.status === "paid" && i.paid_at)
    .sort((a, b) => b.paid_at!.localeCompare(a.paid_at!))
    .slice(0, 10);
  const card = "rounded-xl border bg-white p-5 shadow-sm";

  const tiles = [
    { label: "Mensalidades contratadas", value: formatBRL(s.mrrCents), detail: `${s.payingStores} ${s.payingStores === 1 ? "loja" : "lojas"} pagando por mês`, accent: "border-t-primary-500" },
    { label: "Recebido no mês", value: formatBRL(s.receivedCents), detail: `${s.receivedCount} ${s.receivedCount === 1 ? "pagamento" : "pagamentos"}`, accent: "border-t-emerald-500" },
    { label: "A receber", value: formatBRL(s.upcomingCents), detail: `${s.upcomingCount} ${s.upcomingCount === 1 ? "fatura a vencer" : "faturas a vencer"}`, accent: "border-t-sky-500" },
    { label: "Vencido", value: formatBRL(s.overdueCents), detail: s.overdueCount ? `${s.overdueCount} ${s.overdueCount === 1 ? "fatura vencida" : "faturas vencidas"}` : "nenhuma fatura vencida", accent: s.overdueCount ? "border-t-red-500" : "border-t-neutral-300" },
  ];

  const columns = months.map((m, i) => ({
    key: m.month,
    cents: m.total,
    // Um mês sim, outro não (sempre o atual), para os rótulos não encavalarem no celular.
    axisLabel: (months.length - 1 - i) % 2 === 0 ? monthLabel(m.month) : undefined,
    title: monthLabel(m.month),
    detail: m.count ? [m.monthly && `mensalidades ${formatBRL(m.monthly)}`, m.setup && `implantação ${formatBRL(m.setup)}`].filter(Boolean).join(" · ") : "sem recebimentos",
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Financeiro</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className={`rounded-xl border border-t-4 bg-white p-5 shadow-sm ${t.accent}`}>
            <p className="text-sm text-neutral-500">{t.label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{t.value}</p>
            <p className="text-xs text-neutral-500">{t.detail}</p>
          </div>
        ))}
      </div>

      <section className={card}>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <h2 className="font-medium">Recebido por mês</h2>
            <p className="text-sm text-neutral-500">Últimos 12 meses, pela data do pagamento (implantação e mensalidades)</p>
          </div>
          <p className="text-2xl font-semibold tracking-tight">{formatBRL(yearCents)}</p>
        </div>
        {yearCents > 0 ? (
          <ColumnChart columns={columns} />
        ) : (
          <p className="py-12 text-center text-sm text-neutral-500">Nenhum recebimento nos últimos 12 meses.</p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={card}>
          <h2 className="mb-3 font-medium">Faturas em aberto</h2>
          {open.length === 0 ? (
            <p className="text-sm text-neutral-500">Nenhuma fatura em aberto.</p>
          ) : (
            <ul className="divide-y text-sm">
              {open.map((i) => {
                const late = daysLate(i.due_date, today);
                return (
                  <li key={i.id} className="flex items-start justify-between gap-3 py-2.5">
                    <Link href={`/admin/lojas/${i.store_id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                      {names.get(i.store_id) ?? "Loja"}
                      <span className="block truncate text-xs font-normal text-neutral-500">{invoiceTitle(i)}</span>
                    </Link>
                    <span className="shrink-0 text-right">
                      {formatBRL(i.amount_cents)}
                      <span className={`block text-xs ${late ? "font-medium text-red-700" : "text-neutral-500"}`}>
                        {late ? `${late} ${late === 1 ? "dia" : "dias"} de atraso` : `vence ${formatDay(i.due_date)}`}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className={card}>
          <h2 className="mb-3 font-medium">Últimos recebimentos</h2>
          {recent.length === 0 ? (
            <p className="text-sm text-neutral-500">Nenhum recebimento ainda.</p>
          ) : (
            <ul className="divide-y text-sm">
              {recent.map((i) => (
                <li key={i.id} className="flex items-start justify-between gap-3 py-2.5">
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {names.get(i.store_id) ?? "Loja"}
                    <span className="block truncate text-xs font-normal text-neutral-500">{invoiceTitle(i)}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    {formatBRL(i.amount_cents)}
                    <span className="block text-xs text-neutral-500">
                      {formatDateTime(i.paid_at!).slice(0, 10)}
                      {i.payment_method && ` · ${method(i.payment_method)}`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className={card}>
        <h2 className="mb-3 font-medium">Lojas e mensalidades</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-neutral-500">
              <tr>
                <th className="py-2 pr-4 font-medium">Loja</th>
                <th className="py-2 pr-4 text-right font-medium">Mensalidade</th>
                <th className="py-2 pr-4 text-right font-medium">Implantação</th>
                <th className="py-2 pr-4 font-medium">Desde</th>
                <th className="py-2 font-medium">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {stores.map((st) => {
                const status = storeBillingStatus(st, invoices, today);
                return (
                  <tr key={st.id}>
                    <td className="py-2.5 pr-4">
                      <Link href={`/admin/lojas/${st.id}`} className="font-medium hover:underline">{st.name}</Link>
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{fee(st.monthly_fee_cents)}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{fee(st.setup_fee_cents)}</td>
                    <td className="py-2.5 pr-4 text-neutral-500">{st.monthly_fee_cents && st.billing_starts_on ? formatDay(st.billing_starts_on) : "—"}</td>
                    <td className="py-2.5">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_TONE[status]}`}>{status}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
