"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { formatBRL } from "@/lib/money";
import { formatDateTime } from "@/lib/format";
import { statusLabel, statusTone, type OrderStatus } from "@/lib/order-status";

type FoundOrder = {
  code: string;
  token: string;
  status: OrderStatus;
  shippingMethod: string;
  totalCents: number;
  createdAt: string;
};

const inputClass = "w-full rounded-lg border px-3 py-2.5 text-sm";

export function OrderLookup() {
  const [orders, setOrders] = useState<FoundOrder[] | null>(null);
  const [error, setError] = useState("");
  const [searching, setSearching] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSearching(true);
    setError("");
    setOrders(null);
    const form = new FormData(e.currentTarget);

    const res = await fetch("/api/orders/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: form.get("identifier"), email: form.get("email") }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);

    if (!res?.ok || !data?.orders) setError(data?.error ?? "Não foi possível buscar agora. Tente novamente.");
    else setOrders(data.orders);
    setSearching(false);
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="space-y-3">
        <input
          name="identifier"
          required
          autoComplete="off"
          placeholder="Número do pedido ou CPF"
          aria-label="Número do pedido ou CPF"
          className={inputClass}
        />
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="E-mail usado na compra"
          aria-label="E-mail usado na compra"
          className={inputClass}
        />
        {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        <button
          type="submit"
          disabled={searching}
          className="w-full rounded-lg px-4 py-3 font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-50"
          style={{ background: "var(--brand)" }}
        >
          {searching ? "Buscando…" : "Buscar pedidos"}
        </button>
      </form>

      {orders?.length === 0 && (
        <p className="rounded-lg bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
          Nenhum pedido encontrado com esses dados. Confira o número (ou CPF) e o e-mail informados na compra.
        </p>
      )}

      {orders && orders.length > 0 && (
        <ul className="divide-y rounded-xl border bg-white text-sm shadow-sm">
          {orders.map((o) => (
            <li key={o.token}>
              <Link
                href={`/pedido/${o.token}`}
                className="flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-neutral-50"
              >
                <span>
                  <span className="block font-medium">Pedido {o.code}</span>
                  <span className="block text-neutral-500">{formatDateTime(o.createdAt)}</span>
                </span>
                <span className="text-right">
                  <span className={statusTone(o.status)}>{statusLabel(o.status, o.shippingMethod)}</span>
                  <span className="mt-1 block font-medium">{formatBRL(o.totalCents)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
