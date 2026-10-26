-- Venda no balcão (Painel → Vender): venda presencial registrada pelo lojista, paga fora do site
-- (dinheiro, Pix direto, maquininha). Vira um pedido comum já concluído (shipping_method = 'Venda no balcão'):
-- baixa o estoque pela confirm_order_payment e entra nos relatórios. Aqui fica só a forma de pagamento.
alter table public.orders
  add column if not exists counter_payment text check (counter_payment in ('cash', 'pix', 'credit', 'debit', 'other'));

-- Caixa do dia: vendas de balcão por loja e data.
create index if not exists orders_counter_idx on public.orders (store_id, paid_at) where counter_payment is not null;
