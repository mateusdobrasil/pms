-- Aceite dos Termos de uso na proposta: guarda a versão aceita e a prova do aceite (IP e navegador),
-- junto com o accepted_at que já existe.
alter table public.proposals
  add column if not exists terms_version       text,
  add column if not exists accepted_ip         text,
  add column if not exists accepted_user_agent text;
