"use server";

import { revalidatePath } from "next/cache";
import { requireStore } from "@/lib/panel";
import { parseBRL } from "@/lib/money";
import { isUuid } from "@/lib/validation";
import type { PaymentMode } from "@/lib/booking";

export type ServiceState = { error?: string; ok?: string } | null;

const MODES: PaymentMode[] = ["onsite", "deposit", "full"];

function readService(form: FormData) {
  const name = String(form.get("name") ?? "").trim().replace(/\s+/g, " ");
  const description = String(form.get("description") ?? "").trim();
  const duration = Number(form.get("duration_minutes"));
  const priceText = String(form.get("price") ?? "").trim();
  const price = priceText ? parseBRL(priceText) : 0;
  const mode = String(form.get("payment_mode") ?? "onsite") as PaymentMode;
  const deposit = Number(form.get("deposit_percent") ?? 0);

  if (name.length < 2 || name.length > 80) return { error: "Informe o nome do serviço (até 80 caracteres)." };
  if (description.length > 500) return { error: "Descrição muito longa (até 500 caracteres)." };
  if (!Number.isInteger(duration) || duration < 5 || duration > 720) return { error: "Duração inválida." };
  if (price === null || price > 10_000_000) return { error: "Preço inválido (ex.: 80,00)." };
  if (!MODES.includes(mode)) return { error: "Forma de pagamento inválida." };
  if (mode === "deposit" && (!Number.isInteger(deposit) || deposit < 1 || deposit > 99)) return { error: "Sinal inválido: de 1% a 99%." };
  if (mode !== "onsite" && price === 0) return { error: "Serviço gratuito não tem pagamento online: escolha \"Paga no salão\"." };

  return {
    fields: {
      name,
      description: description || null,
      duration_minutes: duration,
      price_cents: price,
      payment_mode: mode,
      deposit_percent: mode === "deposit" ? deposit : null,
      active: form.get("active") === "on",
    },
  };
}

function done(ok: string): ServiceState {
  revalidatePath("/painel/agenda", "layout");
  return { ok };
}

export async function createService(_prev: ServiceState, form: FormData): Promise<ServiceState> {
  const { supabase, store } = await requireStore();
  const parsed = readService(form);
  if ("error" in parsed) return { error: parsed.error };
  const { data: last } = await supabase.from("services").select("position").eq("store_id", store.id).order("position", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("services").insert({ ...parsed.fields, store_id: store.id, position: (last?.position ?? -1) + 1 });
  if (error) return { error: "Não foi possível criar o serviço." };
  return done(`Serviço "${parsed.fields.name}" criado.`);
}

export async function updateService(_prev: ServiceState, form: FormData): Promise<ServiceState> {
  const { supabase, store } = await requireStore();
  const id = String(form.get("id") ?? "");
  if (!isUuid(id)) return { error: "Serviço não encontrado." };
  const parsed = readService(form);
  if ("error" in parsed) return { error: parsed.error };
  const { data, error } = await supabase.from("services").update(parsed.fields).eq("id", id).eq("store_id", store.id).select("id");
  if (error || !data?.length) return { error: "Não foi possível salvar o serviço." };
  return done("Serviço salvo.");
}

export async function deleteService(form: FormData) {
  const { supabase, store } = await requireStore();
  const id = String(form.get("id") ?? "");
  if (!isUuid(id)) return;
  // Agendamentos antigos guardam o nome do serviço, então o histórico continua intacto.
  await supabase.from("services").delete().eq("id", id).eq("store_id", store.id);
  done("Serviço excluído.");
}

export async function moveService(form: FormData) {
  const { supabase, store } = await requireStore();
  const id = String(form.get("id") ?? "");
  const up = form.get("direction") === "up";
  if (!isUuid(id)) return;
  const { data } = await supabase.from("services").select("id, position").eq("store_id", store.id).order("position").order("name");
  const list = (data ?? []) as { id: string; position: number }[];
  const i = list.findIndex((s) => s.id === id);
  const j = up ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  for (const [position, s] of list.entries()) {
    if (s.position !== position) await supabase.from("services").update({ position }).eq("id", s.id).eq("store_id", store.id);
  }
  done("Ordem salva.");
}
