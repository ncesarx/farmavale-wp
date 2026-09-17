# Farmavale Central

Central corporativa de atendimento WhatsApp da Farmavale.

## Sprint 1 — Fundação

Base técnica para operação multiusuário, distribuição de conversas, histórico, etiquetas, métricas e integração oficial com a WhatsApp Cloud API.

## Stack

- Next.js e TypeScript
- PostgreSQL e Prisma ORM
- WhatsApp Cloud API
- Process manager compatível com Node.js
- Proxy reverso HTTPS

Copie `.env.example` para `.env` e mantenha todos os valores reais fora do versionamento.

## Notificações Push e alertas operacionais

A Central mantém notificações internas persistentes para novas mensagens, atribuições e alertas de SLA. Cada atendente pode escolher os eventos e ativar Web Push em seus navegadores.

Gere o par VAPID uma única vez com `npm run push:generate-keys` e copie a saída diretamente para o `.env` do servidor. Nunca versione nem compartilhe a chave privada. Depois da migração, execute `npm run alerts:sla` a cada cinco minutos por cron ou timer do systemd para identificar atendimentos vencidos ou a até 15 minutos do limite.
