"use client";

import { useState, useTransition } from "react";
import { redeemSessionForBooking } from "./pacotes/actions";

// "Usar pacote · restam 4": marca o agendamento como atendido e desconta uma sessão do pacote (sem cobrar).
export function UsePackage({ bookingId, packageId, left, name }: { bookingId: string; packageId: string; left: number; name: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={pending}
        title={name}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await redeemSessionForBooking(packageId, bookingId);
            if (!r.ok) setError(r.error);
          })
        }
        className="rounded-md bg-violet-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
      >
        {pending ? "Usando…" : `Usar pacote · restam ${left}`}
      </button>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
