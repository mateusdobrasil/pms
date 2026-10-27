import { describe, expect, it } from "vitest";
import { campaignHoursOpen, campaignLink, campaignRemaining, cleanCampaignText, nextCampaignAt } from "@/lib/whatsapp-campaigns";
import { WA_AUTO_EVENTS, WA_FIELDS, previewText } from "@/lib/whatsapp-events";

describe("campanhas no WhatsApp", () => {
  it("texto: uma linha, com pontuação no fim, de 5 a 300 caracteres", () => {
    expect(cleanCampaignText("  Coleção nova\n com 20% de desconto  ")).toBe("Coleção nova com 20% de desconto.");
    expect(cleanCampaignText("Promoção!")).toBe("Promoção!");
    expect(cleanCampaignText("oi")).toBeNull();
    expect(cleanCampaignText("x".repeat(301))).toBeNull();
  });

  it("link: caminho da loja com o cupom; endereço de fora vira a página inicial", () => {
    expect(campaignLink("https://loja.com.br", "/agendar", "VERAO20")).toBe("https://loja.com.br/agendar?cupom=VERAO20");
    expect(campaignLink("https://loja.com.br", "/", null)).toBe("https://loja.com.br/");
    expect(campaignLink("https://loja.com.br", "//evil.com", null)).toBe("https://loja.com.br/");
    expect(campaignLink("https://loja.com.br", "https://evil.com", null)).toBe("https://loja.com.br/");
  });

  it("cota: enviadas e na fila contam", () => {
    expect(campaignRemaining(500, 120, 30)).toBe(350);
    expect(campaignRemaining(100, 100, 5)).toBe(0);
  });

  it("uma campanha por dia", () => {
    const now = new Date("2026-11-10T15:00:00Z");
    expect(nextCampaignAt(null, now)).toBeNull();
    expect(nextCampaignAt("2026-11-09T14:00:00Z", now)).toBeNull();
    expect(nextCampaignAt("2026-11-10T10:00:00Z", now)?.toISOString()).toBe("2026-11-11T10:00:00.000Z");
  });

  it("horário comercial de Brasília (9h às 21h)", () => {
    expect(campaignHoursOpen(new Date("2026-11-10T12:00:00Z"))).toBe(true); // 9h
    expect(campaignHoursOpen(new Date("2026-11-10T11:59:00Z"))).toBe(false); // 8h59
    expect(campaignHoursOpen(new Date("2026-11-10T23:59:00Z"))).toBe(true); // 20h59
    expect(campaignHoursOpen(new Date("2026-11-11T00:00:00Z"))).toBe(false); // 21h
  });

  it("a campanha não entra na escolha de eventos automáticos da loja", () => {
    expect(WA_AUTO_EVENTS).not.toContain("campaign");
    expect(WA_AUTO_EVENTS).toContain("order_paid");
  });

  it("prévia com os dados da campanha (o que não foi informado usa o exemplo)", () => {
    expect(previewText("Olá, {{1}}! {{2}} {{3}}", ["first_name", "campaign_text", "store_name"], { campaign_text: "Tudo 10% off." })).toBe(
      `Olá, Ana! Tudo 10% off. ${WA_FIELDS.store_name.sample}`,
    );
  });
});
