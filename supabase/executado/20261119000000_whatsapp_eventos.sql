-- WhatsApp por eventos: cada evento do sistema (lembrete, compra confirmada, pedido enviado...) usa um template
-- aprovado na Meta, escolhido no /admin → WhatsApp → Modelos, com as variáveis {{1}}, {{2}}... ligadas aos dados
-- do evento. Configuração da plataforma (vale para todas as lojas): sem store_id, só service role.
create table if not exists public.whatsapp_event_templates (
  event      text primary key,
  template   text not null,
  language   text not null default 'pt_BR',
  params     jsonb not null default '[]'::jsonb, -- ["first_name", "store_name", ...]: dado de cada {{n}}, em ordem
  enabled    boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.whatsapp_event_templates enable row level security;

-- Por loja: com o WhatsApp ligado (stores.whatsapp_reminders), quais eventos ela usa. Nulo = todos os ligados.
alter table public.stores add column if not exists whatsapp_events text[];

-- Registro: de que evento foi a mensagem e de que pedido (os agendamentos já têm booking_id).
alter table public.whatsapp_messages
  add column if not exists event text,
  add column if not exists order_id uuid references public.orders(id) on delete set null;
