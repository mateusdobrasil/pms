-- Lista de espera da agenda: dia lotado, o cliente deixa nome, celular e e-mail para o serviço e o dia.
-- Quando um horário abre nesse dia (cancelamento ou remarcação), quem está na lista recebe um e-mail na hora,
-- e quem agendar primeiro leva. Gravação só pelo servidor (service role); o lojista lê no painel.
create table if not exists public.booking_waitlist (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references public.stores(id) on delete cascade,
  service_id      uuid not null references public.services(id) on delete cascade,
  professional_id uuid references public.professionals(id) on delete cascade, -- nulo = qualquer profissional
  date            date not null,
  customer_name   text not null,
  customer_email  text not null,
  customer_phone  text not null,
  status          text not null default 'waiting' check (status in ('waiting', 'booked')),
  notified_at     timestamptz, -- último aviso de horário livre (não repete em menos de 1 h)
  notify_count    integer not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists booking_waitlist_day_idx on public.booking_waitlist (store_id, date) where status = 'waiting';
-- Uma inscrição por pessoa, serviço e dia.
create unique index if not exists booking_waitlist_once_idx on public.booking_waitlist (store_id, service_id, date, customer_email) where status = 'waiting';

alter table public.booking_waitlist enable row level security;
create policy "members read waitlist" on public.booking_waitlist for select using (public.is_store_member(store_id));
