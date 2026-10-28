import { type TrackingEvent, correiosTrackingUrl } from "@/lib/correios";

const when = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// Histórico do objeto nos Correios (mais novo em cima). Usado no pedido do painel e na página do pedido do cliente.
export function TrackingTimeline({ code, events, max = 6 }: { code: string; events: TrackingEvent[]; max?: number }) {
  const shown = events.slice(0, max);
  return (
    <div className="space-y-2">
      <ol className="space-y-2.5 border-l-2 border-neutral-200 pl-4">
        {shown.map((e, i) => (
          <li key={`${e.at}-${e.code}-${i}`} className="relative text-sm">
            <span className={`absolute -left-[1.4rem] top-1 h-3 w-3 rounded-full ${i === 0 ? "bg-emerald-500" : "bg-neutral-300"}`} aria-hidden="true" />
            <span className={`block ${i === 0 ? "font-medium" : "text-neutral-700"}`}>{e.description}</span>
            <span className="block text-xs text-neutral-500">
              {when(e.at)}
              {e.place ? ` · ${e.place}` : ""}
              {e.detail ? ` · ${e.detail}` : ""}
            </span>
          </li>
        ))}
      </ol>
      <a href={correiosTrackingUrl(code)} target="_blank" rel="noopener noreferrer" className="inline-block text-xs font-medium underline">
        {events.length > max ? `Ver o histórico completo nos Correios` : "Ver nos Correios"}
      </a>
    </div>
  );
}
