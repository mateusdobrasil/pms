import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseCartItems, priceCart } from "@/lib/orders";
import { normalizePhone } from "@/lib/customers";
import { isEmail } from "@/lib/validation";
import { COUNTER_METHOD, type CounterPayment, counterTotal, isCounterPayment } from "@/lib/counter";

export type CounterSaleInput = {
  items: unknown; // [{ variantId, quantity }]
  payment: unknown;
  discountCents: unknown;
  customer?: { name?: unknown; phone?: unknown; email?: unknown };
};

type Result = { ok: true; id: string; code: string; totalCents: number; stockIssue: boolean } | { ok: false; error: string };

// Venda presencial: preços e disponibilidade sempre de product_variants (como no checkout). Produto esgotado
// no sistema ainda pode ser vendido (está na mão do lojista): o pedido fica com o selo "sem estoque".
// A service role cria o pedido, confirma pela confirm_order_payment (baixa o estoque) e já o conclui.
export async function createCounterSale(db: SupabaseClient, storeId: string, input: CounterSaleInput): Promise<Result> {
  const items = parseCartItems(input.items);
  if (!items) return { ok: false, error: "Adicione pelo menos um produto." };
  if (!isCounterPayment(input.payment)) return { ok: false, error: "Escolha a forma de pagamento." };
  const payment: CounterPayment = input.payment;

  const { lines, subtotalCents } = await priceCart(db, storeId, items);
  if (lines.length !== items.length) return { ok: false, error: "Um produto da venda não está mais à venda. Confira a lista." };
  const rawDiscount = Number(input.discountCents ?? 0);
  if (!Number.isInteger(rawDiscount) || rawDiscount < 0) return { ok: false, error: "Desconto inválido." };
  const { discountCents, totalCents } = counterTotal(subtotalCents, rawDiscount);

  // Cliente opcional: com celular ou e-mail, a venda entra em Clientes e no cartão fidelidade.
  const name = typeof input.customer?.name === "string" ? input.customer.name.trim().replace(/\s+/g, " ").slice(0, 120) : "";
  const phoneRaw = typeof input.customer?.phone === "string" ? input.customer.phone : "";
  const phone = normalizePhone(phoneRaw);
  if (phoneRaw.trim() && !phone) return { ok: false, error: "Celular inválido: use DDD + número." };
  const email = typeof input.customer?.email === "string" ? input.customer.email.trim().toLowerCase() : "";
  if (email && !isEmail(email)) return { ok: false, error: "E-mail do cliente inválido." };

  const { data: order, error } = await db
    .from("orders")
    .insert({
      store_id: storeId,
      customer_name: name || "Cliente do balcão",
      customer_email: email,
      customer_cpf: "",
      customer_phone: phone,
      shipping_address: null,
      shipping_method: COUNTER_METHOD,
      subtotal_cents: subtotalCents,
      shipping_cents: 0,
      discount_cents: discountCents,
      total_cents: totalCents,
      counter_payment: payment,
    })
    .select("id, code")
    .single();
  if (error) throw error;

  const { error: itemsErr } = await db.from("order_items").insert(
    lines.map((l) => ({
      store_id: storeId,
      order_id: order.id,
      variant_id: l.variantId,
      product_name: l.productName,
      variant_name: l.variantName,
      unit_price_cents: l.unitPriceCents,
      quantity: l.quantity,
    })),
  );
  if (itemsErr) {
    await db.from("orders").delete().eq("id", order.id);
    throw itemsErr;
  }

  // Baixa o estoque (marca "sem estoque" se faltar) e já conclui: a venda foi entregue na hora.
  const { error: confirmErr } = await db.rpc("confirm_order_payment", { p_order_id: order.id });
  if (confirmErr) throw confirmErr;
  const { data: done } = await db.from("orders").update({ status: "delivered" }).eq("id", order.id).select("stock_issue").single();
  return { ok: true, id: order.id, code: order.code, totalCents, stockIssue: !!done?.stock_issue };
}

// Venda lançada por engano: cancela e devolve os itens ao estoque (se a baixa aconteceu inteira).
export async function cancelCounterSale(db: SupabaseClient, storeId: string, orderId: string) {
  const { data: o } = await db.from("orders").select("id, shipping_method, stock_issue, status").eq("id", orderId).eq("store_id", storeId).maybeSingle();
  if (!o || o.shipping_method !== COUNTER_METHOD) return { error: "Venda não encontrada." };
  if (o.status === "canceled") return { error: "Esta venda já foi cancelada." };
  const restock = !o.stock_issue; // com falta de estoque na venda, a baixa foi parcial: o lojista ajusta à mão
  const { data: ok, error } = await db.rpc("refund_order", { p_order_id: orderId, p_restock: restock });
  if (error || !ok) return { error: "Não foi possível cancelar a venda." };
  return { ok: true as const, restocked: restock };
}
