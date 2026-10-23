import { describe, expect, it } from "vitest";
import { isStoreSubdomain, storeDomainError, storeSubdomain } from "@/lib/store-domains";

describe("subdomínios minhaloja.promo", () => {
  it("monta o endereço a partir do identificador", () => {
    expect(storeSubdomain("minha-loja")).toBe("minha-loja.minhaloja.promo");
    expect(isStoreSubdomain("minha-loja.minhaloja.promo")).toBe(true);
    expect(isStoreSubdomain("www.minhaloja.com.br")).toBe(false);
  });

  it("aceita subdomínio comum e domínio próprio", () => {
    expect(storeDomainError("minha-loja.minhaloja.promo")).toBeNull();
    expect(storeDomainError("pms.minhaloja.promo")).toBeNull();
    expect(storeDomainError("www.minhaloja.com.br")).toBeNull();
  });

  it("recusa o domínio raiz, nomes reservados e mais de um nível", () => {
    expect(storeDomainError("minhaloja.promo")).not.toBeNull();
    expect(storeDomainError("www.minhaloja.promo")).not.toBeNull();
    expect(storeDomainError("admin.minhaloja.promo")).not.toBeNull();
    expect(storeDomainError("painel.minhaloja.promo")).not.toBeNull();
    expect(storeDomainError("a.b.minhaloja.promo")).not.toBeNull();
  });

  it("não confunde domínio parecido com o da plataforma", () => {
    expect(storeDomainError("admin.outraminhaloja.promo")).toBeNull();
  });
});
