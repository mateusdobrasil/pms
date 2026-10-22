-- Limite de tentativas por IP (checkout, "Meus pedidos", pagamento): janela fixa.
-- Só o servidor usa (service role); sem policy, ninguém mais lê ou escreve.
create table public.rate_limits (
  store_id     uuid not null references public.stores(id) on delete cascade,
  key          text not null,          -- '<ação>:<ip>'
  window_start timestamptz not null default now(),
  hits         integer not null default 1,
  primary key (store_id, key)
);
alter table public.rate_limits enable row level security;

-- Conta uma tentativa e diz se ainda está dentro do limite.
create or replace function public.rate_limit_hit(p_store_id uuid, p_key text, p_limit integer, p_window_seconds integer)
returns boolean language sql security definer set search_path = public as $$
  insert into rate_limits as r (store_id, key) values (p_store_id, p_key)
  on conflict (store_id, key) do update set
    hits         = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits <= p_limit;
$$;
revoke execute on function public.rate_limit_hit(uuid, text, integer, integer) from public, anon, authenticated;

-- Limpeza diária das janelas antigas (precisa do pg_cron de 20261021100000).
select cron.schedule('limpar-limites', '17 4 * * *', $$delete from public.rate_limits where window_start < now() - interval '1 day'$$);
