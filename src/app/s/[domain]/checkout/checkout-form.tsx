"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearCart, readCart } from "@/lib/cart";
import { formatBRL } from "@/lib/money";
import { trackBeginCheckout } from "@/lib/tracking";
import { type CheckoutPrefill, takePrefill } from "@/lib/checkout-prefill";
import { forgetCoupon, savedCoupon } from "@/lib/coupon-link";

type Option = {
  id: string;
  name: string;
  priceCents: number;
  deliveryDays: number | null;
  requiresAddress: boolean;
  originalPriceCents?: number; // frete grátis: preço original, mostrado riscado
};
type Quote = {
  lines: { variantId: string; productName: string; variantName: string; quantity: number; totalCents: number }[];
  subtotalCents: number;
  shippingOptions: Option[];
  shippingError: string | null;
  shippingNeedsZip?: boolean; // false = loja só com retirada: o checkout nem pede o CEP
  problems: string[];
  pixDiscountPercent?: number;
  freeShippingMinCents?: number | null;
  coupon?: { code: string; label: string; discountCents: number };
  couponError?: string;
  whatsappOptIn?: boolean; // a loja oferece novidades pelo WhatsApp
};
type Address = { street: string; number: string; complement: string; district: string; city: string; state: string };

const EMPTY_ADDRESS: Address = { street: "", number: "", complement: "", district: "", city: "", state: "" };
const inputClass = "w-full rounded-lg border px-3 py-2.5 text-sm";
const digits = (s: string) => s.replace(/\D/g, "");

async function fetchQuote(zip: string | null, coupon: string | null): Promise<Quote> {
  const res = await fetch("/api/cart/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: readCart(), zip, coupon }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "Não foi possível atualizar o resumo.");
  return data;
}

export function CheckoutForm() {
  const router = useRouter();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [empty, setEmpty] = useState(false);
  const [shippingId, setShippingId] = useState("");
  const [cep, setCep] = useState("");
  const [cepStatus, setCepStatus] = useState<"idle" | "loading" | "notfound">("idle");
  const [address, setAddress] = useState<Address>(EMPTY_ADDRESS);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [prefill, setPrefill] = useState<CheckoutPrefill | null>(null); // "Refazer pedido" de um pedido expirado
  const requestId = useRef(0); // ignora respostas de CEPs antigos
  // Cupom: o código conferido pelo servidor (ref: as cotações de CEP usam sempre o atual).
  const couponRef = useRef<string | null>(null);
  const [couponInput, setCouponInput] = useState("");
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);

  function applyQuote(q: Quote) {
    setQuote(q);
    if (q.lines.length === 0) setEmpty(true);
    // Mantém a opção escolhida se ela ainda existir; senão, a primeira (a mais barata).
    setShippingId((current) => (q.shippingOptions.some((o) => o.id === current) ? current : (q.shippingOptions[0]?.id ?? "")));
    // Cupom que deixou de valer (ex.: o carrinho ficou abaixo do mínimo): sai do pedido, com o motivo.
    if (q.couponError) {
      couponRef.current = null;
      setCouponError(q.couponError);
      forgetCoupon();
    }
  }

  async function applyCoupon(code: string | null) {
    setCouponLoading(true);
    setCouponError(null);
    couponRef.current = code;
    const zip = digits(cep);
    const q = await fetchQuote(zip.length === 8 ? zip : null, code).catch((err: Error) => {
      setCouponError(err.message);
      couponRef.current = null;
      return null;
    });
    if (q) {
      applyQuote(q);
      if (q.coupon) setCouponInput("");
      if (!code || !q.coupon) forgetCoupon();
    }
    setCouponLoading(false);
  }

  useEffect(() => {
    // Cupom vindo de um link da loja (?cupom=): já entra na primeira cotação.
    couponRef.current = savedCoupon();
    fetchQuote(null, couponRef.current)
      .then((q) => {
        applyQuote(q);
        if (q.lines.length) {
          trackBeginCheckout(
            q.subtotalCents,
            q.lines.map((l) => ({ id: l.variantId, name: l.productName, priceCents: l.totalCents / l.quantity, quantity: l.quantity })),
          );
        }
        // Refazendo um pedido: dados do cliente e endereço de antes; o CEP recalcula o frete.
        const saved = takePrefill();
        if (saved) {
          setPrefill(saved);
          if (saved.address) setAddress(saved.address);
          if (saved.cep && q.shippingNeedsZip !== false) onCepChange(saved.cep);
        }
      })
      .catch(() => setErrors(["Não foi possível carregar o carrinho."]));
    // Só ao abrir o checkout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCepChange(value: string) {
    const masked = digits(value).slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2");
    setCep(masked);
    const zip = digits(masked);
    if (zip.length !== 8) return;

    const id = ++requestId.current;
    setCepStatus("loading");
    const [viaCep, q] = await Promise.all([
      fetch(`https://viacep.com.br/ws/${zip}/json/`)
        .then((r) => r.json())
        .catch(() => null),
      fetchQuote(zip, couponRef.current).catch(() => null),
    ]);
    if (id !== requestId.current) return;

    if (!viaCep || viaCep.erro) {
      setCepStatus("notfound");
    } else {
      setCepStatus("idle");
      setAddress((a) => ({
        ...a,
        street: viaCep.logradouro || a.street,
        district: viaCep.bairro || a.district,
        city: viaCep.localidade || a.city,
        state: viaCep.uf || a.state,
      }));
    }
    if (q) {
      applyQuote(q);
      // Com CEP informado, sugere a entrega mais barata em vez da retirada.
      const firstDelivery = q.shippingOptions.find((o) => o.requiresAddress);
      if (firstDelivery) setShippingId(firstDelivery.id);
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setErrors([]);
    const form = new FormData(e.currentTarget);
    const option = quote?.shippingOptions.find((o) => o.id === shippingId);

    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: readCart(),
        shippingOptionId: shippingId,
        coupon: quote?.coupon?.code ?? null,
        address: option?.requiresAddress ? { ...address, cep: digits(cep) } : null,
        customer: {
          name: form.get("name"),
          email: form.get("email"),
          cpf: form.get("cpf"),
          phone: form.get("phone"),
        },
        whatsappOptIn: form.get("whatsapp_optin") === "on",
      }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);

    if (!res?.ok || !data?.token) {
      setErrors(data?.errors ?? ["Não foi possível criar o pedido. Tente novamente."]);
      setSubmitting(false);
      return;
    }
    clearCart();
    forgetCoupon();
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
  const couponCents = quote.coupon?.discountCents ?? 0;
  const total = quote.subtotalCents - couponCents + (shipping?.priceCents ?? 0);
  const blocked = quote.problems.length > 0;
  // Mesmas contas do servidor (lib/promotions e lib/orders): só exibição; o pedido é recalculado lá.
  // O Pix desconta sobre os produtos já com o cupom.
  const pixDiscount = quote.pixDiscountPercent ? Math.floor(((quote.subtotalCents - couponCents) * quote.pixDiscountPercent) / 100) : 0;
  const pickupOnly = quote.shippingNeedsZip === false;
  const missingForFreeShipping =
    quote.freeShippingMinCents && !pickupOnly ? Math.max(0, quote.freeShippingMinCents - quote.subtotalCents) : 0;
  const zipReady = digits(cep).length === 8;
  const setField = (field: keyof Address) => (e: { target: { value: string } }) =>
    setAddress((a) => ({ ...a, [field]: e.target.value }));

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <section>
        <h2 className="mb-3 font-semibold">Resumo</h2>
        <ul className="divide-y rounded-xl border bg-white text-sm shadow-sm">
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
        <h2 className="font-semibold">Seus dados</h2>
        <input name="name" required autoComplete="name" placeholder="Nome completo" defaultValue={prefill?.name} className={inputClass} />
        <input name="email" type="email" required autoComplete="email" placeholder="E-mail" defaultValue={prefill?.email} className={inputClass} />
        <div className="grid grid-cols-2 gap-3">
          <input name="cpf" required inputMode="numeric" placeholder="CPF" autoFocus={!!prefill} className={inputClass} />
          <input name="phone" type="tel" required autoComplete="tel" placeholder="Celular com DDD" defaultValue={prefill?.phone} className={inputClass} />
        </div>
        {quote.whatsappOptIn && (
          <label className="flex items-start gap-2 text-sm text-neutral-700">
            <input type="checkbox" name="whatsapp_optin" className="mt-0.5" />
            <span>Quero receber novidades e promoções da loja pelo WhatsApp (dá para sair quando quiser).</span>
          </label>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Entrega</h2>
        {/* Loja só com retirada: sem CEP, só a opção de retirada abaixo. */}
        <div className={`flex-wrap items-center gap-3 ${pickupOnly ? "hidden" : "flex"}`}>
          <input
            value={cep}
            onChange={(e) => onCepChange(e.target.value)}
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="CEP"
            aria-label="CEP"
            className="w-36 rounded-lg border px-3 py-2.5 text-sm"
          />
          {cepStatus === "loading" && <span className="text-sm text-neutral-500">Calculando frete…</span>}
          {cepStatus === "notfound" && <span className="text-sm text-red-700">CEP não encontrado.</span>}
          {!zipReady && cepStatus === "idle" && (
            <span className="text-sm text-neutral-500">Informe o CEP para ver as opções de entrega.</span>
          )}
          <a
            href="https://buscacepinter.correios.com.br/app/endereco/index.php"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-neutral-500 underline"
          >
            Não sei meu CEP
          </a>
        </div>

        {quote.shippingError && zipReady && <p className="text-sm text-amber-700">{quote.shippingError}</p>}

        <div className="space-y-2">
          {quote.shippingOptions.map((o) => (
            <label
              key={o.id}
              className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm transition ${
                shippingId === o.id ? "border-2" : "hover:border-neutral-400"
              }`}
              style={shippingId === o.id ? { borderColor: "var(--brand)" } : undefined}
            >
              <span className="flex items-center gap-3">
                <input type="radio" name="shipping" checked={shippingId === o.id} onChange={() => setShippingId(o.id)} />
                <span>
                  <span className="font-medium">{o.name}</span>
                  {o.deliveryDays != null && (
                    <span className="block text-neutral-500">
                      {o.deliveryDays === 0
                        ? "no mesmo dia"
                        : `até ${o.deliveryDays} ${o.deliveryDays === 1 ? "dia útil" : "dias úteis"}`}
                    </span>
                  )}
                </span>
              </span>
              <span className="text-right font-medium">
                {o.originalPriceCents && <span className="mr-2 text-neutral-400 line-through">{formatBRL(o.originalPriceCents)}</span>}
                {o.priceCents === 0 ? <span className="text-emerald-700">Grátis</span> : formatBRL(o.priceCents)}
              </span>
            </label>
          ))}
        </div>

        {shipping?.requiresAddress && (
          <div className="grid gap-3 rounded-xl border bg-neutral-50 p-4 sm:grid-cols-6">
            <input value={address.street} onChange={setField("street")} required autoComplete="address-line1" placeholder="Rua" className={`${inputClass} sm:col-span-4`} />
            <input value={address.number} onChange={setField("number")} required placeholder="Número" className={`${inputClass} sm:col-span-2`} />
            <input value={address.complement} onChange={setField("complement")} autoComplete="address-line2" placeholder="Complemento (opcional)" className={`${inputClass} sm:col-span-3`} />
            <input value={address.district} onChange={setField("district")} required placeholder="Bairro" className={`${inputClass} sm:col-span-3`} />
            <input value={address.city} onChange={setField("city")} required autoComplete="address-level2" placeholder="Cidade" className={`${inputClass} sm:col-span-4`} />
            <input value={address.state} onChange={(e) => setAddress((a) => ({ ...a, state: e.target.value.toUpperCase().slice(0, 2) }))} required autoComplete="address-level1" placeholder="UF" className={`${inputClass} sm:col-span-2`} />
          </div>
        )}
      </section>

      <section className="space-y-2 text-sm">
        <h2 className="font-semibold">Cupom de desconto</h2>
        {quote.coupon ? (
          <p className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-emerald-900">
            <span>
              <strong>{quote.coupon.code}</strong> · {quote.coupon.label}
            </span>
            <button type="button" onClick={() => applyCoupon(null)} disabled={couponLoading} className="text-xs font-medium underline">
              Remover
            </button>
          </p>
        ) : (
          <div className="flex gap-2">
            <input
              value={couponInput}
              onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (couponInput.trim()) applyCoupon(couponInput.trim());
                }
              }}
              placeholder="Tem um cupom?"
              aria-label="Cupom de desconto"
              autoCapitalize="characters"
              className="w-full max-w-xs rounded-lg border px-3 py-2.5 text-sm uppercase"
            />
            <button
              type="button"
              onClick={() => applyCoupon(couponInput.trim())}
              disabled={!couponInput.trim() || couponLoading}
              className="rounded-lg border px-4 py-2.5 text-sm font-medium transition hover:border-neutral-400 disabled:opacity-50"
            >
              {couponLoading ? "Conferindo…" : "Aplicar"}
            </button>
          </div>
        )}
        {couponError && <p className="text-red-700">{couponError}</p>}
      </section>

      <section className="space-y-1 border-t pt-4 text-sm">
        <p className="flex justify-between"><span>Subtotal</span><span>{formatBRL(quote.subtotalCents)}</span></p>
        {couponCents > 0 && (
          <p className="flex justify-between text-emerald-700"><span>Cupom {quote.coupon?.code}</span><span>−{formatBRL(couponCents)}</span></p>
        )}
        <p className="flex justify-between"><span>Entrega</span><span>{shipping?.priceCents ? formatBRL(shipping.priceCents) : "Grátis"}</span></p>
        <p className="flex justify-between text-base font-semibold"><span>Total</span><span>{formatBRL(total)}</span></p>
        {pixDiscount > 0 && (
          <p className="flex justify-between font-medium text-emerald-700">
            <span>No Pix ({quote.pixDiscountPercent}% de desconto)</span>
            <span>{formatBRL(total - pixDiscount)}</span>
          </p>
        )}
        {missingForFreeShipping > 0 && (
          <p className="pt-1 text-neutral-600">
            Faltam <strong>{formatBRL(missingForFreeShipping)}</strong> em produtos para ganhar frete grátis.
          </p>
        )}
      </section>

      {errors.length > 0 && (
        <ul className="space-y-1 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {errors.map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      )}

      <button
        type="submit"
        disabled={submitting || blocked || !shipping || cepStatus === "loading"}
        className="w-full rounded-lg px-4 py-3 font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-50"
        style={{ background: "var(--brand)" }}
      >
        {submitting ? "Criando pedido…" : "Ir para o pagamento"}
      </button>
      <p className="text-center text-xs text-neutral-500">
        Ao continuar, você concorda com a{" "}
        <Link href="/politica-de-privacidade" className="underline">Política de privacidade</Link> e a{" "}
        <Link href="/trocas-e-devolucoes" className="underline">Política de trocas e devoluções</Link>.
      </p>
    </form>
  );
}
