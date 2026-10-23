"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStore } from "@/lib/panel";
import { isUuid } from "@/lib/validation";
import { WEEKDAYS, formatTime, parseRanges } from "@/lib/booking";

export type ProfessionalState = { error?: string; ok?: string } | null;

const readName = (form: FormData) => String(form.get("name") ?? "").trim().replace(/\s+/g, " ");

export async function createProfessional(_prev: ProfessionalState, form: FormData): Promise<ProfessionalState> {
  const { supabase, store } = await requireStore();
  const name = readName(form);
  if (name.length < 2 || name.length > 60) return { error: "Informe o nome (até 60 caracteres)." };
  const { data: last } = await supabase.from("professionals").select("position").eq("store_id", store.id).order("position", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase
    .from("professionals")
    .insert({ store_id: store.id, name, position: (last?.position ?? -1) + 1 })
    .select("id")
    .single();
  if (error) return { error: "Não foi possível cadastrar." };
  // Já cadastra os serviços (todos, por padrão) e um horário comercial de segunda a sábado, para ajustar.
  const { data: services } = await supabase.from("services").select("id").eq("store_id", store.id);
  if (services?.length) {
    await supabase.from("professional_services").insert(services.map((s) => ({ store_id: store.id, professional_id: data.id, service_id: s.id })));
  }
  await supabase.from("working_hours").insert(
    [1, 2, 3, 4, 5, 6].map((weekday) => ({ store_id: store.id, professional_id: data.id, weekday, start_time: "09:00", end_time: "18:00" })),
  );
  revalidatePath("/painel/agenda", "layout");
  redirect(`/painel/agenda/profissionais/${data.id}?novo=1`);
}

// Salva tudo do profissional: nome, ativo, serviços que faz e horários da semana.
export async function saveProfessional(_prev: ProfessionalState, form: FormData): Promise<ProfessionalState> {
  const { supabase, store } = await requireStore();
  const id = String(form.get("id") ?? "");
  if (!isUuid(id)) return { error: "Profissional não encontrado." };
  const name = readName(form);
  if (name.length < 2 || name.length > 60) return { error: "Informe o nome (até 60 caracteres)." };

  const hours: { weekday: number; start_time: string; end_time: string }[] = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    const parsed = parseRanges(String(form.get(`hours_${weekday}`) ?? ""));
    if ("error" in parsed) return { error: `${WEEKDAYS[weekday]}: ${parsed.error}` };
    for (const [a, b] of parsed.ranges) hours.push({ weekday, start_time: formatTime(a), end_time: formatTime(b) });
  }
  const serviceIds = form.getAll("services").map(String).filter(isUuid);

  const { data, error } = await supabase
    .from("professionals")
    .update({ name, active: form.get("active") === "on" })
    .eq("id", id)
    .eq("store_id", store.id)
    .select("id");
  if (error || !data?.length) return { error: "Não foi possível salvar." };

  // Serviços e horários: troca tudo pelo que está na tela.
  await supabase.from("professional_services").delete().eq("professional_id", id).eq("store_id", store.id);
  if (serviceIds.length) {
    const { data: valid } = await supabase.from("services").select("id").eq("store_id", store.id).in("id", serviceIds);
    if (valid?.length) {
      await supabase.from("professional_services").insert(valid.map((s) => ({ store_id: store.id, professional_id: id, service_id: s.id })));
    }
  }
  await supabase.from("working_hours").delete().eq("professional_id", id).eq("store_id", store.id);
  if (hours.length) {
    const { error: hErr } = await supabase.from("working_hours").insert(hours.map((h) => ({ ...h, store_id: store.id, professional_id: id })));
    if (hErr) return { error: "Não foi possível salvar os horários." };
  }

  revalidatePath("/painel/agenda", "layout");
  return { ok: "Profissional salvo." };
}

export async function deleteProfessional(form: FormData) {
  const { supabase, store } = await requireStore();
  const id = String(form.get("id") ?? "");
  if (isUuid(id)) await supabase.from("professionals").delete().eq("id", id).eq("store_id", store.id);
  revalidatePath("/painel/agenda", "layout");
  redirect("/painel/agenda/profissionais");
}
