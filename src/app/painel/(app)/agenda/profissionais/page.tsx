import Link from "next/link";
import { requireStore } from "@/lib/panel";
import { WEEKDAYS } from "@/lib/booking";
import { CreateProfessionalForm } from "./professional-forms";

export const metadata = { title: "Profissionais · Agenda" };

type Row = { id: string; name: string; active: boolean; professional_services: { service_id: string }[]; working_hours: { weekday: number }[] };

export default async function ProfessionalsPage() {
  const { supabase, store } = await requireStore();
  const { data } = await supabase
    .from("professionals")
    .select("id, name, active, professional_services(service_id), working_hours(weekday)")
    .eq("store_id", store.id)
    .order("position")
    .order("name");
  const pros = (data ?? []) as Row[];

  return (
    <div className="max-w-2xl space-y-6">
      <CreateProfessionalForm />
      {pros.length === 0 ? (
        <p className="rounded-xl border bg-white px-4 py-8 text-center text-sm text-neutral-500 shadow-sm">
          Nenhum profissional ainda. Se você atende sozinho, cadastre o seu próprio nome.
        </p>
      ) : (
        <ul className="divide-y rounded-xl border bg-white shadow-sm">
          {pros.map((p) => {
            const days = [...new Set(p.working_hours.map((h) => h.weekday))].sort();
            return (
              <li key={p.id}>
                <Link href={`/painel/agenda/profissionais/${p.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm hover:bg-neutral-50">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{p.name}</span>
                    {!p.active && <span className="ml-2 rounded bg-neutral-200 px-1.5 py-0.5 text-xs">não atende</span>}
                    <span className="block text-neutral-500">
                      {p.professional_services.length} serviço(s) ·{" "}
                      {days.length ? days.map((d) => WEEKDAYS[d].slice(0, 3)).join(", ") : "sem horário"}
                    </span>
                  </span>
                  <span className="text-primary-700 underline">editar</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
