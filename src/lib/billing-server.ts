import "server-only";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { type InvoiceNotice, notifyInvoice, notifyPlatformError } from "@/lib/email";
import { platformUrl } from "@/lib/urls";
import { createCheckoutPreference, type GatewayPayment } from "@/lib/payments/mercadopago";
import { BILLING, addDays, invoiceStage, invoiceTitle, monthlyInvoiceToIssue, todayBR, type InvoiceKind } from "@/lib/billing";

// Cobrança da plataforma: faturas de implantação e mensalidade, pagas na conta Mercado Pago da PLATAFORMA
// (MP_PLATFORM_ACCESS_TOKEN), nunca na do lojista. Tudo aqui usa a service role.

type Db = ReturnType<typeof createAdminClient>;

export const BILLING_PROVIDER = "mercadopago-plataforma"; // webhook_events

export const platformAccessToken = () => process.env.MP_PLATFORM_ACCESS_TOKEN || null;

export type InvoiceRow = {
  id: string;
  store_id: string;
  kind: InvoiceKind;
  reference_month: string | null;
  amount_cents: number;
  due_date: string;
  status: "open" | "paid" | "canceled";
  paid_at: string | null;
  payment_method: string | null;
};

export const INVOICE_FIELDS = "id, store_id, kind, reference_month, amount_cents, due_date, status, paid_at, payment_method";

// Cria as faturas que já deveriam existir: implantação (uma vez) e a mensalidade do próximo dia 9.
// Pode rodar várias vezes: os índices únicos impedem duplicar (o erro 23505 é ignorado).
export async function issueInvoices(db: Db, today: string, storeId?: string) {
  let query = db.from("stores").select("id, setup_fee_cents, monthly_fee_cents, billing_starts_on").or("setup_fee_cents.gt.0,monthly_fee_cents.gt.0");
  if (storeId) query = query.eq("id", storeId);
  const { data: stores, error } = await query;
  if (error) throw error;

  let created = 0;
  for (const s of stores ?? []) {
    const rows: Record<string, unknown>[] = [];
    if (s.setup_fee_cents > 0) {
      rows.push({ store_id: s.id, kind: "setup", amount_cents: s.setup_fee_cents, due_date: addDays(today, BILLING.setupDueDays) });
    }
    const monthly = s.monthly_fee_cents > 0 ? monthlyInvoiceToIssue(today, s.billing_starts_on) : null;
    if (monthly) {
      rows.push({ store_id: s.id, kind: "monthly", amount_cents: s.monthly_fee_cents, reference_month: monthly.referenceMonth, due_date: monthly.dueDate });
    }
    for (const row of rows) {
      const { error: iErr } = await db.from("store_invoices").insert(row);
      if (!iErr) created++;
      else if (iErr.code !== "23505") throw iErr;
    }
  }
  return created;
}

// Volta a loja ao ar se ela foi suspensa pela cobrança e não sobrou fatura com mais de 20 dias de atraso.
export async function reactivateIfClear(db: Db, storeId: string, today = todayBR()) {
  const { count } = await db
    .from("store_invoices")
    .select("id", { count: "exact", head: true })
    .eq("store_id", storeId)
    .eq("status", "open")
    .lt("due_date", addDays(today, -BILLING.graceDays));
  if (count) return false;
  const { data } = await db
    .from("stores")
    .update({ status: "active", suspended_for_billing: false })
    .eq("id", storeId)
    .eq("suspended_for_billing", true)
    .select("id");
  return !!data?.length;
}

// Rotina diária (Vercel Cron): emite faturas, manda os avisos e suspende quem passou de 20 dias de atraso.
export async function runBilling(db: Db, today = todayBR()) {
  const issued = await issueInvoices(db, today);
  const { data: open, error } = await db
    .from("store_invoices")
    .select("id, store_id, due_date, notified_issued_at, notified_overdue_at, notified_warning_at, notified_suspended_at")
    .eq("status", "open");
  if (error) throw error;

  const sent: Record<string, number> = { issued: 0, overdue: 0, warning: 0, suspended: 0 };
  const failed: { invoice: string; notice: InvoiceNotice; error: string }[] = [];
  const notify = async (invoice: string, notice: InvoiceNotice) => {
    const r = await notifyInvoice(invoice, notice);
    if (r.sent) sent[notice]++;
    else if (r.error) failed.push({ invoice, notice, error: r.error });
  };
  let suspended = 0;
  for (const inv of open ?? []) {
    const stage = invoiceStage(inv.due_date, today);
    if (!inv.notified_issued_at && stage === "upcoming") await notify(inv.id, "issued");
    if (stage === "overdue" && !inv.notified_overdue_at) await notify(inv.id, "overdue");
    if (stage === "warning" && !inv.notified_warning_at) await notify(inv.id, "warning");
    // Suspende uma vez por fatura: se o admin reativar a loja na mão, o job não suspende de novo.
    if (stage === "suspend" && !inv.notified_suspended_at) {
      const { data } = await db
        .from("stores")
        .update({ status: "suspended", suspended_for_billing: true })
        .eq("id", inv.store_id)
        .eq("status", "active")
        .select("id");
      if (data?.length) suspended++;
      await notify(inv.id, "suspended");
    }
  }
  return { today, issued, suspended, emails: sent, failed };
}

// Pagamento aprovado no Mercado Pago da plataforma → baixa a fatura e reativa a loja. Idempotente.
export async function recordInvoicePayment(db: Db, payment: GatewayPayment) {
  if (payment.status !== "approved" || !payment.orderId) return;
  const { data: invoice } = await db.from("store_invoices").select(INVOICE_FIELDS).eq("id", payment.orderId).maybeSingle();
  if (!invoice) return;
  const inv = invoice as InvoiceRow;

  if (payment.amountCents < inv.amount_cents) {
    after(() =>
      notifyPlatformError(`fatura:valor:${inv.id}`, "Pagamento de fatura com valor menor", { fatura: inv.id, loja: inv.store_id, pagamento: payment.id, pago: payment.amountCents, devido: inv.amount_cents }),
    );
    return;
  }

  const { data: updated } = await db
    .from("store_invoices")
    .update({ status: "paid", paid_at: new Date().toISOString(), payment_id: payment.id, payment_method: payment.raw.payment_method_id })
    .eq("id", inv.id)
    .eq("status", "open")
    .select("id");

  if (updated?.length) {
    await reactivateIfClear(db, inv.store_id);
    after(() => notifyInvoice(inv.id, "paid"));
    return;
  }

  // Já estava paga (outro pagamento) ou cancelada: o dinheiro entrou mesmo assim. Avisa para devolver.
  const { data: current } = await db.from("store_invoices").select("status, payment_id").eq("id", inv.id).single();
  if (current && current.payment_id !== payment.id) {
    after(() =>
      notifyPlatformError(`fatura:duplicada:${payment.id}`, "Fatura paga duas vezes ou paga depois de cancelada", {
        fatura: inv.id,
        loja: inv.store_id,
        situacao: current.status,
        pagamento: payment.id,
        acao: "Conferir no Mercado Pago e devolver o pagamento extra",
      }),
    );
  }
}

// Link do Checkout Pro para pagar a fatura (Pix, cartão ou boleto).
export async function invoicePaymentUrl(inv: InvoiceRow, payerEmail: string | null) {
  const token = platformAccessToken();
  if (!token) throw new Error("MP_PLATFORM_ACCESS_TOKEN ausente");
  const base = platformUrl();
  return createCheckoutPreference({
    accessToken: token,
    reference: inv.id,
    title: `PMS app · ${invoiceTitle(inv)}`,
    amountCents: inv.amount_cents,
    payerEmail,
    backUrl: platformUrl("/painel/assinatura"),
    notificationUrl: base.startsWith("https://") ? platformUrl("/api/webhooks/plataforma") : undefined,
  });
}
