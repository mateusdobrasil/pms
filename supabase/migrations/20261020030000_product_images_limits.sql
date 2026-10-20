-- Limita o bucket de imagens de produto: até 5 MB, só JPG, PNG e WebP.
update storage.buckets
   set file_size_limit    = 5242880,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'product-images';

-- Apagar (e substituir) um arquivo no Storage exige também permissão de leitura do objeto.
-- Sem isto, remover uma foto no painel apaga o registro mas deixa o arquivo órfão no bucket.
create policy "members read product images" on storage.objects for select to authenticated
  using (bucket_id = 'product-images' and exists (
    select 1 from public.store_members m
     where m.user_id = auth.uid() and m.store_id::text = (storage.foldername(name))[1]));
