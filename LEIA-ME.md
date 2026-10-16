# MYSLA — loja própria com painel

O visual é o do protótipo do Figma. Por baixo dele agora existe um sistema completo:

- **Loja**: vitrine, catálogo com filtros, página da peça com cores, tamanhos e estoque, sacola, checkout com busca de CEP, Pix e cartão (Mercado Pago), página do pedido e "Meu pedido".
- **Painel** em `/admin`: relatório do mês, pedidos, cadastro de peças, banner da home, tarja de promoção, vendas fechadas pelo WhatsApp e configurações.
- **WhatsApp rastreado**: todo botão passa pelo site antes de abrir a conversa. Cada clique é contado no relatório, por peça e por dia.

Tudo roda num servidor seu. Os dados ficam num arquivo na pasta `data/`. Os serviços de fora são só o Mercado Pago (pagamento) e o ViaCEP (busca de endereço, gratuito).

---

## 1. Rodar no seu computador

Precisa do [Node.js](https://nodejs.org) versão 20 ou mais nova.

```bash
npm install
npm run dev
```

- Loja: http://localhost:5173
- Painel: http://localhost:5173/admin
  - Acesso inicial: `admin@mysla.com.br` / senha `mysla123`. **Troque em Configurações.**

Sem as chaves do Mercado Pago, a loja fica em **modo demonstração**. Nesse modo:

- O Pix tem um botão "Simular Pix pago".
- No cartão, qualquer nome é aprovado. Use o nome `RECUSAR` para simular uma recusa.

As 8 peças do protótipo vêm cadastradas como exemplo. Edite ou apague pelo painel.

## 2. Ligar o Mercado Pago

1. Crie uma aplicação em https://www.mercadopago.com.br/developers/panel/app. Escolha o produto **Checkout Transparente / Pagamentos online**.
2. Copie o arquivo `.env.example` para `.env`.
3. Preencha `MP_ACCESS_TOKEN` e `MP_PUBLIC_KEY`. Use primeiro as credenciais de **teste** e depois troque pelas de **produção**.
4. Para usar Pix em produção, a conta do Mercado Pago precisa ter uma **chave Pix cadastrada**.
5. Depois que o site estiver no ar com https, configure as notificações:
   - Em **Webhooks**, use a URL `https://SEU-DOMINIO/api/webhooks/mercadopago`.
   - Marque o evento **Pagamentos**.
   - Copie a "assinatura secreta" para `MP_WEBHOOK_SECRET`.

Mesmo sem o webhook, a tela do Pix confere o pagamento direto no Mercado Pago a cada poucos segundos. O webhook garante a confirmação quando a cliente fecha a página antes de o pagamento cair.

Os dados do cartão são digitados no formulário seguro do próprio Mercado Pago e **nunca passam pelo seu servidor**.

## 3. Colocar no ar (VPS)

Funciona em qualquer VPS Linux (Hostinger, Contabo, DigitalOcean, Magalu Cloud…), com 1 GB de RAM.

```bash
# no servidor, dentro da pasta do projeto
npm install
npm run build            # gera a pasta dist com o site
cp .env.example .env     # preencha SITE_URL, ADMIN_*, MP_*
npm install -g pm2
pm2 start "npm start" --name mysla
pm2 save && pm2 startup
```

O servidor sobe na porta 3001. Ponha um Nginx na frente com https (Let's Encrypt / certbot):

```nginx
server {
  server_name www.suamarca.com.br suamarca.com.br;
  client_max_body_size 25m;          # envio de fotos pelo painel
  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Depois, rode `sudo certbot --nginx` para ativar o https.

Para **atualizar** o site depois de mudar o código:

```bash
npm run build
pm2 restart mysla
```

## 4. Backup

Tudo o que importa fica na pasta `data/`: o banco `loja.db` e as fotos em `uploads/`. Copie essa pasta com frequência, por exemplo com um cron diário para outro lugar. Para restaurar, basta colocar a pasta de volta.

---

## Como as coisas funcionam

**Estoque.** Quando a cliente finaliza a compra, as peças ficam reservadas.

- Se ela não pagar o Pix em 45 minutos, o pedido é cancelado e as peças voltam ao estoque sozinhas.
- Cartão recusado não cancela o pedido: ela pode tentar outro cartão ou trocar para Pix.

**Status do pedido.**

- *Aguardando pagamento* → *Pago*: automático, quando o Mercado Pago aprova.
- *Pago* → *Enviado* → *Entregue*: você marca no painel e informa o código de rastreio. A cliente vê o rastreio em "Meu pedido".

**Frete.** É um valor fixo, com frete grátis acima de um valor. Os dois se configuram no painel. Para calcular por CEP e peso depois, dá para integrar o Melhor Envio ou os Correios no arquivo `server/orders.js`, na função `shippingFor`.

**Relatório mensal.** Mostra:

- peças vendidas no site, faturamento e ticket médio;
- cliques no WhatsApp: total, por peça, por dia e por botão;
- vendas fechadas no WhatsApp, que você lança à mão;
- a divisão das peças vendidas entre site e WhatsApp, com comparação com o mês anterior.

O botão "Baixar planilha" exporta o mês em CSV, que abre no Excel ou no Google Planilhas.

**Clique ≠ venda.** O site sabe que a conversa foi aberta, mas não sabe se a venda fechou. Por isso existe a tela "Vendas WhatsApp" para lançar as vendas. Ao escolher a cor e o tamanho, a peça também sai do estoque do site.

## Onde está cada coisa

| Pasta / arquivo | O que é |
|---|---|
| `src/store/` | A loja (telas do protótipo, agora ligadas aos dados) |
| `src/store.css` | O CSS original do Figma |
| `src/store-extra.css` | Estilos novos no mesmo padrão: checkout, pedido, WhatsApp |
| `src/admin/` | O painel |
| `server/` | O servidor: banco, pedidos, Mercado Pago, relatório |
| `data/` | Banco de dados e fotos (criada automaticamente, **faça backup**) |
