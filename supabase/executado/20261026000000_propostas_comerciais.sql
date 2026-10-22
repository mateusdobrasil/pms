-- Propostas comerciais da plataforma (/admin → Propostas), enviadas a lojistas interessados.
-- Exceção à regra do store_id: a proposta vem antes de a loja existir (como platform_admins).
-- O cliente vê a proposta em pmsapp.dev/proposta/<public_token> e pode aceitar por lá.
create table if not exists public.proposals (
  id                uuid primary key default gen_random_uuid(),
  public_token      uuid not null unique default gen_random_uuid(),
  client_name       text not null,          -- pessoa de contato
  business_name     text not null,          -- nome do negócio / da futura loja
  email             text,
  whatsapp          text,                   -- só dígitos, com DDD (sem o 55)
  setup_fee_cents   integer not null default 0 check (setup_fee_cents >= 0),
  monthly_fee_cents integer not null default 0 check (monthly_fee_cents >= 0),
  valid_until       date not null,
  items             text not null default '', -- o que está incluído, um item por linha
  notes             text,                   -- condições e observações
  sent_at           timestamptz,
  viewed_at         timestamptz,            -- primeira vez que o cliente abriu
  accepted_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Sem policy: só o servidor (service role) lê e grava.
alter table public.proposals enable row level security;
