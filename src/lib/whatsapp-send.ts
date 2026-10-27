import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { reminderTemplate, sendTemplate, toWhatsappNumber, whatsappConnected } from "@/lib/whatsapp";
import { LEGACY_REMINDER_PARAMS, WA_EVENTS, type WaEvent, type WaField, buildParams, isWaField } from "@/lib/whatsapp-events";

export type EventTemplate = { template: string; language: string; params: WaField[]; enabled: boolean };

// Modelo configurado para o evento (/admin → WhatsApp → Modelos). O lembrete ainda sem modelo usa a variável
// antiga WHATSAPP_REMINDER_TEMPLATE, com as variáveis de antes.
export async function eventTemplate(db: SupabaseClient, event: WaEvent): Promise<EventTemplate | null> {
  const { data } = await db.from("whatsapp_event_templates").select("template, language, params, enabled").eq("event", event).maybeSingle();
  if (data) return { template: data.template, language: data.language, params: ((data.params ?? []) as unknown[]).filter(isWaField), enabled: data.enabled };
  const legacy = event === "booking_reminder" ? reminderTemplate() : null;
  return legacy ? { template: legacy, language: process.env.WHATSAPP_TEMPLATE_LANG || "pt_BR", params: LEGACY_REMINDER_PARAMS, enabled: true } : null;
}

// A loja usa o WhatsApp (ligado pelo super-admin) e este evento? Devolve também o WhatsApp da loja (eventos para o lojista).
async function storeAllows(db: SupabaseClient, storeId: string, event: WaEvent) {
  const full = await db.from("stores").select("whatsapp, whatsapp_reminders, whatsapp_events").eq("id", storeId).maybeSingle();
  const row = (full.error ? (await db.from("stores").select("whatsapp, whatsapp_reminders").eq("id", storeId).maybeSingle()).data : full.data) as {
    whatsapp: string | null;
    whatsapp_reminders?: boolean;
    whatsapp_events?: string[] | null;
  } | null;
  if (!row?.whatsapp_reminders) return null;
  if (row.whatsapp_events && !row.whatsapp_events.includes(event)) return null;
  return { storePhone: row.whatsapp };
}

type SendInput = {
  storeId: string;
  event: WaEvent;
  phone?: string | null; // do cliente; nos eventos para o lojista, vale o WhatsApp da loja
  data: Partial<Record<WaField, string>>;
  bookingId?: string | null;
  orderId?: string | null;
};

// Envia a mensagem do evento, se tudo estiver ligado e configurado, e registra em whatsapp_messages.
// Nunca lança erro (o WhatsApp é um extra: o e-mail continua indo). Quem chama cuida de não repetir.
export async function sendWhatsappEvent(input: SendInput, db: SupabaseClient = createAdminClient()): Promise<"sent" | "failed" | "skipped"> {
  try {
    if (!whatsappConnected()) return "skipped";
    const store = await storeAllows(db, input.storeId, input.event);
    if (!store) return "skipped";
    const cfg = await eventTemplate(db, input.event);
    if (!cfg?.enabled) return "skipped";
    const to = toWhatsappNumber(WA_EVENTS[input.event].audience === "store" ? store.storePhone : input.phone);
    if (!to) return "skipped";
    const r = await sendTemplate(to, cfg.template, buildParams(cfg.params, input.data), cfg.language);
    const row = {
      store_id: input.storeId,
      booking_id: input.bookingId ?? null,
      to_phone: to,
      template: cfg.template,
      wa_message_id: r.ok ? r.id : null,
      status: r.ok ? "sent" : "failed",
      error: r.ok ? null : r.error,
    };
    // event/order_id: colunas do SQL 20261119000000 (sem elas, registra o básico).
    const { error } = await db.from("whatsapp_messages").insert({ ...row, event: input.event, order_id: input.orderId ?? null });
    if (error) await db.from("whatsapp_messages").insert(row);
    return r.ok ? "sent" : "failed";
  } catch (err) {
    console.error("Falha no WhatsApp", { event: input.event, storeId: input.storeId, err });
    return "failed";
  }
}
