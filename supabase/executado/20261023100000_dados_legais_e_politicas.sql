-- Identificação da loja e políticas (Decreto 7.962/2013, CDC e LGPD).
-- legal_name / document / address: aparecem no rodapé de todas as páginas da loja.
-- privacy_policy / returns_policy: texto próprio do lojista; vazio = a loja mostra o modelo padrão
-- (montado com os dados da loja em src/lib/policies.ts).
alter table public.stores
  add column legal_name     text check (char_length(legal_name) between 2 and 150),
  add column document       text check (document ~ '^([0-9]{11}|[0-9]{14})$'),  -- CPF ou CNPJ, só dígitos
  add column address        text check (char_length(address) between 5 and 250),
  add column privacy_policy text check (char_length(privacy_policy) <= 20000),
  add column returns_policy text check (char_length(returns_policy) <= 20000);

grant update (legal_name, document, address, privacy_policy, returns_policy) on public.stores to authenticated;
