import { describe, expect, it } from "vitest";
import { PAGE_SIZE, chunks, fetchAll } from "@/lib/supabase/fetch-all";

describe("leitura em páginas", () => {
  it("junta as páginas até a última vir incompleta", async () => {
    const all = Array.from({ length: 2 * PAGE_SIZE + 5 }, (_, i) => i);
    const calls: [number, number][] = [];
    const rows = await fetchAll<number>(async (from, to) => {
      calls.push([from, to]);
      return { data: all.slice(from, to + 1), error: null };
    });
    expect(rows).toHaveLength(all.length);
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("página exata de 1000 busca mais uma (vazia) e para", async () => {
    let n = 0;
    const rows = await fetchAll<number>(async (from) => {
      n++;
      return { data: from === 0 ? Array(PAGE_SIZE).fill(1) : [], error: null };
    });
    expect(rows).toHaveLength(PAGE_SIZE);
    expect(n).toBe(2);
  });

  it("erro na consulta não vira lista vazia", async () => {
    await expect(fetchAll(async () => ({ data: null, error: { message: "falhou" } }))).rejects.toThrow("falhou");
  });

  it("lotes de ids", () => {
    expect(chunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunks([], 2)).toEqual([]);
  });
});
