import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ORDER_TTL_MINUTES, parseCustomer } from "@/lib/orders";
import { PAYMENT_LINK_METHOD, linkState, type LinkStatus } from "@/lib/payment-links";

export type PaymentLink = {
  id: string;
  public_token: string;
  title: string;
  amount_cents: number;
  reusable: boolean;
  status: LinkStatus;
  expires_at: string | null;
  paid_at: string | null;
  created_at: string;
};

export const PAYMENT_LINK_FIELDS = "id, public_token, title, amount_cents, reusable, status, expires_at, paid_at, created_at";

export async function getPaymentLink(db: SupabaseClient, storeId: string, token: string) {
  const { data } = await db.from("payment_links").select(PAYMENT_LINK_FIELDS).eq("store_id", storeId).eq("public_token", token).maybeSingle();
  return data as PaymentLink | null;
}

type Result = { ok: true; token: string } | { ok: false; errors: string[]; status?: number };

// O cliente informou os dados no link: cria um pedido comum (aguardando pagamento) com o valor do link.
// Valor e descrição vêm do banco, nunca do navegador. Estoque não entra (o item não é um produto da loja).
export async function createLinkOrder(db: SupabaseClient, storeId: string, token: string, body: unknown): Promise<Result> {
  const link = await getPaymentLink(db, storeId, token);
  if (!link) return { ok: false, errors: ["Link de pagamento não encontrado."], status: 404 };
  const state = linkState(link);
  if (state !== "active") {
    const why = state === "paid" ? "Este link já foi pago." : state === "expired" ? "Este link venceu. Peça um novo à loja." : "Este link foi cancelado pela loja.";
    return { ok: false, errors: [why], status: 409 };
  }

  const { customer, errors } = parseCustomer((body as Record<string, unknown> | null)?.customer);
  if (!customer) return { ok: false, errors };

  const { data: order, error } = await db
    .from("orders")
    .insert({
      store_id: storeId,
      customer_name: customer.name,
      customer_email: customer.email,
      customer_cpf: customer.cpf,
      customer_phone: customer.phone,
      shipping_address: null,
      shipping_method: PAYMENT_LINK_METHOD,
      subtotal_cents: link.amount_cents,
      shipping_cents: 0,
      total_cents: link.amount_cents,
      payment_link_id: link.id,
      expires_at: new Date(Date.now() + ORDER_TTL_MINUTES * 60_000).toISOString(),
    })
    .select("id, public_token")
    .single();
  if (error) throw error;

  const { error: itemErr } = await db.from("order_items").insert({
    store_id: storeId,
    order_id: order.id,
    variant_id: null,
    product_name: link.title,
    variant_name: "Único",
    unit_price_cents: link.amount_cents,
    quantity: 1,
  });
  if (itemErr) {
    await db.from("orders").delete().eq("id", order.id);
    throw itemErr;
  }
  return { ok: true, token: order.public_token };
}
