-- Lembrete de agendamento por WhatsApp (número oficial da plataforma na Cloud API da Meta).
-- O custo por mensagem é da plataforma: só o super-admin liga, loja por loja (sem grant para o lojista).
alter table public.stores add column if not exists whatsapp_reminders boolean not null default false;

-- Trava do lembrete por WhatsApp (separada da do e-mail): cada agendamento recebe uma vez.
alter table public.bookings add column if not exists notified_reminder_whatsapp_at timestamptz;

-- Registro de cada mensagem enviada (custo por loja no mês e diagnóstico de falhas). Só service role.
create table if not exists public.whatsapp_messages (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references public.stores(id) on delete cascade,
  booking_id    uuid references public.bookings(id) on delete set null,
  to_phone      text not null,
  template      text not null,
  wa_message_id text,
  status        text not null check (status in ('sent', 'failed')),
  error         text,
  created_at    timestamptz not null default now()
);
create index if not exists whatsapp_messages_store_idx on public.whatsapp_messages (store_id, created_at desc);
alter table public.whatsapp_messages enable row level security;
