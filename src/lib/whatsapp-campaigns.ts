// Campanhas no WhatsApp: regras puras (testadas em tests/whatsapp-campaigns.test.ts).

export const CAMPAIGN_TEXT_MAX = 300;
export const CAMPAIGN_MIN_HOURS = 24; // no máximo uma campanha por dia (protege a qualidade do número)

// Texto do lojista: uma linha (a Meta recusa quebra de linha no parâmetro), terminando com pontuação.
export function cleanCampaignText(raw: string) {
  const t = raw.replace(/\s+/g, " ").trim();
  if (t.length < 5 || t.length > CAMPAIGN_TEXT_MAX) return null;
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}

// Link da campanha: um caminho da loja ("/", "/agendar", "/c/promocoes"...) com o cupom, se houver.
export function campaignLink(base: string, path: string, couponCode: string | null) {
  const p = path.startsWith("/") && !path.startsWith("//") ? path : "/";
  const url = new URL(p, base);
  if (couponCode) url.searchParams.set("cupom", couponCode);
  return url.toString();
}

// Cota do mês: o que já saiu (enviadas) e o que está na fila contam.
export function campaignRemaining(quota: number, sentThisMonth: number, queued: number) {
  return Math.max(0, quota - sentThisMonth - queued);
}

// Propaganda só em horário comercial (9h às 21h de Brasília); fora disso a fila espera.
export function campaignHoursOpen(now: Date) {
  const hour = Number(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hourCycle: "h23" }));
  return hour >= 9 && hour < 21;
}

// Pode mandar outra? null = pode; senão, a partir de quando.
export function nextCampaignAt(lastCreatedAt: string | null, now: Date) {
  if (!lastCreatedAt) return null;
  const next = new Date(new Date(lastCreatedAt).getTime() + CAMPAIGN_MIN_HOURS * 3600_000);
  return next > now ? next : null;
}
