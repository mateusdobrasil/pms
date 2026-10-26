-- Clientes que sumiram (Painel → Clientes): a lista vem dos pedidos pagos e dos agendamentos; aqui fica só
-- o que o lojista marca em cada cliente: quando chamou no WhatsApp e se o cliente pediu para não ser chamado.
-- customer_key: celular (só dígitos, sem o 55) ou, sem celular, o e-mail em minúsculas.
create table if not exists public.customer_contacts (
  store_id       uuid not null references public.stores(id) on delete cascade,
  customer_key   text not null check (char_length(customer_key) between 5 and 200),
  contacted_at   timestamptz,
  do_not_contact boolean not null default false,
  updated_at     timestamptz not null default now(),
  primary key (store_id, customer_key)
);

alter table public.customer_contacts enable row level security;
create policy "members read customer contacts" on public.customer_contacts for select using (public.is_store_member(store_id));
create policy "members create customer contacts" on public.customer_contacts for insert with check (public.is_store_member(store_id));
create policy "members update customer contacts" on public.customer_contacts for update
  using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));
