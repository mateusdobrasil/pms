-- Agendamentos (salões, barbearias, estética): serviços, profissionais, horários, bloqueios e reservas.
-- O lojista liga o módulo em Configurações; a vitrine ganha a página /agendar.
create extension if not exists btree_gist with schema extensions;

-- Configurações da agenda (o lojista altera).
alter table public.stores
  add column if not exists booking_enabled             boolean not null default false,
  add column if not exists booking_slot_minutes        integer not null default 30 check (booking_slot_minutes in (10, 15, 20, 30, 60)),
  add column if not exists booking_min_notice_minutes  integer not null default 120 check (booking_min_notice_minutes between 0 and 10080),
  add column if not exists booking_max_days            integer not null default 30 check (booking_max_days between 1 and 180),
  add column if not exists booking_cancel_hours        integer not null default 24 check (booking_cancel_hours between 0 and 168);
grant update (booking_enabled, booking_slot_minutes, booking_min_notice_minutes, booking_max_days, booking_cancel_hours)
  on public.stores to authenticated;

-- Serviços ------------------------------------------------------------------
create table if not exists public.services (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references public.stores(id) on delete cascade,
  name             text not null,
  description      text,
  duration_minutes integer not null check (duration_minutes between 5 and 720),
  price_cents      integer not null check (price_cents >= 0),
  -- full: paga tudo online · deposit: sinal online (deposit_percent) e o resto no salão · onsite: paga no salão
  payment_mode     text not null default 'onsite' check (payment_mode in ('full', 'deposit', 'onsite')),
  deposit_percent  integer check (deposit_percent between 1 and 99),
  active           boolean not null default true,
  position         integer not null default 0,
  created_at       timestamptz not null default now(),
  check (payment_mode <> 'deposit' or deposit_percent is not null)
);
create index if not exists services_store on public.services (store_id, position);

-- Profissionais ---------------------------------------------------------------
create table if not exists public.professionals (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid not null references public.stores(id) on delete cascade,
  name       text not null,
  active     boolean not null default true,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists professionals_store on public.professionals (store_id, position);

-- Quais serviços cada profissional faz.
create table if not exists public.professional_services (
  store_id        uuid not null references public.stores(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  service_id      uuid not null references public.services(id) on delete cascade,
  primary key (professional_id, service_id)
);

-- Horário semanal de cada profissional (várias faixas por dia: 09:00–12:00 e 13:00–18:00).
create table if not exists public.working_hours (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references public.stores(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  weekday         smallint not null check (weekday between 0 and 6), -- 0 = domingo
  start_time      time not null,
  end_time        time not null,
  check (start_time < end_time)
);
create index if not exists working_hours_prof on public.working_hours (professional_id, weekday);

-- Bloqueios: folga, férias, feriado. professional_id nulo = salão todo fechado.
create table if not exists public.time_off (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references public.stores(id) on delete cascade,
  professional_id uuid references public.professionals(id) on delete cascade,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  reason          text,
  check (starts_at < ends_at)
);
create index if not exists time_off_store on public.time_off (store_id, ends_at);

-- Agendamentos -----------------------------------------------------------------
create table if not exists public.bookings (
  id                    uuid primary key default gen_random_uuid(),
  store_id              uuid not null references public.stores(id) on delete cascade,
  code                  text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  public_token          uuid not null unique default gen_random_uuid(), -- link do cliente (ver, cancelar, remarcar)
  service_id            uuid references public.services(id) on delete set null,
  service_name          text not null,      -- cópia no momento do agendamento
  professional_id       uuid references public.professionals(id) on delete set null,
  professional_name     text not null,
  starts_at             timestamptz not null,
  ends_at               timestamptz not null,
  -- pending_payment: horário segurado enquanto o cliente paga (expires_at) · confirmed · completed · no_show · canceled · expired
  status                text not null default 'confirmed'
                          check (status in ('pending_payment', 'confirmed', 'completed', 'no_show', 'canceled', 'expired')),
  customer_name         text not null,
  customer_email        text,
  customer_phone        text,
  notes                 text,
  price_cents           integer not null check (price_cents >= 0),
  payment_mode          text not null check (payment_mode in ('full', 'deposit', 'onsite')),
  online_cents          integer not null default 0 check (online_cents >= 0), -- valor a pagar online (tudo, sinal ou zero)
  paid_cents            integer not null default 0,
  expires_at            timestamptz,
  source                text not null default 'customer' check (source in ('customer', 'store')), -- loja ou painel (encaixe)
  created_at            timestamptz not null default now(),
  canceled_at           timestamptz,
  refunded_at           timestamptz,
  notified_confirmed_at timestamptz,
  notified_reminder_at  timestamptz,
  notified_canceled_at  timestamptz,
  notified_store_at     timestamptz,
  check (starts_at < ends_at)
);
create index if not exists bookings_store_time on public.bookings (store_id, starts_at);
create index if not exists bookings_hold on public.bookings (expires_at) where status = 'pending_payment';

-- Dois agendamentos ativos do mesmo profissional nunca se sobrepõem (o banco garante, mesmo com cliques simultâneos).
alter table public.bookings drop constraint if exists bookings_no_overlap;
alter table public.bookings add constraint bookings_no_overlap
  exclude using gist (professional_id with =, tstzrange(starts_at, ends_at) with &&)
  where (status in ('pending_payment', 'confirmed', 'completed'));

-- Pagamentos dos agendamentos (Mercado Pago do lojista), separados dos pagamentos de pedidos.
create table if not exists public.booking_payments (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references public.stores(id) on delete cascade,
  booking_id          uuid not null references public.bookings(id) on delete cascade,
  provider            text not null,
  provider_payment_id text not null,
  method              text not null,      -- pix ou card
  status              text not null,      -- pending, approved, rejected, refunded, expired
  amount_cents        integer not null,
  raw                 jsonb,
  created_at          timestamptz not null default now(),
  unique (provider, provider_payment_id)
);

-- Libera os horários segurados de quem não pagou (a cada 5 minutos, como os pedidos).
create or replace function public.expire_pending_bookings()
returns integer language sql security definer set search_path = public as $$
  with x as (
    update bookings set status = 'expired'
     where status = 'pending_payment' and expires_at < now()
    returning 1
  )
  select count(*)::integer from x;
$$;
revoke execute on function public.expire_pending_bookings() from public, anon, authenticated;
select cron.schedule('expirar-agendamentos', '*/5 * * * *', $$select public.expire_pending_bookings()$$);

-- RLS ---------------------------------------------------------------------------
alter table public.services              enable row level security;
alter table public.professionals         enable row level security;
alter table public.professional_services enable row level security;
alter table public.working_hours         enable row level security;
alter table public.time_off              enable row level security;
alter table public.bookings              enable row level security;
alter table public.booking_payments      enable row level security;

-- A vitrine lê o catálogo de serviços e profissionais ativos (horários livres são calculados no servidor).
drop policy if exists "public reads active services" on public.services;
create policy "public reads active services" on public.services for select using (active and public.store_is_active(store_id));
drop policy if exists "public reads active professionals" on public.professionals;
create policy "public reads active professionals" on public.professionals for select using (active and public.store_is_active(store_id));
drop policy if exists "public reads professional services" on public.professional_services;
create policy "public reads professional services" on public.professional_services for select using (public.store_is_active(store_id));

-- O lojista gerencia tudo da própria loja.
drop policy if exists "members manage services" on public.services;
create policy "members manage services" on public.services for all using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));
drop policy if exists "members manage professionals" on public.professionals;
create policy "members manage professionals" on public.professionals for all using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));
drop policy if exists "members manage professional services" on public.professional_services;
create policy "members manage professional services" on public.professional_services for all using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));
drop policy if exists "members manage working hours" on public.working_hours;
create policy "members manage working hours" on public.working_hours for all using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));
drop policy if exists "members manage time off" on public.time_off;
create policy "members manage time off" on public.time_off for all using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));
-- Agendamentos: o lojista lê e muda status; criar e cobrar é do servidor (service role).
drop policy if exists "members read bookings" on public.bookings;
create policy "members read bookings" on public.bookings for select using (public.is_store_member(store_id));
drop policy if exists "members read booking payments" on public.booking_payments;
create policy "members read booking payments" on public.booking_payments for select using (public.is_store_member(store_id));
