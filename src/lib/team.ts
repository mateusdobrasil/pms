// Equipe da loja: perfis e o que cada um acessa no painel. Puro (o menu, no navegador, usa o mesmo mapa).

export type MemberRole = "owner" | "staff" | "professional";
export const TEAM_ROLES = ["staff", "professional"] as const; // o que o dono pode dar à equipe
export type TeamRole = (typeof TEAM_ROLES)[number];

export const ROLE_LABELS: Record<MemberRole, string> = { owner: "Dono", staff: "Recepção", professional: "Profissional" };
export const ROLE_HINTS: Record<TeamRole, string> = {
  staff: "Vende no balcão, cuida dos pedidos, da agenda e dos clientes e ajusta o estoque. Não vê o resumo de vendas, as configurações, a divulgação, a equipe nem a assinatura.",
  professional: "Vê só a própria agenda e a própria comissão.",
};

export const isMemberRole = (v: unknown): v is MemberRole => v === "owner" || v === "staff" || v === "professional";
export const isTeamRole = (v: unknown): v is TeamRole => v === "staff" || v === "professional";

// Áreas do painel. "dono" é o padrão de requireStore(): tela nova nasce só para o dono.
export type Area = "dono" | "todos" | "vendas" | "agenda" | "clientes" | "estoque" | "minha-agenda";

const ACCESS: Record<MemberRole, Area[]> = {
  owner: ["dono", "todos", "vendas", "agenda", "clientes", "estoque"],
  staff: ["todos", "vendas", "agenda", "clientes", "estoque"],
  professional: ["todos", "minha-agenda"],
};

export const canAccess = (role: MemberRole, area: Area) => ACCESS[role].includes(area);

// Para onde vai quem abre uma tela que não é do seu perfil. A Recepção cai no Resumo, que a manda
// para a agenda ou para os pedidos.
export const homeFor = (role: MemberRole) => (role === "professional" ? "/painel/minha-agenda" : "/painel");

// Área de cada caminho do painel (o mais específico primeiro), usada para montar o menu e as abas.
const PATHS: [string, Area][] = [
  ["/painel/agenda/servicos", "dono"],
  ["/painel/agenda/profissionais", "dono"],
  ["/painel/agenda/comissoes", "dono"],
  ["/painel/agenda", "agenda"],
  ["/painel/minha-agenda", "minha-agenda"],
  ["/painel/vender", "vendas"],
  ["/painel/pedidos/exportar", "dono"],
  ["/painel/pedidos", "vendas"],
  ["/painel/produtos", "estoque"],
  ["/painel/clientes", "clientes"],
  ["/painel/conta", "todos"],
  ["/painel/ajuda", "todos"],
];

export function pathArea(path: string): Area {
  const hit = PATHS.find(([p]) => path === p || path.startsWith(`${p}/`));
  return hit ? hit[1] : "dono";
}

export const canSee = (role: MemberRole, path: string) => canAccess(role, pathArea(path));
