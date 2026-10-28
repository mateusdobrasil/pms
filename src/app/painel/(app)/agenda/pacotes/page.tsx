import Link from "next/link";
import { requireStore } from "@/lib/panel";
import { formatBRL } from "@/lib/money";
import { formatPhone } from "@/lib/format";
import { PACKAGE_STATES, packageState, perSessionCents, remaining } from "@/lib/packages";
import { loadCustomerPackages } from "@/lib/packages-server";
import { togglePackage } from "./actions";
import { CreatePackageForm, CustomerPackageActions } from "./package-forms";

export const metadata = { title: "Pacotes · Agenda" };

type Model = { id: string; name: string; sessions: number; price_cents: number; validity_days: number | null; active: boolean; services: { name: string } | null };

const date = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

// Pacotes de sessões: os modelos à venda e os pacotes dos clientes (sessões restantes, usar e cancelar).
export default async function PackagesPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const { supabase, store, role } = await requireStore("agenda");
  const showClosed = (await searchParams).ver === "encerrados";
  const [{ data: models, error }, { data: services }, { data: links }, customerPkgs] = await Promise.all([
    supabase.from("service_packages").select("id, name, sessions, price_cents, validity_days, active, services(name)").eq("store_id", store.id).order("created_at"),
    supabase.from("services").select("id, name").eq("store_id", store.id).eq("active", true).order("position").order("name"),
    supabase.from("professional_services").select("service_id, professionals(id, name, active)").eq("store_id", store.id),
    loadCustomerPackages(supabase, store.id),
  ]);

  if (error) {
    return <p className="text-sm text-neutral-600">Os pacotes estão sendo instalados. Volte em alguns minutos.</p>;
  }
  const prosFor = (serviceId: string | null) =>
    ((links ?? []) as unknown as { service_id: string; professionals: { id: string; name: string; active: boolean } | null }[])
      .filter((l) => l.service_id === serviceId && l.professionals?.active)
      .map((l) => ({ id: l.professionals!.id, name: l.professionals!.name }));
  const withState = customerPkgs.map((p) => ({ ...p, state: packageState(p) }));
  const open = withState.filter((p) => p.state === "active");
  const closed = withState.filter((p) => p.state !== "active");
  const list = showClosed ? closed : open;

  return (
    <div className="space-y-6">
      {role === "owner" && (
      <section className="space-y-3 rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="font-medium">Pacotes à venda</h2>
        <p className="text-sm text-neutral-600">
          Ex.: &quot;5 escovas por R$ 200&quot;. O cliente paga uma vez (em <Link href="/painel/vender" className="font-medium text-primary-700 hover:underline">Vender → Pacotes</Link>) e
          cada atendimento desconta uma sessão: na agenda, use o botão &quot;Usar pacote&quot; no agendamento.
        </p>
        {(models ?? []).length > 0 && (
          <ul className="divide-y rounded-lg border text-sm">
            {((models ?? []) as unknown as Model[]).map((m) => (
              <li key={m.id} className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 ${m.active ? "" : "opacity-60"}`}>
                <span>
                  <span className="font-medium">{m.name}</span>
                  <span className="text-neutral-500">
                    {" "}· {m.services?.name} · {m.sessions} sessões · {formatBRL(m.price_cents)} ({formatBRL(perSessionCents(m.price_cents, m.sessions))} cada)
                    {m.validity_days ? ` · vale ${m.validity_days} dias` : " · sem validade"}
                  </span>
                </span>
                <form action={togglePackage}>
                  <input type="hidden" name="id" value={m.id} />
                  <input type="hidden" name="active" value={m.active ? "0" : "1"} />
                  <button type="submit" className="text-xs font-medium text-primary-700 hover:underline">{m.active ? "Parar de vender" : "Voltar a vender"}</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        {(services ?? []).length === 0 ? (
          <p className="text-sm text-neutral-500">Cadastre os serviços primeiro, em Agenda → Serviços.</p>
        ) : (
          <CreatePackageForm services={(services ?? []) as { id: string; name: string }[]} />
        )}
      </section>
      )}

      <section className="rounded-xl border bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="font-medium">Pacotes dos clientes</h2>
          <div className="flex gap-1 text-sm">
            <Link href="/painel/agenda/pacotes" className={`rounded-full border px-3 py-1 ${!showClosed ? "border-neutral-900 bg-neutral-900 text-white" : "bg-white"}`}>Ativos ({open.length})</Link>
            <Link href="/painel/agenda/pacotes?ver=encerrados" className={`rounded-full border px-3 py-1 ${showClosed ? "border-neutral-900 bg-neutral-900 text-white" : "bg-white"}`}>Encerrados ({closed.length})</Link>
          </div>
        </div>
        {list.length === 0 ? (
          <p className="px-4 py-6 text-sm text-neutral-500">{showClosed ? "Nenhum pacote encerrado." : "Nenhum pacote ativo. Venda em Vender → Pacotes."}</p>
        ) : (
          <ul className="divide-y text-sm">
            {list.map((p) => (
              <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                <div className="space-y-0.5">
                  <p>
                    <span className="font-medium">{p.customer_name}</span>
                    {p.customer_phone && <span className="text-neutral-500"> · {formatPhone(p.customer_phone)}</span>}
                  </p>
                  <p className="text-neutral-600">
                    {p.name} · <strong>{remaining(p)} de {p.sessions_total}</strong> sessões restantes
                  </p>
                  <p className="text-xs text-neutral-500">
                    <span className={`mr-2 rounded-full px-2 py-0.5 font-medium ring-1 ring-inset ${PACKAGE_STATES[p.state].tone}`}>{PACKAGE_STATES[p.state].label}</span>
                    comprado em {date(p.created_at)} · {formatBRL(p.price_cents)}
                    {p.expires_at && ` · vale até ${date(p.expires_at)}`}
                  </p>
                </div>
                {p.state === "active" && <CustomerPackageActions id={p.id} pros={prosFor(p.service_id)} canCancel={role === "owner"} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
