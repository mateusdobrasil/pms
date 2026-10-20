"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { readCart } from "@/lib/cart";

function subscribe(onChange: () => void) {
  window.addEventListener("cart:change", onChange);
  window.addEventListener("storage", onChange); // outra aba
  return () => {
    window.removeEventListener("cart:change", onChange);
    window.removeEventListener("storage", onChange);
  };
}

const count = () => readCart().reduce((sum, i) => sum + i.quantity, 0);

export function CartLink() {
  const items = useSyncExternalStore(subscribe, count, () => 0);
  return (
    <Link href="/carrinho" className="text-sm">
      Carrinho
      {items > 0 && (
        <span className="ml-1 rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ background: "var(--brand)" }}>
          {items}
        </span>
      )}
    </Link>
  );
}
