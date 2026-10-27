"use client";

import { useEffect } from "react";
import { saveCouponFromUrl } from "@/lib/coupon-link";

// Guarda o ?cupom= de qualquer página da loja para o checkout (não renderiza nada).
export function CouponCapture() {
  useEffect(saveCouponFromUrl, []);
  return null;
}
