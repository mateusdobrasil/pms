-- Links de pagamento avulsos: o lojista cria uma cobrança (descrição + valor) e manda o link no WhatsApp/Instagram.
-- O cliente abre loja.com.br/pagar/<token>, informa os dados e paga por Pix ou cartão. Cada tentativa vira um
-- pedido comum (orders.payment_link_id), então pagamento, webhook, e-mails, painel e estorno são os mesmos.
create table if not exists public.payment_links (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references public.stores(id) on delete cascade,
  public_token uuid not null unique default gen_random_uuid(),
  title        text not null check (char_length(title) between 2 and 120),
  amount_cents integer not null check (amount_cents between 100 and 100000000), -- de R$ 1,00 a R$ 1 milhão
  reusable     boolean not null default false, -- true: continua aberto depois de pago (ex.: sinal fixo na bio)
  status       text not null default 'active' check (status in ('active', 'paid', 'canceled')),
  expires_at   timestamptz, -- nulo = sem validade
  paid_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists payment_links_store_idx on public.payment_links (store_id, created_at desc);

alter table public.payment_links enable row level security;
create policy "members read own payment links" on public.payment_links for select using (public.is_store_member(store_id));
create policy "members create own payment links" on public.payment_links for insert with check (public.is_store_member(store_id));
create policy "members update own payment links" on public.payment_links for update
  using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));
-- O lojista só cancela (status); valor, descrição e token não mudam depois de enviados ao cliente.
revoke update on public.payment_links from authenticated;
grant update (status) on public.payment_links to authenticated;

alter table public.orders add column if not exists payment_link_id uuid references public.payment_links(id) on delete set null;
create index if not exists orders_payment_link_idx on public.orders (payment_link_id) where payment_link_id is not null;

-- Pedido do link pago: link de uso único passa a "pago" (vale para checkout, polling e webhook).
create or replace function public.payment_link_paid()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.payment_link_id is not null and new.status = 'paid' and old.status is distinct from 'paid' then
    update payment_links set status = 'paid', paid_at = now()
     where id = new.payment_link_id and status = 'active' and not reusable;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_payment_link_paid on public.orders;
create trigger orders_payment_link_paid after update of status on public.orders
  for each row execute function public.payment_link_paid();
