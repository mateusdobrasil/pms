-- 1) Segunda chance do pedido expirado: e-mail único para o cliente refazer o pedido que venceu sem pagamento.
--    Trava do envio, como as outras colunas notified_* (só quem preencher envia).
alter table public.orders add column if not exists notified_expired_at timestamptz;

-- Busca da rotina diária: pedidos expirados ainda sem aviso.
create index if not exists orders_expired_unnotified_idx
  on public.orders (expires_at) where status = 'expired' and notified_expired_at is null;

-- 2) Catálogo do Instagram/Facebook: verificação do domínio da loja na Meta, publicada como
--    <meta name="facebook-domain-verification" content="...">. O lojista cola só o código (content).
alter table public.stores
  add column if not exists meta_domain_verification text check (meta_domain_verification ~ '^[A-Za-z0-9_-]{10,100}$');

grant update (meta_domain_verification) on public.stores to authenticated;
