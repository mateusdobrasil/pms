export type OrderStatus =
  | "pending_payment"
  | "paid"
  | "preparing"
  | "shipped"
  | "delivered"
  | "canceled"
  | "expired";

const LABELS: Record<OrderStatus, string> = {
  pending_payment: "Aguardando pagamento",
  paid: "Pago",
  preparing: "Em preparação",
  shipped: "Enviado",
  delivered: "Entregue",
  canceled: "Cancelado",
  expired: "Expirado",
};

// Na retirada, "enviado/entregue" vira "pronto para retirada/retirado".
export function statusLabel(status: OrderStatus, shippingMethod?: string | null) {
  if (shippingMethod === "pickup") {
    if (status === "shipped") return "Pronto para retirada";
    if (status === "delivered") return "Retirado";
  }
  return LABELS[status] ?? status;
}

export const ORDER_STATUSES = Object.keys(LABELS) as OrderStatus[];

// Status que contam como venda.
export const SOLD_STATUSES: OrderStatus[] = ["paid", "preparing", "shipped", "delivered"];

// Espelha o trigger orders_guard_member_update (o banco é quem garante).
export const MEMBER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ["canceled"],
  paid: ["preparing", "shipped", "canceled"],
  preparing: ["shipped", "canceled"],
  shipped: ["delivered"],
  delivered: [],
  canceled: [],
  expired: [],
};
