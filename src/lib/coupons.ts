import { formatBRL } from "@/lib/money";

// Cupons de desconto: regras puras (testadas em tests/coupons.test.ts). O desconto vale só para os produtos.
export type Coupon = {
  id: string;
  code: string;
  kind: "percent" | "fixed";
  value: number; // percent: 1 a 90; fixed: centavos
  min_subtotal_cents: number | null;
  starts_at: string | null;
  ends_at: string | null;
  max_uses: number | null;
  once_per_customer: boolean;
  active: boolean;
};

// "  bemvindo10 " → "BEMVINDO10". Inválido → null.
export function normalizeCouponCode(raw: unknown) {
  const code = typeof raw === "string" ? raw.trim().toUpperCase().replace(/\s+/g, "") : "";
  return /^[A-Z0-9_-]{3,30}$/.test(code) ? code : null;
}

// Desconto em centavos sobre os produtos (nunca maior que eles).
export function couponDiscountCents(c: Pick<Coupon, "kind" | "value">, subtotalCents: number) {
  const d = c.kind === "percent" ? Math.floor((subtotalCents * c.value) / 100) : c.value;
  return Math.max(0, Math.min(d, subtotalCents));
}

// "10% de desconto" / "R$ 20,00 de desconto".
export const couponLabel = (c: Pick<Coupon, "kind" | "value">) => (c.kind === "percent" ? `${c.value}% de desconto` : `${formatBRL(c.value)} de desconto`);

// Por que o cupom não vale agora (null = vale). Usos: pedidos pagos e pedidos ainda aguardando pagamento.
export function couponProblem(c: Coupon, subtotalCents: number, now: Date, used: { total: number; byCustomer: number }) {
  if (!c.active) return "Este cupom não está mais ativo.";
  if (c.starts_at && now < new Date(c.starts_at)) return "Este cupom ainda não começou a valer.";
  if (c.ends_at && now > new Date(c.ends_at)) return "Este cupom expirou.";
  if (c.min_subtotal_cents && subtotalCents < c.min_subtotal_cents) return `Este cupom vale para compras a partir de ${formatBRL(c.min_subtotal_cents)} em produtos.`;
  if (c.max_uses && used.total >= c.max_uses) return "Este cupom já atingiu o limite de usos.";
  if (c.once_per_customer && used.byCustomer > 0) return "Você já usou este cupom.";
  return null;
}

export type CouponInput = Omit<Coupon, "id" | "active">;

// Formulário do painel → cupom. Datas (AAAA-MM-DD) no horário de Brasília: começa às 0h, termina às 23h59.
export function parseCouponForm(f: {
  code: string;
  kind: string;
  value: string;
  min: string;
  starts: string;
  ends: string;
  maxUses: string;
  once: boolean;
}, parseMoney: (s: string) => number | null): { coupon: CouponInput } | { error: string } {
  const code = normalizeCouponCode(f.code);
  if (!code) return { error: "Código inválido: de 3 a 30 letras, números, - ou _ (ex.: BEMVINDO10)." };
  if (f.kind !== "percent" && f.kind !== "fixed") return { error: "Escolha o tipo de desconto." };
  const value = f.kind === "percent" ? Number(f.value.replace(",", ".")) : parseMoney(f.value);
  if (f.kind === "percent" && (!Number.isInteger(value) || value! < 1 || value! > 90)) return { error: "Percentual: um número inteiro de 1 a 90." };
  if (f.kind === "fixed" && (!value || value <= 0)) return { error: "Valor do desconto inválido. Use o formato 20,00." };
  const min = f.min.trim() ? parseMoney(f.min) : null;
  if (f.min.trim() && (!min || min <= 0)) return { error: "Valor mínimo inválido. Use o formato 100,00." };
  const date = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  if ((f.starts && !date(f.starts)) || (f.ends && !date(f.ends))) return { error: "Data inválida." };
  if (f.starts && f.ends && f.ends < f.starts) return { error: "O fim da validade é antes do começo." };
  const maxUses = f.maxUses.trim() ? Number(f.maxUses) : null;
  if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 100000)) return { error: "Limite de usos: um número inteiro a partir de 1." };
  return {
    coupon: {
      code,
      kind: f.kind,
      value: value!,
      min_subtotal_cents: min,
      starts_at: f.starts ? `${f.starts}T00:00:00-03:00` : null,
      ends_at: f.ends ? `${f.ends}T23:59:59-03:00` : null,
      max_uses: maxUses,
      once_per_customer: f.once,
    },
  };
}

// Condições em texto, para a lista do painel.
export function couponConditions(c: Pick<Coupon, "min_subtotal_cents" | "starts_at" | "ends_at" | "once_per_customer">) {
  const day = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return [
    c.min_subtotal_cents && `compras a partir de ${formatBRL(c.min_subtotal_cents)}`,
    c.starts_at && `a partir de ${day(c.starts_at)}`,
    c.ends_at && `até ${day(c.ends_at)}`,
    c.once_per_customer && "1 uso por CPF",
  ].filter(Boolean) as string[];
}

// Cupom gravado no pedido (null = sem cupom).
export type OrderCoupon = { code: string; cents: number } | null;

// Linhas de desconto do pedido: o cupom e o resto de discount_cents (Pix, ou o desconto do balcão).
export function discountLines(discountCents: number, coupon: OrderCoupon, otherLabel = "Desconto Pix") {
  const c = coupon?.cents ?? 0;
  const lines: { label: string; cents: number }[] = [];
  if (coupon && c > 0) lines.push({ label: `Cupom ${coupon.code}`, cents: c });
  if (discountCents - c > 0) lines.push({ label: otherLabel, cents: discountCents - c });
  return lines;
}

// Situação para o painel.
export function couponStatus(c: Coupon, now: Date, uses: number): { label: string; tone: "on" | "off" | "wait" } {
  if (!c.active) return { label: "Desativado", tone: "off" };
  if (c.ends_at && now > new Date(c.ends_at)) return { label: "Expirado", tone: "off" };
  if (c.max_uses && uses >= c.max_uses) return { label: "Esgotado", tone: "off" };
  if (c.starts_at && now < new Date(c.starts_at)) return { label: "Agendado", tone: "wait" };
  return { label: "Ativo", tone: "on" };
}
