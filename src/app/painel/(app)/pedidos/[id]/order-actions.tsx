"use client";

import { useActionState, useState } from "react";
import { statusLabel, type OrderStatus } from "@/lib/order-status";
import { changeStatus, refundOrder, saveTracking, type OrderActionState } from "./actions";
import { submitKeepingValues } from "@/lib/form-submit";

export function OrderActions({
  orderId,
  status,
  shippingMethod,
  trackingCode,
  transitions,
  refundable,
}: {
  orderId: string;
  status: OrderStatus;
  shippingMethod: string;
  trackingCode: string | null;
  transitions: OrderStatus[];
  refundable: boolean; // pago com pagamento aprovado: o cancelamento é pelo "Cancelar e estornar"
}) {
  const [statusState, statusAction, statusPending] = useActionState<OrderActionState, FormData>(changeStatus, null);
  const [trackState, trackAction, trackPending] = useActionState<OrderActionState, FormData>(saveTracking, null);

  const isPickup = shippingMethod === "pickup";
  const canTrack = !isPickup && ["paid", "preparing", "shipped", "delivered"].includes(status);
  const nextSteps = transitions.filter((s) => s !== "canceled" && !(s === "shipped" && !isPickup));
  const canCancel = transitions.includes("canceled") && !refundable;

  return (
    <section className="space-y-4 rounded-xl border bg-white shadow-sm px-4 py-3 text-sm">
      <h2 className="font-medium">Andamento</h2>

      {nextSteps.length === 0 && !canTrack && !canCancel && (
        <p className="text-neutral-500">Nenhuma ação disponível para este pedido.</p>
      )}

      {nextSteps.length > 0 && (
        <form onSubmit={submitKeepingValues(statusAction)} className="flex flex-wrap gap-2">
          <input type="hidden" name="orderId" value={orderId} />
          {nextSteps.map((s) => (
            <button
              key={s}
              type="submit"
              name="status"
              value={s}
              disabled={statusPending}
              className="rounded-md bg-primary-600 hover:bg-primary-700 px-3 py-2 font-medium text-white disabled:opacity-50"
            >
              Marcar como {statusLabel(s, shippingMethod).toLowerCase()}
            </button>
          ))}
        </form>
      )}

      {canTrack && (
        <form onSubmit={submitKeepingValues(trackAction)} className="space-y-2">
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
          onSubmit={(e) => {
            const msg =
              status === "pending_payment"
                ? "Cancelar este pedido?"
                : "Cancelar este pedido pago? O estorno do pagamento deve ser feito no Mercado Pago e o estoque não volta automaticamente.";
            if (!confirm(msg)) return e.preventDefault();
            submitKeepingValues(statusAction)(e);
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

// Cancelar e estornar (pedido pago com pagamento aprovado). Pede confirmação antes.
export function RefundSection({
  orderId,
  totalLabel,
  method,
  stockIssue,
}: {
  orderId: string;
  totalLabel: string;
  method: "pix" | "card";
  stockIssue: boolean;
}) {
  const [state, action, pending] = useActionState<OrderActionState, FormData>(refundOrder, null);
  const [open, setOpen] = useState(false);

  return (
    <section className="space-y-3 rounded-xl border bg-white px-4 py-3 text-sm shadow-sm">
      <h2 className="font-medium">Cancelar e estornar</h2>
      {!open ? (
        <>
          <p className="text-neutral-600">Devolve o pagamento ao cliente pelo Mercado Pago e cancela o pedido.</p>
          <button type="button" onClick={() => setOpen(true)} className="rounded-md border border-red-300 px-3 py-2 font-medium text-red-700 hover:bg-red-50">
            Cancelar e estornar
          </button>
        </>
      ) : (
        <form onSubmit={submitKeepingValues(action)} className="space-y-3">
          <input type="hidden" name="orderId" value={orderId} />
          <p className="rounded-md bg-red-50 px-3 py-2 text-red-800">
            Vamos devolver <strong>{totalLabel}</strong> ao cliente
            {method === "pix" ? " (Pix: o dinheiro volta na hora)" : " (cartão: aparece como crédito na fatura do cliente)"}. O valor sai do saldo da sua conta do
            Mercado Pago. Isso não pode ser desfeito.
          </p>
          <label className="flex items-start gap-2">
            <input type="checkbox" name="restock" defaultChecked={!stockIssue} className="mt-0.5" />
            <span>
              Devolver os itens ao estoque
              <span className="block text-xs text-neutral-500">
                {stockIssue
                  ? "Este pedido teve falta de estoque na confirmação: confira o estoque antes de marcar."
                  : "Desmarque se o produto não voltou ou não pode ser vendido de novo."}
              </span>
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={pending} className="rounded-md bg-red-600 px-3 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50">
              {pending ? "Estornando…" : `Confirmar estorno de ${totalLabel}`}
            </button>
            <button type="button" disabled={pending} onClick={() => setOpen(false)} className="rounded-md border px-3 py-2">
              Voltar
            </button>
          </div>
        </form>
      )}
      {state?.error && <p className="text-red-700">{state.error}</p>}
      {state?.ok && <p className="text-green-700">{state.ok}</p>}
    </section>
  );
}
