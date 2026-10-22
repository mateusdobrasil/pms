-- Cobrança da plataforma: taxa de implantação e mensalidade de cada loja.
-- As faturas são pagas no Mercado Pago da PLATAFORMA (Pix, cartão ou boleto) e confirmadas por webhook.
-- Um job diário (Vercel Cron → /api/cron/cobranca) gera as mensalidades, manda os avisos e suspende
-- a loja com mais de 20 dias de atraso; ao pagar, a loja volta sozinha.

-- Valores e início da cobrança: só o super-admin altera (sem grant para o lojista).
alter table public.stores
  add column if not exists setup_fee_cents   integer not null default 0 check (setup_fee_cents >= 0),
  add column if not exists monthly_fee_cents integer not null default 0 check (monthly_fee_cents >= 0),
  add column if not exists billing_starts_on date,                     -- vencimento da 1ª mensalidade (dia 9); null = sem mensalidade
  add column if not exists suspended_for_billing boolean not null default false; -- suspensa pelo job (volta sozinha ao pagar)

create table if not exists public.store_invoices (
  id                    uuid primary key default gen_random_uuid(),
  store_id              uuid not null references public.stores(id) on delete cascade,
  kind                  text not null check (kind in ('setup', 'monthly')),
  reference_month       date,               -- 1º dia do mês da mensalidade; null na implantação
  amount_cents          integer not null check (amount_cents > 0),
  due_date              date not null,
  status                text not null default 'open' check (status in ('open', 'paid', 'canceled')),
  paid_at               timestamptz,
  payment_id            text,               -- id do pagamento no Mercado Pago (null se baixada à mão)
  payment_method        text,               -- pix, credit_card, bolbradesco... ou manual
  notified_issued_at    timestamptz,        -- travas dos e-mails (cada aviso sai uma vez só)
  notified_overdue_at   timestamptz,
  notified_warning_at   timestamptz,
  notified_suspended_at timestamptz,
  notified_paid_at      timestamptz,
  created_at            timestamptz not null default now(),
  check ((kind = 'monthly') = (reference_month is not null))
);

-- Uma mensalidade por mês e uma implantação por loja (o job pode rodar de novo sem duplicar).
create unique index if not exists store_invoices_one_month on public.store_invoices (store_id, reference_month) where kind = 'monthly';
create unique index if not exists store_invoices_one_setup on public.store_invoices (store_id) where kind = 'setup';
create index if not exists store_invoices_open on public.store_invoices (status, due_date);

-- O lojista só lê as faturas da própria loja; criar e baixar é do servidor (service role).
alter table public.store_invoices enable row level security;
drop policy if exists "members read own invoices" on public.store_invoices;
create policy "members read own invoices" on public.store_invoices for select using (public.is_store_member(store_id));
