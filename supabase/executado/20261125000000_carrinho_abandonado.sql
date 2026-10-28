-- Carrinho abandonado: o cliente preenche o e-mail no checkout e não finaliza. Uma hora depois recebe um lembrete
-- (e-mail e, se aceitou novidades, WhatsApp dentro da cota de campanhas), com o link que refaz o carrinho.

-- 1) Liga/desliga por loja (vem ligado; o lojista desliga em Configurações).
alter table public.stores add column if not exists abandoned_cart_enabled boolean not null default true;
grant update (abandoned_cart_enabled) on public.stores to authenticated;

-- 2) Um carrinho por e-mail em cada loja (o mais recente). Itens só com variante e quantidade: preço e estoque
--    são conferidos de novo no lembrete e no checkout.
create table if not exists public.abandoned_carts (
  id                 uuid primary key default gen_random_uuid(),
  store_id           uuid not null references public.stores(id) on delete cascade,
  email              text not null,
  name               text,
  phone              text,
  whatsapp_optin     boolean not null default false, -- marcou "quero receber novidades" no checkout
  items              jsonb not null,                 -- [{"variantId": "...", "quantity": 2}]
  token              uuid not null unique default gen_random_uuid(), -- links "voltar ao carrinho" e "não quero lembretes"
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  notified_at        timestamptz,  -- trava: um lembrete por carrinho
  notified_whatsapp  boolean not null default false,
  recovered_at       timestamptz,  -- abriu o link do lembrete
  converted_at       timestamptz,  -- fez o pedido
  converted_order_id uuid references public.orders(id) on delete set null,
  opted_out_at       timestamptz,  -- não quer mais lembretes desta loja
  unique (store_id, email)
);
create index if not exists abandoned_carts_pending on public.abandoned_carts (updated_at)
  where notified_at is null and converted_at is null and opted_out_at is null;
create index if not exists abandoned_carts_store on public.abandoned_carts (store_id, updated_at desc);

-- Gravado só pelo servidor (service role). O painel (dono e Recepção) lê a lista.
alter table public.abandoned_carts enable row level security;
create policy "members read abandoned carts" on public.abandoned_carts for select using (public.is_store_member(store_id));
