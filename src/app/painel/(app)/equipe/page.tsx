import { requireStore } from "@/lib/panel";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROLE_HINTS, ROLE_LABELS, TEAM_ROLES, isMemberRole, type MemberRole } from "@/lib/team";
import { AddTeamMemberForm, TeamMemberRow } from "./team-forms";

export const metadata = { title: "Equipe · Painel" };

type Member = { user_id: string; role: MemberRole; professional_id: string | null; created_at: string; email: string };

// Quem acessa o painel desta loja. Só o dono vê e mexe (requireStore sem área).
export default async function TeamPage() {
  const { store, userId } = await requireStore();
  const db = createAdminClient();
  const [{ data: rows, error }, { data: pros }] = await Promise.all([
    db.from("store_members").select("user_id, role, professional_id, created_at").eq("store_id", store.id).order("created_at"),
    db.from("professionals").select("id, name").eq("store_id", store.id).eq("active", true).order("position").order("name"),
  ]);
  // E-mail de cada acesso (o Auth guarda; são poucos por loja).
  const members: Member[] = await Promise.all(
    ((rows ?? []) as Omit<Member, "email">[])
      .filter((r) => isMemberRole(r.role))
      .map(async (r) => ({ ...r, email: (await db.auth.admin.getUserById(r.user_id)).data.user?.email ?? "(sem e-mail)" })),
  );
  const professionals = (pros ?? []) as { id: string; name: string }[];
  const linked = new Set(members.map((m) => m.professional_id).filter(Boolean));

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Equipe</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Dê um acesso próprio a cada pessoa que trabalha com você. Cada uma entra com o próprio e-mail e senha e vê só o que o perfil dela permite.
        </p>
      </div>

      {error ? (
        <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">A equipe está sendo instalada na sua loja. Volte em alguns minutos.</p>
      ) : (
        <>
          <section className="rounded-xl border bg-white shadow-sm">
            <h2 className="border-b px-4 py-3 font-medium">Quem acessa o painel</h2>
            <ul className="divide-y text-sm">
              {members.map((m) =>
                m.role === "owner" ? (
                  <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <span className="font-medium">{m.email}{m.user_id === userId && <span className="ml-1 font-normal text-neutral-500">(você)</span>}</span>
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">{ROLE_LABELS.owner}</span>
                  </li>
                ) : (
                  <TeamMemberRow
                    key={m.user_id}
                    userId={m.user_id}
                    email={m.email}
                    role={m.role}
                    professionalId={m.professional_id}
                    professionals={professionals.filter((p) => p.id === m.professional_id || !linked.has(p.id))}
                  />
                ),
              )}
            </ul>
          </section>

          <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="font-medium">Adicionar pessoa</h2>
            <AddTeamMemberForm professionals={professionals.filter((p) => !linked.has(p.id))} />
          </section>

          <section className="space-y-2 rounded-xl border bg-white p-5 text-sm shadow-sm">
            <h2 className="font-medium">O que cada perfil vê</h2>
            <dl className="space-y-2">
              <div>
                <dt className="font-medium">{ROLE_LABELS.owner}</dt>
                <dd className="text-neutral-600">Tudo, inclusive o resumo de vendas, as configurações, a assinatura e esta tela.</dd>
              </div>
              {TEAM_ROLES.map((r) => (
                <div key={r}>
                  <dt className="font-medium">{ROLE_LABELS[r]}</dt>
                  <dd className="text-neutral-600">{ROLE_HINTS[r]}</dd>
                </div>
              ))}
            </dl>
          </section>
        </>
      )}
    </div>
  );
}
