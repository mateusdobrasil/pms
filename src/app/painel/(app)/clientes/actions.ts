"use server";

import { revalidatePath } from "next/cache";
import { requireStore } from "@/lib/panel";
import { parseBRL } from "@/lib/money";

const validKey = (key: unknown): key is string => typeof key === "string" && key.length >= 5 && key.length <= 200;

// Ao tocar em "Chamar no WhatsApp": registra a data para o lojista não chamar a mesma pessoa duas vezes.
export async function markContacted(key: string) {
  const { supabase, store } = await requireStore("clientes");
  if (!validKey(key)) return;
  const now = new Date().toISOString();
  await supabase.from("customer_contacts").upsert({ store_id: store.id, customer_key: key, contacted_at: now, updated_at: now }, { onConflict: "store_id,customer_key" });
  revalidatePath("/painel/clientes");
}

// "Não chamar mais" (o cliente pediu, ou não faz sentido): some da lista de sumidos. Reversível.
export async function setDoNotContact(key: string, value: boolean) {
  const { supabase, store } = await requireStore("clientes");
  if (!validKey(key)) return;
  await supabase
    .from("customer_contacts")
    .upsert({ store_id: store.id, customer_key: key, do_not_contact: value, updated_at: new Date().toISOString() }, { onConflict: "store_id,customer_key" });
  revalidatePath("/painel/clientes");
}

export type LoyaltyState = { error?: string; ok?: string } | null;

// Cartão fidelidade: liga/desliga e regra. Ao ligar pela primeira vez, os carimbos passam a contar a partir de agora.
export async function saveLoyalty(_prev: LoyaltyState, form: FormData): Promise<LoyaltyState> {
  const { supabase, store } = await requireStore();
  const enabled = form.get("enabled") === "on";
  const goal = Number(form.get("goal"));
  const reward = String(form.get("reward") ?? "").trim().replace(/\s+/g, " ");
  const counts = String(form.get("counts") ?? "both");
  const min = parseBRL(String(form.get("min_order") ?? "") || "0");
  if (!Number.isInteger(goal) || goal < 2 || goal > 50) return { error: "A meta precisa ser de 2 a 50." };
  if (enabled && (reward.length < 2 || reward.length > 120)) return { error: "Escreva o prêmio, por exemplo \"1 corte grátis\" ou \"10% de desconto\"." };
  if (!["orders", "bookings", "both"].includes(counts)) return { error: "Escolha o que conta no cartão." };
  if (min == null) return { error: "Valor mínimo inválido. Use, por exemplo, 50 ou 49,90." };

  const { data: current } = await supabase.from("stores").select("loyalty_started_at").eq("id", store.id).single();
  const { error } = await supabase
    .from("stores")
    .update({
      loyalty_enabled: enabled,
      loyalty_goal: goal,
      loyalty_reward: reward || null,
      loyalty_counts: counts,
      loyalty_min_order_cents: min,
      ...(enabled && !current?.loyalty_started_at ? { loyalty_started_at: new Date().toISOString() } : {}),
    })
    .eq("id", store.id);
  if (error) return { error: "Não foi possível salvar." };
  revalidatePath("/painel/clientes");
  return { ok: enabled ? "Cartão fidelidade ligado." : "Cartão fidelidade desligado." };
}

// Entregou o prêmio: dá baixa no mais antigo em aberto deste cliente (pelo celular ou pelo e-mail).
export async function redeemReward(keys: string[]) {
  const { supabase, store } = await requireStore("clientes");
  const valid = keys.filter(validKey);
  if (!valid.length) return;
  const { data: open } = await supabase
    .from("loyalty_rewards")
    .select("id")
    .eq("store_id", store.id)
    .in("customer_key", valid)
    .is("redeemed_at", null)
    .order("earned_at")
    .limit(1)
    .maybeSingle();
  if (open) await supabase.from("loyalty_rewards").update({ redeemed_at: new Date().toISOString() }).eq("id", open.id).is("redeemed_at", null);
  revalidatePath("/painel/clientes");
}
