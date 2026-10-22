import { describe, expect, it } from "vitest";
import { thumbPath } from "@/lib/images";

describe("thumbPath", () => {
  it("troca a extensão por -thumb.jpg, na mesma pasta", () => {
    expect(thumbPath("loja/produto/abc.webp")).toBe("loja/produto/abc-thumb.jpg");
    expect(thumbPath("loja/produto/abc.jpg")).toBe("loja/produto/abc-thumb.jpg");
  });

  it("não mexe em pontos das pastas", () => {
    expect(thumbPath("loja.v2/produto/abc")).toBe("loja.v2/produto/abc-thumb.jpg");
  });
});
