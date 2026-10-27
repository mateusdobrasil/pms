// Eventos do WhatsApp: em que momentos o sistema pode mandar mensagem e que dados cada um oferece para as
// variáveis do template ({{1}}, {{2}}...). Funções puras, testadas em tests/whatsapp-events.test.ts.

export type WaField =
  | "first_name"
  | "customer_name"
  | "store_name"
  | "service"
  | "professional"
  | "date"
  | "time"
  | "link"
  | "order_code"
  | "total"
  | "items"
  | "tracking"
  | "shipping"
  | "package_name"
  | "sessions_left"
  | "valid_until"
  | "free_times"
  | "reward"
  | "customer_phone";

export const WA_FIELDS: Record<WaField, { label: string; sample: string }> = {
  first_name: { label: "Primeiro nome do cliente", sample: "Ana" },
  customer_name: { label: "Nome completo do cliente", sample: "Ana Souza" },
  store_name: { label: "Nome da loja", sample: "Salão Exemplo" },
  service: { label: "Serviço", sample: "Escova" },
  professional: { label: "Profissional", sample: "Bia" },
  date: { label: "Data (sexta-feira, 31/10)", sample: "sexta-feira, 31/10" },
  time: { label: "Hora (14:00)", sample: "14:00" },
  link: { label: "Link (do agendamento, pedido ou loja)", sample: "https://www.pmsapp.dev" },
  order_code: { label: "Número do pedido", sample: "A1B2C3D4" },
  total: { label: "Valor (R$ 129,90)", sample: "R$ 129,90" },
  items: { label: "Itens (2× Camiseta, 1× Boné)", sample: "2× Camiseta, 1× Boné" },
  tracking: { label: "Código de rastreio", sample: "AA123456789BR" },
  shipping: { label: "Forma de entrega", sample: "Correios SEDEX" },
  package_name: { label: "Nome do pacote", sample: "5 × Escova" },
  sessions_left: { label: "Sessões restantes", sample: "3" },
  valid_until: { label: "Validade do pacote", sample: "31/01/2027" },
  free_times: { label: "Horários livres", sample: "10:00, 14:30" },
  reward: { label: "Prêmio do cartão fidelidade", sample: "1 corte grátis" },
  customer_phone: { label: "Celular do cliente", sample: "(11) 98765-4321" },
};

export type WaEvent =
  | "booking_reminder"
  | "booking_confirmed"
  | "order_paid"
  | "order_shipped"
  | "order_ready"
  | "package_activated"
  | "package_used"
  | "waitlist_opening"
  | "loyalty_reward"
  | "store_new_sale"
  | "store_new_booking";

type EventDef = { label: string; description: string; audience: "customer" | "store"; fields: WaField[] };

const BOOKING: WaField[] = ["first_name", "customer_name", "store_name", "service", "professional", "date", "time", "link"];
const ORDER: WaField[] = ["first_name", "customer_name", "store_name", "order_code", "total", "items", "link"];

export const WA_EVENTS: Record<WaEvent, EventDef> = {
  booking_reminder: { label: "Lembrete da véspera", description: "Na véspera do agendamento, às 8h.", audience: "customer", fields: BOOKING },
  booking_confirmed: { label: "Agendamento confirmado", description: "Quando o agendamento é confirmado (na hora ou depois do sinal pago).", audience: "customer", fields: BOOKING },
  order_paid: { label: "Compra confirmada", description: "Quando o pagamento do pedido é aprovado.", audience: "customer", fields: ORDER },
  order_shipped: { label: "Pedido enviado", description: "Quando o pedido sai para entrega (com o rastreio, se houver).", audience: "customer", fields: [...ORDER, "tracking", "shipping"] },
  order_ready: { label: "Pronto para retirada", description: "Quando o pedido de retirada fica pronto.", audience: "customer", fields: ORDER },
  package_activated: { label: "Pacote ativo", description: "Quando um pacote de sessões é comprado.", audience: "customer", fields: ["first_name", "customer_name", "store_name", "package_name", "sessions_left", "valid_until"] },
  package_used: { label: "Sessão do pacote usada", description: "A cada sessão usada, com o que sobrou.", audience: "customer", fields: ["first_name", "customer_name", "store_name", "package_name", "sessions_left", "valid_until"] },
  waitlist_opening: { label: "Horário liberado (lista de espera)", description: "Quando abre horário no dia que a pessoa esperava.", audience: "customer", fields: ["first_name", "customer_name", "store_name", "service", "date", "free_times", "link"] },
  loyalty_reward: { label: "Prêmio do cartão fidelidade", description: "Quando o cliente completa o cartão.", audience: "customer", fields: ["first_name", "customer_name", "store_name", "reward"] },
  store_new_sale: { label: "Nova venda (para o lojista)", description: "Para o WhatsApp da loja, a cada venda paga.", audience: "store", fields: ["store_name", "customer_name", "customer_phone", "order_code", "total", "items", "link"] },
  store_new_booking: { label: "Novo agendamento (para o lojista)", description: "Para o WhatsApp da loja, a cada agendamento novo.", audience: "store", fields: ["store_name", "customer_name", "customer_phone", "service", "professional", "date", "time", "link"] },
};

export const WA_EVENT_KEYS = Object.keys(WA_EVENTS) as WaEvent[];
export const isWaEvent = (v: unknown): v is WaEvent => typeof v === "string" && v in WA_EVENTS;
export const isWaField = (v: unknown): v is WaField => typeof v === "string" && v in WA_FIELDS;

// Quantas variáveis o corpo do template tem (o maior {{n}}).
export function countPlaceholders(body: string) {
  return Math.max(0, ...[...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])));
}

// Parâmetros do envio, na ordem de {{1}}, {{2}}... (dado ausente vira "-": a Meta recusa parâmetro vazio).
export function buildParams(mapping: WaField[], data: Partial<Record<WaField, string>>) {
  return mapping.map((f) => (data[f] ?? "").replace(/[\n\t]+/g, " ").replace(/ {5,}/g, "    ").trim() || "-");
}

// Prévia: o corpo com os exemplos de cada dado no lugar das variáveis.
export function previewText(body: string, mapping: WaField[]) {
  return body.replace(/\{\{(\d+)\}\}/g, (all, n) => {
    const f = mapping[Number(n) - 1];
    return f ? WA_FIELDS[f].sample : all;
  });
}

// O lembrete antigo (WHATSAPP_REMINDER_TEMPLATE): mesmas variáveis, até ser configurado em Modelos.
export const LEGACY_REMINDER_PARAMS: WaField[] = ["first_name", "store_name", "service", "time", "professional", "link"];

// Sugestão de template para cadastrar no WhatsApp Manager (categoria Utilidade, Português (BR)): nome, corpo e o
// dado de cada variável. A Meta não aceita variável no começo nem no fim do corpo.
export const WA_SUGGESTIONS: Record<WaEvent, { name: string; body: string; params: WaField[] }> = {
  booking_reminder: {
    name: "lembrete_horario",
    body: "Olá, {{1}}! Lembrete do seu horário na {{2}} amanhã: {{3}} às {{4}}, com {{5}}. Para remarcar ou cancelar, use o link {{6}} . Até lá!",
    params: LEGACY_REMINDER_PARAMS,
  },
  booking_confirmed: {
    name: "agendamento_confirmado",
    body: "Olá, {{1}}! Seu horário na {{2}} está confirmado: {{3}}, {{4}} às {{5}}, com {{6}}. Detalhes, remarcar ou cancelar: {{7}} . Até lá!",
    params: ["first_name", "store_name", "service", "date", "time", "professional", "link"],
  },
  order_paid: {
    name: "compra_confirmada",
    body: "Olá, {{1}}! Recebemos o pagamento do seu pedido {{2}} na {{3}}, no valor de {{4}}. Acompanhe pelo link {{5}} . Obrigado pela compra!",
    params: ["first_name", "order_code", "store_name", "total", "link"],
  },
  order_shipped: {
    name: "pedido_enviado",
    body: "Olá, {{1}}! Seu pedido {{2}} da {{3}} foi enviado ({{4}}). Código de rastreio: {{5}}. Acompanhe pelo link {{6}} . Boas compras!",
    params: ["first_name", "order_code", "store_name", "shipping", "tracking", "link"],
  },
  order_ready: {
    name: "pedido_pronto_retirada",
    body: "Olá, {{1}}! Seu pedido {{2}} da {{3}} está pronto para retirada. Detalhes no link {{4}} . Te esperamos!",
    params: ["first_name", "order_code", "store_name", "link"],
  },
  package_activated: {
    name: "pacote_ativo",
    body: "Olá, {{1}}! Seu pacote {{2}} na {{3}} está ativo: {{4}} sessões, válidas até {{5}}. É só agendar!",
    params: ["first_name", "package_name", "store_name", "sessions_left", "valid_until"],
  },
  package_used: {
    name: "sessao_pacote_usada",
    body: "Olá, {{1}}! Uma sessão do seu pacote {{2}} na {{3}} foi usada. Restam {{4}}, válidas até {{5}}. Obrigado!",
    params: ["first_name", "package_name", "store_name", "sessions_left", "valid_until"],
  },
  waitlist_opening: {
    name: "horario_liberado",
    body: "Olá, {{1}}! Abriu horário para {{2}} na {{3}} em {{4}}: {{5}}. Para reservar, use o link {{6}} . Vale quem reservar primeiro!",
    params: ["first_name", "service", "store_name", "date", "free_times", "link"],
  },
  loyalty_reward: {
    name: "premio_fidelidade",
    body: "Parabéns, {{1}}! Você completou o cartão fidelidade da {{2}} e ganhou: {{3}}. Fale com a loja para usar o prêmio.",
    params: ["first_name", "store_name", "reward"],
  },
  store_new_sale: {
    name: "nova_venda_loja",
    body: "Nova venda na {{1}}! Pedido {{2}} de {{3}}, no valor de {{4}}: {{5}}. Veja no painel: {{6}} . Boas vendas!",
    params: ["store_name", "order_code", "customer_name", "total", "items", "link"],
  },
  store_new_booking: {
    name: "novo_agendamento_loja",
    body: "Novo agendamento na {{1}}: {{2}} com {{3}}, {{4}} às {{5}}. Cliente: {{6}} ({{7}}). Veja no painel.",
    params: ["store_name", "service", "professional", "date", "time", "customer_name", "customer_phone"],
  },
};

const TZ = "America/Sao_Paulo";
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
// "R$ 129,90" com espaço comum (o Intl usa um espaço especial que nem todo WhatsApp mostra bem).
const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\s/g, " ");

// Dados de um agendamento para as variáveis ("sexta-feira, 31/10", "14:00"...).
export function bookingFields(b: { customerName: string; storeName: string; serviceName: string; professionalName: string; startsAt: string; link: string; customerPhone?: string | null }) {
  const d = new Date(b.startsAt);
  const date = `${d.toLocaleDateString("pt-BR", { timeZone: TZ, weekday: "long" })}, ${d.toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" })}`;
  const time = d.toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  return {
    first_name: firstName(b.customerName),
    customer_name: b.customerName,
    store_name: b.storeName,
    service: b.serviceName,
    professional: b.professionalName,
    date,
    time,
    link: b.link,
    customer_phone: b.customerPhone ?? "",
  } satisfies Partial<Record<WaField, string>>;
}

// Dados de um pedido para as variáveis ("R$ 129,90", "2× Camiseta, 1× Boné"...).
export function orderFields(o: { customerName: string; storeName: string; code: string; totalCents: number; items: { name: string; quantity: number }[]; link: string; customerPhone?: string | null; tracking?: string | null; shipping?: string | null }) {
  return {
    first_name: firstName(o.customerName),
    customer_name: o.customerName,
    store_name: o.storeName,
    order_code: o.code,
    total: brl(o.totalCents),
    items: o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ").slice(0, 300),
    link: o.link,
    customer_phone: o.customerPhone ?? "",
    tracking: o.tracking ?? "",
    shipping: o.shipping ?? "",
  } satisfies Partial<Record<WaField, string>>;
}
