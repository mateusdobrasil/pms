"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { formatBRL, parseBRL } from "@/lib/money";
import { ThumbImage } from "@/lib/thumb-image";
import { COUNTER_PAYMENTS, type CounterPayment, changeFor, counterTotal } from "@/lib/counter";
import { registerCounterSale } from "./actions";

export type PosVariant = { variantId: string; label: string; priceCents: number; stock: number; image: string | null };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const input = "w-full rounded-md border bg-white px-3 py-2 text-sm";

// Caixa do balcão: escolhe os produtos, a forma de pagamento e (opcional) o cliente.
export function CounterPos({ variants }: { variants: PosVariant[] }) {
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<Map<string, number>>(new Map());
  const [payment, setPayment] = useState<CounterPayment | null>(null);
  const [discount, setDiscount] = useState("");
  const [received, setReceived] = useState("");
  const [customer, setCustomer] = useState({ name: "", phone: "", email: "" });
  const [message, setMessage] = useState<{ ok: boolean; text: string; orderId?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const byId = useMemo(() => new Map(variants.map((v) => [v.variantId, v])), [variants]);
  const shown = useMemo(() => {
    const q = norm(query.trim());
    return (q ? variants.filter((v) => q.split(/\s+/).every((w) => norm(v.label).includes(w))) : variants).slice(0, 60);
  }, [query, variants]);

  const lines = [...cart.entries()].map(([id, qty]) => ({ v: byId.get(id)!, qty })).filter((l) => l.v);
  const subtotal = lines.reduce((s, l) => s + l.v.priceCents * l.qty, 0);
  const discountCents = parseBRL(discount || "0") ?? 0;
  const { totalCents } = counterTotal(subtotal, discountCents);
  const receivedCents = parseBRL(received || "0");
  const change = payment === "cash" && received ? changeFor(totalCents, receivedCents ?? 0) : null;

  function add(id: string, delta: number) {
    setMessage(null);
    setCart((c) => {
      const next = new Map(c);
      const qty = Math.min(99, (next.get(id) ?? 0) + delta);
      if (qty <= 0) next.delete(id);
      else next.set(id, qty);
      return next;
    });
  }

  function finish() {
    startTransition(async () => {
      const r = await registerCounterSale({
        items: lines.map((l) => ({ variantId: l.v.variantId, quantity: l.qty })),
        payment,
        discountCents: Math.min(discountCents, subtotal),
        customer,
      });
      if (!r.ok) {
        setMessage({ ok: false, text: r.error });
        return;
      }
      setMessage({
        ok: true,
        orderId: r.id,
        text: `Venda ${r.code} registrada: ${formatBRL(r.totalCents)} no ${COUNTER_PAYMENTS[payment!].toLowerCase()}.${r.stockIssue ? " Atenção: o sistema não tinha estoque de algum item; confira o estoque." : ""}`,
      });
      setCart(new Map());
      setPayment(null);
      setDiscount("");
      setReceived("");
      setCustomer({ name: "", phone: "", email: "" });
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <section className="space-y-3">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar produto ou tamanho…" className={input} autoFocus />
        {variants.length === 0 ? (
          <p className="rounded-xl border bg-white px-4 py-6 text-sm text-neutral-500">Cadastre produtos em Produtos para vender no balcão.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {shown.map((v) => (
              <button
                key={v.variantId}
                type="button"
                onClick={() => add(v.variantId, 1)}
                className="flex gap-2 rounded-lg border bg-white p-2 text-left text-sm shadow-sm transition hover:border-neutral-400"
              >
                {v.image ? (
                  <ThumbImage path={v.image} alt="" lazy className="h-12 w-12 shrink-0 rounded object-cover" />
                ) : (
                  <span className="h-12 w-12 shrink-0 rounded bg-neutral-100" />
                )}
                <span className="min-w-0">
                  <span className="line-clamp-2 font-medium leading-tight">{v.label}</span>
                  <span className="block text-neutral-600">{formatBRL(v.priceCents)}</span>
                  <span className={`block text-xs ${v.stock > 0 ? "text-neutral-400" : "text-red-600"}`}>{v.stock > 0 ? `${v.stock} em estoque` : "sem estoque no sistema"}</span>
                </span>
              </button>
            ))}
          </div>
        )}
        {shown.length === 60 && <p className="text-xs text-neutral-500">Mostrando os 60 primeiros. Digite para encontrar outro.</p>}
      </section>

      <aside className="space-y-4 rounded-xl border bg-white p-4 text-sm shadow-sm lg:sticky lg:top-4 lg:self-start">
        <h2 className="font-semibold">Venda</h2>
        {lines.length === 0 ? (
          <p className="text-neutral-500">Toque nos produtos para adicionar.</p>
        ) : (
          <ul className="divide-y">
            {lines.map((l) => (
              <li key={l.v.variantId} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{l.v.label}</span>
                  <span className="text-neutral-500">{formatBRL(l.v.priceCents * l.qty)}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => add(l.v.variantId, -1)} className="h-8 w-8 rounded-md border" aria-label="Menos um">−</button>
                  <span className="w-6 text-center">{l.qty}</span>
                  <button type="button" onClick={() => add(l.v.variantId, 1)} className="h-8 w-8 rounded-md border" aria-label="Mais um">+</button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-1 border-t pt-3">
          <p className="flex justify-between"><span>Subtotal</span><span>{formatBRL(subtotal)}</span></p>
          <label className="flex items-center justify-between gap-2">
            <span>Desconto (R$)</span>
            <input value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" placeholder="0,00" className="w-28 rounded-md border px-2 py-1 text-right" />
          </label>
          <p className="flex justify-between text-base font-semibold"><span>Total</span><span>{formatBRL(totalCents)}</span></p>
        </div>

        <div className="space-y-2">
          <p className="font-medium">Pagamento</p>
          <div className="grid grid-cols-2 gap-2">
            {(["cash", "pix", "credit", "debit"] as CounterPayment[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setPayment(m)}
                className={`rounded-md border-2 px-2 py-2 font-medium ${payment === m ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 hover:border-neutral-400"}`}
              >
                {COUNTER_PAYMENTS[m]}
              </button>
            ))}
          </div>
          {payment === "cash" && (
            <label className="flex items-center justify-between gap-2">
              <span>Valor recebido</span>
              <input value={received} onChange={(e) => setReceived(e.target.value)} inputMode="decimal" placeholder="0,00" className="w-28 rounded-md border px-2 py-1 text-right" />
            </label>
          )}
          {payment === "cash" && received && (
            <p className={`text-right font-semibold ${change == null ? "text-red-700" : "text-emerald-700"}`}>
              {change == null ? "Valor menor que o total" : `Troco: ${formatBRL(change)}`}
            </p>
          )}
        </div>

        <details className="rounded-md bg-neutral-50 px-3 py-2">
          <summary className="cursor-pointer">Identificar o cliente (opcional)</summary>
          <div className="mt-2 space-y-2">
            <input value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} placeholder="Nome" className={input} />
            <input value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} type="tel" inputMode="tel" placeholder="Celular com DDD" className={input} />
            <input value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} type="email" placeholder="E-mail" className={input} />
            <p className="text-xs text-neutral-500">Com o celular, a compra aparece em Clientes e conta no cartão fidelidade.</p>
          </div>
        </details>

        <button
          type="button"
          onClick={finish}
          disabled={pending || lines.length === 0 || !payment || (payment === "cash" && !!received && change == null)}
          className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-base font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {pending ? "Registrando…" : `Finalizar venda · ${formatBRL(totalCents)}`}
        </button>
        {message && (
          <p className={`rounded-md px-3 py-2 ${message.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
            {message.text}{" "}
            {message.orderId && <Link href={`/painel/pedidos/${message.orderId}`} className="font-medium underline">Ver venda</Link>}
          </p>
        )}
      </aside>
    </div>
  );
}
