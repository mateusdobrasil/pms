// Links de pagamento avulsos (sem servidor: usado no painel, na página do cliente e nos testes).

// Nome gravado em orders.shipping_method nos pedidos que vêm de um link (aparece assim no pedido e na planilha).
export const PAYMENT_LINK_METHOD = "Link de pagamento";
export const isPaymentLink = (shippingMethod: string | null | undefined) => shippingMethod === PAYMENT_LINK_METHOD;

export const MIN_LINK_CENTS = 100;
export const MAX_LINK_CENTS = 100_000_000;

// Validade oferecida no painel (dias; 0 = sem validade).
export const LINK_VALIDITY_DAYS = [1, 3, 7, 30, 0] as const;
export const validityLabel = (days: number) => (days === 0 ? "Sem validade" : days === 1 ? "1 dia" : `${days} dias`);

export type LinkStatus = "active" | "paid" | "canceled";
export type LinkState = LinkStatus | "expired";

export type PaymentLinkRow = {
  status: LinkStatus;
  expires_at: string | null;
};

// Situação real do link: "ativo" que passou da validade é "vencido" (sem rotina que mude o status).
export function linkState(link: PaymentLinkRow, now = new Date()): LinkState {
  if (link.status === "active" && link.expires_at && new Date(link.expires_at) <= now) return "expired";
  return link.status;
}

const LABELS: Record<LinkState, string> = { active: "Aguardando pagamento", paid: "Pago", canceled: "Cancelado", expired: "Vencido" };
const TONES: Record<LinkState, string> = {
  active: "bg-amber-100 text-amber-800 ring-amber-200",
  paid: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  canceled: "bg-red-100 text-red-800 ring-red-200",
  expired: "bg-neutral-100 text-neutral-500 ring-neutral-200",
};
export const linkStateLabel = (state: LinkState, reusable = false) => (state === "active" && reusable ? "Aberto" : LABELS[state]);
export const linkStateTone = (state: LinkState) => `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[state]}`;

// Mensagem pronta para o WhatsApp do lojista mandar ao cliente.
export function whatsappShareText(storeName: string, title: string, amountLabel: string, url: string) {
  return `Olá! Segue o link para pagar "${title}" (${amountLabel}) na ${storeName}, por Pix ou cartão:\n${url}`;
}
