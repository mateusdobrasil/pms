import { describe, expect, it } from "vitest";
import { searchTerms } from "@/lib/search";

describe("searchTerms", () => {
  it("tira acentos e maiúsculas", () => {
    expect(searchTerms("Açaí")).toEqual(["acai"]);
    expect(searchTerms("POMÁDA Modeladora")).toEqual(["pomada", "modeladora"]);
    expect(searchTerms("ção")).toEqual(["cao"]);
  });

  it("separa palavras e ignora espaços e curingas", () => {
    expect(searchTerms("  camiseta   preta ")).toEqual(["camiseta", "preta"]);
    expect(searchTerms("50% off_")).toEqual(["50", "off"]);
    expect(searchTerms("")).toEqual([]);
  });

  it("limita a 5 palavras", () => {
    expect(searchTerms("a b c d e f g")).toHaveLength(5);
  });
});
