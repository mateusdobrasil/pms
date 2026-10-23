import type { CardInput } from "@/lib/payments/mercadopago";

// Dados do cartão que o navegador manda (já tokenizados pelo Card Payment Brick). Usado em pedidos e agendamentos.
export function parseCard(b: Record<string, unknown>): CardInput | null {
  const id = (b.payer as { identification?: { type?: unknown; number?: unknown } } | undefined)?.identification;
  const installments = Number(b.installments);
  if (typeof b.token !== "string" || !b.token) return null;
  if (typeof b.paymentMethodId !== "string" || !b.paymentMethodId) return null;
  if (!Number.isInteger(installments) || installments < 1 || installments > 24) return null;
  if (typeof id?.type !== "string" || typeof id?.number !== "string") return null;
  return {
    token: b.token,
    installments,
    paymentMethodId: b.paymentMethodId,
    issuerId: b.issuerId == null || b.issuerId === "" ? null : String(b.issuerId),
    identification: { type: id.type, number: id.number },
  };
}
