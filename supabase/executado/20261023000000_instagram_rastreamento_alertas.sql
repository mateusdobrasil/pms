-- 1) Instagram no lugar dos vídeos enviados.
--    stores.instagram: @ da loja (só o nome de usuário, sem @). Ícone no topo e no rodapé da vitrine.
--    products.instagram_url: link opcional de um Reel/post do produto ("Ver vídeo no Instagram").
alter table public.stores   add column instagram text check (instagram ~ '^[A-Za-z0-9._]{1,30}$');
alter table public.products add column instagram_url text check (instagram_url ~ '^https://(www\.)?instagram\.com/');
grant update (instagram) on public.stores to authenticated;

--    Vídeos enviados saem (nenhum foi gravado). O bucket product-videos é apagado pela API do Storage
--    depois do deploy (o Supabase não deixa apagar bucket por SQL).
drop table public.product_videos;
drop policy if exists "members upload product videos" on storage.objects;
drop policy if exists "members read product videos"   on storage.objects;
drop policy if exists "members delete product videos" on storage.objects;

-- 2) Pixel da Meta e Google Analytics por loja (carregam só depois do "Aceitar" do aviso de cookies).
alter table public.stores
  add column meta_pixel_id     text check (meta_pixel_id ~ '^[0-9]{5,20}$'),
  add column ga_measurement_id text check (ga_measurement_id ~ '^G-[A-Z0-9]{4,15}$');
grant update (meta_pixel_id, ga_measurement_id) on public.stores to authenticated;

-- 3) Alertas de erro por e-mail: trava para mandar no máximo 1 por tipo de erro a cada 30 min.
--    Tabela da plataforma (não de uma loja), por isso sem store_id. Só o servidor usa (service role).
create table public.error_alerts (
  key          text primary key,   -- tipo do erro, ex.: 'pagamento:pix'
  last_sent_at timestamptz not null default now(),
  suppressed   integer not null default 0  -- quantos se repetiram desde o último e-mail
);
alter table public.error_alerts enable row level security;

-- Pode mandar o e-mail agora? Devolve -1 se ainda está dentro da janela (só conta a repetição);
-- senão registra o envio e devolve quantas repetições ficaram sem e-mail desde o último.
create or replace function public.error_alert_claim(p_key text, p_minutes integer)
returns integer language plpgsql security definer set search_path = public as $$
declare v_prev integer;
begin
  insert into error_alerts (key) values (p_key) on conflict (key) do nothing;
  if found then return 0; end if;  -- primeira vez deste erro

  select suppressed into v_prev from error_alerts
   where key = p_key and last_sent_at < now() - make_interval(mins => p_minutes)
   for update;
  if found then
    update error_alerts set last_sent_at = now(), suppressed = 0 where key = p_key;
    return v_prev;
  end if;

  update error_alerts set suppressed = suppressed + 1 where key = p_key;
  return -1;
end;
$$;
revoke execute on function public.error_alert_claim(text, integer) from public, anon, authenticated;
