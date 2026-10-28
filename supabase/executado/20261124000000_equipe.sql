-- Equipe com acessos: além do dono, o lojista cadastra Recepção (role 'staff', que já existia) e Profissional.
--   owner        tudo
--   staff        balcão, pedidos, agenda, clientes e estoque (o painel limita as telas)
--   professional só a própria agenda e a própria comissão, lidas pelo servidor (service role)

-- 1) Novo perfil e o vínculo do usuário profissional com o cadastro da agenda.
alter type public.member_role add value if not exists 'professional';

alter table public.store_members
  add column if not exists professional_id uuid references public.professionals(id) on delete set null;
-- Um cadastro de profissional tem no máximo um acesso.
create unique index if not exists store_members_professional
  on public.store_members (store_id, professional_id) where professional_id is not null;

-- 2) Quem passa pelas policies. O profissional fica de fora de todas (não lê pedidos, clientes etc. pela API);
--    a tela dele é montada no servidor, filtrada pelo cadastro dele.
--    (Compara com 'owner'/'staff' e não com 'professional': o valor novo do enum só vale depois deste SQL.)
create or replace function public.is_store_member(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from store_members where store_id = sid and user_id = auth.uid() and role in ('owner', 'staff'));
$$;

create or replace function public.is_store_owner(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from store_members where store_id = sid and user_id = auth.uid() and role = 'owner');
$$;

-- Qualquer pessoa da equipe lê o cadastro da própria loja (nome e logo no topo do painel, mesmo suspensa).
create or replace function public.is_store_team(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from store_members where store_id = sid and user_id = auth.uid());
$$;

drop policy if exists "members read own store" on public.stores;
create policy "members read own store" on public.stores for select using (public.is_store_team(id));

-- Configurações da loja: só o dono altera.
drop policy if exists "members update own store" on public.stores;
create policy "members update own store" on public.stores for update
  using (public.is_store_owner(id)) with check (public.is_store_owner(id));

-- 3) Fotos de produto: só o dono envia, troca e apaga (a Recepção só ajusta estoque).
drop policy if exists "members upload product images" on storage.objects;
drop policy if exists "members update product images" on storage.objects;
drop policy if exists "members delete product images" on storage.objects;
drop policy if exists "members read product images"   on storage.objects;

create policy "members upload product images" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and exists (
    select 1 from public.store_members m
     where m.user_id = auth.uid() and m.role = 'owner' and m.store_id::text = (storage.foldername(name))[1]));

create policy "members update product images" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and exists (
    select 1 from public.store_members m
     where m.user_id = auth.uid() and m.role = 'owner' and m.store_id::text = (storage.foldername(name))[1]));

create policy "members delete product images" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and exists (
    select 1 from public.store_members m
     where m.user_id = auth.uid() and m.role = 'owner' and m.store_id::text = (storage.foldername(name))[1]));

create policy "members read product images" on storage.objects for select to authenticated
  using (bucket_id = 'product-images' and exists (
    select 1 from public.store_members m
     where m.user_id = auth.uid() and m.role = 'owner' and m.store_id::text = (storage.foldername(name))[1]));
