"use client";

import { useState, useTransition } from "react";
import { cancelCounterSaleAction } from "./actions";

// Cancelar uma venda de balcão lançada por engano (pede confirmação; devolve os itens ao estoque).
export function CancelSale({ orderId, code }: { orderId: string; code: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm(`Cancelar a venda ${code}? Os itens voltam ao estoque. Devolva o dinheiro ao cliente, se for o caso.`)) return;
          startTransition(async () => {
            const r = await cancelCounterSaleAction(orderId);
            if ("error" in r && r.error) setError(r.error);
          });
        }}
        className="text-xs font-medium text-red-700 hover:underline disabled:opacity-50"
      >
        {pending ? "Cancelando…" : "Cancelar"}
      </button>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </span>
  );
}
