-- O lojista (role authenticated) só pode mover o pedido pelas transições do fluxo.
-- 'paid' e 'expired' são definidos apenas pelo servidor (service role), via pagamento.
create or replace function public.orders_guard_member_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if new.status is distinct from old.status and not (
       (old.status = 'pending_payment' and new.status = 'canceled')
    or (old.status = 'paid'            and new.status in ('preparing', 'shipped', 'canceled'))
    or (old.status = 'preparing'       and new.status in ('shipped', 'canceled'))
    or (old.status = 'shipped'         and new.status = 'delivered')
  ) then
    raise exception 'Mudança de status não permitida: % → %', old.status, new.status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists orders_guard_member_update on public.orders;
create trigger orders_guard_member_update
  before update on public.orders
  for each row execute function public.orders_guard_member_update();
