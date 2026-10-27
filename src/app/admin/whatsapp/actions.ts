"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { sendTemplate, toWhatsappNumber } from "@/lib/whatsapp";
import { WA_EVENTS, WA_FIELDS, type WaField, buildParams, isWaEvent, isWaField } from "@/lib/whatsapp-events";
import { eventTemplate } from "@/lib/whatsapp-send";

export type TestState = { ok?: string; error?: string } | null;
export type ModelState = { ok?: string; error?: string } | null;

const SAMPLES = Object.fromEntries(Object.entries(WA_FIELDS).map(([k, v]) => [k, v.sample])) as Record<WaField, string>;

// Envio de teste do modelo de um evento (dados de exemplo) para um celular: valida token, número, template e variáveis.
export async function sendWhatsappTest(_prev: TestState, form: FormData): Promise<TestState> {
  const { db } = await requireAdmin();
  const to = toWhatsappNumber(String(form.get("phone") ?? ""));
  if (!to) return { error: "Celular inválido: use DDD + número." };
  const event = form.get("event");
  if (!isWaEvent(event)) return { error: "Escolha o evento." };
  const cfg = await eventTemplate(db, event);
  if (!cfg) return { error: `"${WA_EVENTS[event].label}" ainda não tem modelo: configure em Modelos.` };
  const r = await sendTemplate(to, cfg.template, buildParams(cfg.params, SAMPLES), cfg.language);
  return r.ok
    ? { ok: `Enviado "${cfg.template}" (id ${r.id ?? "-"}). Confira o WhatsApp do celular: a mensagem chega em segundos.` }
    : { error: `A Meta recusou: ${r.error}` };
}

// Salva o modelo de um evento: template aprovado na Meta, idioma, o dado de cada variável e se está ligado.
export async function saveEventTemplate(_prev: ModelState, form: FormData): Promise<ModelState> {
  const { db } = await requireAdmin();
  const event = form.get("event");
  if (!isWaEvent(event)) return { error: "Evento inválido." };
  const template = String(form.get("template") ?? "").trim();
  const language = String(form.get("language") ?? "").trim() || "pt_BR";
  if (!/^[a-z0-9_]{1,512}$/.test(template)) return { error: "Nome do template inválido: use o nome exato da Meta (minúsculas, números e _)." };
  if (!/^[a-z]{2,3}(_[A-Z]{2})?$/.test(language)) return { error: "Idioma inválido (ex.: pt_BR)." };
  const count = Number(form.get("count"));
  if (!Number.isInteger(count) || count < 0 || count > 20) return { error: "Número de variáveis inválido." };
  const params: WaField[] = [];
  for (let n = 1; n <= count; n++) {
    const f = form.get(`p${n}`);
    if (!isWaField(f) || !WA_EVENTS[event].fields.includes(f)) return { error: `Escolha o dado da variável {{${n}}}.` };
    params.push(f);
  }
  const { error } = await db
    .from("whatsapp_event_templates")
    .upsert({ event, template, language, params, enabled: form.get("enabled") === "1", updated_at: new Date().toISOString() });
  if (error) return { error: "Não foi possível salvar. Rodou o SQL 20261119000000_whatsapp_eventos.sql?" };
  revalidatePath("/admin/whatsapp");
  return { ok: "Modelo salvo." };
}

// Tira o modelo do evento (o evento para de enviar; o lembrete volta à variável antiga, se existir).
export async function removeEventTemplate(form: FormData) {
  const { db } = await requireAdmin();
  const event = form.get("event");
  if (!isWaEvent(event)) return;
  await db.from("whatsapp_event_templates").delete().eq("event", event);
  revalidatePath("/admin/whatsapp");
}
