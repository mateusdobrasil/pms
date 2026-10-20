"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearCart, readCart } from "@/lib/cart";
import { formatBRL } from "@/lib/money";

type Quote = {
  lines: { variantId: string; productName: string; variantName: string; quantity: number; totalCents: number }[];
  subtotalCents: number;
  shippingOptions: { id: string; name: string; priceCents: number; deliveryDays: number | null }[];
  problems: string[];
};

const inputClass = "w-full rounded-md border px-3 py-2 text-sm";

export function CheckoutForm() {
  const router = useRouter();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [empty, setEmpty] = useState(false);
  const [shippingId, setShippingId] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Carrinho vazio: a rota devolve um resumo sem linhas e cai no "carrinho vazio".
    fetch("/api/cart/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: readCart() }),
    })
      .then((r) => r.json())
      .then((q: Quote) => {
        setQuote(q);
        setShippingId(q.shippingOptions[0]?.id ?? "");
        if (q.lines.length === 0) setEmpty(true);
      })
      .catch(() => setErrors(["Não foi possível carregar o carrinho."]));
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setErrors([]);
    const form = new FormData(e.currentTarget);

    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: readCart(),
        shippingOptionId: shippingId,
        customer: {
          name: form.get("name"),
          email: form.get("email"),
          cpf: form.get("cpf"),
          phone: form.get("phone"),
        },
      }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);

    if (!res?.ok || !data?.token) {
      setErrors(data?.errors ?? ["Não foi possível criar o pedido. Tente novamente."]);
      setSubmitting(false);
      return;
    }
    clearCart();
    router.push(`/pedido/${data.token}`);
  }

  if (empty) {
    return (
      <p className="text-neutral-600">
        Seu carrinho está vazio. <Link href="/" className="underline">Ver produtos</Link>
      </p>
    );
  }
  if (!quote) return <p className="text-neutral-600">{errors[0] ?? "Carregando…"}</p>;

  const shipping = quote.shippingOptions.find((o) => o.id === shippingId);
  const total = quote.subtotalCents + (shipping?.priceCents ?? 0);
  const blocked = quote.problems.length > 0;

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <section>
        <h2 className="mb-3 font-medium">Resumo</h2>
        <ul className="divide-y rounded-md border text-sm">
          {quote.lines.map((l) => (
            <li key={l.variantId} className="flex justify-between gap-4 px-4 py-3">
              <span>
                {l.quantity}× {l.productName}
                {l.variantName !== "Único" && <span className="text-neutral-500"> · {l.variantName}</span>}
              </span>
              <span>{formatBRL(l.totalCents)}</span>
            </li>
          ))}
        </ul>
        {blocked && (
          <ul className="mt-3 space-y-1 text-sm text-red-700">
            {quote.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
            <li>
              <Link href="/carrinho" className="underline">Ajustar carrinho</Link>
            </li>
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Seus dados</h2>
        <input name="name" required autoComplete="name" placeholder="Nome completo" className={inputClass} />
        <input name="email" type="email" required autoComplete="email" placeholder="E-mail" className={inputClass} />
        <div className="grid grid-cols-2 gap-3">
          <input name="cpf" required inputMode="numeric" placeholder="CPF" className={inputClass} />
          <input name="phone" type="tel" required autoComplete="tel" placeholder="Celular com DDD" className={inputClass} />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Entrega</h2>
        {quote.shippingOptions.map((o) => (
          <label key={o.id} className="flex items-center justify-between rounded-md border px-4 py-3 text-sm">
            <span className="flex items-center gap-3">
              <input
                type="radio"
                name="shipping"
                checked={shippingId === o.id}
                onChange={() => setShippingId(o.id)}
              />
              {o.name}
              {o.deliveryDays != null && <span className="text-neutral-500">até {o.deliveryDays} dias úteis</span>}
            </span>
            <span>{o.priceCents === 0 ? "Grátis" : formatBRL(o.priceCents)}</span>
          </label>
        ))}
      </section>

      <section className="space-y-1 border-t pt-4 text-sm">
        <p className="flex justify-between"><span>Subtotal</span><span>{formatBRL(quote.subtotalCents)}</span></p>
        <p className="flex justify-between"><span>Entrega</span><span>{formatBRL(shipping?.priceCents ?? 0)}</span></p>
        <p className="flex justify-between text-base font-semibold"><span>Total</span><span>{formatBRL(total)}</span></p>
      </section>

      {errors.length > 0 && (
        <ul className="space-y-1 text-sm text-red-700">
          {errors.map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      )}

      <button
        type="submit"
        disabled={submitting || blocked || !shipping}
        className="w-full rounded-md px-4 py-3 font-medium text-white disabled:opacity-50"
        style={{ background: "var(--brand)" }}
      >
        {submitting ? "Criando pedido…" : "Ir para o pagamento"}
      </button>
    </form>
  );
}
