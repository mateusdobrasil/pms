-- Formas de entrega combináveis (Painel → Configurações → Entrega), no lugar de stores.shipping_mode:
--   shipping_pickup         retirada na loja
--   shipping_carriers       transportadoras do Melhor Envio: 'none', 'correios' (só PAC/SEDEX) ou 'all'
--   local_delivery_enabled  entrega própria do lojista nas cidades de local_delivery_areas

alter table public.stores
  add column shipping_pickup        boolean not null default true,
  add column shipping_carriers      text    not null default 'all' check (shipping_carriers in ('none', 'correios', 'all')),
  add column local_delivery_enabled boolean not null default false;

-- Mantém o que cada loja já tinha escolhido.
update public.stores set
  shipping_pickup   = shipping_mode <> 'me',
  shipping_carriers = case shipping_mode when 'pickup' then 'none' when 'pickup_correios' then 'correios' else 'all' end;

alter table public.stores drop column shipping_mode;

grant update (shipping_pickup, shipping_carriers, local_delivery_enabled) on public.stores to authenticated;

-- Cidades da entrega própria, cada uma com o seu preço. A cidade do cliente vem do CEP (ViaCEP, no servidor);
-- a comparação ignora acentos e maiúsculas.
create table public.local_delivery_areas (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references public.stores(id) on delete cascade,
  city          text not null check (char_length(city) between 2 and 60),
  state         text not null check (state ~ '^[A-Z]{2}$'),
  price_cents   integer not null check (price_cents >= 0),        -- 0 = grátis
  delivery_days integer check (delivery_days between 0 and 30),  -- nulo = sem prazo informado; 0 = no mesmo dia
  position      integer not null default 0,
  created_at    timestamptz not null default now()
);
create index on public.local_delivery_areas (store_id);

-- O lojista gerencia as cidades da própria loja; a vitrine lê pelo servidor (service role).
alter table public.local_delivery_areas enable row level security;
create policy "members manage local delivery areas" on public.local_delivery_areas for all
  using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));
