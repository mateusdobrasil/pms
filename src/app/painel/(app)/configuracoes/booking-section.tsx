import Link from "next/link";

export type BookingSettings = {
  booking_enabled: boolean;
  booking_slot_minutes: number;
  booking_min_notice_minutes: number;
  booking_max_days: number;
  booking_cancel_hours: number;
};

const input = "w-full rounded-lg border px-3 py-2 text-sm";

// Agendamentos (salões): liga a página /agendar da loja e as regras da agenda. Fica dentro do formulário de Configurações.
export function BookingSection({ booking }: { booking: BookingSettings }) {
  return (
    <section id="agendamentos" className="scroll-mt-24 space-y-4 rounded-xl border bg-white p-5 shadow-sm">
      <div>
        <h2 className="font-semibold">Agendamentos</h2>
        <p className="text-xs text-neutral-500">
          Para salões, barbearias e estética: o cliente escolhe o serviço, o profissional e o horário na página <strong>Agendar</strong> da loja.
          Cadastre serviços e profissionais em <Link href="/painel/agenda" className="underline">Agenda</Link>.
        </p>
      </div>
      <input type="hidden" name="booking_settings" value="1" />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="booking_enabled" defaultChecked={booking.booking_enabled} />
        <span className="font-medium">Aceitar agendamentos pela loja</span>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-neutral-700">Horários de quanto em quanto tempo</span>
          <select name="booking_slot_minutes" defaultValue={booking.booking_slot_minutes} className={input}>
            {[10, 15, 20, 30, 60].map((m) => (
              <option key={m} value={m}>{m === 60 ? "1 hora (9:00, 10:00…)" : `${m} minutos`}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-neutral-700">Antecedência mínima</span>
          <select name="booking_min_notice_minutes" defaultValue={booking.booking_min_notice_minutes} className={input}>
            {[
              [0, "Nenhuma"],
              [30, "30 minutos"],
              [60, "1 hora"],
              [120, "2 horas"],
              [240, "4 horas"],
              [720, "12 horas"],
              [1440, "1 dia"],
              [2880, "2 dias"],
            ].map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-neutral-700">Agenda aberta para os próximos</span>
          <select name="booking_max_days" defaultValue={booking.booking_max_days} className={input}>
            {[7, 14, 30, 60, 90].map((d) => (
              <option key={d} value={d}>{d} dias</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-neutral-700">Cliente cancela ou remarca pelo link até</span>
          <select name="booking_cancel_hours" defaultValue={booking.booking_cancel_hours} className={input}>
            {[
              [0, "a hora do atendimento"],
              [2, "2 horas antes"],
              [12, "12 horas antes"],
              [24, "24 horas antes"],
              [48, "48 horas antes"],
            ].map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}
