import { describe, expect, it } from "vitest";
import { isEmail, isUuid, isValidCPF, onlyDigits } from "@/lib/validation";
import { parseInstagramHandle } from "@/lib/store-marketing";

describe("CPF", () => {
  it("aceita CPF válido, com ou sem máscara", () => {
    expect(isValidCPF("529.982.247-25")).toBe(true);
    expect(isValidCPF("52998224725")).toBe(true);
  });

  it("recusa dígito verificador errado, repetidos e tamanho errado", () => {
    expect(isValidCPF("529.982.247-24")).toBe(false);
    expect(isValidCPF("111.111.111-11")).toBe(false);
    expect(isValidCPF("1234567890")).toBe(false);
  });
});

describe("outros campos", () => {
  it("e-mail", () => {
    expect(isEmail("cliente@gmail.com")).toBe(true);
    expect(isEmail("cliente@gmail")).toBe(false);
    expect(isEmail("cliente gmail.com")).toBe(false);
  });

  it("uuid e dígitos", () => {
    expect(isUuid("d33591ca-0c90-4f18-a082-e2f5a638aedb")).toBe(true);
    expect(isUuid("d33591ca")).toBe(false);
    expect(onlyDigits("(11) 98888-7777")).toBe("11988887777");
  });
});

describe("Instagram da loja", () => {
  it.each([
    ["@minha.loja", "minha.loja"],
    ["minha.loja", "minha.loja"],
    ["https://www.instagram.com/minha.loja/", "minha.loja"],
    ["instagram.com/minha.loja?igsh=abc", "minha.loja"], // link colado sem https://
    ["www.instagram.com/minha.loja", "minha.loja"],
    ["https://instagram.com/loja_x?utm=1", "loja_x"],
  ])("%s → %s", (input, handle) => {
    expect(parseInstagramHandle(input)).toBe(handle);
  });

  it("recusa nomes inválidos", () => {
    expect(parseInstagramHandle("minha loja")).toBeNull();
    expect(parseInstagramHandle("@")).toBeNull();
  });
});
