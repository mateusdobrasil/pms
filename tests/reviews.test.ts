import { describe, expect, it } from "vitest";
import { authorName, bookingReviewDue, formatRating, orderReviewDue, parseReview, ratingSummary, starsText } from "@/lib/reviews";
import { WA_AUTO_EVENTS, WA_EVENTS } from "@/lib/whatsapp-events";

const now = new Date("2026-11-20T15:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();

describe("avaliações", () => {
  it("nome na loja: primeiro nome e inicial do sobrenome", () => {
    expect(authorName("ana maria souza")).toBe("Ana S.");
    expect(authorName("  BIA  ")).toBe("Bia");
    expect(authorName("")).toBe("Cliente");
  });

  it("nota de 1 a 5 e comentário opcional", () => {
    expect(parseReview({ rating: 5, comment: "  Ótimo!\n\n\n\nVoltarei.  " })).toEqual({ rating: 5, comment: "Ótimo!\n\nVoltarei." });
    expect(parseReview({ rating: "4", comment: "" })).toEqual({ rating: 4, comment: null });
    expect(parseReview({ rating: 0, comment: "" })).toEqual({ error: "Escolha de 1 a 5 estrelas." });
    expect(parseReview({ rating: 6, comment: "" })).toMatchObject({ error: expect.any(String) });
    expect(parseReview({ rating: 3, comment: "x".repeat(1001) })).toMatchObject({ error: expect.stringMatching(/1000/) });
  });

  it("média com uma casa e contagem por estrela", () => {
    const s = ratingSummary([5, 5, 4, 3, 5]);
    expect(s).toEqual({ count: 5, average: 4.4, byStars: { 1: 0, 2: 0, 3: 1, 4: 1, 5: 3 } });
    expect(formatRating(4.4)).toBe("4,4");
    expect(ratingSummary([]).average).toBe(0);
    expect(starsText(4.4)).toBe("★★★★☆");
  });

  it("quando pedir a avaliação de um pedido", () => {
    expect(orderReviewDue({ status: "delivered", paid_at: daysAgo(3), notified_shipped_at: null }, now)).toBe(true);
    expect(orderReviewDue({ status: "delivered", paid_at: daysAgo(1), notified_shipped_at: null }, now)).toBe(false); // cedo
    expect(orderReviewDue({ status: "shipped", paid_at: daysAgo(12), notified_shipped_at: daysAgo(11) }, now)).toBe(true);
    expect(orderReviewDue({ status: "shipped", paid_at: daysAgo(6), notified_shipped_at: daysAgo(5) }, now)).toBe(false); // ainda a caminho
    expect(orderReviewDue({ status: "delivered", paid_at: daysAgo(45), notified_shipped_at: null }, now)).toBe(false); // antigo demais
    expect(orderReviewDue({ status: "paid", paid_at: daysAgo(5), notified_shipped_at: null }, now)).toBe(false);
  });

  it("quando pedir a avaliação de um atendimento", () => {
    expect(bookingReviewDue({ status: "completed", ends_at: hoursAgo(3) }, now)).toBe(true);
    expect(bookingReviewDue({ status: "completed", ends_at: hoursAgo(1) }, now)).toBe(false);
    expect(bookingReviewDue({ status: "confirmed", ends_at: hoursAgo(5) }, now)).toBe(false);
    expect(bookingReviewDue({ status: "completed", ends_at: daysAgo(40) }, now)).toBe(false);
  });

  it("o pedido de avaliação é um aviso automático do cliente (a loja pode desligar)", () => {
    expect(WA_EVENTS.review_request.audience).toBe("customer");
    expect(WA_AUTO_EVENTS).toContain("review_request");
  });
});
