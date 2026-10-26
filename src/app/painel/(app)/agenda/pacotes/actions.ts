"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireStore } from "@/lib/panel";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBRL } from "@/lib/money";
import { isUuid } from "@/lib/validation";
import { cancelCustomerPackage, redeemPackageSession } from "@/lib/packages-server";
import { checkLoyaltyForBooking } from "@/lib/loyalty-server";
import { notifyPackage } from "@/lib/email";

export type PackageFormState = { error?: string; ok?: string } | null;

const refresh = () => revalidatePath("/painel", "layout");

// Pacote à venda: serviço, número de sessões, preço e validade.
export async function createPackage(_prev: PackageFormState, form: FormData): Promise<PackageFormState> {
  const { supabase, store } = await requireStore();
  const serviceId = String(form.get("service_id") ?? "");
  const sessions = Number(form.get("sessions"));
  const price = parseBRL(String(form.get("price") ?? ""));
  const validity = String(form.get("validity") ?? "").trim();
  const name = String(form.get("name") ?? "").trim().replace(/\s+/g, " ");
  if (!isUuid(serviceId)) return { error: "Escolha o serviço." };
  if (!Number.isInteger(sessions) || sessions < 2 || sessions > 100) return { error: "O pacote precisa ter de 2 a 100 sessões." };
  if (price == null || price < 100) return { error: "Informe o preço do pacote, por exemplo 200 ou 199,90." };
  const days = validity ? Number(validity) : null;
  if (days != null && (!Number.isInteger(days) || days < 1 || days > 1095)) return { error: "Validade de 1 a 1095 dias (ou em branco, sem validade)." };
  const { data: svc } = await supabase.from("services").select("name").eq("id", serviceId).eq("store_id", store.id).maybeSingle();
  if (!svc) return { error: "Serviço não encontrado." };
  const finalName = name || `${sessions} × ${svc.name}`;
  if (finalName.length > 80) return { error: "Nome muito longo (até 80 caracteres)." };
  const { error } = await supabase.from("service_packages").insert({ store_id: store.id, service_id: serviceId, name: finalName, sessions, price_cents: price, validity_days: days });
  if (error) return { error: "Não foi possível criar o pacote." };
  refresh();
  return { ok: `Pacote "${finalName}" criado. Venda em Vender → Pacotes.` };
}

export async function togglePackage(form: FormData) {
  const { supabase, store } = await requireStore();
  const id = String(form.get("id") ?? "");
  if (!isUuid(id)) return;
  await supabase.from("service_packages").update({ active: form.get("active") === "1" }).eq("id", id).eq("store_id", store.id);
  refresh();
}

// Sessão usada sem agendamento (cliente que chegou sem horário): com quem atendeu, para a comissão.
export async function redeemSessionAtCounter(customerPackageId: string, professionalId: string) {
  const { store } = await requireStore();
  if (!isUuid(customerPackageId) || !isUuid(professionalId)) return { ok: false as const, error: "Escolha quem atendeu." };
  const r = await redeemPackageSession(createAdminClient(), store.id, { customerPackageId, professionalId });
  if (r.ok) after(() => notifyPackage(customerPackageId, "used", r.left));
  refresh();
  return r;
}

// "Usar pacote" no agendamento: marca como atendido e desconta a sessão (sem cobrar).
export async function redeemSessionForBooking(customerPackageId: string, bookingId: string) {
  const { store } = await requireStore();
  if (!isUuid(customerPackageId) || !isUuid(bookingId)) return { ok: false as const, error: "Agendamento não encontrado." };
  const r = await redeemPackageSession(createAdminClient(), store.id, { customerPackageId, bookingId });
  if (r.ok) {
    after(async () => {
      await notifyPackage(customerPackageId, "used", r.left);
      if (r.bookingCompleted) await checkLoyaltyForBooking(bookingId); // carimbo do cartão fidelidade
    });
  }
  refresh();
  return r;
}

export async function cancelPackageAction(customerPackageId: string) {
  const { store } = await requireStore();
  if (!isUuid(customerPackageId)) return;
  await cancelCustomerPackage(createAdminClient(), store.id, customerPackageId);
  refresh();
}
