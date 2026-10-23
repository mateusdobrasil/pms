import Link from "next/link";
import { requireStore } from "@/lib/panel";

export const metadata = { title: "Agenda · Painel" };

// Primeira etapa: o passo a passo para deixar a agenda pronta (a visão do dia/semana chega na fase 4).
export default async function AgendaPage() {
  const { supabase, store } = await requireStore();
  const [{ count: services }, { data: pros }, { data: settings }] = await Promise.all([
    supabase.from("services").select("id", { count: "exact", head: true }).eq("store_id", store.id).eq("active", true),
    supabase.from("professionals").select("id, working_hours(id), professional_services(service_id)").eq("store_id", store.id).eq("active", true),
    supabase.from("stores").select("booking_enabled").eq("id", store.id).single(),
  ]);
  const professionals = (pros ?? []) as { id: string; working_hours: { id: string }[]; professional_services: { service_id: string }[] }[];
  const ready = professionals.filter((p) => p.working_hours.length && p.professional_services.length).length;

  const steps = [
    { done: (services ?? 0) > 0, text: "Cadastre os serviços (duração, preço e forma de pagamento)", href: "/painel/agenda/servicos" },
    { done: professionals.length > 0, text: "Cadastre os profissionais", href: "/painel/agenda/profissionais" },
    { done: ready > 0, text: "Em cada profissional, marque os serviços que ele faz e os horários de trabalho", href: "/painel/agenda/profissionais" },
    { done: !!settings?.booking_enabled, text: "Ligue os agendamentos em Configurações → Agendamentos", href: "/painel/configuracoes#agendamentos" },
  ];

  return (
    <section className="max-w-2xl space-y-3 rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="font-medium">Deixe a agenda pronta</h2>
      <ol className="space-y-2 text-sm">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs font-bold ${s.done ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-500"}`}>
              {s.done ? "✓" : i + 1}
            </span>
            <Link href={s.href} className={s.done ? "text-neutral-500 line-through" : "hover:underline"}>{s.text}</Link>
          </li>
        ))}
      </ol>
      <p className="text-xs text-neutral-500">A agenda do dia e da semana, com os horários marcados pelos clientes, aparece aqui quando os agendamentos começarem.</p>
    </section>
  );
}
