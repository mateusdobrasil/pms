-- Notificações no celular do lojista (Web Push): cada aparelho/navegador que ativou os avisos no painel.
-- Sem policy: só a service role lê e grava (o painel grava por server action depois de conferir o login).
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid not null references public.stores(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null unique,  -- endereço do serviço de push do navegador (Google, Apple, Mozilla, Microsoft)
  p256dh     text not null,         -- chaves do navegador para criptografar a mensagem
  auth       text not null,
  device     text,                  -- "Android · Chrome", para o lojista reconhecer o aparelho
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_store_idx on public.push_subscriptions (store_id);

alter table public.push_subscriptions enable row level security;
