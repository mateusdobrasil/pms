-- Campanhas no WhatsApp (marketing): o lojista manda novidades e promoções só para quem aceitou receber,
-- dentro de uma cota mensal definida pelo super-admin (o custo por mensagem é da plataforma).

-- Cota mensal de mensagens de campanha por loja (0 = sem campanhas; a caixa de aceite nem aparece).
alter table public.stores add column if not exists whatsapp_campaign_quota integer not null default 0 check (whatsapp_campaign_quota >= 0);

-- Quem aceitou receber (caixa no checkout e no agendamento). Saiu = opted_out_at (pelo link da mensagem).
create table if not exists public.whatsapp_optins (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references public.stores(id) on delete cascade,
  phone        text not null check (phone ~ '^\d{10,11}$'), -- DDD + número, sem o 55
  name         text not null,
  source       text not null check (source in ('checkout', 'agenda')),
  opted_in_at  timestamptz not null default now(),
  opted_out_at timestamptz,
  token        uuid not null default gen_random_uuid() unique, -- link "não quero mais receber"
  unique (store_id, phone)
);
alter table public.whatsapp_optins enable row level security;
create policy "members read whatsapp optins" on public.whatsapp_optins for select using (public.is_store_member(store_id));

-- Campanhas e a fila de envio (um destinatário por linha; a rotina envia aos poucos).
create table if not exists public.whatsapp_campaigns (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores(id) on delete cascade,
  text        text not null check (char_length(text) between 5 and 300),
  link        text not null,
  coupon_code text,
  status      text not null default 'sending' check (status in ('sending', 'done', 'canceled')),
  total       integer not null default 0,
  created_at  timestamptz not null default now()
);
create table if not exists public.whatsapp_campaign_recipients (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.whatsapp_campaigns(id) on delete cascade,
  store_id    uuid not null references public.stores(id) on delete cascade,
  optin_id    uuid not null references public.whatsapp_optins(id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  error       text,
  sent_at     timestamptz,
  unique (campaign_id, optin_id)
);
create index if not exists whatsapp_campaign_recipients_pending_idx on public.whatsapp_campaign_recipients (campaign_id) where status = 'pending';
alter table public.whatsapp_campaigns enable row level security;
alter table public.whatsapp_campaign_recipients enable row level security;
create policy "members read whatsapp campaigns" on public.whatsapp_campaigns for select using (public.is_store_member(store_id));
create policy "members read whatsapp campaign recipients" on public.whatsapp_campaign_recipients for select using (public.is_store_member(store_id));
-- Aceites, campanhas e fila: só o servidor grava (service role, depois de conferir o login).

alter table public.whatsapp_messages add column if not exists campaign_id uuid references public.whatsapp_campaigns(id) on delete set null;
