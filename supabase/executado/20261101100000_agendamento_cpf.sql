-- CPF do cliente no agendamento: o Mercado Pago exige no Pix (como em orders.customer_cpf).
-- Só é pedido quando o serviço tem pagamento online.
alter table public.bookings add column if not exists customer_cpf text;
