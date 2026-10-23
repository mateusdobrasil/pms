import { requireStore } from "@/lib/panel";
import { formatBRL } from "@/lib/money";
import { PAYMENT_MODES, formatDuration, onlineCents } from "@/lib/booking";
import { deleteService, moveService } from "./actions";
import { ServiceForm, type ServiceRow } from "./service-form";

export const metadata = { title: "Serviços · Agenda" };

export default async function ServicesPage() {
  const { supabase, store } = await requireStore();
  const { data } = await supabase
    .from("services")
    .select("id, name, description, duration_minutes, price_cents, payment_mode, deposit_percent, active")
    .eq("store_id", store.id)
    .order("position")
    .order("name");
  const services = (data ?? []) as ServiceRow[];

  return (
    <div className="max-w-3xl space-y-6">
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-medium">Novo serviço</h2>
        <ServiceForm />
      </section>

      {services.length === 0 ? (
        <p className="rounded-xl border bg-white px-4 py-8 text-center text-sm text-neutral-500 shadow-sm">Nenhum serviço ainda.</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-white shadow-sm">
          {services.map((s, i) => {
            const online = onlineCents(s.price_cents, s.payment_mode, s.deposit_percent);
            const mode = PAYMENT_MODES.find((m) => m.value === s.payment_mode)?.label;
            return (
              <li key={s.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                <form action={moveService} className="flex flex-col pt-1">
                  <input type="hidden" name="id" value={s.id} />
                  <button name="direction" value="up" disabled={i === 0} className="leading-none disabled:opacity-20" aria-label="Subir">▲</button>
                  <button name="direction" value="down" disabled={i === services.length - 1} className="leading-none disabled:opacity-20" aria-label="Descer">▼</button>
                </form>
                <details className="min-w-0 flex-1">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{s.name}</span>
                      {!s.active && <span className="ml-2 rounded bg-neutral-200 px-1.5 py-0.5 text-xs">indisponível</span>}
                      <span className="block text-neutral-500">
                        {formatDuration(s.duration_minutes)} · {formatBRL(s.price_cents)} · {mode}
                        {online > 0 && s.payment_mode === "deposit" && ` de ${formatBRL(online)} (${s.deposit_percent}%)`}
                      </span>
                    </span>
                    <span className="text-primary-700 underline">editar</span>
                  </summary>
                  <div className="mt-4 space-y-3 border-t pt-4">
                    <ServiceForm service={s} />
                    <form action={deleteService}>
                      <input type="hidden" name="id" value={s.id} />
                      <button type="submit" className="text-xs text-red-700 underline">Excluir serviço</button>
                    </form>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-neutral-500">
        Pagamento online (tudo ou sinal) usa o seu Mercado Pago, como as vendas da loja. Os agendamentos já feitos guardam o nome e o preço da época,
        mesmo que você mude ou exclua o serviço.
      </p>
    </div>
  );
}
