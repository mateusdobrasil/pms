import { describe, expect, it } from "vitest";
import { centsToInput, formatBRL, parseBRL } from "@/lib/money";

describe("parseBRL (texto do lojista → centavos)", () => {
  it.each([
    ["79,90", 7990],
    ["79,9", 7990],
    ["79", 7900],
    ["R$ 10", 1000],
    ["1.234,56", 123456],
    ["0,05", 5],
  ])("%s → %i", (input, cents) => {
    expect(parseBRL(input)).toBe(cents);
  });

  it.each(["", "abc", "10,999", "-5", "1,2,3"])("recusa %j", (input) => {
    expect(parseBRL(input)).toBeNull();
  });
});

describe("formatação", () => {
  it("formatBRL usa vírgula e R$", () => {
    expect(formatBRL(7990).replace(/\s/g, " ")).toBe("R$ 79,90");
  });

  it("centsToInput volta para o formato do formulário", () => {
    expect(centsToInput(7990)).toBe("79,90");
    expect(centsToInput(null)).toBe("");
    expect(parseBRL(centsToInput(123456))).toBe(123456);
  });
});
