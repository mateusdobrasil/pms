// O Supabase devolve no máximo 1000 linhas por consulta: para ler tudo, busca em páginas.
// A consulta precisa de uma ordem estável (order por uma coluna única ou quase), senão páginas se repetem.
export const PAGE_SIZE = 1000;

export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  max = 50_000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < max; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

// Listas grandes em .in(...) estouram o tamanho da URL: divide em lotes (100 UUIDs ≈ 3,7 KB).
export function chunks<T>(list: T[], size = 100): T[][] {
  return Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));
}
