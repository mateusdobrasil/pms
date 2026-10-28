import type { ReactNode } from "react";
import Link from "next/link";
import { requireStore } from "@/lib/panel";
import { AgendaTabs } from "./agenda-tabs";

// Área de agendamentos: abas e aviso quando o módulo está desligado (ou sem o SQL).
export default async function AgendaLayout({ children }: { children: ReactNode }) {
  const { supabase, store, role } = await requireStore("agenda");
  const { data, error } = await supabase.from("stores").select("booking_enabled").eq("id", store.id).single();

  if (error) {
    return <p className="rounded-xl border bg-white p-5 text-sm text-neutral-500">A agenda ainda não está disponível para a sua loja. Fale com o suporte.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Agenda</h1>
        <AgendaTabs role={role} />
      </div>
      {!data?.booking_enabled && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Os agendamentos pela loja estão <strong>desligados</strong>. Cadastre serviços e profissionais e, quando estiver pronto, ligue em{" "}
          <Link href="/painel/configuracoes#agendamentos" className="font-semibold underline">Configurações → Agendamentos</Link>.
        </p>
      )}
      {children}
    </div>
  );
}
