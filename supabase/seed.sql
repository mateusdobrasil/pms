-- Loja de teste acessível em http://loja-teste.localhost:3000
with s as (
  insert into public.stores (slug, name, whatsapp, origin_zip)
  values ('loja-teste', 'Loja Teste', '5511999999999', '01001000')
  returning id
), d as (
  insert into public.store_domains (domain, store_id, is_primary)
  select 'loja-teste.localhost', id, true from s
), c as (
  insert into public.categories (store_id, name, slug)
  select id, 'Camisetas', 'camisetas' from s
  returning id, store_id
), p as (
  insert into public.products (store_id, category_id, name, slug, description, featured)
  select store_id, id, 'Camiseta básica', 'camiseta-basica', 'Algodão 100%, modelagem regular.', true from c
  returning id, store_id
)
insert into public.product_variants (store_id, product_id, name, price_cents, stock, position)
select p.store_id, p.id, v.name, 7990, 10, v.pos
from p cross join (values ('P', 0), ('M', 1), ('G', 2)) as v(name, pos);
