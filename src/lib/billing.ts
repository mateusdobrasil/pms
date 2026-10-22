// Regras da cobrança da plataforma (implantação + mensalidade). Funções puras, testadas em tests/billing.test.ts.
// Datas são "AAAA-MM-DD" no fuso de Brasília, sem horário.

export const BILLING = {
  setupFeeCents: 200_000, // R$ 2.000,00: valor sugerido (cada loja tem o seu, digitado no /admin)
  monthlyFeeCents: 30_000, // R$ 300,00: valor sugerido
  dueDay: 9, // a mensalidade vence todo dia 9
  setupDueDays: 3, // a implantação vence 3 dias depois de configurada
  issueDaysBefore: 10, // a fatura do mês aparece (e é enviada por e-mail) 10 dias antes do vencimento
  warningDaysLate: 15, // último aviso: faltam 5 dias para suspender
  graceDays: 20, // com mais de 20 dias de atraso, a loja é suspensa
};

export type InvoiceKind = "setup" | "monthly";
export type InvoiceStatus = "open" | "paid" | "canceled";

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

// Hoje em Brasília (sem horário de verão desde 2019).
export function todayBR(now = new Date()) {
  return new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

const dueInMonth = (year: number, month: number) => {
  const d = new Date(Date.UTC(year, month, BILLING.dueDay));
  return d.toISOString().slice(0, 10);
};

// Próximo dia 9 a partir de hoje (o próprio dia, se hoje for dia 9).
export function nextDueDate(today: string) {
  const [y, m, d] = today.split("-").map(Number);
  return d <= BILLING.dueDay ? dueInMonth(y, m - 1) : dueInMonth(y, m);
}

// Opções para a 1ª mensalidade no admin: os próximos dias 9.
export function dueDateOptions(today: string, count = 4) {
  const first = nextDueDate(today);
  const [y, m] = first.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => dueInMonth(y, m - 1 + i));
}

export const isDueDay = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number(date.slice(8)) === BILLING.dueDay;

// Mensalidade a emitir hoje (ou null): a do próximo vencimento, se faltar até 10 dias e a cobrança já tiver começado.
export function monthlyInvoiceToIssue(today: string, startsOn: string | null) {
  if (!startsOn) return null;
  const due = nextDueDate(today);
  if (due < startsOn || daysBetween(today, due) > BILLING.issueDaysBefore) return null;
  return { referenceMonth: `${due.slice(0, 7)}-01`, dueDate: due };
}

// Último dia para pagar sem a loja ser suspensa.
export const lastPayDay = (dueDate: string) => addDays(dueDate, BILLING.graceDays);

export function daysLate(dueDate: string, today: string) {
  return Math.max(0, daysBetween(dueDate, today));
}

// Em que ponto está uma fatura em aberto (define os avisos do job diário).
export function invoiceStage(dueDate: string, today: string): "upcoming" | "overdue" | "warning" | "suspend" {
  const late = daysLate(dueDate, today);
  if (late === 0) return "upcoming";
  if (late > BILLING.graceDays) return "suspend";
  if (late >= BILLING.warningDaysLate) return "warning";
  return "overdue";
}

export function formatDay(date: string) {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

export function invoiceTitle(invoice: { kind: InvoiceKind; reference_month: string | null }) {
  if (invoice.kind === "setup" || !invoice.reference_month) return "Taxa de implantação";
  const [y, m] = invoice.reference_month.split("-").map(Number);
  return `Mensalidade de ${MONTHS[m - 1]} de ${y}`; // sem barra: o Mercado Pago remove
}
