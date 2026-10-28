import { isLocalDelivery } from "@/lib/shipping-settings";

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

// Na retirada, "enviado/entregue" vira "pronto para retirada/retirado"; na entrega própria, "saiu para entrega".
export function statusLabel(status: OrderStatus, shippingMethod?: string | null) {
  if (shippingMethod === "pickup") {
    if (status === "shipped") return "Pronto para retirada";
    if (status === "delivered") return "Retirado";
  }
  if (isLocalDelivery(shippingMethod) && status === "shipped") return "Saiu para entrega";
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

// Recepção: avança o pedido, mas só cancela o que ainda não foi pago (cancelar venda paga é com o dono).
export const staffTransitions = (status: OrderStatus): OrderStatus[] =>
  status === "pending_payment" ? MEMBER_TRANSITIONS[status] : MEMBER_TRANSITIONS[status].filter((s) => s !== "canceled");

// Cor do selo de status (classes Tailwind).
const TONES: Record<OrderStatus, string> = {
  pending_payment: "bg-amber-100 text-amber-800 ring-amber-200",
  paid: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  preparing: "bg-sky-100 text-sky-800 ring-sky-200",
  shipped: "bg-indigo-100 text-indigo-800 ring-indigo-200",
  delivered: "bg-neutral-100 text-neutral-700 ring-neutral-200",
  canceled: "bg-red-100 text-red-800 ring-red-200",
  expired: "bg-neutral-100 text-neutral-500 ring-neutral-200",
};

export function statusTone(status: OrderStatus) {
  return `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[status] ?? TONES.expired}`;
}
