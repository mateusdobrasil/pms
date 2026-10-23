"use client";

import { useState } from "react";
import { centsToInput } from "@/lib/money";
import { CARRIER_OPTIONS, MAX_LOCAL_AREAS, type Carriers, type LocalArea } from "@/lib/shipping-settings";

export type ShippingFormSettings = {
  pickup: boolean;
  carriers: Carriers;
  localDelivery: boolean;
  areas: LocalArea[];
  melhorEnvioReady: boolean; // token do Melhor Envio configurado pelo suporte (/admin)
};

type Row = { key: number; city: string; state: string; price: string; days: string };

const cell = "w-full rounded-lg border px-2 py-2 text-sm";
let nextKey = 0;
const toRow = (a?: LocalArea): Row => ({
  key: nextKey++,
  city: a?.city ?? "",
  state: a?.state ?? "",
  price: a ? centsToInput(a.priceCents) : "",
  days: a?.deliveryDays == null ? "" : String(a.deliveryDays),
});

// Formas de entrega combináveis: retirada, transportadoras do Melhor Envio e entrega própria por cidade.
// Fica dentro do formulário de Configurações; as cidades vão num campo escondido em JSON.
export function ShippingSection({ shipping, originZip }: { shipping: ShippingFormSettings; originZip: string }) {
  const [pickup, setPickup] = useState(shipping.pickup);
  const [carriers, setCarriers] = useState<Carriers>(shipping.carriers);
  const [local, setLocal] = useState(shipping.localDelivery);
  const [rows, setRows] = useState<Row[]>(() => (shipping.areas.length ? shipping.areas.map(toRow) : [toRow()]));

  const setRow = (key: number, field: keyof Omit<Row, "key">, value: string) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  const filledRows = rows.filter((r) => r.city.trim());
  const noCarrierYet = carriers !== "none" && (!shipping.melhorEnvioReady || originZip.replace(/\D/g, "").length !== 8);
  const nothing = !pickup && carriers === "none" && !(local && filledRows.length);

  return (
    <section id="entrega" className="scroll-mt-24 space-y-5 rounded-xl border bg-white p-5 shadow-sm">
      <div>
        <h2 className="font-semibold">Entrega</h2>
        <p className="text-xs text-neutral-500">Marque como o cliente pode receber o pedido. Dá para combinar as formas.</p>
      </div>
      <input type="hidden" name="shipping_enabled" value="1" />
      <input
        type="hidden"
        name="local_areas"
        value={JSON.stringify(rows.map(({ city, state, price, days }) => ({ city, state, price, days })))}
      />

      <label className="flex cursor-pointer gap-3 text-sm">
        <input type="checkbox" name="shipping_pickup" checked={pickup} onChange={(e) => setPickup(e.target.checked)} className="mt-0.5" />
        <span>
          <span className="block font-medium">Retirada na loja</span>
          <span className="block text-xs text-neutral-500">O cliente busca o pedido na loja, sem frete.</span>
        </span>
      </label>

      <fieldset className="space-y-2 text-sm">
        <legend className="mb-2 font-medium">Correios e transportadoras</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {CARRIER_OPTIONS.map((c) => (
            <label
              key={c.value}
              className={`flex cursor-pointer gap-2 rounded-lg border px-3 py-2.5 transition ${
                carriers === c.value ? "border-primary-500 bg-primary-50" : "hover:border-neutral-400"
              }`}
            >
              <input
                type="radio"
                name="shipping_carriers"
                value={c.value}
                checked={carriers === c.value}
                onChange={() => setCarriers(c.value)}
                className="mt-0.5"
              />
              <span>
                <span className="block font-medium">{c.label}</span>
                <span className="block text-xs text-neutral-500">{c.description}</span>
              </span>
            </label>
          ))}
        </div>
        {carriers !== "none" && !shipping.melhorEnvioReady && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
            O Melhor Envio ainda não está ligado na sua loja. Fale com o suporte do PMS app para ativar. Até lá, essa opção
            não aparece no checkout.
          </p>
        )}
        {carriers !== "none" && shipping.melhorEnvioReady && originZip.replace(/\D/g, "").length !== 8 && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
            Preencha o CEP de origem (em Contato e envio) para o frete ser calculado.
          </p>
        )}
      </fieldset>

      <div className="space-y-3 text-sm">
        <label className="flex cursor-pointer gap-3">
          <input type="checkbox" name="local_delivery_enabled" checked={local} onChange={(e) => setLocal(e.target.checked)} className="mt-0.5" />
          <span>
            <span className="block font-medium">Entrega própria</span>
            <span className="block text-xs text-neutral-500">
              Você (ou alguém da loja) leva o pedido até o cliente, nas cidades abaixo. A cidade do cliente é conferida
              pelo CEP.
            </span>
          </span>
        </label>

        {local && (
          <div className="space-y-2 rounded-lg bg-neutral-50 p-3">
            <div className="hidden grid-cols-[1fr_4rem_6rem_5rem_2rem] gap-2 text-xs font-medium text-neutral-600 sm:grid">
              <span>Cidade</span>
              <span>UF</span>
              <span>Preço (R$)</span>
              <span>Prazo (dias)</span>
              <span />
            </div>
            {rows.map((r) => (
              <div key={r.key} className="grid grid-cols-[1fr_4rem] gap-2 sm:grid-cols-[1fr_4rem_6rem_5rem_2rem]">
                <input value={r.city} onChange={(e) => setRow(r.key, "city", e.target.value)} placeholder="Cidade" aria-label="Cidade" className={cell} />
                <input
                  value={r.state}
                  onChange={(e) => setRow(r.key, "state", e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2))}
                  placeholder="UF"
                  aria-label="UF"
                  className={`${cell} uppercase`}
                />
                <input value={r.price} onChange={(e) => setRow(r.key, "price", e.target.value)} inputMode="decimal" placeholder="0,00" aria-label="Preço em reais" className={cell} />
                <input
                  value={r.days}
                  onChange={(e) => setRow(r.key, "days", e.target.value.replace(/\D/g, "").slice(0, 2))}
                  inputMode="numeric"
                  placeholder="—"
                  aria-label="Prazo em dias"
                  className={cell}
                />
                <button
                  type="button"
                  onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : [toRow()]))}
                  aria-label={`Remover ${r.city || "cidade"}`}
                  className="col-span-2 rounded-lg px-2 py-2 text-left text-red-700 hover:bg-red-50 sm:col-span-1 sm:text-center"
                >
                  <span className="sm:hidden">Remover cidade</span>
                  <span aria-hidden="true" className="hidden sm:inline">×</span>
                </button>
              </div>
            ))}
            {rows.length < MAX_LOCAL_AREAS && (
              <button type="button" onClick={() => setRows((rs) => [...rs, toRow()])} className="rounded-lg border bg-white px-3 py-2 font-medium">
                + Adicionar cidade
              </button>
            )}
            <p className="text-xs text-neutral-500">
              Preço vazio ou 0 = entrega grátis. Prazo em dias (0 = no mesmo dia); deixe vazio para não informar.
            </p>
          </div>
        )}
      </div>

      {nothing && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Escolha pelo menos uma forma de entrega: sem nenhuma, a loja não consegue fechar pedidos.
        </p>
      )}
      {!nothing && !pickup && !(local && filledRows.length) && noCarrierYet && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Sem retirada e sem entrega própria, a loja depende do Melhor Envio, que ainda não está funcionando: não dá para
          salvar assim.
        </p>
      )}
    </section>
  );
}
