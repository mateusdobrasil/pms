-- =====================================================================
-- Base multi-tenant da plataforma de lojas
-- Regras: toda tabela tem store_id; valores em centavos (integer);
-- pedidos e pagamentos são escritos apenas pelo servidor (service role).
-- =====================================================================
create extension if not exists pgcrypto;

-- Tipos -----------------------------------------------------------------
create type public.store_status   as enum ('active', 'suspended');
create type public.member_role    as enum ('owner', 'staff');
create type public.order_status   as enum ('pending_payment', 'paid', 'preparing', 'shipped', 'delivered', 'canceled', 'expired');
create type public.payment_status as enum ('pending', 'approved', 'rejected', 'refunded', 'expired');
create type public.payment_method as enum ('pix', 'card');

-- Lojas -----------------------------------------------------------------
create table public.stores (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          text not null,
  status        public.store_status not null default 'active',
  logo_url      text,
  primary_color text not null default '#1f2937',
  whatsapp      text,               -- só dígitos, com DDI: 5511999999999
  email         text,
  origin_zip    text,               -- CEP de origem para o frete
  created_at    timestamptz not null default now()
);

create table public.store_domains (
  domain     text primary key check (domain = lower(domain)),
  store_id   uuid not null references public.stores(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.store_domains (store_id);

-- Credenciais: sem nenhuma policy, só a service role lê.
-- Evolução recomendada: mover os tokens para o Supabase Vault.
create table public.store_secrets (
  store_id             uuid primary key references public.stores(id) on delete cascade,
  gateway_access_token text,
  melhor_envio_token   text,
  updated_at           timestamptz not null default now()
);

create table public.store_members (
  store_id   uuid not null references public.stores(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       public.member_role not null default 'owner',
  created_at timestamptz not null default now(),
  primary key (store_id, user_id)
);
create index on public.store_members (user_id);

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- Catálogo --------------------------------------------------------------
create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid not null references public.stores(id) on delete cascade,
  name       text not null,
  slug       text not null,
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  unique (store_id, slug)
);

create table public.products (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  name        text not null,
  slug        text not null,
  description text,
  active      boolean not null default true,
  featured    boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (store_id, slug)
);
create index on public.products (store_id, active);

create table public.product_variants (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references public.stores(id) on delete cascade,
  product_id       uuid not null references public.products(id) on delete cascade,
  name             text not null default 'Único',   -- ex.: "M / Azul"
  sku              text,
  price_cents      integer not null check (price_cents >= 0),
  compare_at_cents integer check (compare_at_cents >= 0),
  stock            integer not null default 0 check (stock >= 0),
  weight_g         integer not null default 300 check (weight_g > 0),
  height_cm        numeric(6,1) not null default 5,
  width_cm         numeric(6,1) not null default 15,
  length_cm        numeric(6,1) not null default 20,
  active           boolean not null default true,
  position         integer not null default 0
);
create index on public.product_variants (product_id);

create table public.product_images (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  path       text not null,   -- caminho no bucket: <store_id>/<arquivo>
  alt        text,
  position   integer not null default 0
);
create index on public.product_images (product_id);

-- Pedidos ---------------------------------------------------------------
create table public.orders (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references public.stores(id) on delete cascade,
  code                text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  public_token        uuid not null unique default gen_random_uuid(), -- link de acompanhamento sem login
  status              public.order_status not null default 'pending_payment',
  customer_name       text not null,
  customer_email      text not null,
  customer_cpf        text not null,
  customer_phone      text,
  shipping_address    jsonb,          -- nulo quando for retirada local
  shipping_method     text not null,  -- 'pickup' ou nome do serviço do Melhor Envio
  shipping_service_id text,
  subtotal_cents      integer not null check (subtotal_cents >= 0),
  shipping_cents      integer not null default 0 check (shipping_cents >= 0),
  total_cents         integer not null check (total_cents >= 0),
  tracking_code       text,
  stock_issue         boolean not null default false, -- pago, mas faltou estoque: tratar manualmente
  expires_at          timestamptz,
  paid_at             timestamptz,
  created_at          timestamptz not null default now()
);
create index on public.orders (store_id, created_at desc);
create index on public.orders (expires_at) where status = 'pending_payment';

create table public.order_items (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references public.stores(id) on delete cascade,
  order_id         uuid not null references public.orders(id) on delete cascade,
  variant_id       uuid references public.product_variants(id) on delete set null,
  product_name     text not null,   -- cópia no momento da compra
  variant_name     text not null,
  unit_price_cents integer not null check (unit_price_cents >= 0),
  quantity         integer not null check (quantity > 0)
);
create index on public.order_items (order_id);

create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references public.stores(id) on delete cascade,
  order_id            uuid not null references public.orders(id) on delete cascade,
  provider            text not null,
  provider_payment_id text not null,
  method              public.payment_method not null,
  status              public.payment_status not null default 'pending',
  amount_cents        integer not null check (amount_cents >= 0),
  raw                 jsonb,
  created_at          timestamptz not null default now(),
  unique (provider, provider_payment_id)
);
create index on public.payments (order_id);

-- Garante idempotência dos webhooks do gateway.
create table public.webhook_events (
  id           uuid primary key default gen_random_uuid(),
  provider     text not null,
  event_id     text not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, event_id)
);

-- Funções auxiliares ----------------------------------------------------
create or replace function public.is_store_member(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from store_members where store_id = sid and user_id = auth.uid());
$$;

create or replace function public.store_is_active(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from stores where id = sid and status = 'active');
$$;

-- Confirma o pagamento e baixa o estoque de forma atômica.
-- Idempotente: só age em pedidos ainda em 'pending_payment'.
create or replace function public.confirm_order_payment(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r       record;
  v_issue boolean := false;
begin
  perform 1 from orders where id = p_order_id and status = 'pending_payment' for update;
  if not found then
    return;
  end if;

  for r in select variant_id, quantity from order_items where order_id = p_order_id and variant_id is not null loop
    update product_variants set stock = stock - r.quantity
     where id = r.variant_id and stock >= r.quantity;
    if not found then
      v_issue := true;
    end if;
  end loop;

  update orders set status = 'paid', paid_at = now(), stock_issue = v_issue
   where id = p_order_id;
end;
$$;

-- Expira pedidos Pix não pagos. Agende com pg_cron:
-- select cron.schedule('expirar-pedidos', '*/5 * * * *', $$select public.expire_pending_orders()$$);
create or replace function public.expire_pending_orders()
returns integer language sql security definer set search_path = public as $$
  with x as (
    update orders set status = 'expired'
     where status = 'pending_payment' and expires_at < now()
    returning 1
  )
  select count(*)::integer from x;
$$;

revoke execute on function public.confirm_order_payment(uuid) from public, anon, authenticated;
revoke execute on function public.expire_pending_orders()     from public, anon, authenticated;

-- RLS -------------------------------------------------------------------
alter table public.stores           enable row level security;
alter table public.store_domains    enable row level security;
alter table public.store_secrets    enable row level security;
alter table public.store_members    enable row level security;
alter table public.platform_admins  enable row level security;
alter table public.categories       enable row level security;
alter table public.products         enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_images   enable row level security;
alter table public.orders           enable row level security;
alter table public.order_items      enable row level security;
alter table public.payments         enable row level security;
alter table public.webhook_events   enable row level security;
-- store_secrets, platform_admins e webhook_events ficam sem policy: só service role.

-- Lojas
create policy "public reads active stores" on public.stores for select using (status = 'active');
create policy "members read own store"     on public.stores for select using (public.is_store_member(id));
create policy "members update own store"   on public.stores for update
  using (public.is_store_member(id)) with check (public.is_store_member(id));
-- O lojista não pode alterar status nem slug (a suspensão é decisão sua).
revoke update on public.stores from authenticated;
grant update (name, logo_url, primary_color, whatsapp, email, origin_zip) on public.stores to authenticated;

create policy "public reads domains"       on public.store_domains for select using (true);
create policy "users read own memberships" on public.store_members for select using (user_id = auth.uid());

-- Catálogo: leitura pública se a loja estiver ativa; gestão pelos membros
create policy "public reads categories" on public.categories for select using (public.store_is_active(store_id));
create policy "members manage categories" on public.categories for all
  using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));

create policy "public reads active products" on public.products for select
  using (active and public.store_is_active(store_id));
create policy "members manage products" on public.products for all
  using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));

create policy "public reads active variants" on public.product_variants for select
  using (active and public.store_is_active(store_id)
         and exists (select 1 from public.products p where p.id = product_id and p.active));
create policy "members manage variants" on public.product_variants for all
  using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));

create policy "public reads images" on public.product_images for select using (public.store_is_active(store_id));
create policy "members manage images" on public.product_images for all
  using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));

-- Pedidos: criados só pelo servidor; o lojista lê e muda status/rastreio
create policy "members read orders"   on public.orders for select using (public.is_store_member(store_id));
create policy "members update orders" on public.orders for update
  using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));
revoke update on public.orders from authenticated;
grant update (status, tracking_code) on public.orders to authenticated;

create policy "members read order items" on public.order_items for select using (public.is_store_member(store_id));
create policy "members read payments"    on public.payments    for select using (public.is_store_member(store_id));

-- Storage: imagens em product-images/<store_id>/... ------------------------
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

create policy "members upload product images" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and exists (
    select 1 from public.store_members m
     where m.user_id = auth.uid() and m.store_id::text = (storage.foldername(name))[1]));

create policy "members update product images" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and exists (
    select 1 from public.store_members m
     where m.user_id = auth.uid() and m.store_id::text = (storage.foldername(name))[1]));

create policy "members delete product images" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and exists (
    select 1 from public.store_members m
     where m.user_id = auth.uid() and m.store_id::text = (storage.foldername(name))[1]));
