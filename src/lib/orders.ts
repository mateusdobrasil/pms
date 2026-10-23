import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Store } from "@/lib/store";
import { getShippingOptions } from "@/lib/shipping";
import { getPromotions, pixDiscountCents } from "@/lib/promotions";
import { isEmail, isUuid, isValidCPF, onlyDigits } from "@/lib/validation";

export type CartItemInput = { variantId: string; quantity: number };

export type PricedLine = {
  variantId: string;
  productName: string;
  variantName: string;
  unitPriceCents: number;
  quantity: number;
  totalCents: number;
  stock: number; // disponível agora (exibição; a baixa só acontece no pagamento)
  productSlug: string;
  imagePath: string | null; // capa do produto
  weightG: number;
  heightCm: number;
  widthCm: number;
  lengthCm: number;
};

export type CustomerInput = { name: string; email: string; cpf: string; phone: string };

export type ShippingAddress = {
  cep: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
};

const UFS = new Set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "));

function parseAddress(raw: unknown): { address: ShippingAddress | null; errors: string[] } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown, max = 120) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
  const address = {
    cep: onlyDigits(str(r.cep)),
    street: str(r.street),
    number: str(r.number, 20),
    complement: str(r.complement, 60),
    district: str(r.district, 80),
    city: str(r.city, 80),
    state: str(r.state, 2).toUpperCase(),
  };
  const errors: string[] = [];
  if (address.cep.length !== 8) errors.push("CEP inválido.");
  if (!address.street) errors.push("Informe a rua.");
  if (!address.number) errors.push("Informe o número (ou \"s/n\").");
  if (!address.district) errors.push("Informe o bairro.");
  if (!address.city) errors.push("Informe a cidade.");
  if (!UFS.has(address.state)) errors.push("Estado (UF) inválido.");
  return { address: errors.length ? null : address, errors };
}

const MAX_LINES = 50;
const MAX_QUANTITY = 99;
export const ORDER_TTL_MINUTES = 60;

type VariantRow = {
  id: string;
  name: string;
  price_cents: number;
  stock: number;
  weight_g: number;
  height_cm: number;
  width_cm: number;
  length_cm: number;
  active: boolean;
  products: { name: string; slug: string; active: boolean; product_images: { path: string; position: number }[] };
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
    .select("id, name, price_cents, stock, weight_g, height_cm, width_cm, length_cm, active, products!inner(name, slug, active, product_images(path, position))")
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
      stock: v.stock,
      productSlug: v.products.slug,
      imagePath: [...v.products.product_images].sort((a, b) => a.position - b.position)[0]?.path ?? null,
      weightG: v.weight_g,
      heightCm: Number(v.height_cm),
      widthCm: Number(v.width_cm),
      lengthCm: Number(v.length_cm),
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

  // Entrega: o endereço é exigido antes, porque o frete é cotado pelo CEP dele.
  let address: ShippingAddress | null = null;
  if (b.shippingOptionId !== "pickup") {
    const parsed = parseAddress(b.address);
    if (!parsed.address) return { ok: false, errors: parsed.errors };
    address = parsed.address;
  }

  // Recalcula as opções no servidor e só aceita uma delas: o preço do frete nunca vem do navegador.
  const { options } = await getShippingOptions(store, lines, address?.cep);
  const shipping = options.find((o) => o.id === b.shippingOptionId);
  if (!shipping) return { ok: false, errors: ["A forma de entrega escolhida não está mais disponível. Recalcule o frete."] };

  // Desconto do Pix fica gravado no pedido: o valor do Pix não muda se a loja alterar o percentual depois.
  const pixDiscount = pixDiscountCents(subtotalCents, (await getPromotions(store.id)).pixDiscountPercent);

  const { data: order, error } = await db
    .from("orders")
    .insert({
      store_id: store.id,
      customer_name: customer.name,
      customer_email: customer.email,
      customer_cpf: customer.cpf,
      customer_phone: customer.phone,
      shipping_address: shipping.requiresAddress ? address : null,
      shipping_method: shipping.id === "pickup" ? "pickup" : shipping.name,
      shipping_service_id: shipping.id.startsWith("me:") ? shipping.id.slice(3) : null, // retirada e entrega própria: sem serviço
      subtotal_cents: subtotalCents,
      shipping_cents: shipping.priceCents,
      total_cents: subtotalCents + shipping.priceCents,
      ...(pixDiscount > 0 ? { pix_discount_cents: pixDiscount } : {}),
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
