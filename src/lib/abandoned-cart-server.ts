import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CartItem } from "@/lib/cart";
import { type CartCapture, captureAction, reminderWindow } from "@/lib/abandoned-cart";
import { notifyAbandonedCart } from "@/lib/email";
import { storeBaseUrl } from "@/lib/urls";
import { sendTemplate, toWhatsappNumber, whatsappConnected } from "@/lib/whatsapp";
import { buildParams } from "@/lib/whatsapp-events";
import { eventTemplate } from "@/lib/whatsapp-send";
import { campaignState, recordOptIn } from "@/lib/whatsapp-campaigns-server";

const BATCH = 50; // por rodada (de hora em hora): cabe folgado no limite de 60 s
const KEEP_DAYS = 30;

// A loja lembra carrinhos? (SQL 20261125000000; sem a coluna, não.)
export async function abandonedCartEnabled(db: SupabaseClient, storeId: string) {
  const { data, error } = await db.from("stores").select("abandoned_cart_enabled").eq("id", storeId).maybeSingle();
  return !error && !!(data as { abandoned_cart_enabled?: boolean } | null)?.abandoned_cart_enabled;
}

// Checkout com e-mail preenchido: grava (ou atualiza) o carrinho daquele e-mail. Nunca lança erro.
export async function captureCart(db: SupabaseClient, storeId: string, c: CartCapture) {
  try {
    if (!(await abandonedCartEnabled(db, storeId))) return;
    const { data: existing } = await db
      .from("abandoned_carts")
      .select("id, notified_at, converted_at, opted_out_at")
      .eq("store_id", storeId)
      .eq("email", c.email)
      .maybeSingle();
    const action = captureAction(existing, Date.now());
    if (action === "skip") return;
    const fields = { name: c.name, phone: c.phone, whatsapp_optin: c.whatsappOptIn, items: c.items, updated_at: new Date().toISOString() };
    if (action === "insert") {
      await db.from("abandoned_carts").upsert({ store_id: storeId, email: c.email, ...fields }, { onConflict: "store_id,email" });
    } else {
      const reset = action === "renew" ? { notified_at: null, notified_whatsapp: false, recovered_at: null, converted_at: null, converted_order_id: null, created_at: fields.updated_at } : {};
      await db.from("abandoned_carts").update({ ...fields, ...reset }).eq("id", existing!.id);
    }
  } catch (err) {
    console.error("Falha ao gravar carrinho", { storeId, err });
  }
}

// Pedido criado: o carrinho daquele e-mail virou compra (não recebe mais lembrete). Nunca lança erro.
export async function markCartConverted(db: SupabaseClient, storeId: string, email: string, orderId: string) {
  try {
    await db
      .from("abandoned_carts")
      .update({ converted_at: new Date().toISOString(), converted_order_id: orderId })
      .eq("store_id", storeId)
      .eq("email", email.trim().toLowerCase())
      .is("converted_at", null);
  } catch (err) {
    console.error("Falha ao marcar carrinho comprado", { storeId, err });
  }
}

type VariantRow = { id: string; stock: number; active: boolean; price_cents: number; name: string; products: { active: boolean; name: string } };
export type CartLine = CartItem & { productName: string; variantName: string; unitPriceCents: number };

// Itens que ainda dá para comprar, limitados ao estoque de agora, com nome e preço atuais.
export async function availableCartLines(db: SupabaseClient, storeId: string, items: CartItem[]): Promise<CartLine[]> {
  if (!items.length) return [];
  const { data } = await db
    .from("product_variants")
    .select("id, stock, active, price_cents, name, products!inner(active, name)")
    .eq("store_id", storeId)
    .in("id", items.map((i) => i.variantId));
  const byId = new Map(((data ?? []) as unknown as VariantRow[]).map((v) => [v.id, v]));
  return items.flatMap((i) => {
    const v = byId.get(i.variantId);
    if (!v?.active || !v.products.active || v.stock <= 0) return [];
    return [{ variantId: v.id, quantity: Math.min(i.quantity, v.stock), productName: v.products.name, variantName: v.name, unitPriceCents: v.price_cents }];
  });
}

// Link do lembrete: o carrinho (só o que ainda está à venda) e os dados para o checkout.
export async function openCartByToken(db: SupabaseClient, storeId: string, token: string) {
  const { data } = await db.from("abandoned_carts").select("name, email, phone, items").eq("store_id", storeId).eq("token", token).maybeSingle();
  if (!data) return null;
  const lines = await availableCartLines(db, storeId, data.items as CartItem[]);
  return { name: data.name as string | null, email: data.email as string, phone: data.phone as string | null, items: lines.map(({ variantId, quantity }) => ({ variantId, quantity })) };
}

// O cliente voltou pelo lembrete. Chamado pelo navegador (POST): a prévia de link do WhatsApp e os antivírus de
// e-mail abrem a página sozinhos e não podem contar como volta.
export async function markCartRecovered(db: SupabaseClient, storeId: string, token: string) {
  await db.from("abandoned_carts").update({ recovered_at: new Date().toISOString() }).eq("store_id", storeId).eq("token", token).is("recovered_at", null);
}

// "Não quero lembretes" pelo link do e-mail.
export async function optOutCart(db: SupabaseClient, storeId: string, token: string) {
  const { data } = await db.from("abandoned_carts").update({ opted_out_at: new Date().toISOString() }).eq("store_id", storeId).eq("token", token).is("opted_out_at", null).select("id");
  return !!data?.length;
}

// Guarda por até 30 dias (como diz a política de privacidade). Quem pediu para não receber lembretes fica só com
// o e-mail e a data da saída, para continuar fora.
export async function purgeOldCarts(db: SupabaseClient) {
  const before = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString();
  await db.from("abandoned_carts").delete().lt("updated_at", before).is("opted_out_at", null);
  await db.from("abandoned_carts").update({ name: null, phone: null, items: [] }).lt("updated_at", before).not("opted_out_at", "is", null).neq("items", "[]");
}

type Candidate = {
  id: string;
  store_id: string;
  email: string;
  name: string | null;
  phone: string | null;
  whatsapp_optin: boolean;
  items: CartItem[];
  token: string;
  updated_at: string;
  stores: { name: string; email: string | null; primary_color: string; abandoned_cart_enabled: boolean; store_domains: { domain: string; is_primary: boolean }[] };
};

// Rotina de hora em hora (de dia): um lembrete por carrinho largado entre 1 h e 48 h atrás, se o cliente não fez
// pedido depois e se algum item ainda está à venda. E-mail sempre; WhatsApp só para quem aceitou novidades, dentro
// da cota de campanhas da loja. Trava: notified_at.
export async function sendAbandonedCartReminders(db: SupabaseClient) {
  const result = { candidates: 0, emails: 0, whatsapp: 0, skipped: 0 };
  const { since, until } = reminderWindow(Date.now());
  const { data, error } = await db
    .from("abandoned_carts")
    .select("id, store_id, email, name, phone, whatsapp_optin, items, token, updated_at, stores!inner(name, email, primary_color, status, abandoned_cart_enabled, store_domains(domain, is_primary))")
    .is("notified_at", null)
    .is("converted_at", null)
    .is("opted_out_at", null)
    .gte("updated_at", since)
    .lte("updated_at", until)
    .eq("stores.status", "active")
    .eq("stores.abandoned_cart_enabled", true)
    .order("updated_at")
    .limit(BATCH);
  if (error) return result; // sem o SQL
  await purgeOldCarts(db);
  const carts = (data ?? []) as unknown as Candidate[];
  result.candidates = carts.length;
  const waCfg = carts.length && whatsappConnected() ? await eventTemplate(db, "abandoned_cart") : null;
  const waLeft = new Map<string, number>();

  for (const c of carts) {
    // Trava antes de tudo: se outra rodada pegou este carrinho, segue.
    const { data: claimed } = await db.from("abandoned_carts").update({ notified_at: new Date().toISOString() }).eq("id", c.id).is("notified_at", null).select("id");
    if (!claimed?.length) continue;
    // Fez pedido depois (mesmo sem pagar: o pedido expirado tem o próprio lembrete) ou nada mais à venda: não lembra.
    const { count } = await db.from("orders").select("id", { count: "exact", head: true }).eq("store_id", c.store_id).eq("customer_email", c.email).gte("created_at", c.updated_at);
    const lines = count ? [] : await availableCartLines(db, c.store_id, c.items);
    const domain = c.stores.store_domains.find((d) => d.is_primary)?.domain ?? c.stores.store_domains[0]?.domain;
    if (!lines.length || !domain) {
      result.skipped++;
      continue;
    }
    const base = storeBaseUrl(domain);
    const link = `${base}/carrinho/voltar/${c.token}`;
    const sent = await notifyAbandonedCart(c.stores, { id: c.id, key: c.updated_at, name: c.name, email: c.email, lines, link, optOutLink: `${base}/carrinho/sair/${c.token}` });
    if (!sent) {
      await db.from("abandoned_carts").update({ notified_at: null }).eq("id", c.id); // tenta tudo na próxima rodada
      continue;
    }
    result.emails++;

    // WhatsApp: aceitou novidades (agora ou antes), sem ter saído da lista, e a cota do mês ainda tem espaço.
    const to = toWhatsappNumber(c.phone);
    if (!waCfg?.enabled || !to || !c.phone) continue;
    if (c.whatsapp_optin) await recordOptIn(db, c.store_id, { phone: c.phone, name: c.name ?? "", source: "checkout" });
    const { data: optin } = await db.from("whatsapp_optins").select("token").eq("store_id", c.store_id).eq("phone", c.phone).is("opted_out_at", null).maybeSingle();
    if (!optin) continue;
    if (!waLeft.has(c.store_id)) waLeft.set(c.store_id, (await campaignState(db, c.store_id))?.remaining ?? 0);
    if ((waLeft.get(c.store_id) ?? 0) <= 0) continue;
    const name = c.name ?? "";
    const totalCents = lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
    const wa = await sendTemplate(
      to,
      waCfg.template,
      buildParams(waCfg.params, {
        first_name: name.split(" ")[0] || "tudo bem",
        customer_name: name,
        store_name: c.stores.name,
        items: lines.map((l) => `${l.quantity}× ${l.productName}`).join(", ").slice(0, 300),
        total: (totalCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\s/g, " "),
        link,
        optout_link: `${base}/whatsapp/sair/${optin.token}`,
      }),
      waCfg.language,
    );
    await db.from("whatsapp_messages").insert({
      store_id: c.store_id,
      to_phone: to,
      template: waCfg.template,
      wa_message_id: wa.ok ? wa.id : null,
      status: wa.ok ? "sent" : "failed",
      error: wa.ok ? null : wa.error,
      event: "abandoned_cart",
    });
    if (wa.ok) {
      result.whatsapp++;
      waLeft.set(c.store_id, (waLeft.get(c.store_id) ?? 1) - 1);
      await db.from("abandoned_carts").update({ notified_whatsapp: true }).eq("id", c.id);
    }
  }
  return result;
}
