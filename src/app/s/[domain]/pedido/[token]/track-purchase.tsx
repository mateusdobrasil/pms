"use client";

import { useEffect } from "react";
import { trackPurchase } from "@/lib/tracking";

// Registra a compra no Pixel/Analytics (uma vez por pedido neste navegador), depois que o layout carregou os scripts.
export function TrackPurchase({ orderCode, valueCents }: { orderCode: string; valueCents: number }) {
  useEffect(() => {
    const t = setTimeout(() => trackPurchase(orderCode, valueCents));
    return () => clearTimeout(t);
  }, [orderCode, valueCents]);
  return null;
}
