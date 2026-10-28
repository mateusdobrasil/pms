"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { type CartItem, readCart, writeCart } from "@/lib/cart";
import { type CheckoutPrefill, savePrefill } from "@/lib/checkout-prefill";

// Junta os itens ao carrinho deste navegador (sem dobrar o que já estava nele) e vai para o checkout preenchido.
export function RestoreCart({ token, items, prefill }: { token: string; items: CartItem[]; prefill: CheckoutPrefill }) {
  const router = useRouter();
  useEffect(() => {
    const cart = readCart();
    for (const item of items) {
      const inCart = cart.find((c) => c.variantId === item.variantId);
      if (inCart) inCart.quantity = Math.max(inCart.quantity, item.quantity);
      else cart.push(item);
    }
    writeCart(cart);
    savePrefill(prefill);
    fetch("/api/cart/sair", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, voltou: true }), keepalive: true }).catch(() => {});
    router.replace("/checkout");
  }, [token, items, prefill, router]);
  return <p className="py-10 text-center text-neutral-600">Abrindo o seu carrinho…</p>;
}
