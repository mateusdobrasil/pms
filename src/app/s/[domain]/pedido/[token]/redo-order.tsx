"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { type CartItem, writeCart } from "@/lib/cart";
import { type CheckoutPrefill, savePrefill } from "@/lib/checkout-prefill";

// Pedido expirado: monta o carrinho com os itens ainda disponíveis e leva ao checkout com os dados preenchidos.
// auto = veio do e-mail de segunda chance (?refazer=1): faz isso sozinho ao abrir.
export function RedoOrder({ items, prefill, auto }: { items: CartItem[]; prefill: CheckoutPrefill; auto: boolean }) {
  const router = useRouter();

  function redo() {
    writeCart(items);
    savePrefill(prefill);
    router.push("/checkout");
  }

  useEffect(() => {
    if (auto) redo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  return (
    <button
      type="button"
      onClick={redo}
      className="mt-4 rounded-lg px-5 py-3 font-semibold text-white shadow-sm transition hover:brightness-110"
      style={{ background: "var(--brand)" }}
    >
      Refazer pedido
    </button>
  );
}
