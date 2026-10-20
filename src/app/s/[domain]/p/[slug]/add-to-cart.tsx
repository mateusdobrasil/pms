"use client";

import Link from "next/link";
import { useState } from "react";
import { addToCart, readCart } from "@/lib/cart";
import { formatBRL } from "@/lib/money";

type Variant = { id: string; name: string; priceCents: number; compareAtCents: number | null; stock: number };

export function AddToCart({ productName, variants }: { productName: string; variants: Variant[] }) {
  const single = variants.length === 1;
  const firstAvailable = variants.find((v) => v.stock > 0) ?? variants[0];
  const [selectedId, setSelectedId] = useState(single ? firstAvailable.id : null);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selected = variants.find((v) => v.id === selectedId) ?? null;
  const shown = selected ?? firstAvailable;
  const prices = new Set(variants.map((v) => v.priceCents));
  const soldOut = variants.every((v) => v.stock <= 0);

  function add() {
    if (!selected) {
      setMessage("Escolha uma opção.");
      return;
    }
    const inCart = readCart().find((i) => i.variantId === selected.id)?.quantity ?? 0;
    const qty = Math.min(quantity, selected.stock - inCart);
    if (qty <= 0) {
      setMessage(`Você já tem todas as unidades disponíveis (${selected.stock}) no carrinho.`);
      return;
    }
    addToCart(selected.id, qty);
    setMessage(qty < quantity ? `Adicionamos ${qty}, o máximo disponível.` : null);
    setAdded(true);
  }

  return (
    <div className="space-y-5">
      <p className="text-2xl">
        {!selected && prices.size > 1 && <span className="text-base text-neutral-500">a partir de </span>}
        <span className="font-semibold">{formatBRL(selected ? selected.priceCents : Math.min(...prices))}</span>
        {shown.compareAtCents && (selected || prices.size === 1) && (
          <span className="ml-3 text-lg text-neutral-400 line-through">{formatBRL(shown.compareAtCents)}</span>
        )}
      </p>

      {!single && (
        <fieldset className="space-y-2">
          <legend className="text-sm text-neutral-600">Opção</legend>
          <div className="flex flex-wrap gap-2">
            {variants.map((v) => (
              <button
                key={v.id}
                type="button"
                disabled={v.stock <= 0}
                onClick={() => {
                  setSelectedId(v.id);
                  setAdded(false);
                  setMessage(null);
                  setQuantity(1);
                }}
                className={`rounded-md border px-4 py-2 text-sm disabled:cursor-not-allowed disabled:text-neutral-400 disabled:line-through ${
                  v.id === selectedId ? "border-neutral-900 font-medium" : ""
                }`}
              >
                {v.name}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {soldOut ? (
        <p className="rounded-md bg-neutral-100 px-4 py-3 text-sm text-neutral-700">Produto esgotado no momento.</p>
      ) : (
        <div className="flex gap-3">
          <label className="sr-only" htmlFor="qty">Quantidade</label>
          <input
            id="qty"
            type="number"
            min={1}
            max={selected?.stock ?? undefined}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Math.floor(e.target.valueAsNumber || 1)))}
            className="w-20 rounded-md border px-3 py-3 text-sm"
          />
          <button
            type="button"
            onClick={add}
            className="flex-1 rounded-md px-4 py-3 font-medium text-white"
            style={{ background: "var(--brand)" }}
          >
            Adicionar ao carrinho
          </button>
        </div>
      )}

      {selected && selected.stock > 0 && selected.stock <= 5 && (
        <p className="text-sm text-amber-700">Últimas {selected.stock} unidades.</p>
      )}
      {message && <p className="text-sm text-red-700">{message}</p>}
      {added && (
        <p className="flex flex-wrap items-center gap-3 text-sm text-green-700">
          {productName} adicionado ao carrinho.
          <Link href="/carrinho" className="font-medium underline">Ver carrinho</Link>
          <Link href="/checkout" className="font-medium underline">Finalizar compra</Link>
        </p>
      )}
    </div>
  );
}
