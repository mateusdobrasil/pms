-- Pacotes de sessões (Agenda → Pacotes): "5 escovas por R$ 200". O cliente paga uma vez (venda de balcão) e cada
-- atendimento desconta uma sessão. Sessões restantes = sessions_total − usos (package_uses).

-- Pacotes à venda (modelo).
create table if not exists public.service_packages (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references public.stores(id) on delete cascade,
  service_id    uuid not null references public.services(id) on delete cascade,
  name          text not null check (char_length(name) between 2 and 80),
  sessions      integer not null check (sessions between 2 and 100),
  price_cents   integer not null check (price_cents >= 100),
  validity_days integer check (validity_days between 1 and 1095), -- nulo = sem validade
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists service_packages_store_idx on public.service_packages (store_id);

-- Pacotes dos clientes (vendidos): cópia do modelo na hora da venda.
create table if not exists public.customer_packages (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references public.stores(id) on delete cascade,
  package_id     uuid references public.service_packages(id) on delete set null,
  service_id     uuid references public.services(id) on delete set null,
  name           text not null,
  service_name   text not null,
  sessions_total integer not null check (sessions_total > 0),
  price_cents    integer not null,
  customer_name  text not null,
  customer_phone text,
  customer_email text,
  customer_key   text not null, -- celular (só dígitos) ou e-mail, como em Clientes
  order_id       uuid references public.orders(id) on delete set null,
  status         text not null default 'active' check (status in ('active', 'canceled')),
  expires_at     timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists customer_packages_key_idx on public.customer_packages (store_id, customer_key) where status = 'active';

-- Cada sessão usada: num agendamento (booking_id, uma vez por agendamento) ou no balcão, com quem atendeu
-- (para a comissão, pelo valor do serviço).
create table if not exists public.package_uses (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references public.stores(id) on delete cascade,
  customer_package_id uuid not null references public.customer_packages(id) on delete cascade,
  booking_id          uuid unique references public.bookings(id) on delete set null,
  professional_id     uuid references public.professionals(id) on delete set null,
  professional_name   text,
  price_cents         integer not null default 0, -- valor do serviço na hora (base da comissão)
  commission_percent  numeric(5,2) check (commission_percent between 0 and 100),
  used_at             timestamptz not null default now()
);
create index if not exists package_uses_pkg_idx on public.package_uses (customer_package_id);

-- Venda de pacote no balcão: o item da venda aponta o modelo vendido.
alter table public.order_items add column if not exists package_id uuid references public.service_packages(id) on delete set null;

alter table public.service_packages enable row level security;
alter table public.customer_packages enable row level security;
alter table public.package_uses enable row level security;
create policy "members manage service packages" on public.service_packages for all
  using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));
create policy "members read customer packages" on public.customer_packages for select using (public.is_store_member(store_id));
create policy "members read package uses" on public.package_uses for select using (public.is_store_member(store_id));
-- Pacotes dos clientes e usos: só o servidor grava (service role, depois de conferir o login).
