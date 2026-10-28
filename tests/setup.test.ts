import { describe, expect, it } from "vitest";
import { type SetupState, setupProgress, setupSteps } from "@/lib/setup";

const empty: SetupState = {
  hasLogo: false,
  hasEmail: false,
  hasWhatsapp: false,
  hasLegal: false,
  products: 0,
  bookingEnabled: false,
  services: 0,
  bookableProfessionals: 0,
  hasOriginZip: false,
  hasShippingOption: false,
  paymentConfigured: false,
  paymentLive: false,
  testSale: false,
  pushDevices: 0,
  hasInstagramOrBio: false,
};
const keys = (s: SetupState) => setupSteps(s).map((x) => x.key);
const step = (s: SetupState, key: string) => setupSteps(s).find((x) => x.key === key)!;

describe("primeiros passos da loja", () => {
  it("loja nova: nada feito, entrega só aparece quando há produto", () => {
    expect(keys(empty)).toEqual(["marca", "contato", "empresa", "catalogo", "pagamento", "teste", "celular", "divulgar"]);
    expect(keys({ ...empty, products: 3 })).toContain("entrega");
    expect(setupProgress(setupSteps(empty))).toEqual({ done: 0, total: 8, requiredLeft: 6, ready: false });
  });

  it("o que você vende: produto, ou agenda completa (ligada, serviço e profissional com horário)", () => {
    expect(step({ ...empty, products: 1 }, "catalogo").done).toBe(true);
    expect(step({ ...empty, bookingEnabled: true, services: 2 }, "catalogo").done).toBe(false);
    expect(step({ ...empty, bookingEnabled: true, services: 2, bookableProfessionals: 1 }, "catalogo").done).toBe(true);
    expect(step({ ...empty, bookingEnabled: true }, "catalogo").href).toBe("/painel/agenda");
  });

  it("contato precisa de e-mail e WhatsApp; entrega precisa de CEP e uma opção", () => {
    expect(step({ ...empty, hasEmail: true }, "contato").done).toBe(false);
    expect(step({ ...empty, hasEmail: true, hasWhatsapp: true }, "contato").done).toBe(true);
    expect(step({ ...empty, products: 1, hasOriginZip: true }, "entrega").done).toBe(false);
    expect(step({ ...empty, products: 1, hasOriginZip: true, hasShippingOption: true }, "entrega").done).toBe(true);
  });

  it("pagamento: o texto muda entre sem conta, teste e produção", () => {
    expect(step(empty, "pagamento").hint).toMatch(/conecta a sua conta/);
    expect(step({ ...empty, paymentConfigured: true }, "pagamento").hint).toMatch(/modo de teste/);
    expect(step({ ...empty, paymentConfigured: true, paymentLive: true }, "pagamento").label).toBe("Pagamento ativado");
  });

  it("pronta quando todos os essenciais estão feitos (os opcionais não seguram)", () => {
    const full: SetupState = { ...empty, hasLogo: true, hasEmail: true, hasWhatsapp: true, hasLegal: true, products: 1, hasOriginZip: true, hasShippingOption: true, paymentConfigured: true, testSale: true };
    expect(setupProgress(setupSteps(full))).toEqual({ done: 7, total: 9, requiredLeft: 0, ready: true });
  });
});
