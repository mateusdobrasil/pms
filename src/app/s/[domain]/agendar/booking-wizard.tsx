"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatBRL } from "@/lib/money";
import { formatDuration, type PaymentMode } from "@/lib/booking";
import { weekdayOf } from "@/lib/booking-slots";
import { forgetCoupon, savedCoupon } from "@/lib/coupon-link";

// Cupom vindo de um link da loja (?cupom=): preenche o campo uma vez, quando ele aparece.
function fillSavedCoupon(el: HTMLInputElement | null) {
  if (el && !el.dataset.filled) {
    el.dataset.filled = "1";
    el.value = savedCoupon() ?? "";
  }
}

type Service = {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price_cents: number;
  payment_mode: PaymentMode;
  deposit_percent: number | null;
  online_cents: number;
};
type Professional = { id: string; name: string; serviceIds: string[]; weekdays: number[] };
type Slot = { time: number; label: string };

const WEEK = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const input = "w-full rounded-lg border px-3 py-2.5 text-sm";

function paymentNote(s: Service) {
  if (s.payment_mode === "full") return `Pagamento online de ${formatBRL(s.online_cents)}`;
  if (s.payment_mode === "deposit") return `Sinal de ${formatBRL(s.online_cents)} online, o resto no salão`;
  return "Pagamento no salão";
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <span className="grid h-7 w-7 place-items-center rounded-full text-sm text-white" style={{ background: "var(--brand)" }}>{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

const chip = (selected: boolean) =>
  `rounded-lg border-2 px-3 py-2 text-sm font-medium transition ${selected ? "" : "border-neutral-200 hover:border-neutral-400"}`;
const chipStyle = (selected: boolean) => (selected ? { borderColor: "var(--brand)", color: "var(--brand)" } : undefined);

export function BookingWizard({
  services,
  professionals,
  days,
  whatsapp,
  reschedule = null,
  initialServiceId = null,
  initialDate = null,
  packageServiceIds = [],
  whatsappOptIn = false,
  withCoupon = false,
  birthdayGift = null,
}: {
  services: Service[];
  professionals: Professional[];
  days: string[];
  whatsapp: string | null;
  reschedule?: { token: string; serviceId: string; professionalId: string | null } | null; // remarcar um agendamento existente
  initialServiceId?: string | null; // vindo de um cartão de serviço da home (?servico=)
  initialDate?: string | null; // vindo do e-mail da lista de espera (?data=)
  packageServiceIds?: string[]; // serviços com pacote à venda (quem tem pacote agenda sem sinal)
  whatsappOptIn?: boolean; // a loja oferece novidades pelo WhatsApp (caixa de aceite, desmarcada)
  withCoupon?: boolean; // a loja tem cupom que vale na agenda (campo opcional, conferido no servidor)
  birthdayGift?: string | null; // a loja dá presente de aniversário ("15% de desconto")
}) {
  const router = useRouter();
  const [serviceId, setServiceId] = useState<string | null>(reschedule?.serviceId ?? initialServiceId ?? (services.length === 1 ? services[0].id : null));
  // Remarcação: começa com o mesmo profissional, se ele ainda faz o serviço. "" = qualquer um.
  const [proId, setProId] = useState<string>(
    reschedule?.professionalId && professionals.some((p) => p.id === reschedule.professionalId && p.serviceIds.includes(reschedule.serviceId)) ? reschedule.professionalId : "",
  );
  // Só aceita o dia do link se ele está na agenda (o serviço também precisa ter vindo no link).
  const [date, setDate] = useState<string | null>(initialServiceId && initialDate && days.includes(initialDate) ? initialDate : null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const dayStep = useRef<HTMLDivElement>(null);
  const cameWithDate = useRef(date !== null);
  const [time, setTime] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const service = services.find((s) => s.id === serviceId) ?? null;
  const pros = service ? professionals.filter((p) => p.serviceIds.includes(service.id)) : [];
  const candidates = proId ? pros.filter((p) => p.id === proId) : pros;
  const openDays = days.filter((d) => candidates.some((p) => p.weekdays.includes(weekdayOf(d))));

  // Busca os horários livres quando serviço, profissional e dia estão escolhidos.
  useEffect(() => {
    if (!serviceId || !date) return;
    let alive = true;
    const qs = new URLSearchParams({ service: serviceId, date, ...(proId ? { professional: proId } : {}) });
    fetch(`/api/bookings/slots?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => alive && setSlots(d.slots ?? []))
      .catch(() => alive && setSlots([]));
    return () => {
      alive = false;
    };
  }, [serviceId, proId, date]);

  // Veio do e-mail da lista de espera (dia já escolhido): leva direto aos horários.
  useEffect(() => {
    if (cameWithDate.current && slots !== null) {
      cameWithDate.current = false;
      dayStep.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [slots]);

  function pickService(id: string) {
    setServiceId(id);
    setProId("");
    setDate(null);
    setSlots(null);
    setTime(null);
  }
  function pickPro(id: string) {
    setProId(id);
    setDate(null);
    setSlots(null);
    setTime(null);
  }
  function pickDate(d: string) {
    setDate(d);
    setSlots(null);
    setTime(null);
  }

  // Remarcar: só manda o novo dia/horário (os dados do cliente e o pagamento continuam os mesmos).
  async function confirmReschedule() {
    if (!reschedule || !date || time === null) return;
    setSending(true);
    setError(null);
    const res = await fetch(`/api/bookings/${reschedule.token}/manage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reschedule", date, time, professionalId: proId || null }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { error?: string } | null;
    if (res?.ok) {
      router.push(`/agendamento/${reschedule.token}?remarcado=1`);
      return;
    }
    setSending(false);
    setError(data?.error ?? "Não foi possível remarcar agora. Tente de novo.");
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!service || !date || time === null) return;
    const f = new FormData(e.currentTarget);
    setSending(true);
    setError(null);
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceId: service.id,
        professionalId: proId || null,
        date,
        time,
        name: f.get("name"),
        email: f.get("email"),
        phone: f.get("phone"),
        cpf: f.get("cpf") ?? "",
        notes: f.get("notes") ?? "",
        whatsappOptIn: f.get("whatsapp_optin") === "on",
        coupon: String(f.get("coupon") ?? "").trim() || null,
        birthday: String(f.get("birthday") ?? "").trim() || null,
      }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { token?: string; error?: string } | null;
    if (res?.ok && data?.token) {
      forgetCoupon();
      router.push(`/agendamento/${data.token}`);
      return;
    }
    setSending(false);
    setError(data?.error ?? "Não foi possível agendar agora. Tente de novo.");
    // Horário tomado por outra pessoa: recarrega os horários do dia.
    if (res?.status === 409 && date) {
      setTime(null);
      setSlots(null);
      const qs = new URLSearchParams({ service: service.id, date, ...(proId ? { professional: proId } : {}) });
      fetch(`/api/bookings/slots?${qs}`, { cache: "no-store" }).then((r) => r.json()).then((d) => setSlots(d.slots ?? [])).catch(() => setSlots([]));
    }
  }

  return (
    <div className="space-y-8">
      <Step n={1} title="Serviço">
        <div className="grid gap-3 sm:grid-cols-2">
          {services.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => pickService(s.id)}
              className={`rounded-xl border-2 p-4 text-left transition ${s.id === serviceId ? "" : "border-neutral-200 hover:border-neutral-400"}`}
              style={s.id === serviceId ? { borderColor: "var(--brand)" } : undefined}
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">{s.name}</span>
                <span className="shrink-0 font-bold">{formatBRL(s.price_cents)}</span>
              </span>
              <span className="mt-1 block text-sm text-neutral-500">{formatDuration(s.duration_minutes)} · {paymentNote(s)}</span>
              {s.description && <span className="mt-1 block text-sm text-neutral-600">{s.description}</span>}
            </button>
          ))}
        </div>
      </Step>

      {service && pros.length > 1 && (
        <Step n={2} title="Profissional">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => pickPro("")} className={chip(proId === "")} style={chipStyle(proId === "")}>
              Qualquer um disponível
            </button>
            {pros.map((p) => (
              <button key={p.id} type="button" onClick={() => pickPro(p.id)} className={chip(proId === p.id)} style={chipStyle(proId === p.id)}>
                {p.name}
              </button>
            ))}
          </div>
        </Step>
      )}

      {service && (
        <div ref={dayStep} className="scroll-mt-40">
        <Step n={pros.length > 1 ? 3 : 2} title="Dia e horário">
          {openDays.length === 0 ? (
            <p className="text-sm text-neutral-600">Sem dias com atendimento nas próximas semanas.</p>
          ) : (
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
              {openDays.map((d) => {
                const [, m, day] = d.split("-").map(Number);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => pickDate(d)}
                    className={`shrink-0 rounded-lg border-2 px-3 py-2 text-center text-sm transition ${d === date ? "" : "border-neutral-200 hover:border-neutral-400"}`}
                    style={chipStyle(d === date)}
                  >
                    <span className="block text-xs uppercase text-neutral-500">{WEEK[weekdayOf(d)]}</span>
                    <span className="block font-semibold">{day} {MONTHS[m - 1]}</span>
                  </button>
                );
              })}
            </div>
          )}
          {date && slots === null && <p className="text-sm text-neutral-500">Buscando horários…</p>}
          {date && slots?.length === 0 && (
            <>
              <p className="text-sm text-neutral-600">Nenhum horário livre neste dia. Escolha outro dia{pros.length > 1 && proId ? " ou outro profissional" : ""}.</p>
              {!reschedule && service && <WaitlistBox key={`${service.id}:${proId}:${date}`} serviceId={service.id} professionalId={proId || null} date={date} />}
            </>
          )}
          {slots && slots.length > 0 && (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {slots.map((s) => (
                <button key={s.time} type="button" onClick={() => setTime(s.time)} className={chip(s.time === time)} style={chipStyle(s.time === time)}>
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </Step>
        </div>
      )}

      {reschedule && service && date && time !== null && (
        <section className="space-y-3">
          {error && <p className="text-sm text-red-700">{error}</p>}
          <button
            type="button"
            onClick={confirmReschedule}
            disabled={sending}
            className="w-full rounded-lg px-4 py-3 font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-50"
            style={{ background: "var(--brand)" }}
          >
            {sending ? "Remarcando…" : `Confirmar novo horário: ${slots?.find((s) => s.time === time)?.label}`}
          </button>
        </section>
      )}

      {!reschedule && service && date && time !== null && (
        <Step n={pros.length > 1 ? 4 : 3} title="Seus dados">
          <form onSubmit={submit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <input name="name" required autoComplete="name" placeholder="Nome e sobrenome" className={input} />
              <input name="phone" required type="tel" autoComplete="tel" inputMode="tel" placeholder="Celular com DDD" className={input} />
              <input name="email" required type="email" autoComplete="email" placeholder="E-mail (recebe a confirmação)" className={input} />
              {service.online_cents > 0 && <input name="cpf" required inputMode="numeric" placeholder="CPF (exigido no pagamento)" className={input} />}
            </div>
            {service.online_cents > 0 && packageServiceIds.includes(service.id) && (
              <p className="text-xs text-neutral-600">Tem pacote deste serviço? Use o <strong>mesmo celular do pacote</strong>: o sinal não é cobrado e a sessão é descontada no atendimento.</p>
            )}
            <textarea name="notes" rows={2} maxLength={500} placeholder="Observação para o salão (opcional)" className={input} />
            {birthdayGift && (
              <label className="block space-y-1 text-sm">
                <input
                  name="birthday"
                  inputMode="numeric"
                  maxLength={5}
                  placeholder="Seu aniversário (dd/mm, opcional)"
                  onChange={(e) => (e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4).replace(/^(\d{2})(\d)/, "$1/$2"))}
                  className={input}
                />
                <span className="block text-xs text-neutral-500">🎁 No dia do seu aniversário, você ganha {birthdayGift}.</span>
              </label>
            )}
            {withCoupon && (
              <input ref={fillSavedCoupon} name="coupon" placeholder="Cupom de desconto (opcional)" aria-label="Cupom de desconto" autoCapitalize="characters" className={`${input} uppercase`} />
            )}
            {whatsappOptIn && (
              <label className="flex items-start gap-2 text-sm text-neutral-700">
                <input type="checkbox" name="whatsapp_optin" className="mt-0.5" />
                <span>Quero receber novidades e promoções pelo WhatsApp (dá para sair quando quiser).</span>
              </label>
            )}
            <div className="rounded-xl bg-neutral-50 p-4 text-sm">
              <p className="font-semibold">{service.name} · {formatDuration(service.duration_minutes)}</p>
              <p className="text-neutral-600">
                {(() => {
                  const [y, m, d] = date.split("-").map(Number);
                  return `${WEEK[weekdayOf(date)]}, ${d}/${String(m).padStart(2, "0")}/${y}`;
                })()}{" "}
                às {slots?.find((s) => s.time === time)?.label}
                {proId ? ` com ${pros.find((p) => p.id === proId)?.name}` : ""}
              </p>
              <p className="mt-1">
                Total {formatBRL(service.price_cents)}
                {service.online_cents > 0 ? ` · agora: ${formatBRL(service.online_cents)} (Pix ou cartão)` : " · pagamento no salão"}
              </p>
            </div>
            {error && <p className="text-sm text-red-700">{error}</p>}
            <button
              type="submit"
              disabled={sending}
              className="w-full rounded-lg px-4 py-3 font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-50"
              style={{ background: "var(--brand)" }}
            >
              {sending ? "Agendando…" : service.online_cents > 0 ? "Continuar para o pagamento" : "Confirmar agendamento"}
            </button>
            {whatsapp && (
              <p className="text-center text-xs text-neutral-500">
                Dúvidas? <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer" className="underline">Fale com o salão no WhatsApp</a>
              </p>
            )}
          </form>
        </Step>
      )}
    </div>
  );
}

// Dia lotado: entra na lista de espera; se abrir horário neste dia, o aviso chega por e-mail.
function WaitlistBox({ serviceId, professionalId, date }: { serviceId: string; professionalId: string | null; date: string }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSending(true);
    setError(null);
    const res = await fetch("/api/bookings/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceId, professionalId, date, name: f.get("name"), email: f.get("email"), phone: f.get("phone") }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { error?: string } | null;
    setSending(false);
    if (res?.ok) setDone(true);
    else setError(data?.error ?? "Não foi possível entrar na lista agora. Tente de novo.");
  }

  if (done) {
    return (
      <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        Pronto! Você está na lista de espera. Se abrir um horário neste dia, avisamos por e-mail na hora.
      </p>
    );
  }
  return (
    <div className="rounded-xl border bg-neutral-50 p-4 text-sm">
      <p className="font-medium">Queria muito este dia?</p>
      <p className="text-neutral-600">Entre na lista de espera: se alguém desmarcar, você recebe um e-mail na hora para agendar.</p>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="mt-3 rounded-lg border bg-white px-4 py-2 font-medium transition hover:border-neutral-400">
          Entrar na lista de espera
        </button>
      ) : (
        <form onSubmit={submit} className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <input name="name" required autoComplete="name" placeholder="Nome e sobrenome" className={input} />
            <input name="phone" required type="tel" autoComplete="tel" inputMode="tel" placeholder="Celular com DDD" className={input} />
            <input name="email" required type="email" autoComplete="email" placeholder="E-mail (recebe o aviso)" className={input} />
          </div>
          {error && <p className="text-red-700">{error}</p>}
          <button
            type="submit"
            disabled={sending}
            className="rounded-lg px-4 py-2 font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-50"
            style={{ background: "var(--brand)" }}
          >
            {sending ? "Entrando…" : "Me avise se abrir horário"}
          </button>
        </form>
      )}
    </div>
  );
}
