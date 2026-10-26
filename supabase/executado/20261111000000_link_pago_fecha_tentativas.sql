-- Link de pagamento de uso único: quando um pedido dele é pago, as outras tentativas ainda abertas
-- (aguardando pagamento) expiram na hora, para ninguém pagar o mesmo link duas vezes.
create or replace function public.payment_link_paid()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.payment_link_id is not null and new.status = 'paid' and old.status is distinct from 'paid' then
    update payment_links set status = 'paid', paid_at = now()
     where id = new.payment_link_id and status = 'active' and not reusable;
    update orders set status = 'expired'
     where payment_link_id = new.payment_link_id
       and id <> new.id
       and status = 'pending_payment'
       and exists (select 1 from payment_links l where l.id = new.payment_link_id and not l.reusable);
  end if;
  return new;
end;
$$;
