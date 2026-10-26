"use server";

import { revalidatePath } from "next/cache";
import { requireStore } from "@/lib/panel";
import { parseBRL, formatBRL } from "@/lib/money";
import { isUuid } from "@/lib/validation";
import { LINK_VALIDITY_DAYS, MAX_LINK_CENTS, MIN_LINK_CENTS } from "@/lib/payment-links";

export type LinkFormState = { error?: string; created?: { token: string; title: string; amountCents: number } } | null;

export async function createPaymentLink(_prev: LinkFormState, form: FormData): Promise<LinkFormState> {
  const { supabase, store } = await requireStore();
  const title = String(form.get("title") ?? "").trim().replace(/\s+/g, " ");
  const amount = parseBRL(String(form.get("amount") ?? ""));
  const days = Number(form.get("validity"));
  const reusable = form.get("reusable") === "on";

  if (title.length < 2 || title.length > 120) return { error: "Descreva a cobrança (até 120 caracteres), por exemplo \"Vestido azul M\" ou \"Sinal do casamento\"." };
  if (amount == null) return { error: "Valor inválido. Use, por exemplo, 150 ou 89,90." };
  if (amount < MIN_LINK_CENTS || amount > MAX_LINK_CENTS) return { error: `O valor precisa ficar entre ${formatBRL(MIN_LINK_CENTS)} e ${formatBRL(MAX_LINK_CENTS)}.` };
  if (!(LINK_VALIDITY_DAYS as readonly number[]).includes(days)) return { error: "Escolha a validade do link." };

  const { data, error } = await supabase
    .from("payment_links")
    .insert({
      store_id: store.id,
      title,
      amount_cents: amount,
      reusable,
      expires_at: days ? new Date(Date.now() + days * 86_400_000).toISOString() : null,
    })
    .select("public_token")
    .single();
  if (error || !data) return { error: "Não foi possível criar o link. Tente de novo." };
  revalidatePath("/painel/links");
  return { created: { token: data.public_token, title, amountCents: amount } };
}

export async function cancelPaymentLink(form: FormData) {
  const { supabase, store } = await requireStore();
  const id = String(form.get("id") ?? "");
  if (!isUuid(id)) return;
  await supabase.from("payment_links").update({ status: "canceled" }).eq("store_id", store.id).eq("id", id).eq("status", "active");
  // Tentativas ainda abertas deste link também são canceladas: o cliente não consegue mais pagar.
  await supabase.from("orders").update({ status: "canceled" }).eq("store_id", store.id).eq("payment_link_id", id).eq("status", "pending_payment");
  revalidatePath("/painel/links");
  revalidatePath("/painel/pedidos");
}
