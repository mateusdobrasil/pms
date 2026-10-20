"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "../actions";

const inputClass = "w-full rounded-md border px-3 py-2 text-sm";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, null);

  return (
    <form action={action} className="mt-6 space-y-3">
      <input name="email" type="email" required autoComplete="email" placeholder="E-mail" className={inputClass} />
      <input
        name="password"
        type="password"
        required
        autoComplete="current-password"
        placeholder="Senha"
        className={inputClass}
      />
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
