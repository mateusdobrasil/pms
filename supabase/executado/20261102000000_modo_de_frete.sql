-- Formas de entrega da loja (Painel → Configurações → Entrega):
--   pickup          somente retirada na loja
--   pickup_correios retirada ou Correios (PAC/SEDEX cotados pelo Melhor Envio)
--   pickup_me       retirada ou Melhor Envio (todas as transportadoras) — comportamento de antes, por isso é o padrão
--   me              somente Melhor Envio (sem retirada)

alter table public.stores
  add column shipping_mode text not null default 'pickup_me'
    check (shipping_mode in ('pickup', 'pickup_correios', 'pickup_me', 'me'));

grant update (shipping_mode) on public.stores to authenticated;
