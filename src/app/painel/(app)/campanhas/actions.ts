"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireStore } from "@/lib/panel";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeCouponCode } from "@/lib/coupons";
import { isUuid } from "@/lib/validation";
import { cancelCampaign, processCampaignQueue, startCampaign } from "@/lib/whatsapp-campaigns-server";

export type CampaignFormState = { ok?: string; error?: string } | null;

// Aceites, campanhas e fila só são gravados pelo servidor (service role), sempre presos à loja do login.
export async function sendCampaign(_prev: CampaignFormState, form: FormData): Promise<CampaignFormState> {
  const { store } = await requireStore();
  const db = createAdminClient();
  const couponText = String(form.get("coupon") ?? "");
  const r = await startCampaign(db, store.id, {
    text: String(form.get("text") ?? ""),
    path: String(form.get("path") ?? "/"),
    couponCode: couponText ? normalizeCouponCode(couponText) : null,
  });
  if (!r.ok) return { error: r.error };
  after(() => processCampaignQueue(createAdminClient(), 60)); // primeira leva já; o resto, a rotina a cada 5 min
  revalidatePath("/painel/campanhas");
  return {
    ok: `Campanha criada para ${r.total} ${r.total === 1 ? "cliente" : "clientes"}${r.capped ? " (o limite do mês não cobre todos: foram escolhidos os aceites mais recentes)" : ""}. O envio começa em instantes e vai aos poucos, das 9h às 21h.`,
  };
}

export async function stopCampaign(form: FormData) {
  const { store } = await requireStore();
  const id = String(form.get("id") ?? "");
  if (!isUuid(id)) return;
  await cancelCampaign(createAdminClient(), store.id, id);
  revalidatePath("/painel/campanhas");
}
