"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { readCart, writeCart, type CartItem } from "@/lib/cart";
import { formatBRL } from "@/lib/money";
import { productImageUrl } from "@/lib/images";

type Line = {
  variantId: string;
  productName: string;
  variantName: string;
  productSlug: string;
  imagePath: string | null;
  unitPriceCents: number;
  quantity: number;
  totalCents: number;
  stock: number;
};
type Quote = { lines: Line[]; subtotalCents: number; problems: string[] };

async function fetchQuote(items: CartItem[]): Promise<Quote> {
  const res = await fetch("/api/cart/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  return res.json();
}

export function CartView() {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [removedUnavailable, setRemovedUnavailable] = useState(false);
  const [failed, setFailed] = useState(false);

  // Preços e disponibilidade sempre do servidor; o carrinho local só guarda variante e quantidade.
  const refresh = useCallback(
    (items: CartItem[]) =>
      fetchQuote(items).then(
        (q) => {
          // Tira do carrinho o que não existe mais (produto removido ou desativado).
          const valid = new Set(q.lines.map((l) => l.variantId));
          if (items.some((i) => !valid.has(i.variantId))) {
            writeCart(items.filter((i) => valid.has(i.variantId)));
            setRemovedUnavailable(true);
          }
          setQuote(q);
        },
        () => setFailed(true),
      ),
    [],
  );

  useEffect(() => {
    refresh(readCart());
  }, [refresh]);

  function setQuantity(variantId: string, quantity: number) {
    const items = readCart()
      .map((i) => (i.variantId === variantId ? { ...i, quantity } : i))
      .filter((i) => i.quantity > 0);
    writeCart(items);
    refresh(items);
  }

  if (failed) return <p className="text-red-700">Não foi possível carregar o carrinho. Recarregue a página.</p>;
  if (!quote) return <p className="text-neutral-600">Carregando…</p>;
  if (quote.lines.length === 0) {
    return (
      <p className="text-neutral-600">
        Seu carrinho está vazio. <Link href="/" className="underline">Ver produtos</Link>
      </p>
    );
  }

  const blocked = quote.problems.length > 0;

  return (
    <div className="space-y-6">
      {removedUnavailable && (
        <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Alguns itens não estão mais disponíveis e foram retirados do carrinho.
        </p>
      )}

      <ul className="divide-y rounded-md border">
        {quote.lines.map((l) => (
          <li key={l.variantId} className="flex gap-4 p-4">
            <Link href={`/p/${l.productSlug}`} className="h-20 w-20 shrink-0 overflow-hidden rounded bg-neutral-100">
              {l.imagePath && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={productImageUrl(l.imagePath)} alt={l.productName} className="h-full w-full object-cover" />
              )}
            </Link>
            <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <div className="min-w-0">
                <Link href={`/p/${l.productSlug}`} className="font-medium hover:underline">{l.productName}</Link>
                {l.variantName !== "Único" && <p className="text-sm text-neutral-500">{l.variantName}</p>}
                <p className="text-sm text-neutral-500">{formatBRL(l.unitPriceCents)} cada</p>
                {l.quantity > l.stock && (
                  <p className="text-sm text-red-700">
                    {l.stock === 0 ? "Esgotado." : `Só restam ${l.stock}.`}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center rounded-md border">
                  <button type="button" onClick={() => setQuantity(l.variantId, l.quantity - 1)} className="px-3 py-1" aria-label="Diminuir">−</button>
                  <span className="w-8 text-center text-sm">{l.quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQuantity(l.variantId, l.quantity + 1)}
                    disabled={l.quantity >= l.stock}
                    className="px-3 py-1 disabled:opacity-30"
                    aria-label="Aumentar"
                  >
                    +
                  </button>
                </div>
                <span className="w-24 text-right font-medium">{formatBRL(l.totalCents)}</span>
                <button type="button" onClick={() => setQuantity(l.variantId, 0)} className="text-sm text-neutral-500 underline">
                  Remover
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-col items-end gap-3">
        <p className="text-lg">
          Subtotal: <span className="font-semibold">{formatBRL(quote.subtotalCents)}</span>
        </p>
        <p className="text-sm text-neutral-500">Frete calculado no checkout.</p>
        {blocked && <p className="text-sm text-red-700">Ajuste as quantidades acima para continuar.</p>}
        {blocked ? (
          <span className="rounded-md bg-neutral-300 px-6 py-3 font-medium text-white">Finalizar compra</span>
        ) : (
          <Link href="/checkout" className="rounded-md px-6 py-3 font-medium text-white" style={{ background: "var(--brand)" }}>
            Finalizar compra
          </Link>
        )}
      </div>
    </div>
  );
}
