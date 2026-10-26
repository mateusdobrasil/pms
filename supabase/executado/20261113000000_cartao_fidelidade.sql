-- Cartão fidelidade digital (Painel → Clientes): a cada N atendimentos e/ou compras, o cliente ganha um prêmio.
-- Os carimbos não são gravados um a um: saem dos atendimentos "atendido" e das compras pagas desde loyalty_started_at.
alter table public.stores
  add column if not exists loyalty_enabled boolean not null default false,
  add column if not exists loyalty_goal integer not null default 10 check (loyalty_goal between 2 and 50),
  add column if not exists loyalty_reward text check (char_length(loyalty_reward) <= 120),
  add column if not exists loyalty_counts text not null default 'both' check (loyalty_counts in ('orders', 'bookings', 'both')),
  add column if not exists loyalty_min_order_cents integer not null default 0 check (loyalty_min_order_cents >= 0),
  add column if not exists loyalty_started_at timestamptz;

grant update (loyalty_enabled, loyalty_goal, loyalty_reward, loyalty_counts, loyalty_min_order_cents, loyalty_started_at) on public.stores to authenticated;

-- Prêmios conquistados (o 1º, o 2º...): a linha nasce quando o cliente completa o cartão (trava do e-mail)
-- e redeemed_at marca quando o lojista entregou.
create table if not exists public.loyalty_rewards (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references public.stores(id) on delete cascade,
  customer_key   text not null, -- celular (só dígitos) ou e-mail, como em Clientes
  number         integer not null check (number > 0),
  reward         text not null, -- o prêmio na época (mudar o prêmio depois não altera o já conquistado)
  customer_name  text,
  customer_email text,
  earned_at      timestamptz not null default now(),
  redeemed_at    timestamptz,
  unique (store_id, customer_key, number)
);
create index if not exists loyalty_rewards_open_idx on public.loyalty_rewards (store_id) where redeemed_at is null;

alter table public.loyalty_rewards enable row level security;
create policy "members read loyalty rewards" on public.loyalty_rewards for select using (public.is_store_member(store_id));
create policy "members redeem loyalty rewards" on public.loyalty_rewards for update
  using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));
revoke update on public.loyalty_rewards from authenticated;
grant update (redeemed_at) on public.loyalty_rewards to authenticated;
