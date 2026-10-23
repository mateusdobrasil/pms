"use client";

import { useActionState, useEffect, useRef } from "react";
import { createCategory, deleteCategory, renameCategory, type CategoryState } from "./actions";
import { submitKeepingValues } from "@/lib/form-submit";

export function CreateCategoryForm() {
  const [state, action, pending] = useActionState<CategoryState, FormData>(createCategory, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} onSubmit={submitKeepingValues(action)} className="space-y-2">
      <div className="flex gap-2">
        <input name="name" required placeholder="Nova categoria" className="min-w-0 flex-1 rounded-md border bg-white px-3 py-2 text-sm" />
        <button type="submit" disabled={pending} className="rounded-md bg-primary-600 hover:bg-primary-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          Adicionar
        </button>
      </div>
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
    </form>
  );
}

// Excluir: só aparece em categoria vazia; o servidor confere de novo.
export function DeleteCategoryButton({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState<CategoryState, FormData>(deleteCategory, null);
  return (
    <form action={action} onSubmit={(e) => !confirm(`Excluir a categoria "${name}"?`) && e.preventDefault()} className="contents">
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} className="text-red-700 underline disabled:opacity-50">Excluir</button>
      {state?.error && <span className="w-full text-red-700">{state.error}</span>}
    </form>
  );
}

export function RenameCategoryForm({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState<CategoryState, FormData>(renameCategory, null);

  return (
    <form onSubmit={submitKeepingValues(action)} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input name="name" defaultValue={name} required className="min-w-0 flex-1 rounded-md border px-2 py-1" />
      <button type="submit" disabled={pending} className="rounded-md border px-2 py-1 disabled:opacity-50">Salvar</button>
      {state?.error && <span className="w-full text-red-700">{state.error}</span>}
      {state?.ok && <span className="text-green-700">✓</span>}
    </form>
  );
}
