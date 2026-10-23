import { requireStore } from "@/lib/panel";
import { todayBR } from "@/lib/billing";
import { deleteTimeOff } from "./actions";
import { TimeOffForm } from "./time-off-form";

export const metadata = { title: "Folgas e bloqueios · Agenda" };

type Row = { id: string; starts_at: string; ends_at: string; reason: string | null; professionals: { name: string } | null };

// "qua, 12/11 13:00" (horário de Brasília); fim à meia-noite vira o dia anterior inteiro.
const when = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(",", "");

export default async function TimeOffPage() {
  const { supabase, store } = await requireStore();
  const [{ data: rows }, { data: pros }] = await Promise.all([
    supabase
      .from("time_off")
      .select("id, starts_at, ends_at, reason, professionals(name)")
      .eq("store_id", store.id)
      .gte("ends_at", new Date().toISOString())
      .order("starts_at"),
    supabase.from("professionals").select("id, name").eq("store_id", store.id).order("position").order("name"),
  ]);
  const blocks = (rows ?? []) as unknown as Row[];

  return (
    <div className="max-w-2xl space-y-6">
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-medium">Novo bloqueio</h2>
        <TimeOffForm professionals={(pros ?? []) as { id: string; name: string }[]} today={todayBR()} />
      </section>
      <section className="space-y-2">
        <h2 className="font-medium">Próximos bloqueios</h2>
        {blocks.length === 0 ? (
          <p className="rounded-xl border bg-white px-4 py-6 text-center text-sm text-neutral-500 shadow-sm">Nenhum bloqueio marcado.</p>
        ) : (
          <ul className="divide-y rounded-xl border bg-white text-sm shadow-sm">
            {blocks.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{b.professionals?.name ?? "Salão todo"}</span>
                  {b.reason && <span className="text-neutral-500"> · {b.reason}</span>}
                  <span className="block text-neutral-500">
                    {when(b.starts_at)} até {when(b.ends_at)}
                  </span>
                </span>
                <form action={deleteTimeOff}>
                  <input type="hidden" name="id" value={b.id} />
                  <button type="submit" className="text-xs text-red-700 underline">Remover</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
