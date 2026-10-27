"use client";

import { useState } from "react";
import { formatDocument } from "@/lib/format";
import { onlyDigits } from "@/lib/validation";
import { POLICY_TEMPLATE_DATE, policyToText, privacyPolicyTemplate, returnsPolicyTemplate, type PolicyStore } from "@/lib/policies";

export type PolicyBase = Omit<PolicyStore, "legalName" | "document" | "address" | "about">;

// Modelo montado com o que está digitado agora em Dados da empresa (mesmo que ainda não salvo).
function buildTemplate(kind: "privacy" | "returns", base: PolicyBase, form: HTMLFormElement | null) {
  const field = (name: string) => String(new FormData(form ?? undefined).get(name) ?? "").trim() || null;
  const doc = onlyDigits(field("document") ?? "");
  const store: PolicyStore = {
    ...base,
    legalName: field("legal_name"),
    document: doc.length === 11 || doc.length === 14 ? doc : null,
    address: field("address"),
    about: field("about"),
  };
  return policyToText(kind === "privacy" ? privacyPolicyTemplate(store) : returnsPolicyTemplate(store));
}

export type LegalSettings = {
  legal_name: string | null;
  document: string | null;
  address: string | null;
  privacy_policy: string | null;
  returns_policy: string | null;
};

const input = "w-full rounded-lg border px-3 py-2 text-sm";

// Dados da empresa (rodapé da loja) e políticas. Fica dentro do formulário de Configurações.
export function LegalSection({
  legal,
  about,
  policyBase,
  storeUrl,
}: {
  legal: LegalSettings;
  about: string | null | undefined; // undefined = coluna ainda não existe (SQL 20261031000000)
  policyBase: PolicyBase;
  storeUrl: string | null;
}) {
  return (
    <>
      <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
        <div>
          <h2 className="font-semibold">Dados da empresa</h2>
          <p className="text-xs text-neutral-500">
            Aparecem no rodapé de todas as páginas da loja. A lei do comércio eletrônico (Decreto 7.962/2013) exige nome,
            CPF ou CNPJ e endereço visíveis.
          </p>
        </div>
        <input type="hidden" name="legal_enabled" value="1" />
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-neutral-700">Nome empresarial (razão social)</span>
          <input name="legal_name" defaultValue={legal.legal_name ?? ""} placeholder="Ex.: Minha Loja Ltda" className={input} />
          <span className="text-xs text-neutral-500">Se você vende como pessoa física, use o seu nome completo.</span>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-neutral-700">CNPJ ou CPF</span>
          <input
            name="document"
            inputMode="numeric"
            defaultValue={legal.document ? formatDocument(legal.document) : ""}
            placeholder="00.000.000/0001-00"
            className={input}
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-neutral-700">Endereço</span>
          <input
            name="address"
            defaultValue={legal.address ?? ""}
            placeholder="Rua, número, bairro, cidade/UF, CEP"
            className={input}
          />
          <span className="text-xs text-neutral-500">O endereço da empresa (o mesmo do CNPJ), não precisa ser onde os pedidos saem.</span>
        </label>
        {about !== undefined && (
          <label className="block space-y-1 text-sm">
            <input type="hidden" name="about_enabled" value="1" />
            <span className="font-medium text-neutral-700">Quem somos (opcional)</span>
            <textarea
              name="about"
              rows={4}
              maxLength={1000}
              defaultValue={about ?? ""}
              placeholder="Ex.: Somos uma loja de família, há 10 anos em São Paulo, especializada em cabelos naturais."
              className={input}
            />
            <span className="text-xs text-neutral-500">
              Aparece na seção &quot;Quem somos&quot; da página de Trocas e devoluções. Em branco, a seção mostra só o nome da loja.
            </span>
          </label>
        )}
      </section>

      <section className="space-y-5 rounded-xl border bg-white p-5 shadow-sm">
        <div>
          <h2 className="font-semibold">Políticas da loja</h2>
          <p className="text-xs text-neutral-500">
            A loja já publica um modelo de cada política, com os seus dados, cobrindo o que o Código de Defesa do Consumidor
            e a LGPD exigem. Deixe a caixa vazia para usar o modelo ou escreva o seu próprio texto. Separe os parágrafos
            com uma linha em branco; uma linha curta, sem ponto final, vira título.
          </p>
        </div>
        <PolicyField
          name="returns_policy"
          label="Trocas e devoluções"
          path="/trocas-e-devolucoes"
          value={legal.returns_policy}
          template={(form) => buildTemplate("returns", policyBase, form)}
          storeUrl={storeUrl}
        />
        {legal.privacy_policy && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
            O modelo da política de privacidade foi atualizado em {POLICY_TEMPLATE_DATE}: agora fala da agenda, dos avisos e das novidades pelo WhatsApp, do
            cupom de aniversário e das avaliações (só do que a sua loja usa). Como você usa um texto próprio, ele não muda sozinho: confira se ele cobre esses
            pontos, ou apague o texto para usar o modelo.
          </p>
        )}
        <PolicyField
          name="privacy_policy"
          label="Política de privacidade"
          path="/politica-de-privacidade"
          value={legal.privacy_policy}
          template={(form) => buildTemplate("privacy", policyBase, form)}
          storeUrl={storeUrl}
        />
      </section>
    </>
  );
}

function PolicyField({
  name,
  label,
  path,
  value,
  template,
  storeUrl,
}: {
  name: string;
  label: string;
  path: string;
  value: string | null;
  template: (form: HTMLFormElement | null) => string;
  storeUrl: string | null;
}) {
  const [text, setText] = useState(value ?? "");
  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-neutral-700">{label}</span>
        <span className="flex gap-3">
          {storeUrl && (
            <a href={`${storeUrl}${path}`} target="_blank" rel="noopener" className="font-medium text-primary-700 hover:underline">
              Ver na loja
            </a>
          )}
          <button
            type="button"
            onClick={(e) => (!text || confirm("Trocar o texto atual pelo modelo?")) && setText(template(e.currentTarget.form))}
            className="font-medium text-primary-700 hover:underline"
          >
            Partir do modelo
          </button>
        </span>
      </div>
      <textarea
        name={name}
        rows={text ? 12 : 3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Vazio: a loja mostra o modelo padrão."
        className={`${input} font-normal leading-relaxed`}
      />
    </div>
  );
}
