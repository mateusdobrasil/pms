import { onlyDigits } from "@/lib/validation";

const TZ = "America/Sao_Paulo";

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: TZ, dateStyle: "short", timeStyle: "short" });
}

export function formatCPF(value: string) {
  return onlyDigits(value).replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
}

// CPF (11 dígitos) ou CNPJ (14 dígitos) com máscara.
export function formatDocument(value: string) {
  const d = onlyDigits(value);
  return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : formatCPF(d);
}

export function formatPhone(value: string) {
  return onlyDigits(value).replace(/^(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3");
}

// Início do dia e do mês no horário de Brasília (sem horário de verão desde 2019).
export function saoPauloBoundaries(now = new Date()) {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now); // AAAA-MM-DD
  return {
    startOfDay: new Date(`${ymd}T00:00:00-03:00`),
    startOfMonth: new Date(`${ymd.slice(0, 7)}-01T00:00:00-03:00`),
  };
}
