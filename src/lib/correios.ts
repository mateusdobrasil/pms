// Rastreio dos Correios: regras puras (testadas em tests/correios.test.ts).
// API: GET /srorastro/v1/objetos?codigosObjetos=...&resultado=T (até 50 códigos), com o token do contrato da loja.

export const TRACK_BATCH = 50; // códigos por consulta (limite da API)
export const RECHECK_HOURS = 3; // o mesmo pedido é consultado no máximo a cada 3 h

// Código de objeto dos Correios: 2 letras, 9 dígitos, 2 letras (ex.: AA123456789BR).
export const normalizeTrackingCode = (code: string | null | undefined) => (code ?? "").replace(/\s/g, "").toUpperCase();
export const isCorreiosCode = (code: string | null | undefined) => /^[A-Z]{2}\d{9}[A-Z]{2}$/.test(normalizeTrackingCode(code));

export const correiosTrackingUrl = (code: string) => `https://rastreamento.correios.com.br/app/index.php?objetos=${encodeURIComponent(normalizeTrackingCode(code))}`;

export type TrackingEvent = { code: string; type: string; at: string; description: string; detail: string | null; place: string | null };

type RawUnit = { nome?: string; endereco?: { cidade?: string; uf?: string } } | null | undefined;
type RawEvent = { codigo?: string; tipo?: string; dtHrCriado?: string; descricao?: string; detalhe?: string; unidade?: RawUnit; unidadeDestino?: RawUnit };
type RawObject = { codObjeto?: string; mensagem?: string; eventos?: RawEvent[] };

const place = (u: RawUnit) => {
  const city = u?.endereco?.cidade?.trim();
  const uf = u?.endereco?.uf?.trim();
  return city ? `${city}${uf ? `/${uf}` : ""}` : (u?.nome?.trim() || null);
};

// "2026-10-27T14:03:12" vem sem fuso: é horário de Brasília.
const toIso = (s: string | undefined) => {
  if (!s) return "";
  const withZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s}-03:00`;
  const ms = Date.parse(withZone);
  return Number.isNaN(ms) ? "" : new Date(ms).toISOString();
};

// Resposta da API → eventos de cada código (mais novo primeiro). Código sem eventos (ainda não postado ou
// inexistente) fica de fora.
export function parseTracking(body: unknown): Map<string, TrackingEvent[]> {
  const out = new Map<string, TrackingEvent[]>();
  const objects = ((body as { objetos?: RawObject[] } | null)?.objetos ?? []) as RawObject[];
  for (const o of objects) {
    const code = normalizeTrackingCode(o.codObjeto);
    if (!code || !o.eventos?.length) continue;
    const events = o.eventos
      .map((e) => {
        const to = place(e.unidadeDestino);
        return {
          code: String(e.codigo ?? "").toUpperCase(),
          type: String(e.tipo ?? "").padStart(2, "0"),
          at: toIso(e.dtHrCriado),
          description: String(e.descricao ?? "").trim(),
          detail: e.detalhe?.trim() || (to ? `para ${to}` : null),
          place: place(e.unidade),
        };
      })
      .filter((e) => e.at && e.description)
      .sort((a, b) => b.at.localeCompare(a.at));
    if (events.length) out.set(code, events);
  }
  return out;
}

// Entregue: eventos BDE, BDI ou BDR com tipo 01 (o objeto não muda mais depois disso).
export const deliveredEvent = (events: TrackingEvent[]) => events.find((e) => ["BDE", "BDI", "BDR"].includes(e.code) && e.type === "01") ?? null;

// Precisa consultar de novo? Nunca consultado, ou consultado há mais de 3 h.
export function trackingDue(checkedAt: string | null, now: number) {
  return !checkedAt || now - Date.parse(checkedAt) >= RECHECK_HOURS * 3_600_000;
}

// Token do contrato ainda serve? Renova 30 min antes de vencer (recomendação dos Correios).
export const tokenValid = (expiresAt: string | null, now: number) => !!expiresAt && Date.parse(expiresAt) - now > 30 * 60_000;
