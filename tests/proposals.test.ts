import { describe, expect, it } from "vitest";
import { proposalItems, proposalStatus, proposalWhatsappText } from "@/lib/proposals";

const base = { sent_at: null, viewed_at: null, accepted_at: null, valid_until: "2026-11-06" };

describe("proposalStatus", () => {
  it("segue o caminho rascunho → enviada → vista → aceita", () => {
    expect(proposalStatus(base, "2026-10-22")).toBe("rascunho");
    expect(proposalStatus({ ...base, sent_at: "x" }, "2026-10-22")).toBe("enviada");
    expect(proposalStatus({ ...base, sent_at: "x", viewed_at: "y" }, "2026-10-22")).toBe("vista");
    expect(proposalStatus({ ...base, viewed_at: "y", accepted_at: "z" }, "2026-12-01")).toBe("aceita");
  });

  it("vence depois da validade (o último dia ainda vale)", () => {
    expect(proposalStatus({ ...base, sent_at: "x" }, "2026-11-06")).toBe("enviada");
    expect(proposalStatus({ ...base, sent_at: "x" }, "2026-11-07")).toBe("vencida");
  });
});

describe("textos", () => {
  it("um item por linha, sem marcadores nem linhas vazias", () => {
    expect(proposalItems("- Loja\n\n• Pix e cartão\n  * Frete  \n")).toEqual(["Loja", "Pix e cartão", "Frete"]);
  });

  it("mensagem do WhatsApp usa o primeiro nome", () => {
    expect(proposalWhatsappText({ client_name: "Maria da Silva", business_name: "Kadosh" }, "https://x/p")).toBe(
      "Olá, Maria! Aqui é da PMS app. Segue a proposta da loja virtual para a Kadosh: https://x/p",
    );
  });
});
