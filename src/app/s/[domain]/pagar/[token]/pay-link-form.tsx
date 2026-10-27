"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { forgetCoupon, savedCoupon } from "@/lib/coupon-link";

const inputClass = "w-full rounded-lg border px-3 py-2.5 text-sm";

// Dados do cliente (os mesmos do checkout: o Pix e o cartão pedem CPF e e-mail). Depois, a página do pedido cobra.
// endpoint: quem cria o pedido (link de pagamento ou compra de pacote). withCoupon: campo de cupom (pacotes),
// já preenchido com o cupom de um link da loja (?cupom=); o servidor confere.
export function PayLinkForm({ endpoint, withCoupon = false }: { endpoint: string; withCoupon?: boolean }) {
  const router = useRouter();
  const couponInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (couponInput.current && !couponInput.current.value) couponInput.current.value = savedCoupon() ?? "";
  }, []);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setErrors([]);
    const form = new FormData(e.currentTarget);
    const coupon = String(form.get("coupon") ?? "").trim();
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer: { name: form.get("name"), email: form.get("email"), cpf: form.get("cpf"), phone: form.get("phone") },
        ...(coupon ? { coupon } : {}),
      }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (!res?.ok || !data?.token) {
      setErrors(data?.errors ?? ["Não foi possível continuar. Tente novamente."]);
      setSubmitting(false);
      return;
    }
    if (withCoupon) forgetCoupon();
    router.push(`/pedido/${data.token}`);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <h2 className="font-semibold">Seus dados</h2>
      <input name="name" required autoComplete="name" placeholder="Nome completo" className={inputClass} />
      <input name="email" type="email" required autoComplete="email" placeholder="E-mail (recebe o comprovante)" className={inputClass} />
      <div className="grid grid-cols-2 gap-3">
        <input name="cpf" required inputMode="numeric" placeholder="CPF" className={inputClass} />
        <input name="phone" type="tel" required autoComplete="tel" placeholder="Celular com DDD" className={inputClass} />
      </div>
      {withCoupon && (
        <input
          ref={couponInput}
          name="coupon"
          placeholder="Cupom de desconto (opcional)"
          aria-label="Cupom de desconto"
          autoCapitalize="characters"
          className={`${inputClass} uppercase`}
        />
      )}
      {errors.length > 0 && (
        <ul className="space-y-1 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {errors.map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg px-4 py-3 font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-50"
        style={{ background: "var(--brand)" }}
      >
        {submitting ? "Abrindo o pagamento…" : "Ir para o pagamento"}
      </button>
      <p className="text-center text-xs text-neutral-500">
        Pagamento processado pelo Mercado Pago. Ao continuar, você concorda com a{" "}
        <Link href="/politica-de-privacidade" className="underline">Política de privacidade</Link>.
      </p>
    </form>
  );
}
