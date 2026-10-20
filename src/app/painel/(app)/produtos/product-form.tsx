"use client";

import { useActionState, useState } from "react";
import { slugify } from "@/lib/slug";
import { createProduct, updateProduct, type FormState } from "./actions";

type Product = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category_id: string | null;
  active: boolean;
  featured: boolean;
};

const inputClass = "w-full rounded-md border bg-white px-3 py-2 text-sm";

export function ProductForm({
  product,
  categories,
}: {
  product?: Product;
  categories: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(product ? updateProduct : createProduct, null);
  const [name, setName] = useState(product?.name ?? "");
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!product);

  return (
    <form action={action} className="space-y-4 rounded-md border bg-white p-4">
      {product && <input type="hidden" name="id" value={product.id} />}

      <label className="block space-y-1 text-sm">
        <span className="text-neutral-600">Nome</span>
        <input
          name="name"
          required
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
          className={inputClass}
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="text-neutral-600">Endereço na loja</span>
        <div className="flex items-center gap-1">
          <span className="text-neutral-500">/p/</span>
          <input
            name="slug"
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
            onBlur={() => setSlug(slugify(slug || name))}
            className={inputClass}
          />
        </div>
        {product && slug !== product.slug && (
          <span className="text-xs text-amber-700">Mudar o endereço quebra links já divulgados deste produto.</span>
        )}
      </label>

      <label className="block space-y-1 text-sm">
        <span className="text-neutral-600">Descrição</span>
        <textarea name="description" rows={5} defaultValue={product?.description ?? ""} className={inputClass} />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="text-neutral-600">Categoria</span>
        <select name="categoryId" defaultValue={product?.category_id ?? ""} className={inputClass}>
          <option value="">Sem categoria</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </label>

      {!product && (
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1 text-sm">
            <span className="text-neutral-600">Preço (R$)</span>
            <input name="price" required inputMode="decimal" placeholder="79,90" className={inputClass} />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-neutral-600">Estoque</span>
            <input name="stock" type="number" min={0} step={1} defaultValue={0} required className={inputClass} />
          </label>
          <p className="col-span-2 text-xs text-neutral-500">
            Tamanhos, cores e outras variações você adiciona depois de salvar.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-6 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="active" defaultChecked={product?.active ?? true} />
          Visível na loja
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="featured" defaultChecked={product?.featured ?? false} />
          Destaque na página inicial
        </label>
      </div>

      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      {state?.ok && <p className="text-sm text-green-700">{state.ok}</p>}

      <button type="submit" disabled={pending} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {pending ? "Salvando…" : product ? "Salvar produto" : "Criar produto"}
      </button>
    </form>
  );
}
