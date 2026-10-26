-- Resumo do mês por e-mail para o lojista (dia 1, 8h): trava para cada loja receber um resumo por mês.
-- A rotina roda nos dias 1, 2 e 3: se o envio falhar, a linha é apagada e o dia seguinte tenta de novo.
create table if not exists public.store_monthly_reports (
  store_id uuid not null references public.stores(id) on delete cascade,
  month    date not null, -- primeiro dia do mês do resumo
  sent_at  timestamptz not null default now(),
  primary key (store_id, month)
);

alter table public.store_monthly_reports enable row level security;
-- Sem policy: só a service role (rotina mensal).
