import Link from "next/link";
import { notFound } from "next/navigation";
import { getStoreByDomain } from "@/lib/store";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatBRL } from "@/lib/money";
import { isUuid } from "@/lib/validation";
import { PaymentPanel } from "../../payment-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Seu agendamento", robots: { index: false } };

const TITLES: Record<string, string> = {
  pending_payment: "Falta o pagamento",
  confirmed: "Agendamento confirmado",
  completed: "Atendimento realizado",
  no_show: "Não compareceu",
  canceled: "Agendamento cancelado",
  expired: "Horário liberado",
};

// "terça-feira, 10 de novembro de 2026, às 14:30" (Brasília)
function longWhen(iso: string) {
  const d = new Date(iso);
  const day = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const time = d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  return `${day}, às ${time}`;
}

// Página do agendamento (link com public_token, sem login): pagamento, confirmação e resumo.
export default async function BookingPage({ params }: { params: Promise<{ domain: string; token: string }> }) {
  const { domain, token } = await params;
  if (!isUuid(token)) notFound();
  const store = await getStoreByDomain(domain);
  if (!store) notFound();

  const db = createAdminClient();
  const { data: b } = await db
    .from("bookings")
    .select("id, code, status, service_name, professional_name, starts_at, ends_at, customer_email, price_cents, payment_mode, online_cents, paid_cents, expires_at")
    .eq("store_id", store.id)
    .eq("public_token", token)
    .maybeSingle();
  if (!b) notFound();

  const expired = b.status === "expired" || (b.status === "pending_payment" && b.expires_at && new Date(b.expires_at) < new Date());
  const awaiting = b.status === "pending_payment" && !expired;
  const status = expired ? "expired" : b.status;
  let publicKey: string | null = null;
  if (awaiting) {
    const { data: secret } = await db.from("store_secrets").select("gateway_public_key").eq("store_id", store.id).maybeSingle();
    publicKey = secret?.gateway_public_key ?? null;
  }
  const remaining = b.price_cents - b.paid_cents;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header>
        <p className="text-sm text-neutral-500">Agendamento {b.code}</p>
        <h1 className="text-2xl font-bold tracking-tight">{TITLES[status] ?? status}</h1>
        {status === "confirmed" && <p className="mt-2 text-neutral-600">Tudo certo! Enviamos a confirmação para {b.customer_email}. Guarde este link.</p>}
        {awaiting && (
          <p className="mt-2 text-neutral-600">
            Seu horário está reservado por alguns minutos. Pague {b.payment_mode === "deposit" ? "o sinal" : "o valor"} para confirmar.
          </p>
        )}
        {expired && (
          <p className="mt-2 text-neutral-600">
            O pagamento não foi concluído a tempo e o horário foi liberado. <Link href="/agendar" className="font-medium underline">Agende de novo</Link>.
          </p>
        )}
      </header>

      <section className="space-y-1 rounded-xl border p-5">
        <p className="text-lg font-semibold">{b.service_name}</p>
        <p className="text-neutral-700">{longWhen(b.starts_at)}</p>
        <p className="text-neutral-600">com {b.professional_name}</p>
        <div className="mt-3 space-y-1 border-t pt-3 text-sm">
          <p className="flex justify-between"><span>Valor do serviço</span><span>{formatBRL(b.price_cents)}</span></p>
          {b.online_cents > 0 && (
            <p className="flex justify-between">
              <span>{b.payment_mode === "deposit" ? "Sinal (online)" : "Pagamento online"}</span>
              <span>{b.paid_cents >= b.online_cents ? `pago ${formatBRL(b.paid_cents)}` : formatBRL(b.online_cents)}</span>
            </p>
          )}
          {(status === "confirmed" || awaiting) && remaining > 0 && (
            <p className="flex justify-between font-semibold">
              <span>A pagar no salão</span>
              <span>{formatBRL(b.paid_cents >= b.online_cents ? remaining : b.price_cents - b.online_cents)}</span>
            </p>
          )}
        </div>
      </section>

      {awaiting && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Pagamento</h2>
          <PaymentPanel
            token={token}
            apiBase={`/api/bookings/${token}`}
            totalCents={b.online_cents}
            pixTotalCents={b.online_cents}
            publicKey={publicKey}
            payerEmail={b.customer_email ?? ""}
          />
        </section>
      )}

      {store.whatsapp && (
        <p className="text-sm text-neutral-600">
          Precisa mudar algo? <a href={`https://wa.me/${store.whatsapp}`} target="_blank" rel="noopener noreferrer" className="font-medium underline">Fale com o salão no WhatsApp</a>.
        </p>
      )}
    </div>
  );
}
