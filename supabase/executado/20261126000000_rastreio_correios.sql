-- Rastreio automático pelos Correios (API oficial, contrato de cada lojista).
-- Pedidos enviados com código dos Correios são consultados de tempos em tempos: o histórico aparece no pedido e,
-- quando o objeto é entregue, o pedido passa para "Entregue" sozinho.

-- 1) Credenciais do contrato da loja (só service role, como as do Mercado Pago e do Melhor Envio).
--    Usuário do Meu Correios, código de acesso às APIs (gerado no portal, não é a senha) e cartão de postagem.
--    O token vale 24 h e fica guardado para não autenticar a cada consulta.
alter table public.store_secrets
  add column if not exists correios_user              text,
  add column if not exists correios_access_code       text,
  add column if not exists correios_card              text,
  add column if not exists correios_token             text,
  add column if not exists correios_token_expires_at  timestamptz;

-- 2) Histórico do objeto no pedido (eventos já traduzidos, do mais novo ao mais antigo) e quando foi consultado.
alter table public.orders
  add column if not exists tracking_events     jsonb,
  add column if not exists tracking_checked_at timestamptz,
  add column if not exists delivered_at        timestamptz,
  add column if not exists notified_delivered_at timestamptz; -- trava do aviso "pedido entregue" (uma vez só)

create index if not exists orders_tracking_pending on public.orders (tracking_checked_at nulls first)
  where status = 'shipped' and tracking_code is not null;
