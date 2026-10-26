-- Comissão por profissional (Agenda → Comissões).
-- professionals.commission_percent: percentual geral do profissional (ex.: 40 = 40% do valor do serviço).
-- professional_services.commission_percent: percentual próprio daquele serviço para aquele profissional (opcional).
-- bookings.commission_percent: percentual gravado quando o atendimento é marcado como atendido
-- (mudar o percentual depois não altera o que já foi fechado).
alter table public.professionals
  add column if not exists commission_percent numeric(5,2) check (commission_percent between 0 and 100);
alter table public.professional_services
  add column if not exists commission_percent numeric(5,2) check (commission_percent between 0 and 100);
alter table public.bookings
  add column if not exists commission_percent numeric(5,2) check (commission_percent between 0 and 100);
