"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireStore } from "@/lib/panel";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/validation";
import { type CounterSaleInput, cancelCounterSale, createCounterSale } from "@/lib/counter-server";
import { checkLoyaltyForOrder } from "@/lib/loyalty-server";
import { notifyBackInStock } from "@/lib/email";

// Pedidos e estoque só mudam pelo servidor (service role), depois de conferir o login do lojista.
export async function registerCounterSale(input: CounterSaleInput) {
  const { store } = await requireStore();
  try {
    const result = await createCounterSale(createAdminClient(), store.id, input);
    if (!result.ok) return result;
    // Cliente identificado: carimbo do cartão fidelidade.
    if (input.customer?.phone || input.customer?.email) after(() => checkLoyaltyForOrder(result.id));
    revalidatePath("/painel", "layout");
    return result;
  } catch (err) {
    console.error("Venda no balcão não registrada", { storeId: store.id, err });
    return { ok: false as const, error: "Não foi possível registrar a venda. Tente de novo." };
  }
}

export async function cancelCounterSaleAction(orderId: string) {
  const { store } = await requireStore();
  if (!isUuid(orderId)) return { error: "Venda não encontrada." };
  const result = await cancelCounterSale(createAdminClient(), store.id, orderId);
  if ("ok" in result && result.restocked) after(() => notifyBackInStock(store.id));
  revalidatePath("/painel", "layout");
  return result;
}
