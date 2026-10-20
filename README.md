# PMS app

Base multi-tenant de lojas virtuais com Next.js + Supabase + Vercel.

## Montando o projeto

1. Instale as dependências:
   ```bash
   npm install
   ```
2. No Supabase (nuvem), abra o **SQL Editor** e rode, em ordem de nome, os arquivos de `supabase/executado/`
   (banco novo) e depois os de `supabase/migrations/` (pendentes). Ao rodar um arquivo de `migrations/`, mova-o para `executado/`.
3. Copie `.env.example` para `.env.local` e preencha com a URL e as chaves de **Project Settings → API Keys**.
4. Rode:
   ```bash
   npm run dev
   ```
   Abra **http://loja-teste.localhost:3000** para ver a loja de teste.
   O domínio raiz (http://localhost:3000) fica reservado para o painel (`/painel`) e o site da plataforma.

## Virando dono da loja de teste

Crie seu usuário em **Authentication → Users → Add user** (marque "Auto Confirm User"), rode no SQL Editor
o comando abaixo e entre em http://localhost:3000/painel/login:
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

## Melhor Envio (frete)

1. Crie uma conta no **sandbox** (https://sandbox.melhorenvio.com.br) para testes.
2. Em **Integrações → Permissões de acesso → Gerar novo token**, gere um token com as permissões
   `shipping-calculate` (e, para etiquetas no futuro, `shipping-*`/`cart-*`).
3. Cadastre o token da loja e o CEP de origem (de onde a loja envia):
   ```sql
   insert into store_secrets (store_id, melhor_envio_token)
   select id, 'TOKEN...' from stores where slug = 'loja-teste'
   on conflict (store_id) do update set melhor_envio_token = excluded.melhor_envio_token;

   update stores set origin_zip = '01001000' where slug = 'loja-teste';
   ```
4. Variáveis: `MELHOR_ENVIO_ENV=sandbox` (ou `production`) e `MELHOR_ENVIO_CONTACT` (e-mail técnico).

Sem token ou sem CEP de origem, o checkout oferece só "Retirada na loja".
O frete é recalculado no servidor ao criar o pedido: o preço nunca vem do navegador.
Peso e medidas vêm de cada variação (painel → produto → "Mostrar peso e medidas").
