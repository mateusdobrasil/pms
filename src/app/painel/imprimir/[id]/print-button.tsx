"use client";

import { useEffect } from "react";

// Abre a janela de impressão ao carregar; o botão serve para imprimir de novo.
export function PrintButton() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, []);

  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
    >
      Imprimir
    </button>
  );
}
