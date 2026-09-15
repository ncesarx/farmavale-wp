# API CRM — Farmavale Central

Base URL de produção: `https://fv.hoi-cloud.com.br`

## Autenticação

Gere uma chave em **Integrações → Chaves da API**. Envie-a no cabeçalho:

```http
Authorization: Bearer fv_live_SEU_SEGREDO
```

A chave completa é exibida apenas na criação. O servidor armazena somente SHA-256, permite expiração e revogação imediata.

## Criar ou atualizar um cliente

```http
POST /api/v1/crm/contacts
Content-Type: application/json
```

```json
{
  "name": "Cliente Farmavale",
  "phone": "+55 12 99999-1234",
  "email": "cliente@exemplo.com",
  "externalCrmId": "CRM-12345"
}
```

Exemplo:

```bash
curl -X POST 'https://fv.hoi-cloud.com.br/api/v1/crm/contacts' \
  -H 'Authorization: Bearer fv_live_SUBSTITUA_PELA_CHAVE' \
  -H 'Content-Type: application/json' \
  --data '{
    "name": "Cliente Farmavale",
    "phone": "+55 12 99999-1234",
    "email": "cliente@exemplo.com",
    "externalCrmId": "CRM-12345"
  }'
```

A combinação organização + telefone torna a operação idempotente:

- `201`: cliente criado;
- `200`: cliente atualizado;
- `400`: conteúdo inválido;
- `401`: chave ausente, inválida, expirada ou revogada;
- `500`: falha interna registrada no histórico de execuções.

## Segurança e rastreabilidade

- use exclusivamente HTTPS;
- mantenha a chave em um cofre de segredos do CRM;
- não inclua a chave em URLs ou logs;
- use uma chave por sistema integrado;
- configure expiração e faça rotação periódica;
- revogue imediatamente credenciais suspeitas;
- cada sincronização gera um `IntegrationRun` e um registro de auditoria.


## Webhooks de saída

Cadastre uma URL pública HTTPS em **Integrações → Webhooks para CRM**. São suportados inicialmente:

- `contact.updated`;
- `conversation.updated`.

Cada requisição inclui:

```http
X-Farmavale-Delivery: <UUID do evento>
X-Farmavale-Event: contact.updated
X-Farmavale-Signature-256: sha256=<assinatura hexadecimal>
```

A assinatura é o HMAC-SHA256 do corpo bruto da requisição usando o segredo `whsec_...` exibido somente na criação.

Exemplo de verificação em Node.js:

```js
import { createHmac, timingSafeEqual } from "node:crypto";

const expected = createHmac("sha256", process.env.FARMAVALE_WEBHOOK_SECRET)
  .update(rawBody)
  .digest("hex");
const received = request.headers["x-farmavale-signature-256"]?.replace("sha256=", "");

const valid =
  received?.length === expected.length &&
  timingSafeEqual(Buffer.from(received), Buffer.from(expected));
```

O receptor deve responder com HTTP 2xx. A Farmavale realiza até três tentativas automáticas. Entregas malsucedidas permanecem no painel e podem ser reenviadas por um proprietário ou administrador.

Por segurança, destinos devem usar HTTPS público. URLs com credenciais, portas explícitas, localhost, redes privadas e endereços link-local são recusadas.
