-- Pacotes de sessões, fase 2: compra online pela loja e agendamento sem sinal para quem tem pacote.

-- Ativação do pacote comprado online: o pagamento confirma pelo webhook e pelo polling (às vezes ao mesmo
-- tempo). seq numera as unidades do mesmo pacote numa venda; o índice impede ativar duas vezes.
alter table public.customer_packages add column if not exists seq integer not null default 1;
create unique index if not exists customer_packages_once_idx on public.customer_packages (order_id, package_id, seq)
  where order_id is not null and package_id is not null;

-- Agendamento feito por quem tem pacote: dispensa o sinal e fica ligado ao pacote (o lojista usa a sessão no atendimento).
alter table public.bookings
  add column if not exists customer_package_id uuid references public.customer_packages(id) on delete set null;
