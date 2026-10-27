-- Cupons de desconto da loja virtual (Painel → Cupons). Desconto sobre os produtos (não sobre o frete),
-- percentual ou valor fixo, com validade, valor mínimo, limite de usos e opção de 1 uso por CPF.
-- O desconto do Pix continua valendo, calculado sobre o valor dos produtos já com o cupom.
create table if not exists public.coupons (
  id                 uuid primary key default gen_random_uuid(),
  store_id           uuid not null references public.stores(id) on delete cascade,
  code               text not null check (code ~ '^[A-Z0-9_-]{3,30}$'), -- sempre em maiúsculas
  kind               text not null check (kind in ('percent', 'fixed')),
  value              integer not null check (value > 0), -- percent: 1 a 90; fixed: centavos
  min_subtotal_cents integer check (min_subtotal_cents > 0), -- nulo = sem mínimo
  starts_at          timestamptz,
  ends_at            timestamptz,
  max_uses           integer check (max_uses > 0), -- nulo = sem limite
  once_per_customer  boolean not null default false, -- 1 uso por CPF
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  check (kind <> 'percent' or value <= 90),
  unique (store_id, code)
);

alter table public.coupons enable row level security;
create policy "members manage coupons" on public.coupons for all
  using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));

-- No pedido: o cupom usado e o desconto dele (fixo desde a criação). O total já sai com o cupom:
-- cartão cobra subtotal + frete − cupom; Pix cobra isso − pix_discount_cents. discount_cents = desconto total
-- aplicado (cupom, e o cupom + Pix quando o Pix é aprovado).
alter table public.orders
  add column if not exists coupon_id             uuid references public.coupons(id) on delete set null,
  add column if not exists coupon_code           text,
  add column if not exists coupon_discount_cents integer not null default 0 check (coupon_discount_cents >= 0);
create index if not exists orders_coupon_idx on public.orders (coupon_id) where coupon_id is not null;
