"use client";

import { deleteProduct } from "./actions";

export function DeleteProductButton({ id }: { id: string }) {
  return (
    <form
      action={deleteProduct}
      onSubmit={(e) => {
        if (!confirm("Excluir este produto, suas variações e fotos? Pedidos antigos não são afetados.")) e.preventDefault();
      }}
      className="border-t pt-4"
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="text-sm text-red-700 underline">Excluir produto</button>
      <span className="ml-3 text-xs text-neutral-500">Para tirar da loja sem apagar, desmarque “Visível na loja”.</span>
    </form>
  );
}
