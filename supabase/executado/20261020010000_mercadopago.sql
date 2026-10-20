-- Credenciais do Mercado Pago por loja (cada lojista recebe na própria conta).
-- public key: usada no navegador pelo Card Payment Brick (não é segredo, mas fica junto das demais).
-- webhook secret: "assinatura secreta" da aplicação em Suas integrações → Webhooks.
alter table public.store_secrets
  add column gateway_public_key     text,
  add column gateway_webhook_secret text;

-- Um Pix pago depois que o pedido expirou ainda deve virar venda:
-- passa a aceitar 'expired' além de 'pending_payment'. Continua idempotente.
create or replace function public.confirm_order_payment(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r       record;
  v_issue boolean := false;
begin
  perform 1 from orders where id = p_order_id and status in ('pending_payment', 'expired') for update;
  if not found then
    return;
  end if;

  for r in select variant_id, quantity from order_items where order_id = p_order_id and variant_id is not null loop
    update product_variants set stock = stock - r.quantity
     where id = r.variant_id and stock >= r.quantity;
    if not found then
      v_issue := true;
    end if;
  end loop;

  update orders set status = 'paid', paid_at = now(), stock_issue = v_issue
   where id = p_order_id;
end;
$$;

revoke execute on function public.confirm_order_payment(uuid) from public, anon, authenticated;
