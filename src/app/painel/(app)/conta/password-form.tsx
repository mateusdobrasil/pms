"use client";

import { useActionState, useEffect, useRef } from "react";
import { changePassword, type PasswordState } from "./actions";

const input = "w-full rounded-lg border px-3 py-2 text-sm";

export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePassword, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="font-semibold">Trocar senha</h2>
      <label className="block space-y-1 text-sm">
        <span className="font-medium text-neutral-700">Senha atual</span>
        <input name="current" type="password" required autoComplete="current-password" className={input} />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium text-neutral-700">Nova senha</span>
        <input name="next" type="password" required minLength={8} autoComplete="new-password" className={input} />
        <span className="text-xs text-neutral-500">Pelo menos 8 caracteres.</span>
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium text-neutral-700">Confirme a nova senha</span>
        <input name="confirm" type="password" required minLength={8} autoComplete="new-password" className={input} />
      </label>
      {state?.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state?.ok && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.ok}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 disabled:opacity-50"
      >
        {pending ? "Salvando…" : "Trocar senha"}
      </button>
    </form>
  );
}
