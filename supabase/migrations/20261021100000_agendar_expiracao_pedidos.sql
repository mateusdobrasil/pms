-- Expira sozinho, a cada 5 minutos, o pedido que passou do prazo sem pagamento
-- (aguardando pagamento → expirado). A função expire_pending_orders() já existe (init);
-- faltava agendar. Pagamento que chegar depois ainda confirma o pedido (confirm_order_payment aceita 'expired').
create extension if not exists pg_cron with schema pg_catalog;

-- cron.schedule com o mesmo nome atualiza o job existente: rodar de novo não duplica.
select cron.schedule('expirar-pedidos', '*/5 * * * *', $$select public.expire_pending_orders()$$);

-- Já marca agora os que estão vencidos.
select public.expire_pending_orders();
