"use client";

import { useEffect, useState, useTransition } from "react";
import { formatBRL } from "@/lib/money";
import { formatPhone } from "@/lib/format";
import { DEFAULT_MESSAGE, fillMessage } from "@/lib/customers";
import { markContacted, redeemReward, setDoNotContact } from "./actions";

export type CustomerRow = {
  key: string;
  name: string;
  phone: string | null;
  email: string | null;
  orders: number;
  bookings: number;
  totalCents: number;
  daysAway: number;
  nextBooking: string | null; // "sex., 31/10 às 14:00"
  contactedDays: number | null;
  doNotContact: boolean;
  link: string; // loja ou /agendar
  loyalty: { current: number; goal: number; prizes: number; keys: string[] } | null; // cartão fidelidade
};

const STORAGE_KEY = "clientes-mensagem";

// Lista com a mensagem do WhatsApp editável (fica guardada neste navegador).
export function CustomerList({ rows, storeName, canMark }: { rows: CustomerRow[]; storeName: string; canMark: boolean }) {
  const [template, setTemplate] = useState(DEFAULT_MESSAGE);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const saved = (() => {
      try {
        return localStorage.getItem(STORAGE_KEY);
      } catch {
        return null;
      }
    })();
    if (saved) queueMicrotask(() => setTemplate(saved));
  }, []);

  function changeTemplate(value: string) {
    setTemplate(value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // sem armazenamento: vale só nesta visita
    }
  }

  const ago = (d: number) => (d === 0 ? "hoje" : d === 1 ? "ontem" : `há ${d} dias`);

  return (
    <div className="space-y-4">
      <details className="rounded-xl border bg-white p-4 text-sm shadow-sm">
        <summary className="cursor-pointer font-medium">Mensagem do WhatsApp</summary>
        <textarea
          value={template}
          onChange={(e) => changeTemplate(e.target.value)}
          rows={3}
          className="mt-3 w-full rounded-md border px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-neutral-500">
          {"{nome}"} vira o primeiro nome do cliente, {"{loja}"} o nome da loja e {"{link}"} o endereço da loja (ou da agenda, para quem já
          agendou). Fica guardada neste aparelho.{" "}
          <button type="button" onClick={() => changeTemplate(DEFAULT_MESSAGE)} className="underline">Voltar ao texto padrão</button>
        </p>
      </details>

      <ul className="divide-y rounded-xl border bg-white shadow-sm">
        {rows.map((c) => {
          const text = fillMessage(template, { name: c.name, store: storeName, link: c.link });
          return (
            <li key={c.key} className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm ${c.doNotContact ? "opacity-60" : ""}`}>
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium">{c.name}</p>
                <p className="text-neutral-500">
                  {[c.phone && formatPhone(c.phone), c.email].filter(Boolean).join(" · ")}
                </p>
                <p className="text-neutral-600">
                  Última vez {ago(c.daysAway)} ·{" "}
                  {[c.orders && `${c.orders} ${c.orders === 1 ? "compra" : "compras"}`, c.bookings && `${c.bookings} ${c.bookings === 1 ? "atendimento" : "atendimentos"}`]
                    .filter(Boolean)
                    .join(" e ")}{" "}
                  · {formatBRL(c.totalCents)}
                </p>
                {c.nextBooking && <p className="font-medium text-sky-700">Tem horário marcado: {c.nextBooking}</p>}
                {c.loyalty && (
                  <p className="text-neutral-600">
                    🎟️ Cartão fidelidade: {c.loyalty.current} de {c.loyalty.goal}
                    {c.loyalty.prizes > 0 && (
                      <strong className="ml-2 text-emerald-700">
                        🎁 {c.loyalty.prizes === 1 ? "1 prêmio para entregar" : `${c.loyalty.prizes} prêmios para entregar`}
                      </strong>
                    )}
                  </p>
                )}
                {c.contactedDays != null && <p className="text-emerald-700">Você chamou {ago(c.contactedDays)}</p>}
                {c.doNotContact && <p className="text-neutral-500">Não chamar mais</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {c.phone && !c.doNotContact && (
                  <a
                    href={`https://wa.me/55${c.phone}?text=${encodeURIComponent(text)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => canMark && startTransition(() => markContacted(c.key))}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    Chamar no WhatsApp
                  </a>
                )}
                {!c.phone && c.email && !c.doNotContact && (
                  <a
                    href={`mailto:${c.email}?subject=${encodeURIComponent(`Saudades de você na ${storeName}`)}&body=${encodeURIComponent(text)}`}
                    onClick={() => canMark && startTransition(() => markContacted(c.key))}
                    className="rounded-md border px-3 py-1.5 text-xs font-medium hover:border-neutral-400"
                  >
                    Mandar e-mail
                  </a>
                )}
                {c.loyalty && c.loyalty.prizes > 0 && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => startTransition(() => redeemReward(c.loyalty!.keys))}
                    className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
                  >
                    Entregar prêmio
                  </button>
                )}
                {canMark && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => startTransition(() => setDoNotContact(c.key, !c.doNotContact))}
                    className="rounded-md px-2.5 py-1.5 text-xs font-medium text-neutral-500 hover:bg-neutral-100 disabled:opacity-50"
                  >
                    {c.doNotContact ? "Voltar a chamar" : "Não chamar mais"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
