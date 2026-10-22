-- Promoções da loja: desconto no Pix e frete grátis acima de um valor (Painel → Configurações).

alter table public.stores
  add column pix_discount_percent    integer not null default 0 check (pix_discount_percent between 0 and 30),
  add column free_shipping_min_cents integer check (free_shipping_min_cents > 0); -- nulo = sem frete grátis

grant update (pix_discount_percent, free_shipping_min_cents) on public.stores to authenticated;

-- No pedido:
-- pix_discount_cents: desconto que o Pix daria, calculado na criação (sobre os produtos, não sobre o frete).
--   O Pix cobra subtotal + frete - pix_discount_cents; o cartão cobra subtotal + frete.
-- discount_cents: desconto efetivamente aplicado. Quando um Pix é aprovado, vira pix_discount_cents
--   e total_cents passa a ser o valor pago (resumo de vendas, planilha e e-mails mostram o recebido).
alter table public.orders
  add column pix_discount_cents integer not null default 0 check (pix_discount_cents >= 0),
  add column discount_cents     integer not null default 0 check (discount_cents >= 0);
