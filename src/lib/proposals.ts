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

// Texto inicial de "O que está incluído" (editável em cada proposta).
export const DEFAULT_PROPOSAL_ITEMS = [
  "Loja virtual completa no domínio da sua marca, com logo e cores",
  "Pagamento por Pix e cartão (Mercado Pago), com o dinheiro direto na sua conta",
  "Catálogo com fotos, tamanhos e cores, estoque por variação e categorias",
  "Checkout sem cadastro e acompanhamento do pedido por link",
  "Frete calculado pelo Melhor Envio e opção de retirada na loja",
  "E-mails automáticos de pedido confirmado e enviado",
  "Painel de pedidos, produtos e resumo de vendas",
  "Botão de WhatsApp em todas as páginas",
  "Produtos no Google Shopping e integração com Instagram, Meta Pixel e Google Analytics",
  "Páginas de trocas e privacidade prontas (LGPD e Código de Defesa do Consumidor)",
  "Configuração inicial e suporte pelo WhatsApp",
].join("\n");

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
