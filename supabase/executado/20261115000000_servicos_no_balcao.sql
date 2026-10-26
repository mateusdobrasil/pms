-- Serviços no balcão: receber no salão o valor de um agendamento e vender serviço para quem chegou sem horário.
-- Itens de serviço numa venda: serviço, profissional e o percentual de comissão gravado na hora da venda.
alter table public.order_items
  add column if not exists service_id uuid references public.services(id) on delete set null,
  add column if not exists professional_id uuid references public.professionals(id) on delete set null,
  add column if not exists professional_name text,
  add column if not exists commission_percent numeric(5,2) check (commission_percent between 0 and 100),
  add column if not exists booking_id uuid references public.bookings(id) on delete set null; -- recebimento de um agendamento

-- booking_id: a venda é o recebimento daquele agendamento (comissão e fidelidade continuam vindo do agendamento).
-- has_services: a venda tem atendimento sem horário (conta como atendimento no cartão fidelidade).
alter table public.orders
  add column if not exists booking_id uuid references public.bookings(id) on delete set null,
  add column if not exists has_services boolean not null default false;

-- Um agendamento é recebido uma vez só (venda cancelada libera para receber de novo).
create unique index if not exists orders_one_receipt_per_booking on public.orders (booking_id)
  where booking_id is not null and status <> 'canceled';
