// Propostas comerciais (/admin → Propostas). Funções puras, testadas em tests/proposals.test.ts.

export type Proposal = {
  id: string;
  public_token: string;
  client_name: string;
  business_name: string;
  email: string | null;
  whatsapp: string | null;
  setup_fee_cents: number;
  monthly_fee_cents: number;
  valid_until: string; // AAAA-MM-DD
  items: string;
  notes: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  accepted_at: string | null;
  created_at: string;
};

export const PROPOSAL_FIELDS =
  "id, public_token, client_name, business_name, email, whatsapp, setup_fee_cents, monthly_fee_cents, valid_until, items, notes, sent_at, viewed_at, accepted_at, created_at";

export const PROPOSAL_VALID_DAYS = 15;

// Textos de "O que está incluído" (editáveis em cada proposta): um modelo por tipo de negócio.
const COMMON_START = [
  "Loja no domínio da sua marca (ou em sualoja.minhaloja.promo), com logo e cores",
  "Pagamento por Pix e cartão (Mercado Pago), com o dinheiro direto na sua conta, sem comissão sobre as vendas",
];
const COMMON_END = [
  "Avaliações dos clientes na loja, cartão fidelidade e cupom de aniversário",
  "Link para a bio do Instagram e QR Codes para imprimir",
  "Painel no celular, com aviso a cada venda e agendamento, e resumo do mês por e-mail",
  "Páginas de trocas e privacidade prontas (LGPD e Código de Defesa do Consumidor)",
  "Configuração inicial e suporte pelo WhatsApp",
];
const STORE_ITEMS = [
  "Catálogo com fotos, tamanhos e cores, estoque por variação e categorias",
  "Checkout sem cadastro e acompanhamento do pedido por link",
  "Frete pelo Melhor Envio, entrega própria e retirada na loja",
  "Cupons de desconto, links de pagamento e caixa para vendas no balcão",
  "Produtos no Google Shopping e no catálogo do Instagram, com Meta Pixel e Google Analytics",
];
const SERVICE_ITEMS = [
  "Agenda online: o cliente escolhe serviço, profissional e horário, com sinal no Pix ou cartão",
  "Remarcação e cancelamento pelo cliente, com estorno automático, e lista de espera",
  "Lembrete da véspera e confirmação pelo WhatsApp oficial",
  "Pacotes de sessões e comissão por profissional, com o fechamento do mês",
];
export const PROPOSAL_ITEM_MODELS = {
  loja: { label: "Loja", items: [...COMMON_START, ...STORE_ITEMS, ...COMMON_END].join("\n") },
  servicos: { label: "Serviços com hora marcada", items: [...COMMON_START, ...SERVICE_ITEMS, ...COMMON_END].join("\n") },
  completo: { label: "Loja + agenda", items: [...COMMON_START, ...STORE_ITEMS, ...SERVICE_ITEMS, ...COMMON_END].join("\n") },
} as const;
export const DEFAULT_PROPOSAL_ITEMS = PROPOSAL_ITEM_MODELS.loja.items;

export type ProposalStatus = "rascunho" | "enviada" | "vista" | "aceita" | "vencida";

export function proposalStatus(p: Pick<Proposal, "sent_at" | "viewed_at" | "accepted_at" | "valid_until">, today: string): ProposalStatus {
  if (p.accepted_at) return "aceita";
  if (p.valid_until < today) return "vencida";
  if (p.viewed_at) return "vista";
  if (p.sent_at) return "enviada";
  return "rascunho";
}

export const proposalItems = (items: string) =>
  items
    .split("\n")
    .map((l) => l.replace(/^[\s•*-]+/, "").trim())
    .filter(Boolean);

export function proposalWhatsappText(p: Pick<Proposal, "client_name" | "business_name">, url: string) {
  const first = p.client_name.trim().split(/\s+/)[0];
  return `Olá, ${first}! Aqui é da PMS app. Segue a proposta da loja virtual para a ${p.business_name}: ${url}`;
}
