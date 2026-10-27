-- Cupom também na agenda e nos pacotes. Cada cupom escolhe onde vale: na loja virtual (produtos), na agenda e
-- nos pacotes (serviços) ou em tudo.
alter table public.coupons
  add column if not exists applies_to text not null default 'all' check (applies_to in ('all', 'products', 'services'));

-- No agendamento: o cupom e o desconto (price_cents já sai com o desconto; o sinal é calculado sobre ele).
alter table public.bookings
  add column if not exists coupon_id             uuid references public.coupons(id) on delete set null,
  add column if not exists coupon_code           text,
  add column if not exists coupon_discount_cents integer not null default 0 check (coupon_discount_cents >= 0);
create index if not exists bookings_coupon_idx on public.bookings (coupon_id) where coupon_id is not null;
