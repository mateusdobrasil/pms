"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { saveVariants, updateProduct, type VariantRow } from "./actions";
import { ProductFields, type ProductData } from "./product-form";
import { VariantsEditor, toDraft, type Draft } from "./variants-editor";

type Status = { error?: string; ok?: string } | null;

// Página de edição do produto: dados + variações salvos juntos por um botão fixo no rodapé.
// Fotos e vídeos (media) se salvam sozinhos no envio.
export function ProductEditor({
  product,
  categories,
  variants,
  media,
  footer,
}: {
  product: ProductData;
  categories: { id: string; name: string }[];
  variants: VariantRow[];
  media: ReactNode;
  footer: ReactNode;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [rows, setRowsState] = useState<Draft[]>(() => variants.map(toDraft));
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [pending, startTransition] = useTransition();

  const changed = () => {
    setDirty(true);
    setStatus(null);
  };
  const setRows = (update: (rows: Draft[]) => Draft[]) => {
    setRowsState(update);
    changed();
  };

  // Avisa antes de sair da página com alterações não salvas.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function save() {
    const form = formRef.current;
    if (!form || !form.reportValidity()) return;
    const data = new FormData(form);
    setStatus(null);
    startTransition(async () => {
      const saved = await updateProduct(null, data);
      if (saved?.error) return setStatus({ error: saved.error });
      const result = await saveVariants(product.id, rows); // "key" é só da tela e o servidor ignora
      // O servidor devolve as variações gravadas (ids novos e estoque atual), mesmo com aviso de estoque.
      if (result?.variants) setRowsState(result.variants.map(toDraft));
      if (result?.error) return setStatus({ error: result.error });
      setDirty(false);
      setStatus({ ok: "Alterações salvas." });
      router.refresh();
    });
  }

  return (
    <>
      <form
        ref={formRef}
        onChange={changed}
        onSubmit={(e) => {
          e.preventDefault(); // Enter num campo também salva tudo
          save();
        }}
        className="space-y-4 rounded-xl border bg-white shadow-sm p-4"
      >
        <ProductFields product={product} categories={categories} />
      </form>

      {media}

      <VariantsEditor rows={rows} setRows={setRows} />

      {footer}

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t bg-white/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <p className="text-sm" aria-live="polite">
          {status?.error ? (
            <span className="text-red-700">{status.error}</span>
          ) : status?.ok ? (
            <span className="text-green-700">{status.ok}</span>
          ) : dirty ? (
            <span className="font-medium text-amber-700">Alterações não salvas</span>
          ) : (
            <span className="text-neutral-500">Fotos e vídeos são salvos assim que você envia.</span>
          )}
        </p>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-md bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50"
        >
          {pending ? "Salvando…" : "Salvar alterações"}
        </button>
      </div>
    </>
  );
}
