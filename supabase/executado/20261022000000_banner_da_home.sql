-- Banner da página inicial da loja, editado pelo lojista em Configurações.
-- Sem imagem e sem título, a home mostra o cabeçalho padrão (cor da loja).
alter table public.stores
  add column banner_image_url text,  -- imagem no Storage da própria loja (product-images/<store_id>/branding/...)
  add column banner_title     text,
  add column banner_subtitle  text,
  add column banner_link      text;  -- caminho da loja ("/c/promocoes") ou https://...

-- O lojista edita só colunas liberadas (o grant da init cobre as anteriores).
grant update (banner_image_url, banner_title, banner_subtitle, banner_link) on public.stores to authenticated;
