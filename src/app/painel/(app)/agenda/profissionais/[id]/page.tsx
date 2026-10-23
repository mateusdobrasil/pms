import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStore } from "@/lib/panel";
import { isUuid } from "@/lib/validation";
import { formatRanges, parseTime } from "@/lib/booking";
import { deleteProfessional } from "../actions";
import { ProfessionalForm } from "../professional-forms";

export const metadata = { title: "Profissional · Agenda" };

export default async function ProfessionalPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ novo?: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase, store } = await requireStore();
  const [{ data: pro }, { data: services }] = await Promise.all([
    supabase
      .from("professionals")
      .select("id, name, active, professional_services(service_id), working_hours(weekday, start_time, end_time)")
      .eq("id", id)
      .eq("store_id", store.id)
      .maybeSingle(),
    supabase.from("services").select("id, name, active").eq("store_id", store.id).order("position").order("name"),
  ]);
  if (!pro) notFound();
  const isNew = !!(await searchParams).novo;

  const wh = pro.working_hours as { weekday: number; start_time: string; end_time: string }[];
  const hours = Array.from({ length: 7 }, (_, d) =>
    formatRanges(wh.filter((h) => h.weekday === d).map((h) => [parseTime(h.start_time.slice(0, 5))!, parseTime(h.end_time.slice(0, 5))!])),
  );

  return (
    <div className="max-w-2xl space-y-4">
      <Link href="/painel/agenda/profissionais" className="text-sm text-neutral-500 underline">← Profissionais</Link>
      {isNew && (
        <p className="rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Profissional cadastrado com todos os serviços e horário de segunda a sábado, das 9h às 18h. Ajuste o que for diferente e salve.
        </p>
      )}
      <ProfessionalForm
        professional={{ id: pro.id, name: pro.name, active: pro.active, serviceIds: (pro.professional_services as { service_id: string }[]).map((s) => s.service_id) }}
        services={(services ?? []) as { id: string; name: string; active: boolean }[]}
        hours={hours}
      />
      <form action={deleteProfessional} className="pt-2">
        <input type="hidden" name="id" value={pro.id} />
        <button type="submit" className="text-xs text-red-700 underline">Excluir profissional</button>
      </form>
    </div>
  );
}
