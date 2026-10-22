"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { SORTS, type Sort } from "./sort-options";

// Troca a ordem da lista mantendo os outros parâmetros (ex.: o termo da busca).
// Usa o caminho do navegador (o proxy reescreve /c/x para /s/<domínio>/c/x por dentro).
export function SortSelect({ value }: { value: Sort }) {
  const router = useRouter();
  const params = useSearchParams();

  return (
    <label className="flex items-center gap-2 text-sm text-neutral-600">
      Ordenar por
      <select
        value={value}
        onChange={(e) => {
          const next = new URLSearchParams(params);
          if (e.target.value === "destaques") next.delete("ordem");
          else next.set("ordem", e.target.value);
          const qs = next.toString();
          const path = window.location.pathname;
          router.push(qs ? `${path}?${qs}` : path, { scroll: false });
        }}
        className="rounded-lg border bg-white px-3 py-2 text-sm text-neutral-900"
      >
        {SORTS.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
    </label>
  );
}
