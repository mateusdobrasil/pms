"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Enrollment = { factorId: string; qrCode: string; secret: string };

const inputClass = "w-full rounded-lg border px-3 py-2.5 text-center font-mono text-2xl tracking-[0.4em]";

// "enroll": mostra o QR code para o app autenticador e confirma com o primeiro código.
// "verify": pede o código do app. Depois de confirmar, a sessão passa a ter nível aal2 e o /admin libera.
export function TwoFactorForm({ mode, factorId, email }: { mode: "enroll" | "verify"; factorId: string | null; email: string | null }) {
  const router = useRouter();
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode !== "enroll") return;
    // Só a tentativa mais recente atualiza a tela (o React pode rodar este efeito duas vezes).
    let current = true;
    const supabase = createSupabaseBrowserClient();
    (async () => {
      // Remove cadastros iniciados e não concluídos em visitas anteriores.
      const { data: list } = await supabase.auth.mfa.listFactors();
      for (const f of list?.all ?? []) {
        if (f.factor_type === "totp" && f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      // Nome interno único: duas tentativas simultâneas não se atrapalham.
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `PMS app ${Date.now()}` });
      if (!current) return;
      if (error || !data) return setError("Não foi possível iniciar o cadastro. Recarregue a página.");
      setEnrollment({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
    })();
    return () => {
      current = false;
    };
  }, [mode]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const id = mode === "enroll" ? enrollment?.factorId : factorId;
    if (!id) return;
    setBusy(true);
    setError(null);
    const { error } = await createSupabaseBrowserClient().auth.mfa.challengeAndVerify({ factorId: id, code: code.trim() });
    if (error) {
      setBusy(false);
      setCode("");
      return setError("Código incorreto ou expirado. Confira no app e tente o código atual.");
    }
    // A sessão (cookies) já é a verificada: o servidor libera o /admin na próxima requisição.
    router.replace("/admin");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Verificação em duas etapas</h1>
        <p className="mt-1 text-sm text-neutral-600">
          {mode === "enroll"
            ? "O super-admin exige um código do celular além da senha. Configure uma vez:"
            : `Digite o código de 6 dígitos do app autenticador${email ? ` para ${email}` : ""}.`}
        </p>
      </div>

      {mode === "enroll" && (
        <ol className="space-y-3 text-sm text-neutral-700">
          <li>1. Instale um app autenticador: Google Authenticator, Microsoft Authenticator ou o app Senhas do iPhone.</li>
          <li>2. No app, adicione uma conta lendo o QR code:</li>
          <li className="flex justify-center">
            {enrollment ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={enrollment.qrCode} alt="QR code para o app autenticador" className="h-48 w-48 rounded-lg border p-2" />
            ) : (
              <span className="grid h-48 w-48 place-items-center rounded-lg border text-neutral-400">Gerando…</span>
            )}
          </li>
          {enrollment && (
            <li className="text-xs text-neutral-500">
              Sem câmera? Digite esta chave no app: <code className="break-all rounded bg-neutral-100 px-1 font-mono">{enrollment.secret}</code>
            </li>
          )}
          <li>3. Digite o código de 6 dígitos que o app mostrar:</li>
        </ol>
      )}

      <form onSubmit={onSubmit} className="space-y-3">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          required
          pattern="[0-9]{6}"
          placeholder="000000"
          aria-label="Código de 6 dígitos"
          className={inputClass}
        />
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button
          type="submit"
          disabled={busy || code.length !== 6 || (mode === "enroll" && !enrollment)}
          className="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 disabled:opacity-50"
        >
          {busy ? "Conferindo…" : mode === "enroll" ? "Ativar e entrar" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
