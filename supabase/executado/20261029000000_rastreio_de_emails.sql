-- Rastreio dos e-mails: cada envio importante guarda o id do Resend; o webhook do Resend
-- (/api/webhooks/resend) atualiza o status quando o e-mail é entregue, volta ou vira spam.
-- store_id pode ser nulo nos e-mails da plataforma (proposta comercial), como em proposals.
create table if not exists public.sent_emails (
  resend_id  text primary key,
  store_id   uuid references public.stores(id) on delete cascade,
  kind       text not null check (kind in ('order', 'store', 'invoice', 'proposal')), -- cliente da loja, lojista, fatura, proposta
  ref_id     uuid,                    -- pedido, fatura ou proposta
  to_email   text not null,
  subject    text not null,
  status     text not null default 'sent' check (status in ('sent', 'delivered', 'delayed', 'bounced', 'complained')),
  detail     text,                    -- motivo da devolução, quando houver
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sent_emails_ref on public.sent_emails (kind, ref_id);
create index if not exists sent_emails_problems on public.sent_emails (store_id, status) where status in ('bounced', 'complained');

-- O lojista lê os e-mails da própria loja (aviso no pedido); gravar é só do servidor.
alter table public.sent_emails enable row level security;
drop policy if exists "members read own emails" on public.sent_emails;
create policy "members read own emails" on public.sent_emails for select using (store_id is not null and public.is_store_member(store_id));
