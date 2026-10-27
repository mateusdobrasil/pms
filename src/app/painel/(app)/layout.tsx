import type { ReactNode } from "react";
import Link from "next/link";
import { requireStore } from "@/lib/panel";
import { formatDay, lastPayDay, todayBR } from "@/lib/billing";
import { storeTestMode, testAccessUrl } from "@/lib/test-mode";
import { signOut } from "../actions";
import { PanelNav } from "./panel-nav";
import { panelAppMetadata, panelViewport } from "../app-metadata";

export const metadata = { title: "Painel · PMS app", robots: { index: false }, ...panelAppMetadata };
export const viewport = panelViewport;

export default async function PanelLayout({ children }: { children: ReactNode }) {
  const { supabase, store, email } = await requireStore();
  // Fatura vencida mais antiga (aviso no topo de todas as telas). Se a tabela ainda não existir, segue sem aviso.
  const { data: overdue } = await supabase
    .from("store_invoices")
    .select("due_date")
    .eq("store_id", store.id)
    .eq("status", "open")
    .lt("due_date", todayBR())
    .order("due_date")
    .limit(1);
  const oldestDue = overdue?.[0]?.due_date as string | undefined;

  // Menu "Agenda": agendamentos ligados ou já com serviço cadastrado (sem o SQL, fica escondido).
  // Menu "Campanhas": loja com cota de campanhas no WhatsApp (SQL 20261120200000; sem ele, escondido).
  const [{ data: bookingRow }, { count: serviceCount }, { data: campaignRow }] = await Promise.all([
    supabase.from("stores").select("booking_enabled").eq("id", store.id).maybeSingle(),
    supabase.from("services").select("id", { count: "exact", head: true }).eq("store_id", store.id),
    supabase.from("stores").select("whatsapp_campaign_quota").eq("id", store.id).maybeSingle(),
  ]);
  const agenda = !!(bookingRow as { booking_enabled?: boolean } | null)?.booking_enabled || (serviceCount ?? 0) > 0;
  const campaigns = ((campaignRow as { whatsapp_campaign_quota?: number } | null)?.whatsapp_campaign_quota ?? 0) > 0;

  // Modo de teste (Mercado Pago TEST-): link que libera as compras de teste no domínio da loja.
  const testMode = await storeTestMode(store.id);
  const { data: domains } = testMode
    ? await supabase.from("store_domains").select("domain, is_primary").eq("store_id", store.id)
    : { data: null };
  const testDomain = (domains?.find((d) => d.is_primary) ?? domains?.[0])?.domain;

  return (
    <div className="min-h-screen bg-neutral-100">
      <header className="bg-neutral-900 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            {store.logo_url ? (
              // Fundo branco: logos escuros ou com transparência somem no topo escuro do painel.
              <span className="flex h-10 shrink-0 items-center rounded-lg bg-white px-2 py-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={store.logo_url} alt={store.name} className="h-full w-auto max-w-32 object-contain" />
              </span>
            ) : (
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary-500 text-sm font-bold">
                {store.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 leading-tight">
              <p className="truncate font-semibold">{store.name}</p>
              <p className="text-xs text-neutral-400">Painel da loja</p>
            </div>
          </div>
          <form action={signOut} className="flex items-center gap-3 text-sm text-neutral-300 sm:order-last">
            <Link href="/painel/conta" className="hidden rounded-md px-2 py-1 hover:bg-white/10 hover:text-white md:inline" title="Minha conta">
              {email}
            </Link>
            <Link href="/painel/conta" className="rounded-md px-2 py-1 hover:bg-white/10 hover:text-white md:hidden">Conta</Link>
            <button type="submit" className="rounded-md px-2 py-1 hover:bg-white/10 hover:text-white">Sair</button>
          </form>
          <div className="w-full sm:w-auto sm:flex-1">
            <PanelNav agenda={agenda} campaigns={campaigns} />
          </div>
        </div>
      </header>
      {store.status === "suspended" ? (
        <p className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">
          {oldestDue ? (
            <>
              Sua loja está fora do ar por falta de pagamento.{" "}
              <Link href="/painel/assinatura" className="font-semibold underline">Pague a fatura</Link> e ela volta ao ar sozinha.
            </>
          ) : (
            "Sua loja está suspensa e não aparece para os clientes. Fale com o suporte."
          )}
        </p>
      ) : (
        oldestDue && (
          <p className="bg-red-50 px-4 py-2 text-center text-sm text-red-800">
            Fatura vencida em {formatDay(oldestDue)}. Pague até {formatDay(lastPayDay(oldestDue))} para a loja não sair do ar.{" "}
            <Link href="/painel/assinatura" className="font-semibold underline">Pagar agora</Link>
          </p>
        )
      )}
      {testMode && store.status === "active" && (
        <p className="bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
          Sua loja está em <strong>modo de teste</strong>: os clientes veem &quot;Loja em preparação&quot; e não conseguem comprar.
          {testDomain && (
            <>
              {" "}Para fazer compras de teste,{" "}
              <a href={testAccessUrl(testDomain, store.id)} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                abra a loja por este link
              </a>
              .
            </>
          )}
        </p>
      )}
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
