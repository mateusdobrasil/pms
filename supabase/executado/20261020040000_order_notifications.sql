-- Marca quando cada e-mail do pedido foi enviado. Serve de trava: o envio só acontece
-- para quem conseguir preencher a coluna (update ... where coluna is null), então
-- webhooks repetidos ou cliques duplos não mandam o mesmo e-mail duas vezes.
alter table public.orders
  add column notified_paid_at    timestamptz,
  add column notified_shipped_at timestamptz;
-- Só o servidor (service role) escreve nelas: o lojista continua limitado a status e tracking_code.
