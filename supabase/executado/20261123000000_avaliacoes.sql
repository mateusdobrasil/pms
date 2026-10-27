-- Avaliações: o cliente dá nota (1 a 5) e comentário para a compra ou o atendimento. Todas aparecem na loja; o
-- lojista pode responder publicamente e ocultar só as ofensivas (palavrão, dados pessoais), com o motivo.
create table if not exists public.reviews (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references public.stores(id) on delete cascade,
  order_id          uuid unique references public.orders(id) on delete cascade,
  booking_id        uuid unique references public.bookings(id) on delete cascade,
  service_id        uuid references public.services(id) on delete set null, -- agendamento: nota também por serviço
  service_name      text,
  professional_name text,
  rating            integer not null check (rating between 1 and 5),
  comment           text check (char_length(comment) <= 1000),
  author_name       text not null, -- "Ana S." (nome e inicial do sobrenome; nunca e-mail ou telefone)
  reply             text check (char_length(reply) <= 1000),
  replied_at        timestamptz,
  hidden            boolean not null default false,
  hidden_reason     text,
  created_at        timestamptz not null default now(),
  check (order_id is not null or booking_id is not null)
);
create index if not exists reviews_store_idx on public.reviews (store_id, created_at desc);
alter table public.reviews enable row level security;
create policy "public reads visible reviews" on public.reviews for select using (not hidden);
create policy "members read reviews" on public.reviews for select using (public.is_store_member(store_id));
-- Gravar (avaliar, responder, ocultar): só o servidor (service role), depois de conferir o link ou o login.

-- Pedido de avaliação enviado (trava: um por pedido ou agendamento).
alter table public.orders add column if not exists review_requested_at timestamptz;
alter table public.bookings add column if not exists review_requested_at timestamptz;
