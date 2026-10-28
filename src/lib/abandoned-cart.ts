// Carrinho abandonado: regras puras (testadas em tests/abandoned-cart.test.ts).
import type { CartItem } from "@/lib/cart";
import { isEmail, isUuid, onlyDigits } from "@/lib/validation";

export const REMIND_AFTER_MINUTES = 60; // o lembrete sai 1 h depois do último toque no checkout
export const REMIND_WINDOW_HOURS = 48; // carrinho mais velho que isso não recebe mais lembrete
export const RENEW_AFTER_DAYS = 7; // já lembrado ou comprado: um carrinho novo depois disso vale um lembrete novo
const MAX_ITEMS = 50;

export type CartCapture = { email: string; name: string | null; phone: string | null; whatsappOptIn: boolean; items: CartItem[] };

// O que o checkout manda quando o cliente informa o e-mail. Inválido → null (a rota responde igual, sem dizer o motivo).
export function parseCapture(body: unknown): CartCapture | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const email = String(b.email ?? "").trim().toLowerCase();
  if (!isEmail(email) || email.length > 200) return null;
  if (!Array.isArray(b.items) || b.items.length === 0 || b.items.length > MAX_ITEMS) return null;
  const items: CartItem[] = [];
  for (const raw of b.items as unknown[]) {
    const i = raw as Record<string, unknown> | null;
    const quantity = Number(i?.quantity);
    if (!i || !isUuid(String(i.variantId)) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) return null;
    items.push({ variantId: String(i.variantId), quantity });
  }
  const name = String(b.name ?? "").trim().replace(/\s+/g, " ").slice(0, 120) || null;
  const phone = onlyDigits(String(b.phone ?? "")).replace(/^55(?=\d{10,11}$)/, "");
  return { email, name, phone: /^\d{10,11}$/.test(phone) ? phone : null, whatsappOptIn: b.whatsappOptIn === true, items };
}

type Existing = { notified_at: string | null; converted_at: string | null; opted_out_at: string | null };

// Ao gravar de novo o carrinho do mesmo e-mail: "skip" (pediu para não receber), "update" (mesmo carrinho, mantém a
// trava do lembrete) ou "renew" (o anterior já foi lembrado ou comprado há mais de 7 dias: zera as travas).
export function captureAction(existing: Existing | null, now: number): "insert" | "skip" | "update" | "renew" {
  if (!existing) return "insert";
  if (existing.opted_out_at) return "skip";
  const last = Math.max(Date.parse(existing.notified_at ?? "") || 0, Date.parse(existing.converted_at ?? "") || 0);
  if (!last) return "update";
  return now - last > RENEW_AFTER_DAYS * 86_400_000 ? "renew" : "update";
}

// Janela do lembrete: carrinhos tocados entre 48 h e 1 h atrás.
export function reminderWindow(now: number) {
  return {
    since: new Date(now - REMIND_WINDOW_HOURS * 3_600_000).toISOString(),
    until: new Date(now - REMIND_AFTER_MINUTES * 60_000).toISOString(),
  };
}

export type CartState = "waiting" | "reminded" | "recovered" | "converted" | "opted_out";
export const CART_STATES: Record<CartState, { label: string; tone: string }> = {
  waiting: { label: "Aguardando", tone: "bg-neutral-100 text-neutral-700 ring-neutral-200" },
  reminded: { label: "Lembrete enviado", tone: "bg-sky-100 text-sky-800 ring-sky-200" },
  recovered: { label: "Voltou pelo lembrete", tone: "bg-amber-100 text-amber-900 ring-amber-200" },
  converted: { label: "Comprou", tone: "bg-emerald-100 text-emerald-800 ring-emerald-200" },
  opted_out: { label: "Não quer lembretes", tone: "bg-neutral-100 text-neutral-500 ring-neutral-200" },
};

export function cartState(c: Existing & { recovered_at: string | null }): CartState {
  if (c.converted_at) return "converted";
  if (c.opted_out_at) return "opted_out";
  if (c.recovered_at) return "recovered";
  if (c.notified_at) return "reminded";
  return "waiting";
}
