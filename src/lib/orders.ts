import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Store } from "@/lib/store";
import { getShippingOptions } from "@/lib/shipping";
import { isEmail, isUuid, isValidCPF, onlyDigits } from "@/lib/validation";

export type CartItemInput = { variantId: string; quantity: number };

export type PricedLine = {
  variantId: string;
  productName: string;
  variantName: string;
  unitPriceCents: number;
  quantity: number;
  totalCents: number;
};

export type CustomerInput = { name: string; email: string; cpf: string; phone: string };

const MAX_LINES = 50;
const MAX_QUANTITY = 99;
export const ORDER_TTL_MINUTES = 60;

type VariantRow = {
  id: string;
  name: string;
  price_cents: number;
  stock: number;
  active: boolean;
  products: { name: string; active: boolean };
};

export function parseCartItems(raw: unknown): CartItemInput[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_LINES) return null;
  const merged = new Map<string, number>();
  for (const item of raw) {
    const variantId = typeof item?.variantId === "string" ? item.variantId : "";
    const quantity = Number(item?.quantity);
    if (!isUuid(variantId) || !Number.isInteger(quantity) || quantity < 1) return null;
    merged.set(variantId, Math.min((merged.get(variantId) ?? 0) + quantity, MAX_QUANTITY));
  }
  return [...merged].map(([variantId, quantity]) => ({ variantId, quantity }));
}

// Preço e disponibilidade sempre de product_variants; o cliente só informa variante e quantidade.
export async function priceCart(db: SupabaseClient, storeId: string, items: CartItemInput[]) {
  const { data, error } = await db
    .from("product_variants")
    .select("id, name, price_cents, stock, active, products!inner(name, active)")
    .eq("store_id", storeId)
    .in(
      "id",
      items.map((i) => i.variantId),
    );
  if (error) throw error;

  const byId = new Map(((data ?? []) as unknown as VariantRow[]).map((v) => [v.id, v]));
  const lines: PricedLine[] = [];
  const problems: string[] = [];

  for (const item of items) {
    const v = byId.get(item.variantId);
    if (!v || !v.active || !v.products.active) {
      problems.push("Um produto do carrinho não está mais disponível.");
      continue;
    }
    const label = v.name === "Único" ? v.products.name : `${v.products.name} (${v.name})`;
    if (v.stock < item.quantity) {
      problems.push(v.stock === 0 ? `${label} esgotou.` : `${label}: só restam ${v.stock} unidades.`);
    }
    lines.push({
      variantId: v.id,
      productName: v.products.name,
      variantName: v.name,
      unitPriceCents: v.price_cents,
      quantity: item.quantity,
      totalCents: v.price_cents * item.quantity,
    });
  }

  const subtotalCents = lines.reduce((sum, l) => sum + l.totalCents, 0);
  return { lines, subtotalCents, problems };
}

function parseCustomer(raw: unknown): { customer: CustomerInput | null; errors: string[] } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const customer = {
    name: str(r.name).replace(/\s+/g, " "),
    email: str(r.email).toLowerCase(),
    cpf: onlyDigits(str(r.cpf)),
    phone: onlyDigits(str(r.phone)),
  };

  const errors: string[] = [];
  if (customer.name.split(" ").length < 2 || customer.name.length > 120) errors.push("Informe nome e sobrenome.");
  if (!isEmail(customer.email)) errors.push("E-mail inválido.");
  if (!isValidCPF(customer.cpf)) errors.push("CPF inválido.");
  if (customer.phone.length < 10 || customer.phone.length > 11) errors.push("Telefone inválido (DDD + número).");

  return { customer: errors.length ? null : customer, errors };
}

type CreateOrderResult = { ok: true; token: string } | { ok: false; errors: string[] };

// Cria pedido + itens com valores recalculados no servidor. Estoque NÃO baixa aqui.
export async function createOrder(db: SupabaseClient, store: Store, body: unknown): Promise<CreateOrderResult> {
  const b = (body ?? {}) as Record<string, unknown>;

  const items = parseCartItems(b.items);
  if (!items) return { ok: false, errors: ["Carrinho vazio ou inválido."] };

  const { customer, errors } = parseCustomer(b.customer);
  if (!customer) return { ok: false, errors };

  const { lines, subtotalCents, problems } = await priceCart(db, store.id, items);
  if (problems.length || lines.length === 0) return { ok: false, errors: problems };

  const options = await getShippingOptions(store, lines);
  const shipping = options.find((o) => o.id === b.shippingOptionId);
  if (!shipping) return { ok: false, errors: ["Escolha uma forma de entrega."] };

  const { data: order, error } = await db
    .from("orders")
    .insert({
      store_id: store.id,
      customer_name: customer.name,
      customer_email: customer.email,
      customer_cpf: customer.cpf,
      customer_phone: customer.phone,
      shipping_address: null,
      shipping_method: shipping.id === "pickup" ? "pickup" : shipping.name,
      shipping_service_id: shipping.id === "pickup" ? null : shipping.id,
      subtotal_cents: subtotalCents,
      shipping_cents: shipping.priceCents,
      total_cents: subtotalCents + shipping.priceCents,
      expires_at: new Date(Date.now() + ORDER_TTL_MINUTES * 60_000).toISOString(),
    })
    .select("id, public_token")
    .single();
  if (error) throw error;

  const { error: itemsErr } = await db.from("order_items").insert(
    lines.map((l) => ({
      store_id: store.id,
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

  return { ok: true, token: order.public_token };
}
