import { requireStore } from "@/lib/panel";
import { formatBRL } from "@/lib/money";
import { formatDateTime } from "@/lib/format";
import { isUuid } from "@/lib/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPayment, type GatewayPayment } from "@/lib/payments/mercadopago";
import { BILLING, daysLate, formatDay, invoiceTitle, lastPayDay, todayBR } from "@/lib/billing";
import { INVOICE_FIELDS, type InvoiceRow, platformAccessToken, recordInvoicePayment } from "@/lib/billing-server";
import { payInvoice } from "./actions";
import { TERMS_PATH } from "@/lib/terms";
import { platformUrl } from "@/lib/urls";

export const metadata = { title: "Assinatura · PMS app" };

const METHODS: Record<string, string> = { pix: "Pix", manual: "baixa manual", account_money: "saldo Mercado Pago", bolbradesco: "boleto", pec: "boleto" };
const methodLabel = (m: string | null) => (m ? (METHODS[m] ?? "cartão") : "");

// Volta do Mercado Pago (?payment_id=...): confere o pagamento na hora, sem esperar o webhook.
async function syncReturn(storeId: string, paymentId: string | undefined): Promise<GatewayPayment | null> {
  const token = platformAccessToken();
  if (!token || !paymentId || !/^\d{1,20}$/.test(paymentId)) return null;
  try {
    const payment = await getPayment(paymentId, token);
    if (!payment.orderId || !isUuid(payment.orderId)) return null;
    const db = createAdminClient();
    const { data } = await db.from("store_invoices").select("id").eq("id", payment.orderId).eq("store_id", storeId).maybeSingle();
    if (!data) return null;
    await recordInvoicePayment(db, payment);
    return payment;
  } catch (err) {
    console.error("Conferência do retorno do Mercado Pago falhou", { paymentId, err });
    return null;
  }
}

export default async function BillingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { supabase, store } = await requireStore();
  const params = await searchParams;
  const returned = await syncReturn(store.id, params.payment_id);

  const [{ data: plan, error: planError }, { data: rows }] = await Promise.all([
    supabase.from("stores").select("setup_fee_cents, monthly_fee_cents, billing_starts_on, suspended_for_billing").eq("id", store.id).single(),
    supabase.from("store_invoices").select(INVOICE_FIELDS).eq("store_id", store.id).order("due_date", { ascending: false }),
  ]);
  const invoices = (rows ?? []) as InvoiceRow[];
  const open = invoices.filter((i) => i.status === "open").sort((a, b) => a.due_date.localeCompare(b.due_date));
  const history = invoices.filter((i) => i.status !== "open");
  const today = todayBR();
  const card = "rounded-xl border bg-white p-5 shadow-sm";

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Assinatura</h1>
        <p className="mt-1 text-sm text-neutral-600">Faturas da sua loja no PMS app. Pague por Pix, cartão ou boleto; a confirmação é automática.</p>
      </div>

      {returned?.status === "approved" && (
        <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Pagamento confirmado. Obrigado!</p>
      )}
      {returned?.status === "pending" && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Pagamento em processamento. Pix costuma confirmar em minutos; boleto, em até 3 dias úteis. A fatura é baixada sozinha.
        </p>
      )}
      {returned && (returned.status === "rejected" || returned.status === "expired") && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">O pagamento não foi aprovado. Tente de novo com outra forma de pagamento.</p>
      )}
      {params.erro === "indisponivel" && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          Não foi possível abrir o pagamento agora. Tente de novo em alguns minutos ou fale com o suporte.
        </p>
      )}

      {planError || !plan ? (
        <p className={`${card} text-sm text-neutral-500`}>Nenhuma cobrança configurada para a sua loja.</p>
      ) : (
        <section className={`${card} grid gap-4 text-sm sm:grid-cols-2`}>
          <div>
            <p className="text-neutral-500">Mensalidade</p>
            <p className="text-lg font-semibold">{plan.monthly_fee_cents ? formatBRL(plan.monthly_fee_cents) : "Isenta"}</p>
            {plan.monthly_fee_cents > 0 && (
              <p className="text-neutral-500">
                Vence todo dia {BILLING.dueDay}
                {plan.billing_starts_on && plan.billing_starts_on > today ? `, a partir de ${formatDay(plan.billing_starts_on)}` : ""}.
              </p>
            )}
          </div>
          <div>
            <p className="text-neutral-500">Implantação</p>
            <p className="text-lg font-semibold">{plan.setup_fee_cents ? formatBRL(plan.setup_fee_cents) : "Isenta"}</p>
          </div>
        </section>
      )}

      {plan?.suspended_for_billing && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          Sua loja está fora do ar por falta de pagamento. Pague a fatura abaixo e ela volta ao ar assim que o pagamento for confirmado.
        </p>
      )}

      {open.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold">Em aberto</h2>
          {open.map((inv) => {
            const late = daysLate(inv.due_date, today);
            return (
              <div key={inv.id} className={`${card} flex flex-wrap items-center gap-4 ${late ? "border-red-200" : ""}`}>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">{invoiceTitle(inv)}</p>
                  <p className="text-xl font-semibold">{formatBRL(inv.amount_cents)}</p>
                  {late ? (
                    <p className="text-red-700">
                      Venceu em {formatDay(inv.due_date)} ({late} {late === 1 ? "dia" : "dias"} de atraso). Pague até {formatDay(lastPayDay(inv.due_date))} para a
                      loja não ser suspensa.
                    </p>
                  ) : (
                    <p className="text-neutral-500">Vence em {formatDay(inv.due_date)}.</p>
                  )}
                </div>
                <form action={payInvoice}>
                  <input type="hidden" name="invoiceId" value={inv.id} />
                  <button className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700">Pagar</button>
                </form>
              </div>
            );
          })}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-semibold">Histórico</h2>
        {history.length === 0 ? (
          <p className="text-sm text-neutral-500">Nenhuma fatura paga ainda.</p>
        ) : (
          <ul className="divide-y rounded-xl border bg-white text-sm shadow-sm">
            {history.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <span className="min-w-0 flex-1 font-medium">{invoiceTitle(inv)}</span>
                <span>{formatBRL(inv.amount_cents)}</span>
                <span className={inv.status === "paid" ? "text-emerald-700" : "text-neutral-500"}>
                  {inv.status === "paid" ? `Paga${inv.paid_at ? ` em ${formatDateTime(inv.paid_at).slice(0, 10)}` : ""}${inv.payment_method ? ` (${methodLabel(inv.payment_method)})` : ""}` : "Cancelada"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-neutral-500">
        A fatura da mensalidade fica disponível {BILLING.issueDaysBefore} dias antes do vencimento, e avisamos por e-mail. Com mais de {BILLING.graceDays} dias de
        atraso a loja sai do ar, e volta sozinha quando o pagamento é confirmado. Condições completas nos{" "}
        <a href={platformUrl(TERMS_PATH)} target="_blank" rel="noopener" className="underline">Termos de uso</a>.
      </p>
    </div>
  );
}
