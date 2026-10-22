-- Código de verificação do Google (Search Console e Merchant Center), publicado na loja como
-- <meta name="google-site-verification" content="...">. O lojista cola só o código (content).
alter table public.stores
  add column google_site_verification text check (google_site_verification ~ '^[A-Za-z0-9_-]{10,100}$');

grant update (google_site_verification) on public.stores to authenticated;
