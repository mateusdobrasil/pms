# PMS app

Base multi-tenant de lojas virtuais com Next.js + Supabase + Vercel.

## Montando o projeto

1. Crie o app Next.js:
   ```bash
   npx create-next-app@latest pms-app --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
   cd pms-app
   ```
2. Inicialize o Supabase (precisa do Docker rodando para o ambiente local):
   ```bash
   npx supabase init
   ```
3. Copie os arquivos deste pacote para dentro da pasta `pms-app`, sobrescrevendo quando pedir.
4. Instale as dependências:
   ```bash
   npm i @supabase/supabase-js @supabase/ssr server-only
   ```
5. Suba o banco local e aplique schema + seed:
   ```bash
   npx supabase start
   npx supabase db reset
   ```
6. Copie `.env.example` para `.env.local` e preencha com as chaves que o `supabase start` mostrou.
7. Rode:
   ```bash
   npm run dev
   ```
   Abra **http://loja-teste.localhost:3000** para ver a loja de teste.
   O domínio raiz (http://localhost:3000) fica reservado para o painel e o site da plataforma.

## Virando dono da loja de teste

Depois de criar seu usuário pelo Supabase Auth, rode no SQL editor:
```sql
insert into store_members (store_id, user_id)
select s.id, u.id from stores s, auth.users u
where s.slug = 'loja-teste' and u.email = 'seu@email.com';
```

## Observações
- Para produção: `npx supabase link` + `npx supabase db push`, e agende `expire_pending_orders()` com pg_cron (comando no fim da migration).
- Fluxo de pagamento: `/checkout` cria o pedido → `/pedido/<token>` mostra Pix ou cartão e acompanha o status.

## Mercado Pago

Cada loja usa a própria conta do Mercado Pago. Em **Suas integrações → sua aplicação → Credenciais**, pegue o
*Access Token* e a *Public Key* (comece pelas credenciais de teste). Em **Webhooks**, copie a assinatura secreta.

```sql
insert into store_secrets (store_id, gateway_access_token, gateway_public_key, gateway_webhook_secret)
select id, 'TEST-...', 'TEST-...', 'assinatura-secreta' from stores where slug = 'loja-teste'
on conflict (store_id) do update set
  gateway_access_token   = excluded.gateway_access_token,
  gateway_public_key     = excluded.gateway_public_key,
  gateway_webhook_secret = excluded.gateway_webhook_secret;
```

- Em produção defina `PLATFORM_URL=https://suaplataforma.com.br`: cada pagamento é criado com
  `notification_url = PLATFORM_URL/api/webhooks/payments?store=<store_id>`.
- Em dev local o Mercado Pago não alcança o webhook; a página do pedido consulta o pagamento a cada 5 s.
- Cartão de teste: use os cartões da documentação do Mercado Pago com o nome do titular `APRO` (aprovado) ou `OTHE` (recusado).

### Testando antes de existir a página de produto
Pegue um `id` de `product_variants` no Supabase Studio, rode no console do navegador (na loja de teste)
`localStorage.setItem('cart', JSON.stringify([{ variantId: '<id>', quantity: 1 }]))` e abra `/checkout`.
