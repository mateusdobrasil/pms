import "server-only";
import { after } from "next/server";
import type { createAdminClient } from "@/lib/supabase/admin";
import { notifyBooking, notifyPlatformError, notifyWaitlistOpening } from "@/lib/email";
import { pushToStore } from "@/lib/push";
import { PROVIDER, type GatewayPayment, getPayment, refundPayment } from "@/lib/payments/mercadopago";
import { canSelfManage, formatTime, onlineCents, parseTime, type PaymentMode } from "@/lib/booking";
import { type Interval, bookingDays, dayStartMs, daySlots, instantOf, mergeSlots, weekdayOf } from "@/lib/booking-slots";
import { addDays, todayBR } from "@/lib/billing";
import { isEmail, isValidCPF, onlyDigits } from "@/lib/validation";

// Agendamentos na loja: catálogo, horários livres, criação da reserva e pagamento.
// Tudo com a service role, sempre filtrando store_id.

type Db = ReturnType<typeof createAdminClient>;

export const BOOKING_HOLD_MINUTES = 30; // horário segurado enquanto o cliente paga (o mínimo do Pix)
export const ACTIVE_STATUSES = ["pending_payment", "confirmed", "completed"];

export type BookingSettings = { enabled: boolean; slotMinutes: number; minNoticeMinutes: number; maxDays: number; cancelHours: number };

// null = SQL dos agendamentos ainda não rodado.
export async function getBookingSettings(db: Db, storeId: string): Promise<BookingSettings | null> {
  const { data, error } = await db
    .from("stores")
    .select("booking_enabled, booking_slot_minutes, booking_min_notice_minutes, booking_max_days, booking_cancel_hours")
    .eq("id", storeId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    enabled: data.booking_enabled,
    slotMinutes: data.booking_slot_minutes,
    minNoticeMinutes: data.booking_min_notice_minutes,
    maxDays: data.booking_max_days,
    cancelHours: data.booking_cancel_hours,
  };
}

export type BookableService = {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price_cents: number;
  payment_mode: PaymentMode;
  deposit_percent: number | null;
};
type ProRow = {
  id: string;
  name: string;
  working_hours: { weekday: number; start_time: string; end_time: string }[];
  professional_services: { service_id: string }[];
};

// Serviços que dá para agendar (com algum profissional ativo que faz e tem horário) e os profissionais.
export async function loadCatalog(db: Db, storeId: string) {
  const [{ data: services }, { data: pros }] = await Promise.all([
    db
      .from("services")
      .select("id, name, description, duration_minutes, price_cents, payment_mode, deposit_percent")
      .eq("store_id", storeId)
      .eq("active", true)
      .order("position")
      .order("name"),
    db
      .from("professionals")
      .select("id, name, working_hours(weekday, start_time, end_time), professional_services(service_id)")
      .eq("store_id", storeId)
      .eq("active", true)
      .order("position")
      .order("name"),
  ]);
  const professionals = ((pros ?? []) as ProRow[])
    .filter((p) => p.working_hours.length)
    .map((p) => ({
      id: p.id,
      name: p.name,
      serviceIds: p.professional_services.map((s) => s.service_id),
      weekdays: [...new Set(p.working_hours.map((h) => h.weekday))],
      hours: p.working_hours,
    }));
  const bookable = ((services ?? []) as BookableService[]).filter((s) => professionals.some((p) => p.serviceIds.includes(s.id)));
  return { services: bookable, professionals };
}

const toMinutes = (t: string) => parseTime(t.slice(0, 5))!;

// Horários livres de um serviço num dia (de um profissional ou de todos que fazem o serviço).
export async function availability(
  db: Db,
  storeId: string,
  settings: BookingSettings,
  serviceId: string,
  date: string,
  professionalId: string | null,
  ignoreBookingId?: string, // remarcação: o próprio agendamento não ocupa o horário
) {
  if (!bookingDays(todayBR(), settings.maxDays).includes(date)) return { service: null, slots: [] };
  const { services, professionals } = await loadCatalog(db, storeId);
  const service = services.find((s) => s.id === serviceId) ?? null;
  if (!service) return { service: null, slots: [] };
  const pros = professionals.filter((p) => p.serviceIds.includes(serviceId) && (!professionalId || p.id === professionalId));
  if (!pros.length) return { service, slots: [] };

  const from = new Date(dayStartMs(date)).toISOString();
  const to = new Date(dayStartMs(date) + 86_400_000).toISOString();
  const ids = pros.map((p) => p.id);
  const now = Date.now();
  const [{ data: bookings }, { data: blocks }] = await Promise.all([
    db
      .from("bookings")
      .select("id, professional_id, starts_at, ends_at, status, expires_at")
      .eq("store_id", storeId)
      .in("professional_id", ids)
      .in("status", ACTIVE_STATUSES)
      .lt("starts_at", to)
      .gt("ends_at", from),
    db
      .from("time_off")
      .select("professional_id, starts_at, ends_at")
      .eq("store_id", storeId)
      .lt("starts_at", to)
      .gt("ends_at", from),
  ]);
  // Reserva aguardando pagamento que já passou do prazo não segura mais o horário.
  const live = (bookings ?? []).filter(
    (b) => b.id !== ignoreBookingId && (b.status !== "pending_payment" || !b.expires_at || Date.parse(b.expires_at) > now),
  );
  const weekday = weekdayOf(date);

  const byPro = pros.map((p) => {
    const ranges = p.hours.filter((h) => h.weekday === weekday).map((h) => [toMinutes(h.start_time), toMinutes(h.end_time)] as [number, number]);
    const busy: Interval[] = [
      ...live.filter((b) => b.professional_id === p.id).map((b) => [Date.parse(b.starts_at), Date.parse(b.ends_at)] as Interval),
      ...(blocks ?? []).filter((t) => !t.professional_id || t.professional_id === p.id).map((t) => [Date.parse(t.starts_at), Date.parse(t.ends_at)] as Interval),
    ];
    return {
      id: p.id,
      slots: daySlots({ date, ranges, duration: service.duration_minutes, step: settings.slotMinutes, busy, now, minNoticeMinutes: settings.minNoticeMinutes }),
    };
  });
  return { service, slots: mergeSlots(byPro), professionals: pros };
}

export type BookingInput = {
  serviceId: string;
  professionalId: string | null;
  date: string;
  time: number; // minutos desde a meia-noite
  name: string;
  email: string;
  phone: string;
  cpf: string;
  notes: string;
};

// Cria a reserva. Sem pagamento online, já fica confirmada; com pagamento, segura o horário por 30 min.
export async function createBooking(db: Db, storeId: string, input: BookingInput): Promise<{ token: string } | { error: string }> {
  const settings = await getBookingSettings(db, storeId);
  if (!settings?.enabled) return { error: "Esta loja não está aceitando agendamentos no momento." };

  const name = input.name.trim().replace(/\s+/g, " ");
  const email = input.email.trim().toLowerCase();
  const phone = onlyDigits(input.phone).replace(/^55(?=\d{10,11}$)/, "");
  const cpf = onlyDigits(input.cpf);
  if (name.length < 3 || !name.includes(" ")) return { error: "Informe o nome e o sobrenome." };
  if (!isEmail(email)) return { error: "Informe um e-mail válido: a confirmação chega por ele." };
  if (!/^\d{10,11}$/.test(phone)) return { error: "Informe o celular com DDD." };

  const { service, slots, professionals } = await availability(db, storeId, settings, input.serviceId, input.date, input.professionalId);
  if (!service) return { error: "Serviço indisponível para essa data." };
  const slot = slots.find((s) => s.time === input.time);
  if (!slot) return { error: "Esse horário não está mais livre. Escolha outro." };
  // "Qualquer um": o primeiro livre na ordem de cadastro.
  const proId = input.professionalId ?? slot.professionals[0];
  const pro = professionals?.find((p) => p.id === proId);
  if (!pro || !slot.professionals.includes(pro.id)) return { error: "Esse horário não está mais livre. Escolha outro." };

  const online = onlineCents(service.price_cents, service.payment_mode, service.deposit_percent);
  if (online > 0) {
    if (!isValidCPF(cpf)) return { error: "Informe um CPF válido: ele é exigido para o pagamento." };
    const { data: secret } = await db.from("store_secrets").select("gateway_access_token").eq("store_id", storeId).maybeSingle();
    if (!secret?.gateway_access_token) return { error: "Pagamento online indisponível nesta loja no momento. Fale com o salão." };
  }

  // Reserva aguardando pagamento que passou do prazo já aparece como livre; expira agora
  // (sem esperar o job de 5 min), senão o banco ainda recusaria o horário.
  await db
    .from("bookings")
    .update({ status: "expired" })
    .eq("store_id", storeId)
    .eq("professional_id", pro.id)
    .eq("status", "pending_payment")
    .lt("expires_at", new Date().toISOString());

  const startsAt = instantOf(input.date, input.time);
  const { data, error } = await db
    .from("bookings")
    .insert({
      store_id: storeId,
      service_id: service.id,
      service_name: service.name,
      professional_id: pro.id,
      professional_name: pro.name,
      starts_at: new Date(startsAt).toISOString(),
      ends_at: new Date(startsAt + service.duration_minutes * 60_000).toISOString(),
      status: online > 0 ? "pending_payment" : "confirmed",
      expires_at: online > 0 ? new Date(Date.now() + BOOKING_HOLD_MINUTES * 60_000).toISOString() : null,
      customer_name: name,
      customer_email: email,
      customer_phone: phone,
      customer_cpf: online > 0 ? cpf : null,
      notes: input.notes.trim().slice(0, 500) || null,
      price_cents: service.price_cents,
      payment_mode: service.payment_mode,
      online_cents: online,
    })
    .select("id, public_token, status")
    .single();
  // 23P01: o banco recusou por sobreposição (outro cliente pegou o horário no mesmo instante).
  if (error?.code === "23P01") return { error: "Esse horário acabou de ser reservado por outra pessoa. Escolha outro." };
  if (error || !data) {
    console.error("Agendamento não criado", { storeId, error });
    return { error: "Não foi possível agendar agora. Tente de novo." };
  }
  // Quem estava na lista de espera desse dia e conseguiu agendar sai da lista.
  after(async () => {
    await db.from("booking_waitlist").update({ status: "booked" }).eq("store_id", storeId).eq("date", input.date).eq("customer_email", email).eq("status", "waiting");
  });
  // Sem pagamento online já está confirmado: avisa o cliente e o salão.
  if (data.status === "confirmed") {
    after(async () => {
      await notifyBooking(data.id, "confirmed");
      await notifyBooking(data.id, "store");
    });
  }
  return { token: data.public_token };
}

export const BOOKING_PAYMENT_FIELDS = "id, store_id, code, status, online_cents, paid_cents, expires_at, customer_name, customer_email, customer_cpf, service_name, starts_at";

type BookingRef = { id: string; store_id: string; code: string; status: string; online_cents: number };

// Grava o pagamento consultado no Mercado Pago e, se aprovado, confirma o agendamento. Idempotente.
export async function recordBookingPayment(db: Db, booking: BookingRef, payment: GatewayPayment) {
  if (payment.orderId !== `booking:${booking.id}`) return false;
  if (payment.amountCents !== booking.online_cents) {
    after(() =>
      notifyPlatformError("agendamento:valor-divergente", "Pagamento de agendamento com valor diferente", {
        agendamento: booking.code,
        pagamento: payment.id,
        pago: payment.amountCents,
        esperado: booking.online_cents,
      }),
    );
    return false;
  }
  const { error } = await db.from("booking_payments").upsert(
    {
      store_id: booking.store_id,
      booking_id: booking.id,
      provider: PROVIDER,
      provider_payment_id: payment.id,
      method: payment.method,
      status: payment.status,
      amount_cents: payment.amountCents,
      raw: payment.raw,
    },
    { onConflict: "provider,provider_payment_id" },
  );
  if (error) throw error;

  if (payment.status === "approved") {
    const { data: confirmed, error: upErr } = await db
      .from("bookings")
      .update({ status: "confirmed", paid_cents: payment.amountCents, expires_at: null })
      .eq("id", booking.id)
      .in("status", ["pending_payment", "expired"])
      .select("id");
    if (confirmed?.length) {
      after(async () => {
        await notifyBooking(booking.id, "confirmed");
        await notifyBooking(booking.id, "store");
      });
    }
    // Pagou depois de o horário expirar e alguém já pegou: o dinheiro entrou sem horário. Avisa para devolver.
    if (upErr?.code === "23P01") {
      after(() =>
        notifyPlatformError(`agendamento:sem-horario:${booking.id}`, "Agendamento pago depois de o horário ser ocupado", {
          agendamento: booking.code,
          pagamento: payment.id,
          acao: "Combinar outro horário com o cliente ou estornar no painel",
        }),
      );
    } else if (upErr) throw upErr;
  }
  return true;
}

// ---------------------------------------------------------------- autoatendimento (link do cliente) e lembretes

type ManagedBooking = { id: string; status: string; service_id: string | null; professional_id: string | null; starts_at: string; paid_cents: number };

async function loadManaged(db: Db, storeId: string, token: string) {
  const { data } = await db
    .from("bookings")
    .select("id, status, service_id, professional_id, starts_at, paid_cents")
    .eq("store_id", storeId)
    .eq("public_token", token)
    .maybeSingle();
  return data as ManagedBooking | null;
}

// Cancela o agendamento. Pelo cliente (link), só até o prazo da loja. Se houve pagamento online, estorna antes.
export async function cancelBooking(db: Db, storeId: string, token: string, by: "customer" | "store"): Promise<{ ok: true } | { error: string }> {
  const b = await loadManaged(db, storeId, token);
  if (!b || !["confirmed", "pending_payment"].includes(b.status)) return { error: "Este agendamento não pode mais ser cancelado." };
  if (by === "customer") {
    const settings = await getBookingSettings(db, storeId);
    if (!settings || !canSelfManage(b.starts_at, settings.cancelHours)) {
      return { error: "O prazo para cancelar pelo link já passou. Fale com o salão pelo WhatsApp." };
    }
  }

  let refunded = false;
  if (b.paid_cents > 0) {
    const [{ data: paid }, { data: secret }] = await Promise.all([
      db.from("booking_payments").select("provider_payment_id").eq("booking_id", b.id).in("status", ["approved", "refunded"]).limit(1).maybeSingle(),
      db.from("store_secrets").select("gateway_access_token").eq("store_id", storeId).maybeSingle(),
    ]);
    if (!paid || !secret?.gateway_access_token) return { error: "Não foi possível devolver o pagamento agora. Fale com o salão." };
    try {
      const current = await getPayment(paid.provider_payment_id, secret.gateway_access_token);
      if (current.status !== "refunded") await refundPayment(paid.provider_payment_id, secret.gateway_access_token);
      refunded = true;
      await db.from("booking_payments").update({ status: "refunded" }).eq("booking_id", b.id).eq("provider_payment_id", paid.provider_payment_id);
    } catch (err) {
      console.error("Estorno do agendamento recusado", { bookingId: b.id, err });
      after(() => notifyPlatformError(`agendamento:estorno:${b.id}`, "Estorno de agendamento recusado pelo Mercado Pago", { agendamento: b.id, erro: String(err) }));
      return { error: "Não foi possível devolver o pagamento agora. Fale com o salão pelo WhatsApp." };
    }
  }

  const now = new Date().toISOString();
  const { data } = await db
    .from("bookings")
    .update({ status: "canceled", canceled_at: now, ...(refunded ? { refunded_at: now } : {}) })
    .eq("id", b.id)
    .in("status", ["confirmed", "pending_payment"])
    .select("id");
  if (!data?.length) return { error: "Este agendamento não pode mais ser cancelado." };
  if (b.status === "confirmed") after(() => notifyBooking(b.id, "canceled", by));
  after(() => notifyWaitlist(db, storeId, dateOf(b.starts_at))); // horário liberado: avisa a lista de espera
  return { ok: true };
}

// Remarca para outro horário livre (mesmo serviço; o que foi pago continua valendo).
export async function rescheduleBooking(
  db: Db,
  storeId: string,
  token: string,
  target: { date: string; time: number; professionalId: string | null },
): Promise<{ ok: true } | { error: string }> {
  const b = await loadManaged(db, storeId, token);
  if (!b || b.status !== "confirmed" || !b.service_id) return { error: "Este agendamento não pode ser remarcado." };
  const settings = await getBookingSettings(db, storeId);
  if (!settings || !canSelfManage(b.starts_at, settings.cancelHours)) {
    return { error: "O prazo para remarcar pelo link já passou. Fale com o salão pelo WhatsApp." };
  }
  const { service, slots, professionals } = await availability(db, storeId, settings, b.service_id, target.date, target.professionalId, b.id);
  const slot = slots.find((s) => s.time === target.time);
  if (!service || !slot) return { error: "Esse horário não está livre. Escolha outro." };
  // Mantém o mesmo profissional quando ele está livre; senão, o primeiro disponível.
  const proId = target.professionalId ?? (b.professional_id && slot.professionals.includes(b.professional_id) ? b.professional_id : slot.professionals[0]);
  const pro = professionals?.find((p) => p.id === proId);
  if (!pro) return { error: "Esse horário não está livre. Escolha outro." };

  const startsAt = instantOf(target.date, target.time);
  const { data, error } = await db
    .from("bookings")
    .update({
      starts_at: new Date(startsAt).toISOString(),
      ends_at: new Date(startsAt + service.duration_minutes * 60_000).toISOString(),
      professional_id: pro.id,
      professional_name: pro.name,
      notified_reminder_at: null, // o lembrete vale para a nova data
    })
    .eq("id", b.id)
    .eq("status", "confirmed")
    .select("id");
  if (error?.code === "23P01") return { error: "Esse horário acabou de ser reservado por outra pessoa. Escolha outro." };
  if (error || !data?.length) return { error: "Não foi possível remarcar agora. Tente de novo." };
  after(() => notifyBooking(b.id, "rescheduled"));
  after(() => notifyWaitlist(db, storeId, dateOf(b.starts_at))); // o horário antigo ficou livre
  return { ok: true };
}

// Lembrete da véspera: agendamentos confirmados de amanhã (Brasília) que ainda não receberam. Rotina diária.
export async function sendBookingReminders(db: Db, today = todayBR()) {
  const tomorrow = addDays(today, 1);
  const { data, error } = await db
    .from("bookings")
    .select("id")
    .eq("status", "confirmed")
    .is("notified_reminder_at", null)
    .gte("starts_at", new Date(dayStartMs(tomorrow)).toISOString())
    .lt("starts_at", new Date(dayStartMs(addDays(tomorrow, 1))).toISOString());
  if (error) return { reminders: 0, error: error.message }; // sem o SQL da agenda
  for (const b of data ?? []) await notifyBooking(b.id, "reminder");
  return { reminders: data?.length ?? 0 };
}

// ---------------------------------------------------------------- lista de espera

const dateOf = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); // AAAA-MM-DD em Brasília
export const WAITLIST_RENOTIFY_MINUTES = 60; // a mesma pessoa não recebe dois avisos em menos de 1 h
const WAITLIST_MAX_PER_DAY = 100;

export type WaitlistInput = { serviceId: string; professionalId: string | null; date: string; name: string; email: string; phone: string };

// Dia lotado: o cliente entra na lista de espera do serviço (e do profissional, se escolheu um).
export async function joinWaitlist(db: Db, storeId: string, input: WaitlistInput): Promise<{ ok: true } | { error: string }> {
  const settings = await getBookingSettings(db, storeId);
  if (!settings?.enabled) return { error: "Esta loja não está aceitando agendamentos no momento." };
  const name = input.name.trim().replace(/\s+/g, " ");
  const email = input.email.trim().toLowerCase();
  const phone = onlyDigits(input.phone).replace(/^55(?=\d{10,11}$)/, "");
  if (name.length < 3 || !name.includes(" ")) return { error: "Informe o nome e o sobrenome." };
  if (!isEmail(email)) return { error: "Informe um e-mail válido: o aviso chega por ele." };
  if (!/^\d{10,11}$/.test(phone)) return { error: "Informe o celular com DDD." };
  if (!bookingDays(todayBR(), settings.maxDays).includes(input.date)) return { error: "Escolha um dia da agenda." };

  const { services, professionals } = await loadCatalog(db, storeId);
  if (!services.some((s) => s.id === input.serviceId)) return { error: "Serviço indisponível." };
  if (input.professionalId && !professionals.some((p) => p.id === input.professionalId && p.serviceIds.includes(input.serviceId))) {
    return { error: "Profissional indisponível para este serviço." };
  }
  const { count } = await db.from("booking_waitlist").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("date", input.date).eq("status", "waiting");
  if ((count ?? 0) >= WAITLIST_MAX_PER_DAY) return { error: "A lista de espera deste dia está cheia. Escolha outro dia." };

  const { error } = await db.from("booking_waitlist").insert({
    store_id: storeId,
    service_id: input.serviceId,
    professional_id: input.professionalId,
    date: input.date,
    customer_name: name,
    customer_email: email,
    customer_phone: phone,
  });
  // 23505: já está na lista deste serviço e dia (tudo certo, continua na lista).
  if (error && error.code !== "23505") {
    console.error("Lista de espera não gravada", { storeId, error });
    return { error: "Não foi possível entrar na lista agora. Tente de novo." };
  }
  return { ok: true };
}

// Abriu horário no dia (cancelamento ou remarcação): avisa por e-mail quem está na lista e ainda tem horário livre
// para o seu serviço/profissional. Quem agendar primeiro leva; quem não conseguir continua na lista. Nunca lança erro.
export async function notifyWaitlist(db: Db, storeId: string, date: string) {
  try {
    const settings = await getBookingSettings(db, storeId);
    if (!settings?.enabled) return 0;
    const cutoff = new Date(Date.now() - WAITLIST_RENOTIFY_MINUTES * 60_000).toISOString();
    const { data: entries, error } = await db
      .from("booking_waitlist")
      .select("id, service_id, professional_id, notify_count, notified_at")
      .eq("store_id", storeId)
      .eq("date", date)
      .eq("status", "waiting")
      .or(`notified_at.is.null,notified_at.lt.${cutoff}`)
      .order("created_at");
    if (error || !entries?.length) return 0;

    // Disponibilidade calculada uma vez por serviço/profissional.
    const free = new Map<string, string[]>();
    let sent = 0;
    for (const e of entries) {
      const key = `${e.service_id}:${e.professional_id ?? ""}`;
      if (!free.has(key)) {
        const { slots } = await availability(db, storeId, settings, e.service_id, date, e.professional_id);
        free.set(key, slots.map((s) => formatTime(s.time)));
      }
      const labels = free.get(key)!;
      if (!labels.length) continue;
      // Trava: só quem marcar notified_at agora envia (duas liberações ao mesmo tempo não duplicam o e-mail).
      const { data: claimed } = await db
        .from("booking_waitlist")
        .update({ notified_at: new Date().toISOString(), notify_count: e.notify_count + 1 })
        .eq("id", e.id)
        .eq("status", "waiting")
        .or(`notified_at.is.null,notified_at.lt.${cutoff}`)
        .select("id");
      if (!claimed?.length) continue;
      if (await notifyWaitlistOpening(e.id, labels)) sent++;
      // E-mail não saiu: desfaz a marcação, para o próximo horário liberado tentar de novo.
      else await db.from("booking_waitlist").update({ notified_at: e.notified_at, notify_count: e.notify_count }).eq("id", e.id);
    }
    if (sent) {
      const [, m, d] = date.split("-");
      await pushToStore(storeId, {
        title: "Horário liberado na agenda",
        body: `Avisamos ${sent} ${sent === 1 ? "pessoa" : "pessoas"} da lista de espera de ${d}/${m}.`,
        url: `/painel/agenda?dia=${date}`,
        tag: `waitlist-${date}`,
      });
    }
    return sent;
  } catch (err) {
    console.error("Falha ao avisar a lista de espera", { storeId, date, err });
    return 0;
  }
}
