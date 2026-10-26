"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { formatBRL, parseBRL } from "@/lib/money";
import { ThumbImage } from "@/lib/thumb-image";
import { COUNTER_PAYMENTS, type CounterPayment, changeFor, counterTotal } from "@/lib/counter";
import { registerCounterSale } from "./actions";

export type PosVariant = { variantId: string; label: string; priceCents: number; stock: number; image: string | null };
export type PosService = { id: string; name: string; priceCents: number; pros: { id: string; name: string }[] };
export type PosPackage = { id: string; name: string; sessions: number; priceCents: number };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const input = "w-full rounded-md border bg-white px-3 py-2 text-sm";

// Caixa do balcão: escolhe os produtos e/ou serviços (atendimento sem horário, com o profissional),
// a forma de pagamento e (opcional) o cliente.
export function CounterPos({ variants, services = [], packages = [] }: { variants: PosVariant[]; services?: PosService[]; packages?: PosPackage[] }) {
  const [tab, setTab] = useState<"products" | "services" | "packages">(variants.length === 0 && services.length > 0 ? "services" : "products");
  const [pkgCart, setPkgCart] = useState<Map<string, number>>(new Map());
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<Map<string, number>>(new Map());
  const [svcCart, setSvcCart] = useState<Map<string, number>>(new Map()); // "serviço:profissional" → quantidade
  const [picking, setPicking] = useState<string | null>(null); // serviço esperando a escolha do profissional
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
  const svcLines = [...svcCart.entries()]
    .map(([key, qty]) => {
      const [sid, pid] = key.split(":");
      const sv = services.find((x) => x.id === sid);
      return sv ? { key, sv, pro: sv.pros.find((p) => p.id === pid)!, qty } : null;
    })
    .filter((l): l is NonNullable<typeof l> => !!l?.pro);
  const pkgLines = [...pkgCart.entries()].map(([id, qty]) => ({ p: packages.find((x) => x.id === id)!, qty })).filter((l) => l.p);
  const subtotal =
    lines.reduce((s, l) => s + l.v.priceCents * l.qty, 0) + svcLines.reduce((s, l) => s + l.sv.priceCents * l.qty, 0) + pkgLines.reduce((s, l) => s + l.p.priceCents * l.qty, 0);
  const empty = lines.length === 0 && svcLines.length === 0 && pkgLines.length === 0;
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

  function addService(key: string, delta: number) {
    setMessage(null);
    setPicking(null);
    setSvcCart((c) => {
      const next = new Map(c);
      const qty = Math.min(20, (next.get(key) ?? 0) + delta);
      if (qty <= 0) next.delete(key);
      else next.set(key, qty);
      return next;
    });
  }

  function addPackage(id: string, delta: number) {
    setMessage(null);
    setPkgCart((c) => {
      const next = new Map(c);
      const qty = Math.min(5, (next.get(id) ?? 0) + delta);
      if (qty <= 0) next.delete(id);
      else next.set(id, qty);
      return next;
    });
  }

  function finish() {
    startTransition(async () => {
      const r = await registerCounterSale({
        items: lines.map((l) => ({ variantId: l.v.variantId, quantity: l.qty })),
        services: svcLines.map((l) => ({ serviceId: l.sv.id, professionalId: l.pro.id, quantity: l.qty })),
        packages: pkgLines.map((l) => ({ packageId: l.p.id, quantity: l.qty })),
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
      setSvcCart(new Map());
      setPkgCart(new Map());
      setPayment(null);
      setDiscount("");
      setReceived("");
      setCustomer({ name: "", phone: "", email: "" });
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <section className="space-y-3">
        {(services.length > 0 || packages.length > 0) && (
          <div className="flex gap-1 rounded-md border bg-white p-1 text-sm">
            {(["products", ...(services.length ? ["services" as const] : []), ...(packages.length ? ["packages" as const] : [])] as const).map((t) => (
              <button key={t} type="button" onClick={() => setTab(t)} className={`flex-1 rounded px-3 py-1.5 font-medium ${tab === t ? "bg-neutral-900 text-white" : "hover:bg-neutral-50"}`}>
                {t === "products" ? "Produtos" : t === "services" ? "Serviços" : "Pacotes"}
              </button>
            ))}
          </div>
        )}
        {tab === "packages" ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {packages.map((pk) => (
              <button key={pk.id} type="button" onClick={() => addPackage(pk.id, 1)} className="rounded-lg border bg-white p-3 text-left text-sm shadow-sm transition hover:border-neutral-400">
                <span className="block font-medium">{pk.name}</span>
                <span className="text-neutral-600">{formatBRL(pk.priceCents)}</span>
                <span className="block text-xs text-neutral-400">{pk.sessions} sessões · {formatBRL(Math.round(pk.priceCents / pk.sessions))} cada</span>
              </button>
            ))}
            <p className="text-xs text-neutral-500 sm:col-span-2 xl:col-span-3">O pacote fica no nome do cliente: informe nome e celular em &quot;Identificar o cliente&quot;.</p>
          </div>
        ) : tab === "services" ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {services.map((sv) => (
              <div key={sv.id} className="rounded-lg border bg-white p-3 text-sm shadow-sm">
                <button
                  type="button"
                  onClick={() => (sv.pros.length === 1 ? addService(`${sv.id}:${sv.pros[0].id}`, 1) : setPicking(picking === sv.id ? null : sv.id))}
                  className="w-full text-left"
                >
                  <span className="block font-medium">{sv.name}</span>
                  <span className="text-neutral-600">{formatBRL(sv.priceCents)}</span>
                  {sv.pros.length === 1 && <span className="block text-xs text-neutral-400">com {sv.pros[0].name}</span>}
                </button>
                {picking === sv.id && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    <span className="w-full text-xs text-neutral-500">Quem atendeu?</span>
                    {sv.pros.map((p) => (
                      <button key={p.id} type="button" onClick={() => addService(`${sv.id}:${p.id}`, 1)} className="rounded-md border px-2 py-1 text-xs font-medium hover:border-neutral-400">
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
        <>
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
        </>
        )}
      </section>

      <aside className="space-y-4 rounded-xl border bg-white p-4 text-sm shadow-sm lg:sticky lg:top-4 lg:self-start">
        <h2 className="font-semibold">Venda</h2>
        {empty ? (
          <p className="text-neutral-500">Toque nos {services.length || packages.length ? "produtos, serviços ou pacotes" : "produtos"} para adicionar.</p>
        ) : (
          <ul className="divide-y">
            {pkgLines.map((l) => (
              <li key={l.p.id} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium">Pacote: {l.p.name}</span>
                  <span className="text-neutral-500">{formatBRL(l.p.priceCents * l.qty)}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => addPackage(l.p.id, -1)} className="h-8 w-8 rounded-md border" aria-label="Menos um">−</button>
                  <span className="w-6 text-center">{l.qty}</span>
                  <button type="button" onClick={() => addPackage(l.p.id, 1)} className="h-8 w-8 rounded-md border" aria-label="Mais um">+</button>
                </span>
              </li>
            ))}
            {svcLines.map((l) => (
              <li key={l.key} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{l.sv.name}</span>
                  <span className="text-neutral-500">com {l.pro.name} · {formatBRL(l.sv.priceCents * l.qty)}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => addService(l.key, -1)} className="h-8 w-8 rounded-md border" aria-label="Menos um">−</button>
                  <span className="w-6 text-center">{l.qty}</span>
                  <button type="button" onClick={() => addService(l.key, 1)} className="h-8 w-8 rounded-md border" aria-label="Mais um">+</button>
                </span>
              </li>
            ))}
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

        <details className="rounded-md bg-neutral-50 px-3 py-2" open={pkgLines.length > 0 || undefined}>
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
          disabled={pending || empty || !payment || (payment === "cash" && !!received && change == null)}
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
