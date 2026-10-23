-- "Avise-me quando chegar": o cliente deixa o e-mail numa opção esgotada; quando o lojista repõe
-- o estoque, o servidor envia um e-mail (uma vez) e marca notified_at.
create table if not exists public.stock_alerts (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores(id) on delete cascade,
  variant_id  uuid not null references public.product_variants(id) on delete cascade,
  email       text not null,
  created_at  timestamptz not null default now(),
  notified_at timestamptz
);
-- Um pedido de aviso por e-mail e opção (enquanto não for avisado).
create unique index if not exists stock_alerts_pending on public.stock_alerts (variant_id, email) where notified_at is null;
create index if not exists stock_alerts_store on public.stock_alerts (store_id) where notified_at is null;

-- O lojista vê quantos esperam; criar e avisar é só do servidor (service role).
alter table public.stock_alerts enable row level security;
drop policy if exists "members read own stock alerts" on public.stock_alerts;
create policy "members read own stock alerts" on public.stock_alerts for select using (public.is_store_member(store_id));
