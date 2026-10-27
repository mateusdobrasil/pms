// Pacotes de sessões. Funções puras, testadas em tests/packages.test.ts.

export type PackageState = "active" | "used_up" | "expired" | "canceled";

export type CustomerPackageRow = {
  id: string;
  service_id: string | null;
  sessions_total: number;
  status: "active" | "canceled";
  expires_at: string | null;
  used: number; // sessões já usadas
};

export const remaining = (p: Pick<CustomerPackageRow, "sessions_total" | "used">) => Math.max(0, p.sessions_total - p.used);

export function packageState(p: CustomerPackageRow, now = new Date()): PackageState {
  if (p.status === "canceled") return "canceled";
  if (remaining(p) === 0) return "used_up";
  if (p.expires_at && new Date(p.expires_at) <= now) return "expired";
  return "active";
}

export const PACKAGE_STATES: Record<PackageState, { label: string; tone: string }> = {
  active: { label: "Ativo", tone: "bg-emerald-100 text-emerald-800 ring-emerald-200" },
  used_up: { label: "Concluído", tone: "bg-neutral-100 text-neutral-600 ring-neutral-200" },
  expired: { label: "Vencido", tone: "bg-amber-100 text-amber-900 ring-amber-200" },
  canceled: { label: "Cancelado", tone: "bg-red-100 text-red-800 ring-red-200" },
};

// Validade a partir da venda (null = sem validade).
export const expiresAt = (validityDays: number | null, from = new Date()) =>
  validityDays ? new Date(from.getTime() + validityDays * 86_400_000).toISOString() : null;

// Qual pacote usar para o serviço: o ativo que vence primeiro (sem validade fica por último).
export function pickPackage<T extends CustomerPackageRow>(packages: T[], serviceId: string | null, now = new Date()): T | null {
  return (
    packages
      .filter((p) => p.service_id === serviceId && packageState(p, now) === "active")
      .sort((a, b) => (a.expires_at ?? "9999").localeCompare(b.expires_at ?? "9999"))[0] ?? null
  );
}

// "5 escovas" a partir do serviço e da quantidade (sugestão de nome no painel).
export const suggestedName = (serviceName: string, sessions: number) => `${sessions} × ${serviceName}`;

// Preço por sessão (exibição: "R$ 40,00 por sessão").
export const perSessionCents = (priceCents: number, sessions: number) => Math.round(priceCents / sessions);

// Nome gravado em orders.shipping_method na compra online de pacote (sem entrega).
export const PACKAGE_METHOD = "Pacote de sessões";
export const isPackagePurchase = (shippingMethod: string | null | undefined) => shippingMethod === PACKAGE_METHOD;
