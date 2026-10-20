import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

// Integração com a Payments API do Mercado Pago (/v1/payments).
// Cada loja usa o próprio access token (store_secrets), então o dinheiro cai na conta do lojista.

export const PROVIDER = "mercadopago";
const API_URL = "https://api.mercadopago.com";
export const PIX_TTL_MINUTES = 30; // mínimo aceito pelo Mercado Pago

export type PaymentStatus = "pending" | "approved" | "rejected" | "refunded" | "expired";

type MpPayment = {
  id: number;
  status: string;
  status_detail: string | null;
  payment_method_id: string;
  transaction_amount: number;
  external_reference: string | null;
  date_of_expiration: string | null;
  point_of_interaction?: {
    transaction_data?: { qr_code?: string; qr_code_base64?: string; ticket_url?: string };
  };
};

export type GatewayPayment = {
  id: string;
  orderId: string | null; // external_reference
  status: PaymentStatus;
  statusDetail: string | null;
  method: "pix" | "card";
  amountCents: number;
  pix: { qrCode: string; qrCodeBase64: string; expiresAt: string | null } | null;
  raw: MpPayment;
};

export type Payer = { name: string; email: string; cpf: string };

export class MercadoPagoError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(`Mercado Pago respondeu ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function mpFetch(path: string, accessToken: string, init: RequestInit = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new MercadoPagoError(res.status, body);
  return body;
}

function mapStatus(status: string, detail: string | null): PaymentStatus {
  switch (status) {
    case "approved":
      return "approved";
    case "rejected":
      return "rejected";
    case "cancelled":
      return detail === "expired" ? "expired" : "rejected";
    case "refunded":
    case "charged_back":
      return "refunded";
    default:
      return "pending"; // pending, in_process, authorized, in_mediation
  }
}

export function toGatewayPayment(raw: MpPayment): GatewayPayment {
  const tx = raw.point_of_interaction?.transaction_data;
  return {
    id: String(raw.id),
    orderId: raw.external_reference,
    status: mapStatus(raw.status, raw.status_detail),
    statusDetail: raw.status_detail,
    method: raw.payment_method_id === "pix" ? "pix" : "card",
    amountCents: Math.round(raw.transaction_amount * 100),
    pix:
      tx?.qr_code && tx.qr_code_base64
        ? { qrCode: tx.qr_code, qrCodeBase64: tx.qr_code_base64, expiresAt: raw.date_of_expiration }
        : null,
    raw,
  };
}

// O Mercado Pago espera data com fuso explícito. Brasília não tem horário de verão desde 2019.
function toMpDate(date: Date) {
  return new Date(date.getTime() - 3 * 60 * 60 * 1000).toISOString().replace("Z", "-03:00");
}

function payerFields(payer: Payer) {
  const [firstName, ...rest] = payer.name.trim().split(/\s+/);
  return { email: payer.email, first_name: firstName, last_name: rest.join(" ") };
}

// URL de notificação por loja. O Mercado Pago só aceita URL pública (https), então em dev fica sem.
export function notificationUrl(storeId: string) {
  const base = process.env.PLATFORM_URL;
  if (!base?.startsWith("https://")) return undefined;
  return `${base.replace(/\/$/, "")}/api/webhooks/payments?store=${storeId}`;
}

type Common = {
  accessToken: string;
  storeId: string;
  orderId: string;
  amountCents: number;
  description: string;
};

export async function createPixPayment(input: Common & { payer: Payer; expiresAt: Date }) {
  const raw = await mpFetch("/v1/payments", input.accessToken, {
    method: "POST",
    headers: { "X-Idempotency-Key": randomUUID() },
    body: JSON.stringify({
      transaction_amount: input.amountCents / 100,
      description: input.description,
      payment_method_id: "pix",
      external_reference: input.orderId,
      notification_url: notificationUrl(input.storeId),
      date_of_expiration: toMpDate(input.expiresAt),
      payer: { ...payerFields(input.payer), identification: { type: "CPF", number: input.payer.cpf } },
    }),
  });
  return toGatewayPayment(raw);
}

export type CardInput = {
  token: string;
  installments: number;
  paymentMethodId: string;
  issuerId: string | null;
  identification: { type: string; number: string }; // documento do titular do cartão
};

export async function createCardPayment(input: Common & { payer: Payer; card: CardInput }) {
  const raw = await mpFetch("/v1/payments", input.accessToken, {
    method: "POST",
    headers: { "X-Idempotency-Key": randomUUID() },
    body: JSON.stringify({
      transaction_amount: input.amountCents / 100, // sempre o total do pedido, nunca o valor do navegador
      description: input.description,
      token: input.card.token,
      installments: input.card.installments,
      payment_method_id: input.card.paymentMethodId,
      issuer_id: input.card.issuerId ?? undefined,
      external_reference: input.orderId,
      notification_url: notificationUrl(input.storeId),
      payer: { ...payerFields(input.payer), identification: input.card.identification },
    }),
  });
  return toGatewayPayment(raw);
}

export async function getPayment(paymentId: string, accessToken: string) {
  const raw = await mpFetch(`/v1/payments/${encodeURIComponent(paymentId)}`, accessToken);
  return toGatewayPayment(raw);
}

// Valida o header x-signature: ts=...,v1=HMAC-SHA256(secret, "id:<data.id>;request-id:<x-request-id>;ts:<ts>;")
export function verifyWebhookSignature(args: {
  xSignature: string;
  xRequestId: string | null;
  dataId: string | null;
  secret: string;
}) {
  const parts = Object.fromEntries(
    args.xSignature.split(",").map((p) => {
      const [k, ...v] = p.trim().split("=");
      return [k, v.join("=")];
    }),
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  let manifest = "";
  if (args.dataId) manifest += `id:${args.dataId.toLowerCase()};`;
  if (args.xRequestId) manifest += `request-id:${args.xRequestId};`;
  manifest += `ts:${ts};`;

  const expected = createHmac("sha256", args.secret).update(manifest).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

const CARD_MESSAGES: Record<string, string> = {
  cc_rejected_insufficient_amount: "Saldo ou limite insuficiente.",
  cc_rejected_bad_filled_security_code: "Código de segurança inválido.",
  cc_rejected_bad_filled_date: "Data de validade inválida.",
  cc_rejected_bad_filled_card_number: "Número do cartão inválido.",
  cc_rejected_bad_filled_other: "Confira os dados do cartão.",
  cc_rejected_call_for_authorize: "Autorize o pagamento com o banco emissor do cartão e tente novamente.",
  cc_rejected_card_disabled: "Cartão inativo. Ligue para o banco emissor para ativá-lo.",
  cc_rejected_duplicated_payment: "Você já fez um pagamento com esse valor. Use outro cartão ou Pix.",
  cc_rejected_max_attempts: "Limite de tentativas atingido. Use outro cartão ou Pix.",
};

export function cardStatusMessage(payment: GatewayPayment) {
  if (payment.status === "approved") return "Pagamento aprovado!";
  if (payment.status === "pending") return "Seu pagamento está em análise. Avisaremos por e-mail assim que for aprovado.";
  return (
    (payment.statusDetail && CARD_MESSAGES[payment.statusDetail]) ??
    "Pagamento recusado. Tente outro cartão ou pague com Pix."
  );
}
