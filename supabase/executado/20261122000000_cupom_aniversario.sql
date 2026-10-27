-- Cupom de aniversário: o cliente informa dia e mês (opcional) no checkout ou no agendamento; no dia, recebe um
-- cupom pessoal (1 uso, com validade) por e-mail e, se aceitou novidades, pelo WhatsApp.

-- Configuração da loja (Painel → Divulgar → Cupons).
alter table public.stores
  add column if not exists birthday_enabled    boolean not null default false,
  add column if not exists birthday_kind       text    not null default 'percent' check (birthday_kind in ('percent', 'fixed')),
  add column if not exists birthday_value      integer not null default 10 check (birthday_value > 0),
  add column if not exists birthday_valid_days integer not null default 30 check (birthday_valid_days between 1 and 90),
  add column if not exists birthday_applies_to text    not null default 'all' check (birthday_applies_to in ('all', 'products', 'services'));
grant update (birthday_enabled, birthday_kind, birthday_value, birthday_valid_days, birthday_applies_to) on public.stores to authenticated;

-- Aniversário dos clientes (um por loja e cliente; a chave é o celular, como em Clientes).
create table if not exists public.customer_birthdays (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references public.stores(id) on delete cascade,
  customer_key   text not null,
  name           text not null,
  email          text,
  phone          text,
  birthday       text not null check (birthday ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$'), -- MM-DD
  last_sent_year integer, -- trava: um cupom por ano
  updated_at     timestamptz not null default now(),
  unique (store_id, customer_key)
);
create index if not exists customer_birthdays_day_idx on public.customer_birthdays (store_id, birthday);
alter table public.customer_birthdays enable row level security;
create policy "members read customer birthdays" on public.customer_birthdays for select using (public.is_store_member(store_id));
-- Só o servidor grava (service role).

-- Cupons criados pelo sistema (aniversário) ficam fora da lista principal do painel.
alter table public.coupons
  add column if not exists origin       text not null default 'manual' check (origin in ('manual', 'birthday')),
  add column if not exists customer_key text;
