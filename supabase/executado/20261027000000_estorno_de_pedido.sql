-- Estorno pelo painel: o servidor devolve o pagamento no Mercado Pago e depois chama refund_order,
-- que cancela o pedido e (se o lojista escolher) devolve os itens ao estoque, tudo numa transação.
alter table public.orders
  add column if not exists refunded_at          timestamptz,  -- quando o pagamento foi estornado pelo painel
  add column if not exists notified_refunded_at timestamptz;  -- trava do e-mail "pedido estornado" ao cliente

create or replace function public.refund_order(p_order_id uuid, p_restock boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  -- Só pedidos pagos (em qualquer etapa); trava a linha contra dois estornos ao mesmo tempo.
  perform 1 from orders where id = p_order_id and status in ('paid', 'preparing', 'shipped', 'delivered') for update;
  if not found then
    return false;
  end if;

  if p_restock then
    for r in select variant_id, quantity from order_items where order_id = p_order_id and variant_id is not null loop
      update product_variants set stock = stock + r.quantity where id = r.variant_id;
    end loop;
  end if;

  update orders set status = 'canceled', refunded_at = now() where id = p_order_id;
  return true;
end;
$$;

-- Só o servidor (service role) estorna.
revoke execute on function public.refund_order(uuid, boolean) from public, anon, authenticated;
