// Avaliações: regras puras (testadas em tests/reviews.test.ts).

export const REVIEW_COMMENT_MAX = 1000;

// "ana maria souza" → "Ana S." (nunca o nome completo, e-mail ou telefone na página pública).
export function authorName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Cliente";
  const cap = (s: string) => s.charAt(0).toLocaleUpperCase("pt-BR") + s.slice(1).toLocaleLowerCase("pt-BR");
  const last = parts.length > 1 ? ` ${parts[parts.length - 1].charAt(0).toLocaleUpperCase("pt-BR")}.` : "";
  return `${cap(parts[0])}${last}`;
}

// Nota de 1 a 5 e comentário opcional (sem excesso de linhas em branco).
export function parseReview(input: { rating: unknown; comment: unknown }): { rating: number; comment: string | null } | { error: string } {
  const rating = Number(input.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: "Escolha de 1 a 5 estrelas." };
  const comment = typeof input.comment === "string" ? input.comment.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim() : "";
  if (comment.length > REVIEW_COMMENT_MAX) return { error: `O comentário pode ter até ${REVIEW_COMMENT_MAX} caracteres.` };
  return { rating, comment: comment || null };
}

export type RatingSummary = { count: number; average: number; byStars: Record<1 | 2 | 3 | 4 | 5, number> };

export function ratingSummary(ratings: number[]): RatingSummary {
  const byStars = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as RatingSummary["byStars"];
  for (const r of ratings) if (r >= 1 && r <= 5) byStars[r as 1] += 1;
  const count = ratings.length;
  return { count, average: count ? Math.round((ratings.reduce((s, r) => s + r, 0) / count) * 10) / 10 : 0, byStars };
}

// 4.8 → "4,8"
export const formatRating = (avg: number) => avg.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const starsText = (n: number) => "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n));

const DAY = 86_400_000;
export const REVIEW_LOOKBACK_DAYS = 30; // não pede avaliação de compra ou atendimento mais antigo que isso

// Pedido pronto para pedir avaliação: entregue há 2 dias (pela data do pagamento) ou enviado há 10 dias (o lojista
// pode não marcar "entregue"), pago nos últimos 30 dias.
export function orderReviewDue(o: { status: string; paid_at: string | null; notified_shipped_at: string | null }, now: Date) {
  if (!o.paid_at || now.getTime() - Date.parse(o.paid_at) > REVIEW_LOOKBACK_DAYS * DAY) return false;
  if (o.status === "delivered") return now.getTime() - Date.parse(o.paid_at) >= 2 * DAY;
  if (o.status === "shipped") return !!o.notified_shipped_at && now.getTime() - Date.parse(o.notified_shipped_at) >= 10 * DAY;
  return false;
}

// Atendimento: marcado "Atendido", terminado há pelo menos 2 h e no máximo 30 dias.
export function bookingReviewDue(b: { status: string; ends_at: string }, now: Date) {
  const since = now.getTime() - Date.parse(b.ends_at);
  return b.status === "completed" && since >= 2 * 3_600_000 && since <= REVIEW_LOOKBACK_DAYS * DAY;
}

// Pode avaliar (pelo link): pedido vendido ou atendimento feito.
export const orderReviewable = (status: string) => ["paid", "preparing", "shipped", "delivered"].includes(status);
export const bookingReviewable = (status: string) => status === "completed";
