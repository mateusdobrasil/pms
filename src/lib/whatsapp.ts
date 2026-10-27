import "server-only";

// WhatsApp Business (Cloud API da Meta), pelo número oficial da plataforma. Mensagem iniciada pela empresa
// só com template aprovado no WhatsApp Manager (categoria utilidade).
// WHATSAPP_TOKEN: token permanente (usuário do sistema) · WHATSAPP_PHONE_NUMBER_ID: id do número
// WHATSAPP_REMINDER_TEMPLATE: nome do template do lembrete · WHATSAPP_TEMPLATE_LANG: idioma (padrão pt_BR)
const GRAPH = "https://graph.facebook.com/v21.0";

export const reminderTemplate = () => process.env.WHATSAPP_REMINDER_TEMPLATE || null;

export function whatsappConfigured() {
  return !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && reminderTemplate());
}

// Celular brasileiro (10 ou 11 dígitos, sem o 55) no formato da API: 55 + DDD + número.
export const toWhatsappNumber = (phone: string | null | undefined) => {
  const d = (phone ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  return d.length === 10 || d.length === 11 ? `55${d}` : null;
};

// Envia um template com os parâmetros do corpo ({{1}}, {{2}}...). Devolve o id da mensagem ou o erro.
export async function sendTemplate(to: string, template: string, params: string[]): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return { ok: false, error: "WhatsApp não configurado" };
  try {
    const res = await fetch(`${GRAPH}/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: template,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "pt_BR" },
          // A Meta recusa parâmetro vazio ou com quebra de linha/tabulação.
          components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text: text.replace(/[\n\t]+/g, " ").trim() || "-" })) }],
        },
      }),
    });
    const body = (await res.json().catch(() => null)) as { messages?: { id: string }[]; error?: { message?: string; code?: number } } | null;
    if (!res.ok) return { ok: false, error: `${res.status} ${body?.error?.code ?? ""} ${body?.error?.message ?? ""}`.trim().slice(0, 300) };
    return { ok: true, id: body?.messages?.[0]?.id ?? null };
  } catch (err) {
    return { ok: false, error: String(err).slice(0, 300) };
  }
}

// Texto do template de lembrete para cadastrar no WhatsApp Manager (categoria Utilidade, Português (BR)).
// A Meta não aceita variável no começo nem no fim do corpo.
export const REMINDER_TEMPLATE_TEXT =
  "Olá, {{1}}! Lembrete do seu horário na {{2}} amanhã: {{3}} às {{4}}, com {{5}}. Para remarcar ou cancelar, use o link {{6}} . Até lá!";

// Exemplo de parâmetros (o WhatsApp Manager pede exemplos ao cadastrar; o envio de teste usa os mesmos).
export const REMINDER_SAMPLE = ["Ana", "Salão Exemplo", "Escova", "14:00", "Bia", "https://www.pmsapp.dev"];

// Celular para exibir sem expor tudo: 5511987654321 → 55 11 9****-4321.
export const maskPhone = (phone: string) => phone.replace(/^(\d{2})(\d{2})(\d)\d+(\d{4})$/, "$1 $2 $3****-$4");

// Situação das variáveis (só se existem; nunca o valor).
export function whatsappEnv() {
  return {
    token: !!process.env.WHATSAPP_TOKEN,
    phoneNumberId: !!process.env.WHATSAPP_PHONE_NUMBER_ID,
    template: reminderTemplate(),
    lang: process.env.WHATSAPP_TEMPLATE_LANG || "pt_BR",
    businessAccountId: !!process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
  };
}

async function graphGet<T>(path: string): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) return { ok: false, error: "WHATSAPP_TOKEN ausente" };
  try {
    const res = await fetch(`${GRAPH}/${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const body = (await res.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
    if (!res.ok || !body) return { ok: false, error: `${res.status} ${body?.error?.message ?? ""}`.trim().slice(0, 300) };
    return { ok: true, data: body };
  } catch (err) {
    return { ok: false, error: String(err).slice(0, 300) };
  }
}

// Conexão com a Meta: o número, o nome verificado e a qualidade (prova que token e id estão certos).
export async function checkPhoneNumber() {
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!id) return { ok: false as const, error: "WHATSAPP_PHONE_NUMBER_ID ausente" };
  return graphGet<{ display_phone_number?: string; verified_name?: string; quality_rating?: string; messaging_limit_tier?: string }>(
    `${id}?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier`,
  );
}

// Templates da conta (precisa de WHATSAPP_BUSINESS_ACCOUNT_ID): nome, idioma, categoria e situação da aprovação.
export async function listTemplates() {
  const waba = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  if (!waba) return { ok: false as const, error: "WHATSAPP_BUSINESS_ACCOUNT_ID ausente" };
  const r = await graphGet<{ data: { name: string; language: string; status: string; category: string }[] }>(`${waba}/message_templates?fields=name,language,status,category&limit=100`);
  return r.ok ? { ok: true as const, templates: r.data.data } : r;
}
