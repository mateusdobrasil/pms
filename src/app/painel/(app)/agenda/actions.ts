"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireStore } from "@/lib/panel";
import { createAdminClient } from "@/lib/supabase/admin";
import { isEmail, isUuid, onlyDigits } from "@/lib/validation";
import { parseTime } from "@/lib/booking";
import { instantOf } from "@/lib/booking-slots";
import { cancelBooking } from "@/lib/booking-server";
import { notifyBooking } from "@/lib/email";
import { bookingCommissionPercent } from "@/lib/commission-server";
import { checkLoyaltyForBooking } from "@/lib/loyalty-server";
import { receiveBooking } from "@/lib/counter-server";

export type AgendaState = { error?: string; ok?: string } | null;

// Agendamentos só são alterados pelo servidor (service role), sempre depois de conferir que são da loja.
async function ownBooking(id: string) {
  const { store } = await requireStore();
  if (!isUuid(id)) return null;
  const db = createAdminClient();
  const { data } = await db.from("bookings").select("id, public_token, status").eq("id", id).eq("store_id", store.id).maybeSingle();
  return data ? { db, store, booking: data } : null;
}

const refresh = () => revalidatePath("/painel", "layout");

// Atendido ou faltou (só agendamentos confirmados).
export async function setBookingStatus(_prev: AgendaState, form: FormData): Promise<AgendaState> {
  const status = String(form.get("status") ?? "");
  if (status !== "completed" && status !== "no_show") return { error: "Situação inválida." };
  const own = await ownBooking(String(form.get("id") ?? ""));
  if (!own) return { error: "Agendamento não encontrado." };
  // Atendido: grava o percentual de comissão de agora (mudar o percentual depois não altera este atendimento).
  const commission = status === "completed" ? await bookingCommissionPercent(own.db, own.booking.id) : undefined;
  const { data } = await own.db
    .from("bookings")
    .update({ status, ...(commission !== undefined ? { commission_percent: commission } : {}) })
    .eq("id", own.booking.id)
    .eq("status", "confirmed")
    .select("id");
  if (!data?.length) return { error: "Este agendamento não está mais confirmado." };
  if (status === "completed") after(() => checkLoyaltyForBooking(own.booking.id)); // carimbo do cartão fidelidade
  refresh();
  return { ok: status === "completed" ? "Marcado como atendido." : "Marcado como falta." };
}

// O salão cancela (sem prazo). Pagamento online é estornado antes.
export async function cancelBookingByStore(_prev: AgendaState, form: FormData): Promise<AgendaState> {
  const own = await ownBooking(String(form.get("id") ?? ""));
  if (!own) return { error: "Agendamento não encontrado." };
  const r = await cancelBooking(own.db, own.store.id, own.booking.public_token, "store");
  if ("error" in r) return { error: r.error };
  refresh();
  return { ok: "Agendamento cancelado. O cliente foi avisado." };
}

// Encaixe: agendamento feito pelo salão (balcão, WhatsApp). Aceita qualquer horário que não bata com outro
// agendamento do profissional; o pagamento é no salão.
export async function createManualBooking(_prev: AgendaState, form: FormData): Promise<AgendaState> {
  const { store } = await requireStore();
  const db = createAdminClient();
  const serviceId = String(form.get("service_id") ?? "");
  const proId = String(form.get("professional_id") ?? "");
  const date = String(form.get("date") ?? "");
  const time = parseTime(String(form.get("time") ?? ""));
  const name = String(form.get("name") ?? "").trim().replace(/\s+/g, " ");
  const phone = onlyDigits(String(form.get("phone") ?? "")).replace(/^55(?=\d{10,11}$)/, "");
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const notes = String(form.get("notes") ?? "").trim().slice(0, 500);

  if (!isUuid(serviceId) || !isUuid(proId)) return { error: "Escolha o serviço e o profissional." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || time === null) return { error: "Informe o dia e o horário." };
  if (name.length < 2) return { error: "Informe o nome do cliente." };
  if (phone && !/^\d{10,11}$/.test(phone)) return { error: "Celular inválido: use DDD + número." };
  if (email && !isEmail(email)) return { error: "E-mail inválido." };

  const [{ data: service }, { data: pro }] = await Promise.all([
    db.from("services").select("id, name, duration_minutes, price_cents").eq("id", serviceId).eq("store_id", store.id).maybeSingle(),
    db.from("professionals").select("id, name").eq("id", proId).eq("store_id", store.id).maybeSingle(),
  ]);
  if (!service || !pro) return { error: "Serviço ou profissional não encontrado." };

  const startsAt = instantOf(date, time);
  const { data, error } = await db
    .from("bookings")
    .insert({
      store_id: store.id,
      service_id: service.id,
      service_name: service.name,
      professional_id: pro.id,
      professional_name: pro.name,
      starts_at: new Date(startsAt).toISOString(),
      ends_at: new Date(startsAt + service.duration_minutes * 60_000).toISOString(),
      status: "confirmed",
      customer_name: name,
      customer_email: email || null,
      customer_phone: phone || null,
      notes: notes || null,
      price_cents: service.price_cents,
      payment_mode: "onsite",
      online_cents: 0,
      source: "store",
    })
    .select("id")
    .single();
  if (error?.code === "23P01") return { error: `${pro.name} já tem um agendamento nesse horário.` };
  if (error || !data) return { error: "Não foi possível agendar." };
  // Com e-mail, o cliente recebe a confirmação (com o link para remarcar ou cancelar).
  if (email) after(() => notifyBooking(data.id, "confirmed"));
  refresh();
  return { ok: `Agendado: ${service.name} com ${pro.name}.` };
}

// Receber no salão o que falta do agendamento: vira uma venda de balcão (caixa do dia) e marca como atendido.
export async function receiveBookingAction(bookingId: string, payment: unknown, discountCents: unknown) {
  const own = await ownBooking(bookingId);
  if (!own) return { ok: false as const, error: "Agendamento não encontrado." };
  try {
    const r = await receiveBooking(own.db, own.store.id, own.booking.id, payment, discountCents);
    if (r.ok && r.completedNow) after(() => checkLoyaltyForBooking(own.booking.id)); // carimbo do cartão fidelidade
    refresh();
    return r.ok ? { ok: true as const, code: r.code, totalCents: r.totalCents } : r;
  } catch (err) {
    console.error("Recebimento de agendamento não registrado", { bookingId, err });
    return { ok: false as const, error: "Não foi possível registrar o recebimento. Tente de novo." };
  }
}
