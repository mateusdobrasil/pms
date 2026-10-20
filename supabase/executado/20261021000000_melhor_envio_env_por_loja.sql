-- Ambiente do Melhor Envio por loja: true = sandbox (testes), false = produção.
-- Lojas existentes continuam no sandbox; a loja real é trocada para produção no /admin.
alter table public.store_secrets
  add column melhor_envio_sandbox boolean not null default true;
