"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "../actions";

const inputClass = "w-full rounded-lg border px-3 py-2.5 text-sm";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, null);

  return (
    <form action={action} className="mt-6 space-y-4">
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium text-neutral-700">E-mail</span>
        <input name="email" type="email" required autoComplete="email" className={inputClass} />
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium text-neutral-700">Senha</span>
        <input name="password" type="password" required autoComplete="current-password" className={inputClass} />
      </label>
      {state?.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 disabled:opacity-50"
      >
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
