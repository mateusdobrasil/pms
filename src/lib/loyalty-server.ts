import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { loyaltyProgress } from "@/lib/loyalty";
import { customerStamps, getLoyaltyConfig, loyaltyKey } from "@/lib/loyalty-data";
import { notifyLoyaltyReward } from "@/lib/email";

type Who = { name: string; email: string | null; phone: string | null };

// Depois de um carimbo novo (compra paga ou atendimento): se o cliente completou o cartão, registra o prêmio
// e avisa o cliente e a loja. A linha em loyalty_rewards (único por cliente e número) é a trava do aviso.
// Nunca lança erro: o cartão é um extra.
export async function checkLoyalty(db: SupabaseClient, storeId: string, who: Who) {
  try {
    const cfg = await getLoyaltyConfig(db, storeId);
    const key = loyaltyKey(who.phone, who.email);
    if (!cfg?.enabled || !key) return;
    const { earned } = loyaltyProgress(await customerStamps(db, storeId, cfg, who), cfg.goal);
    if (!earned) return;
    const { count } = await db.from("loyalty_rewards").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("customer_key", key);
    for (let n = (count ?? 0) + 1; n <= earned; n++) {
      const { data: inserted } = await db
        .from("loyalty_rewards")
        .upsert({ store_id: storeId, customer_key: key, number: n, reward: cfg.reward, customer_name: who.name, customer_email: who.email }, { onConflict: "store_id,customer_key,number", ignoreDuplicates: true })
        .select("id");
      if (inserted?.length) await notifyLoyaltyReward(storeId, who, cfg.reward);
    }
  } catch (err) {
    console.error("Falha no cartão fidelidade", { storeId, err });
  }
}

export async function checkLoyaltyForOrder(orderId: string) {
  const db = createAdminClient();
  const { data: o } = await db.from("orders").select("store_id, customer_name, customer_email, customer_phone").eq("id", orderId).maybeSingle();
  if (o) await checkLoyalty(db, o.store_id, { name: o.customer_name, email: o.customer_email, phone: o.customer_phone });
}

export async function checkLoyaltyForBooking(bookingId: string) {
  const db = createAdminClient();
  const { data: b } = await db.from("bookings").select("store_id, customer_name, customer_email, customer_phone").eq("id", bookingId).maybeSingle();
  if (b) await checkLoyalty(db, b.store_id, { name: b.customer_name, email: b.customer_email, phone: b.customer_phone });
}
