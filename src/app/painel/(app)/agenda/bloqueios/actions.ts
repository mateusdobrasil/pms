"use server";

import { revalidatePath } from "next/cache";
import { requireStore } from "@/lib/panel";
import { isUuid } from "@/lib/validation";
import { parseTime } from "@/lib/booking";
import { addDays } from "@/lib/billing";

export type TimeOffState = { error?: string; ok?: string } | null;

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
// Data e hora de Brasília → instante (sem horário de verão desde 2019).
const brt = (date: string, time: string) => `${date}T${time}:00-03:00`;

export async function createTimeOff(_prev: TimeOffState, form: FormData): Promise<TimeOffState> {
  const { supabase, store } = await requireStore("agenda");
  const pro = String(form.get("professional_id") ?? "");
  const startDate = String(form.get("start_date") ?? "");
  const endDate = String(form.get("end_date") ?? "") || startDate;
  const startTime = String(form.get("start_time") ?? "").trim();
  const endTime = String(form.get("end_time") ?? "").trim();
  const reason = String(form.get("reason") ?? "").trim().slice(0, 100);

  if (pro && !isUuid(pro)) return { error: "Profissional inválido." };
  if (!isDate(startDate) || !isDate(endDate)) return { error: "Informe as datas." };
  if ((startTime && parseTime(startTime) === null) || (endTime && parseTime(endTime) === null)) return { error: "Horário inválido (use 13:00)." };
  // Sem horário: dias inteiros (do início do primeiro dia ao fim do último).
  const startsAt = brt(startDate, startTime || "00:00");
  const endsAt = endTime ? brt(endDate, endTime) : brt(addDays(endDate, 1), "00:00");
  if (Date.parse(endsAt) <= Date.parse(startsAt)) return { error: "O fim precisa ser depois do início." };
  if (Date.parse(endsAt) - Date.parse(startsAt) > 366 * 86_400_000) return { error: "Bloqueio de no máximo um ano." };

  if (pro) {
    const { data } = await supabase.from("professionals").select("id").eq("id", pro).eq("store_id", store.id).maybeSingle();
    if (!data) return { error: "Profissional inválido." };
  }
  const { error } = await supabase.from("time_off").insert({ store_id: store.id, professional_id: pro || null, starts_at: startsAt, ends_at: endsAt, reason: reason || null });
  if (error) return { error: "Não foi possível salvar o bloqueio." };
  revalidatePath("/painel/agenda/bloqueios");
  return { ok: "Bloqueio salvo. Esses horários não aparecem mais para agendar." };
}

export async function deleteTimeOff(form: FormData) {
  const { supabase, store } = await requireStore("agenda");
  const id = String(form.get("id") ?? "");
  if (isUuid(id)) await supabase.from("time_off").delete().eq("id", id).eq("store_id", store.id);
  revalidatePath("/painel/agenda/bloqueios");
}
