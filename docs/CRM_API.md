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
