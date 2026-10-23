import { describe, expect, it } from "vitest";
import { isValidCNPJ, isValidDocument } from "@/lib/validation";
import { formatDocument } from "@/lib/format";

describe("CNPJ e documento da loja", () => {
  it("aceita CNPJ válido, com ou sem máscara", () => {
    expect(isValidCNPJ("11.222.333/0001-81")).toBe(true);
    expect(isValidCNPJ("11444777000161")).toBe(true);
  });

  it("recusa dígito errado, repetidos e tamanho errado", () => {
    expect(isValidCNPJ("11.222.333/0001-82")).toBe(false);
    expect(isValidCNPJ("00.000.000/0000-00")).toBe(false);
    expect(isValidCNPJ("1122233300018")).toBe(false);
  });

  it("documento aceita CPF ou CNPJ", () => {
    expect(isValidDocument("529.982.247-25")).toBe(true);
    expect(isValidDocument("11.222.333/0001-81")).toBe(true);
    expect(isValidDocument("123")).toBe(false);
  });

  it("formata CPF e CNPJ", () => {
    expect(formatDocument("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatDocument("52998224725")).toBe("529.982.247-25");
  });
});

import { customPolicySections, policyToText, privacyPolicyTemplate, returnsPolicyTemplate, type PolicyStore } from "@/lib/policies";

describe("políticas da loja", () => {
  const store: PolicyStore = { name: "Loja X", email: "contato@lojax.com.br", whatsapp: "5511988887777", legalName: "Loja X Ltda", document: "11222333000181", address: "Rua A, 10, São Paulo/SP", about: null, hasAnalytics: false };

  it("modelo usa os dados da loja", () => {
    const text = policyToText(returnsPolicyTemplate(store));
    expect(text).toContain("7 dias");
    expect(text).toContain("CNPJ 11.222.333/0001-81");
    expect(text).toContain("contato@lojax.com.br");
    expect(text).toContain("(11) 98888-7777");
  });

  it("privacidade fala de Pixel/Analytics só quando a loja usa", () => {
    expect(policyToText(privacyPolicyTemplate(store))).toContain("Não usamos cookies de medição");
    expect(policyToText(privacyPolicyTemplate({ ...store, hasAnalytics: true }))).toContain("Pixel da Meta");
  });

  it("Quem somos: texto do lojista ou só o nome, sem repetir o nome da loja", () => {
    const bare = { ...store, legalName: null, document: null, address: null };
    const quem = (s: PolicyStore) => returnsPolicyTemplate(s).find((x) => x.title === "Quem somos")!.paragraphs;
    expect(quem(bare)).toEqual(["Loja X."]);
    expect(quem({ ...bare, legalName: "Loja X" })).toEqual(["Loja X."]);
    expect(quem({ ...bare, about: "Somos uma loja de família.\n\nDesde 2015." })).toEqual(["Somos uma loja de família.", "Desde 2015."]);
    expect(quem(store)).toEqual(["Loja X · Loja X Ltda · CNPJ 11.222.333/0001-81 · endereço: Rua A, 10, São Paulo/SP."]);
    expect(quem({ ...bare, about: "Loja de família" })).toEqual(["Loja de família."]);
    expect(quem({ ...store, about: "Loja de família." })).toEqual(["Loja de família.", "Loja X Ltda · CNPJ 11.222.333/0001-81 · endereço: Rua A, 10, São Paulo/SP."]);
    expect(policyToText(privacyPolicyTemplate(bare))).toContain("Esta é a loja virtual Loja X. Somos");
  });

  it("o texto editado volta com os mesmos títulos e parágrafos", () => {
    const sections = returnsPolicyTemplate(store);
    expect(customPolicySections(policyToText(sections))).toEqual(sections);
  });

  it("texto livre sem títulos vira parágrafos", () => {
    expect(customPolicySections("Aceitamos trocas em 30 dias.\n\nFale conosco.")).toEqual([
      { title: "", paragraphs: ["Aceitamos trocas em 30 dias.", "Fale conosco."] },
    ]);
    // Linha curta sem pontuação final vira título.
    expect(customPolicySections("Prazo\n\nAté 30 dias.")).toEqual([{ title: "Prazo", paragraphs: ["Até 30 dias."] }]);
  });
});
