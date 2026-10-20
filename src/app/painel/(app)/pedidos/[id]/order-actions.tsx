"use client";

import { useActionState } from "react";
import { statusLabel, type OrderStatus } from "@/lib/order-status";
import { changeStatus, saveTracking, type OrderActionState } from "./actions";

export function OrderActions({
  orderId,
  status,
  shippingMethod,
  trackingCode,
  transitions,
}: {
  orderId: string;
  status: OrderStatus;
  shippingMethod: string;
  trackingCode: string | null;
  transitions: OrderStatus[];
}) {
  const [statusState, statusAction, statusPending] = useActionState<OrderActionState, FormData>(changeStatus, null);
  const [trackState, trackAction, trackPending] = useActionState<OrderActionState, FormData>(saveTracking, null);

  const isPickup = shippingMethod === "pickup";
  const canTrack = !isPickup && ["paid", "preparing", "shipped", "delivered"].includes(status);
  const nextSteps = transitions.filter((s) => s !== "canceled" && !(s === "shipped" && !isPickup));
  const canCancel = transitions.includes("canceled");

  return (
    <section className="space-y-4 rounded-md border bg-white px-4 py-3 text-sm">
      <h2 className="font-medium">Andamento</h2>

      {nextSteps.length === 0 && !canTrack && !canCancel && (
        <p className="text-neutral-500">Nenhuma ação disponível para este pedido.</p>
      )}

      {nextSteps.length > 0 && (
        <form action={statusAction} className="flex flex-wrap gap-2">
          <input type="hidden" name="orderId" value={orderId} />
          {nextSteps.map((s) => (
            <button
              key={s}
              type="submit"
              name="status"
              value={s}
              disabled={statusPending}
              className="rounded-md bg-neutral-900 px-3 py-2 font-medium text-white disabled:opacity-50"
            >
              Marcar como {statusLabel(s, shippingMethod).toLowerCase()}
            </button>
          ))}
        </form>
      )}

      {canTrack && (
        <form action={trackAction} className="space-y-2">
          <input type="hidden" name="orderId" value={orderId} />
          <label className="block text-neutral-600" htmlFor="trackingCode">Código de rastreio</label>
          <div className="flex gap-2">
            <input
              id="trackingCode"
              name="trackingCode"
              defaultValue={trackingCode ?? ""}
              placeholder="AA123456789BR"
              className="min-w-0 flex-1 rounded-md border px-3 py-2 font-mono uppercase"
            />
            <button
              type="submit"
              disabled={trackPending}
              className="rounded-md border px-3 py-2 font-medium disabled:opacity-50"
            >
              Salvar
            </button>
          </div>
          {(status === "paid" || status === "preparing") && (
            <p className="text-xs text-neutral-500">Ao salvar, o pedido é marcado como enviado.</p>
          )}
          {trackState?.error && <p className="text-red-700">{trackState.error}</p>}
          {trackState?.ok && <p className="text-green-700">{trackState.ok}</p>}
        </form>
      )}

      {canCancel && (
        <form
          action={statusAction}
          onSubmit={(e) => {
            const msg =
              status === "pending_payment"
                ? "Cancelar este pedido?"
                : "Cancelar este pedido pago? O estorno do pagamento deve ser feito no Mercado Pago e o estoque não volta automaticamente.";
            if (!confirm(msg)) e.preventDefault();
          }}
        >
          <input type="hidden" name="orderId" value={orderId} />
          <button type="submit" name="status" value="canceled" disabled={statusPending} className="text-red-700 underline">
            Cancelar pedido
          </button>
        </form>
      )}

      {statusState?.error && <p className="text-red-700">{statusState.error}</p>}
      {statusState?.ok && <p className="text-green-700">{statusState.ok}</p>}
    </section>
  );
}
