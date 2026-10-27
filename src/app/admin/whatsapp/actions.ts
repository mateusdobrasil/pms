"use server";

import { requireAdmin } from "@/lib/admin";
import { REMINDER_SAMPLE, reminderTemplate, sendTemplate, toWhatsappNumber } from "@/lib/whatsapp";

export type TestState = { ok?: string; error?: string } | null;

// Envio de teste do template de lembrete (dados de exemplo) para um celular: valida token, número e template.
export async function sendWhatsappTest(_prev: TestState, form: FormData): Promise<TestState> {
  await requireAdmin();
  const to = toWhatsappNumber(String(form.get("phone") ?? ""));
  if (!to) return { error: "Celular inválido: use DDD + número." };
  const template = reminderTemplate();
  if (!template) return { error: "Defina WHATSAPP_REMINDER_TEMPLATE na Vercel (nome do template aprovado)." };
  const r = await sendTemplate(to, template, REMINDER_SAMPLE);
  return r.ok
    ? { ok: `Enviado (id ${r.id ?? "-"}). Confira o WhatsApp do celular: a mensagem chega em segundos.` }
    : { error: `A Meta recusou: ${r.error}` };
}
