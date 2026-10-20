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
    <Link
      href="/carrinho"
      className="relative flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition hover:border-neutral-400"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current" strokeWidth={1.8}>
        <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="10" cy="20" r="1.2" />
        <circle cx="17" cy="20" r="1.2" />
      </svg>
      Carrinho
      {items > 0 && (
        <span
          className="grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-xs font-bold text-white"
          style={{ background: "var(--brand)" }}
        >
          {items}
        </span>
      )}
    </Link>
  );
}
