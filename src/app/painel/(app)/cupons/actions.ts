"use server";

import { revalidatePath } from "next/cache";
import { requireStore } from "@/lib/panel";
import { parseBRL } from "@/lib/money";
import { parseCouponForm } from "@/lib/coupons";
import { parseBirthdayForm } from "@/lib/birthday";
import { isUuid } from "@/lib/validation";

export type CouponState = { ok?: string; error?: string } | null;

export async function createCoupon(_prev: CouponState, form: FormData): Promise<CouponState> {
  const { supabase, store } = await requireStore();
  const s = (k: string) => String(form.get(k) ?? "").trim();
  const parsed = parseCouponForm(
    { code: s("code"), kind: s("kind"), value: s("value"), min: s("min"), starts: s("starts"), ends: s("ends"), maxUses: s("max_uses"), once: form.get("once") === "on", scope: s("scope") || "all" },
    parseBRL,
  );
  if ("error" in parsed) return { error: parsed.error };
  // Sem a coluna applies_to (SQL 20261121000000), grava sem ela (o cupom vale em tudo).
  const { applies_to, ...rest } = parsed.coupon;
  let { error } = await supabase.from("coupons").insert({ store_id: store.id, ...rest, ...(applies_to !== "all" ? { applies_to } : {}) });
  if (error?.code === "PGRST204") ({ error } = await supabase.from("coupons").insert({ store_id: store.id, ...rest }));
  if (error) return { error: error.code === "23505" ? `Já existe um cupom ${parsed.coupon.code}.` : "Não foi possível criar o cupom agora." };
  revalidatePath("/painel/cupons");
  return { ok: `Cupom ${parsed.coupon.code} criado.` };
}

// Liga/desliga. Cupom já usado não é apagado (o pedido guarda o código), só desativado.
export async function setCouponActive(form: FormData) {
  const { supabase, store } = await requireStore();
  const id = String(form.get("id") ?? "");
  if (!isUuid(id)) return;
  await supabase.from("coupons").update({ active: form.get("active") === "1" }).eq("id", id).eq("store_id", store.id);
  revalidatePath("/painel/cupons");
}

export async function deleteCoupon(form: FormData) {
  const { supabase, store } = await requireStore();
  const id = String(form.get("id") ?? "");
  if (!isUuid(id)) return;
  const { count } = await supabase.from("orders").select("id", { count: "exact", head: true }).eq("store_id", store.id).eq("coupon_id", id);
  if (count) await supabase.from("coupons").update({ active: false }).eq("id", id).eq("store_id", store.id);
  else await supabase.from("coupons").delete().eq("id", id).eq("store_id", store.id);
  revalidatePath("/painel/cupons");
}

// Cupom de aniversário (o lojista só altera estas colunas, pelo grant do SQL 20261122000000).
export async function saveBirthdayCoupon(_prev: CouponState, form: FormData): Promise<CouponState> {
  const { supabase, store } = await requireStore();
  const s = (k: string) => String(form.get(k) ?? "").trim();
  const parsed = parseBirthdayForm({ enabled: form.get("enabled") === "on", kind: s("kind"), value: s("value"), validDays: s("valid_days"), scope: s("scope") || "all" }, parseBRL);
  if ("error" in parsed) return { error: parsed.error };
  const c = parsed.config;
  const { error } = await supabase
    .from("stores")
    .update({ birthday_enabled: c.enabled, birthday_kind: c.kind, birthday_value: c.value, birthday_valid_days: c.validDays, birthday_applies_to: c.appliesTo })
    .eq("id", store.id);
  if (error) return { error: "Não foi possível salvar agora." };
  revalidatePath("/painel/cupons");
  return { ok: c.enabled ? "Cupom de aniversário ligado." : "Cupom de aniversário desligado." };
}
