"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { addToCart, readCart } from "@/lib/cart";
import { formatBRL } from "@/lib/money";
import { LOW_STOCK } from "@/lib/stock";
import { trackAddToCart, trackViewProduct } from "@/lib/tracking";

type Variant = { id: string; name: string; priceCents: number; compareAtCents: number | null; stock: number };

type Installments = { max: number; interestFree: number } | null;

export function AddToCart({
  productId,
  productName,
  variants,
  installments,
  pixDiscountPercent,
}: {
  productId: string;
  productName: string;
  variants: Variant[];
  installments: Installments;
  pixDiscountPercent: number;
}) {
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

  // Depois do efeito do layout, que carrega o Pixel/Analytics (quando o visitante aceitou).
  useEffect(() => {
    const t = setTimeout(() =>
      trackViewProduct({ id: productId, name: productName, priceCents: Math.min(...variants.map((v) => v.priceCents)), quantity: 1 }),
    );
    return () => clearTimeout(t);
  }, [productId, productName, variants]);

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
    trackAddToCart({ id: productId, name: productName, priceCents: selected.priceCents, quantity: qty });
    setMessage(qty < quantity ? `Adicionamos ${qty}, o máximo disponível.` : null);
    setAdded(true);
  }

  return (
    <div className="space-y-5">
      <p className="text-2xl">
        {!selected && prices.size > 1 && <span className="text-base text-neutral-500">a partir de </span>}
        <span className="text-3xl font-bold tracking-tight">{formatBRL(selected ? selected.priceCents : Math.min(...prices))}</span>
        {shown.compareAtCents && (selected || prices.size === 1) && (
          <span className="ml-3 text-lg text-neutral-400 line-through">{formatBRL(shown.compareAtCents)}</span>
        )}
      </p>
      <InstallmentsHint
        installments={installments}
        priceCents={selected ? selected.priceCents : Math.min(...prices)}
        pixDiscountPercent={pixDiscountPercent}
      />

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
                className={`min-w-12 rounded-lg border-2 px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:border-dashed disabled:text-neutral-400 disabled:line-through ${
                  v.id === selectedId ? "" : "border-neutral-200 hover:border-neutral-400"
                }`}
                style={v.id === selectedId ? { borderColor: "var(--brand)", color: "var(--brand)" } : undefined}
              >
                {v.name}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {soldOut ? (
        <p className="rounded-lg bg-neutral-100 px-4 py-3 text-sm font-medium text-neutral-700">Produto esgotado no momento.</p>
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
            className="w-20 rounded-lg border px-3 py-3 text-center text-sm"
          />
          <button
            type="button"
            onClick={add}
            className="flex-1 rounded-lg px-4 py-3 font-semibold text-white shadow-sm transition hover:brightness-110"
            style={{ background: "var(--brand)" }}
          >
            Adicionar ao carrinho
          </button>
        </div>
      )}

      {selected && selected.stock > 0 && selected.stock <= LOW_STOCK && (
        <p className="text-sm font-medium text-amber-700">
          {selected.stock === 1 ? "Última unidade!" : `Últimas ${selected.stock} unidades!`}
        </p>
      )}
      {message && <p className="text-sm text-red-700">{message}</p>}
      {added && (
        <p className="flex flex-wrap items-center gap-3 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {productName} adicionado ao carrinho.
          <Link href="/carrinho" className="font-medium underline">Ver carrinho</Link>
          <Link href="/checkout" className="font-medium underline">Finalizar compra</Link>
        </p>
      )}
    </div>
  );
}

// Parcelamento como o Mercado Pago da loja oferece: com parcelas sem juros, mostra o valor de cada uma;
// com juros, só o número máximo (o valor com juros aparece no pagamento).
function InstallmentsHint({
  installments,
  priceCents,
  pixDiscountPercent,
}: {
  installments: Installments;
  priceCents: number;
  pixDiscountPercent: number;
}) {
  // Mesma conta de lib/promotions (desconto sobre o produto, centavos para baixo).
  const pixPrice = priceCents - Math.floor((priceCents * pixDiscountPercent) / 100);
  const pix = pixDiscountPercent > 0 && (
    <p className="-mt-3 text-sm font-medium text-emerald-700">
      {formatBRL(pixPrice)} no Pix <span className="font-normal">({pixDiscountPercent}% de desconto)</span>
    </p>
  );
  if (!installments || installments.max < 2) return pix || null;
  const n = installments.interestFree;
  return (
    <>
      {pix}
      <p className="-mt-3 text-sm text-neutral-600">
        {n > 1 ? (
          <>
            em até <strong>{n}x de {formatBRL(Math.ceil(priceCents / n))} sem juros</strong> no cartão
          </>
        ) : (
          <>em até {installments.max}x no cartão</>
        )}
        {!pix && <span className="text-neutral-400"> · ou Pix</span>}
      </p>
    </>
  );
}
