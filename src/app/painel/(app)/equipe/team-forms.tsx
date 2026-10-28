"use client";

import { useActionState, useState } from "react";
import { submitKeepingValues } from "@/lib/form-submit";
import { ROLE_LABELS, TEAM_ROLES, type MemberRole, type TeamRole } from "@/lib/team";
import { addTeamMember, removeTeamMember, resetTeamPassword, updateTeamMember, type TeamState } from "./actions";

type Pro = { id: string; name: string };

const input = "rounded-md border bg-white px-3 py-1.5 text-sm";

// Senha temporária: aparece uma vez só, com o texto pronto para mandar à pessoa.
function Password({ state }: { state: TeamState }) {
  const [copied, setCopied] = useState(false);
  if (!state?.password) return null;
  const text = `Seu acesso ao painel da loja: www.pmsapp.dev/painel\nE-mail: ${state.email ?? ""}\nSenha temporária: ${state.password}\nNo primeiro acesso, troque a senha em Conta → Minha conta.`;
  return (
    <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <p>
        Senha temporária: <code className="rounded bg-white px-1.5 py-0.5 font-mono font-semibold">{state.password}</code>. Ela aparece só agora: mande para a
        pessoa, que troca no primeiro acesso.
      </p>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(text).catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium hover:border-amber-500"
      >
        {copied ? "Copiado!" : "Copiar mensagem com o acesso"}
      </button>
    </div>
  );
}

function Feedback({ state }: { state: TeamState }) {
  return (
    <>
      {state?.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state?.ok && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.ok}</p>}
      <Password state={state} />
    </>
  );
}

// Perfil + (para Profissional) qual cadastro da agenda é a pessoa.
function RoleFields({ role, onRole, professionals, professionalId }: { role: TeamRole; onRole: (r: TeamRole) => void; professionals: Pro[]; professionalId?: string | null }) {
  return (
    <>
      <select name="role" value={role} onChange={(e) => onRole(e.target.value as TeamRole)} aria-label="Perfil" className={input}>
        {TEAM_ROLES.map((r) => (
          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
        ))}
      </select>
      {role === "professional" &&
        (professionals.length ? (
          <select name="professionalId" defaultValue={professionalId ?? ""} aria-label="Profissional da agenda" className={input}>
            <option value="" disabled>Qual profissional?</option>
            {professionals.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        ) : (
          <span className="self-center text-xs text-neutral-500">Cadastre o profissional em Agenda → Profissionais primeiro.</span>
        ))}
    </>
  );
}

export function AddTeamMemberForm({ professionals }: { professionals: Pro[] }) {
  const [state, action, pending] = useActionState(addTeamMember, null);
  const [role, setRole] = useState<TeamRole>("staff");
  return (
    <form onSubmit={submitKeepingValues(action)} className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input name="email" type="email" required placeholder="e-mail da pessoa" className={`${input} min-w-56 flex-1`} />
        <RoleFields role={role} onRole={setRole} professionals={professionals} />
        <button type="submit" disabled={pending} className="rounded-md bg-primary-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
          {pending ? "Criando…" : "Adicionar"}
        </button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function TeamMemberRow({ userId, email, role: current, professionalId, professionals }: { userId: string; email: string; role: MemberRole; professionalId: string | null; professionals: Pro[] }) {
  const [state, action, pending] = useActionState(updateTeamMember, null);
  const [reset, resetAction, resetting] = useActionState(resetTeamPassword, null);
  const [role, setRole] = useState<TeamRole>(current === "professional" ? "professional" : "staff");
  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{email}</span>
        <div className="flex gap-3 text-xs">
          <form action={resetAction}>
            <input type="hidden" name="userId" value={userId} />
            <button type="submit" disabled={resetting} className="font-medium text-primary-700 hover:underline disabled:opacity-50">Gerar senha nova</button>
          </form>
          <form
            action={removeTeamMember}
            onSubmit={(e) => {
              if (!confirm(`Tirar o acesso de ${email}? A pessoa deixa de entrar no painel na hora.`)) e.preventDefault();
            }}
          >
            <input type="hidden" name="userId" value={userId} />
            <button type="submit" className="font-medium text-red-700 hover:underline">Remover</button>
          </form>
        </div>
      </div>
      <form onSubmit={submitKeepingValues(action)} className="flex flex-wrap gap-2">
        <input type="hidden" name="userId" value={userId} />
        <RoleFields role={role} onRole={setRole} professionals={professionals} professionalId={professionalId} />
        <button type="submit" disabled={pending} className="rounded-md border px-3 py-1.5 text-sm font-medium hover:border-neutral-400 disabled:opacity-50">Salvar</button>
      </form>
      <Feedback state={state} />
      <Feedback state={reset} />
    </li>
  );
}
