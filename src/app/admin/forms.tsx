"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { submitKeepingValues } from "@/lib/form-submit";
import { addDomain, addMember, createStore, saveBilling, saveSecrets, updateBranding, type AdminState } from "./actions";
import { BILLING } from "@/lib/billing";
import { centsToInput, parseBRL } from "@/lib/money";

const input = "w-full rounded-lg border px-3 py-2 text-sm";
const primaryButton =
  "rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 disabled:opacity-50";

// Formulários de "adicionar": limpam os campos quando dá certo (no erro, mantêm o que foi digitado).
function useResetOnOk(state: AdminState) {
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);
  return formRef;
}

function Feedback({ state }: { state: AdminState }) {
  if (!state) return null;
  return (
    <div className="space-y-2 text-sm">
      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{state.error}</p>}
      {state.ok && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800">{state.ok}</p>}
      {state.password && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
          Senha temporária: <code className="rounded bg-white px-1.5 py-0.5 font-mono font-semibold">{state.password}</code>
          <br />
          Anote e envie ao lojista agora: ela não será mostrada de novo. Ele troca em Painel → Minha conta.
        </p>
      )}
    </div>
  );
}

// defaults: vindos de uma proposta aceita (/admin?nome=...&email=...).
export function CreateStoreForm({ defaults }: { defaults?: { name?: string; email?: string } }) {
  const [state, action, pending] = useActionState<AdminState, FormData>(createStore, null);
  return (
    <form onSubmit={submitKeepingValues(action)} className="space-y-3 rounded-xl border bg-white p-5 shadow-sm">
      <label className="block space-y-1 text-sm">
        <span className="font-medium text-neutral-700">Nome da loja</span>
        <input name="name" required defaultValue={defaults?.name} className={input} />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium text-neutral-700">Identificador (opcional)</span>
        <input name="slug" placeholder="gerado a partir do nome" className={input} />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium text-neutral-700">E-mail do dono</span>
        <input name="ownerEmail" type="email" required defaultValue={defaults?.email} className={input} />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium text-neutral-700">Domínio (opcional)</span>
        <input name="domain" placeholder="www.minhaloja.com.br" className={input} />
      </label>
      <ColorField defaultValue="#1f2937" />
      <LogoField />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Criando…" : "Criar loja"}
      </button>
    </form>
  );
}

export function AddDomainForm({ storeId }: { storeId: string }) {
  const [state, action, pending] = useActionState<AdminState, FormData>(addDomain, null);
  const formRef = useResetOnOk(state);
  return (
    <form ref={formRef} onSubmit={submitKeepingValues(action)} className="space-y-2">
      <input type="hidden" name="storeId" value={storeId} />
      <div className="flex gap-2">
        <input name="domain" required placeholder="www.minhaloja.com.br" className={input} />
        <button type="submit" disabled={pending} className={primaryButton}>Vincular</button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function AddMemberForm({ storeId }: { storeId: string }) {
  const [state, action, pending] = useActionState<AdminState, FormData>(addMember, null);
  const formRef = useResetOnOk(state);
  return (
    <form ref={formRef} onSubmit={submitKeepingValues(action)} className="space-y-2">
      <input type="hidden" name="storeId" value={storeId} />
      <div className="flex gap-2">
        <input name="email" type="email" required placeholder="email@lojista.com.br" className={input} />
        <button type="submit" disabled={pending} className={primaryButton}>Adicionar</button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

const SECRET_FIELDS = [
  { name: "gateway_access_token", label: "Mercado Pago — Access Token" },
  { name: "gateway_public_key", label: "Mercado Pago — Public Key" },
  { name: "gateway_webhook_secret", label: "Mercado Pago — assinatura secreta do webhook" },
  { name: "melhor_envio_token", label: "Melhor Envio — token" },
] as const;

export function SecretsForm({
  storeId,
  configured,
  originZip,
  meSandbox,
}: {
  storeId: string;
  configured: Record<string, boolean>;
  originZip: string | null;
  meSandbox: boolean;
}) {
  const [state, action, pending] = useActionState<AdminState, FormData>(saveSecrets, null);
  const formRef = useResetOnOk(state);
  return (
    <form ref={formRef} onSubmit={submitKeepingValues(action)} className="space-y-4">
      <input type="hidden" name="storeId" value={storeId} />
      {SECRET_FIELDS.map((f) => (
        <label key={f.name} className="block space-y-1 text-sm">
          <span className="flex items-center justify-between gap-2">
            <span className="font-medium text-neutral-700">{f.label}</span>
            {configured[f.name] ? (
              <span className="text-xs font-medium text-emerald-700">✓ configurado</span>
            ) : (
              <span className="text-xs text-neutral-400">não configurado</span>
            )}
          </span>
          <input
            name={f.name}
            type="password"
            autoComplete="off"
            placeholder={configured[f.name] ? "deixe vazio para manter" : ""}
            className={input}
          />
          {configured[f.name] && (
            <span className="flex items-center gap-2 text-xs text-neutral-500">
              <input type="checkbox" name={`clear_${f.name}`} /> remover
            </span>
          )}
        </label>
      ))}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="melhor_envio_sandbox" defaultChecked={meSandbox} />
        <span>Melhor Envio em <strong>sandbox</strong> (testes). Desmarque quando o token for de produção.</span>
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium text-neutral-700">CEP de origem (frete)</span>
        <input name="origin_zip" defaultValue={originZip ?? ""} inputMode="numeric" placeholder="00000-000" className={input} />
      </label>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Salvando…" : "Salvar configurações"}
      </button>
    </form>
  );
}

// Cor principal com seletor + campo de texto sincronizados.
function ColorField({ defaultValue }: { defaultValue: string }) {
  const [color, setColor] = useState(defaultValue);
  return (
    <div className="space-y-1 text-sm">
      <span className="font-medium text-neutral-700">Cor principal</span>
      <div className="flex items-center gap-2">
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-12 cursor-pointer rounded-lg border bg-white p-1" aria-label="Escolher cor" />
        <input name="primary_color" value={color} onChange={(e) => setColor(e.target.value)} className="w-28 rounded-lg border px-3 py-2 font-mono text-sm" />
        <span className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white" style={{ background: color }}>Prévia</span>
      </div>
    </div>
  );
}

// Arquivo do logo com prévia local; o servidor valida, otimiza e grava.
function LogoField({ currentUrl, onRemoveChange }: { currentUrl?: string | null; onRemoveChange?: (remove: boolean) => void }) {
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const [error, setError] = useState<string | null>(null);
  const [remove, setRemove] = useState(false);

  useEffect(() => () => {
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
  }, [preview]);

  return (
    <div className="space-y-2 text-sm">
      <span className="font-medium text-neutral-700">Logo {currentUrl === undefined && "(opcional)"}</span>
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid h-14 w-28 place-items-center overflow-hidden rounded-lg border bg-neutral-50">
          {preview && !remove ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Prévia do logo" className="max-h-12 max-w-24 object-contain" />
          ) : (
            <span className="text-xs text-neutral-400">sem logo</span>
          )}
        </div>
        <input
          name="logo"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const file = e.target.files?.[0];
            setError(null);
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) {
              setError("Máximo de 2 MB.");
              e.target.value = "";
              return;
            }
            setRemove(false);
            onRemoveChange?.(false);
            setPreview(URL.createObjectURL(file));
          }}
          className="max-w-full text-xs file:mr-2 file:rounded-md file:border file:bg-white file:px-2 file:py-1"
        />
        {currentUrl && (
          <label className="flex items-center gap-1 text-xs text-red-700">
            <input
              type="checkbox"
              name="removeLogo"
              checked={remove}
              onChange={(e) => {
                setRemove(e.target.checked);
                onRemoveChange?.(e.target.checked);
              }}
            />
            remover
          </label>
        )}
      </div>
      <p className="text-xs text-neutral-500">PNG com fundo transparente fica melhor. Até 2 MB; a plataforma otimiza o arquivo.</p>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}

export function BrandingForm({
  storeId,
  name,
  color,
  logoUrl,
}: {
  storeId: string;
  name: string;
  color: string;
  logoUrl: string | null;
}) {
  const [state, action, pending] = useActionState<AdminState, FormData>(updateBranding, null);
  return (
    <form onSubmit={submitKeepingValues(action)} className="space-y-4">
      <input type="hidden" name="storeId" value={storeId} />
      <label className="block space-y-1 text-sm">
        <span className="font-medium text-neutral-700">Nome da loja</span>
        <input name="name" required defaultValue={name} className={input} />
      </label>
      <ColorField defaultValue={color} />
      <LogoField currentUrl={logoUrl} />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Salvando…" : "Salvar identidade"}
      </button>
    </form>
  );
}

export function BillingForm({
  storeId,
  setupFee,
  monthlyFee,
  startsOn,
  dueOptions,
}: {
  storeId: string;
  setupFee: number;
  monthlyFee: number;
  startsOn: string | null;
  dueOptions: { value: string; label: string }[];
}) {
  const [state, action, pending] = useActionState<AdminState, FormData>(saveBilling, null);
  const [monthly, setMonthly] = useState(centsToInput(monthlyFee || null));
  return (
    <form onSubmit={submitKeepingValues(action)} className="space-y-3">
      <input type="hidden" name="storeId" value={storeId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-neutral-700">Implantação (R$)</span>
          <input
            name="setup_fee"
            defaultValue={centsToInput(setupFee || null)}
            inputMode="decimal"
            placeholder={`ex.: ${centsToInput(BILLING.setupFeeCents)} (vazio = isenta)`}
            className={input}
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-neutral-700">Mensalidade (R$)</span>
          <input
            name="monthly_fee"
            value={monthly}
            onChange={(e) => setMonthly(e.target.value)}
            inputMode="decimal"
            placeholder={`ex.: ${centsToInput(BILLING.monthlyFeeCents)} (vazio = isenta)`}
            className={input}
          />
        </label>
      </div>
      {(parseBRL(monthly) ?? 1) > 0 && monthly.trim() !== "" && (
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-neutral-700">1ª mensalidade vence em</span>
          <select name="billing_starts_on" defaultValue={startsOn ?? dueOptions[1]?.value} className={input}>
            {dueOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      )}
      <p className="text-xs text-neutral-500">
        A implantação vence {BILLING.setupDueDays} dias depois de salvar. Cada mensalidade é emitida {BILLING.issueDaysBefore} dias antes do dia {BILLING.dueDay} e
        enviada por e-mail; com mais de {BILLING.graceDays} dias de atraso a loja é suspensa e volta sozinha ao pagar. Deixar um valor vazio (ou 0) isenta e
        cancela o que estiver em aberto. Mudar o valor da implantação atualiza a fatura dela em aberto; o da mensalidade vale a partir da próxima fatura.
      </p>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Salvando…" : "Salvar cobrança"}
      </button>
    </form>
  );
}
