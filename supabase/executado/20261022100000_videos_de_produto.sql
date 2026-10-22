-- Vídeos curtos de demonstração do produto (até 3 por produto, 60 s, 50 MB).
-- Ficam fora de product_images de propósito: a capa do produto continua sendo sempre uma foto.

create table public.product_videos (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  path       text not null,   -- caminho no bucket product-videos: <store_id>/<product_id>/<arquivo>
  position   integer not null default 0,
  created_at timestamptz not null default now()
);
create index on public.product_videos (product_id);

alter table public.product_videos enable row level security;
create policy "public reads videos" on public.product_videos for select using (public.store_is_active(store_id));
create policy "members manage videos" on public.product_videos for all
  using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));

-- Bucket público (a vitrine toca o vídeo direto da URL), só MP4, WebM e MOV, até 50 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-videos', 'product-videos', true, 52428800, array['video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Lojista envia, lê e apaga só na pasta da própria loja (<store_id>/...), como nas fotos.
create policy "members upload product videos" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-videos' and exists (
    select 1 from public.store_members m
     where m.user_id = auth.uid() and m.store_id::text = (storage.foldername(name))[1]));

create policy "members read product videos" on storage.objects for select to authenticated
  using (bucket_id = 'product-videos' and exists (
    select 1 from public.store_members m
     where m.user_id = auth.uid() and m.store_id::text = (storage.foldername(name))[1]));

create policy "members delete product videos" on storage.objects for delete to authenticated
  using (bucket_id = 'product-videos' and exists (
    select 1 from public.store_members m
     where m.user_id = auth.uid() and m.store_id::text = (storage.foldername(name))[1]));
