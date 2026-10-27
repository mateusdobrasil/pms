import { formatBRL } from "@/lib/money";
import { type CouponScope, isCouponScope } from "@/lib/coupons";

// Cupom de aniversário: regras puras (testadas em tests/birthday.test.ts). O aniversário é guardado como "MM-DD".

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// "15/03", "15/3", "1503" → "03-15". Data impossível ou vazia → null.
export function parseBirthday(raw: unknown) {
  const s = typeof raw === "string" ? raw.trim() : "";
  const m = /^(\d{1,2})\s*[/.-]?\s*(\d{1,2})$/.exec(s.length === 4 && /^\d{4}$/.test(s) ? `${s.slice(0, 2)}/${s.slice(2)}` : s);
  if (!m) return null;
  const day = Number(m[1]), month = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > DAYS_IN_MONTH[month - 1]) return null;
  return `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// "03-15" → "15/03".
export const formatBirthday = (b: string) => `${b.slice(3, 5)}/${b.slice(0, 2)}`;

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

// Aniversários que caem hoje (AAAA-MM-DD). Quem nasceu em 29/02 comemora em 28/02 nos anos não bissextos.
export function birthdaysOn(today: string) {
  const [y, mmdd] = [Number(today.slice(0, 4)), today.slice(5)];
  return mmdd === "02-28" && !isLeap(y) ? ["02-28", "02-29"] : [mmdd];
}

// Próximos aniversários a partir de hoje (AAAA-MM-DD), em até `days` dias, do mais perto ao mais longe.
export function upcomingBirthdays<T extends { birthday: string }>(rows: T[], today: string, days = 30) {
  const start = Date.parse(`${today}T00:00:00Z`);
  const year = Number(today.slice(0, 4));
  return rows
    .map((r) => {
      // Próxima data (este ano ou o próximo); 29/02 vira 28/02 em ano não bissexto.
      const at = (y: number) => {
        const mmdd = r.birthday === "02-29" && !isLeap(y) ? "02-28" : r.birthday;
        return Date.parse(`${y}-${mmdd}T00:00:00Z`);
      };
      const next = at(year) >= start ? at(year) : at(year + 1);
      return { ...r, inDays: Math.round((next - start) / 86_400_000) };
    })
    .filter((r) => r.inDays <= days)
    .sort((a, b) => a.inDays - b.inDays);
}

// Código pessoal: NIVER + 6 letras/números fáceis de ler (sem 0/O, 1/I/L).
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function birthdayCode(random: () => number = Math.random) {
  return `NIVER${Array.from({ length: 6 }, () => ALPHABET[Math.floor(random() * ALPHABET.length)]).join("")}`;
}

export type BirthdayConfig = { enabled: boolean; kind: "percent" | "fixed"; value: number; validDays: number; appliesTo: CouponScope };
export const BIRTHDAY_VALID_DAYS = [7, 15, 30, 60];

export const birthdayGift = (c: Pick<BirthdayConfig, "kind" | "value">) => (c.kind === "percent" ? `${c.value}% de desconto` : `${formatBRL(c.value)} de desconto`);

// Formulário do painel → configuração.
export function parseBirthdayForm(
  f: { enabled: boolean; kind: string; value: string; validDays: string; scope: string },
  parseMoney: (s: string) => number | null,
): { config: BirthdayConfig } | { error: string } {
  if (f.kind !== "percent" && f.kind !== "fixed") return { error: "Escolha o tipo de desconto." };
  const value = f.kind === "percent" ? Number(f.value.replace(",", ".")) : parseMoney(f.value);
  if (f.kind === "percent" && (!Number.isInteger(value) || value! < 1 || value! > 90)) return { error: "Percentual: um número inteiro de 1 a 90." };
  if (f.kind === "fixed" && (!value || value <= 0)) return { error: "Valor do desconto inválido. Use o formato 20,00." };
  const validDays = Number(f.validDays);
  if (!BIRTHDAY_VALID_DAYS.includes(validDays)) return { error: "Escolha a validade do cupom." };
  if (!isCouponScope(f.scope)) return { error: "Escolha onde o cupom vale." };
  return { config: { enabled: f.enabled, kind: f.kind, value: value!, validDays, appliesTo: f.scope } };
}
