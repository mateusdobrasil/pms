import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CartItem } from "@/lib/cart";
import { notifyOrderExpired } from "@/lib/email";

// Segunda chance do pedido que expirou sem pagamento: refazer o pedido (página do pedido) e o aviso por e-mail.

const RECOVERY_WINDOW_HOURS = 48; // pedidos que expiraram até 2 dias atrás
const RECOVERY_DELAY_MINUTES = 30; // e que expiraram há pelo menos 30 min (o cliente acabou de ver "Expirado")
const BATCH = 50; // por rodada (a rotina roda de hora em hora): cabe folgado no limite de 60 s

type VariantRow = { id: string; stock: number; active: boolean; products: { active: boolean } };

// Itens do pedido que ainda podem ser comprados, limitados ao estoque de agora (o carrinho do "Refazer pedido").
export async function availableOrderItems(db: SupabaseClient, storeId: string, orderId: string): Promise<CartItem[]> {
  const { data: items } = await db.from("order_items").select("variant_id, quantity").eq("store_id", storeId).eq("order_id", orderId);
  const wanted = (items ?? []).filter((i): i is { variant_id: string; quantity: number } => !!i.variant_id);
  if (!wanted.length) return [];
  const { data: variants } = await db
    .from("product_variants")
    .select("id, stock, active, products!inner(active)")
    .eq("store_id", storeId)
    .in("id", wanted.map((i) => i.variant_id));
  const byId = new Map(((variants ?? []) as unknown as VariantRow[]).map((v) => [v.id, v]));
  return wanted.flatMap((i) => {
    const v = byId.get(i.variant_id);
    if (!v?.active || !v.products.active || v.stock <= 0) return [];
    return [{ variantId: v.id, quantity: Math.min(i.quantity, v.stock) }];
  });
}

// Rotina de hora em hora: um e-mail por pedido expirado entre 30 min e 48 h atrás, se o cliente não fez outro pedido depois
// e se algum item ainda está à venda. A trava notified_expired_at garante o envio único.
export async function sendExpiredOrderReminders(db: SupabaseClient) {
  const now = new Date().getTime();
  const since = new Date(now - RECOVERY_WINDOW_HOURS * 3_600_000).toISOString();
  const until = new Date(now - RECOVERY_DELAY_MINUTES * 60_000).toISOString();
  const { data, error } = await db
    .from("orders")
    .select("id, store_id, customer_email, created_at, stores!inner(status)")
    .eq("status", "expired")
    .is("notified_expired_at", null)
    .gte("expires_at", since)
    .lte("expires_at", until)
    .eq("stores.status", "active")
    .order("created_at", { ascending: false })
    .limit(BATCH);
  if (error) throw new Error(error.message);

  let sent = 0;
  let skipped = 0;
  for (const o of data ?? []) {
    // Já voltou e fez outro pedido (pago, aguardando ou expirado também): não insiste neste.
    const { count } = await db
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("store_id", o.store_id)
      .eq("customer_email", o.customer_email)
      .gt("created_at", o.created_at);
    if (count || !(await availableOrderItems(db, o.store_id, o.id)).length) {
      skipped++;
      continue;
    }
    if (await notifyOrderExpired(o.id)) sent++;
  }
  return { candidates: data?.length ?? 0, sent, skipped };
}
