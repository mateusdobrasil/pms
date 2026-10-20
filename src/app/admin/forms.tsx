"use client";

import { useActionState } from "react";
import { addDomain, addMember, createStore, saveSecrets, type AdminState } from "./actions";

const input = "w-full rounded-lg border px-3 py-2 text-sm";
const primaryButton =
  "rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 disabled:opacity-50";

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
          Anote e envie ao lojista agora: ela não será mostrada de novo. Ele pode trocar depois.
        </p>
      )}
    </div>
  );
}

export function CreateStoreForm() {
  const [state, action, pending] = useActionState<AdminState, FormData>(createStore, null);
  return (
    <form action={action} className="space-y-3 rounded-xl border bg-white p-5 shadow-sm">
      <label className="block space-y-1 text-sm">
        <span className="font-medium text-neutral-700">Nome da loja</span>
        <input name="name" required className={input} />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium text-neutral-700">Identificador (opcional)</span>
        <input name="slug" placeholder="gerado a partir do nome" className={input} />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium text-neutral-700">E-mail do dono</span>
        <input name="ownerEmail" type="email" required className={input} />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium text-neutral-700">Domínio (opcional)</span>
        <input name="domain" placeholder="www.minhaloja.com.br" className={input} />
      </label>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Criando…" : "Criar loja"}
      </button>
    </form>
  );
}

export function AddDomainForm({ storeId }: { storeId: string }) {
  const [state, action, pending] = useActionState<AdminState, FormData>(addDomain, null);
  return (
    <form action={action} className="space-y-2">
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
  return (
    <form action={action} className="space-y-2">
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
}: {
  storeId: string;
  configured: Record<string, boolean>;
  originZip: string | null;
}) {
  const [state, action, pending] = useActionState<AdminState, FormData>(saveSecrets, null);
  return (
    <form action={action} className="space-y-4">
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
