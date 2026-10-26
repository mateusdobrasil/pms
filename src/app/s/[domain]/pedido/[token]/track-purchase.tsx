"use client";

import { useEffect } from "react";
import { trackPurchase } from "@/lib/tracking";

type Item = { id: string; name: string; priceCents: number; quantity: number };

// Registra a compra no Pixel/Analytics (uma vez por pedido neste navegador), depois que o layout carregou os scripts.
export function TrackPurchase({ orderCode, valueCents, items }: { orderCode: string; valueCents: number; items: Item[] }) {
  useEffect(() => {
    const t = setTimeout(() => trackPurchase(orderCode, valueCents, items));
    return () => clearTimeout(t);
  }, [orderCode, valueCents, items]);
  return null;
}
