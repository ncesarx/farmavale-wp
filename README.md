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


## Operação, monitoramento e backups

Os scripts operacionais não imprimem credenciais e usam a variável `DATABASE_URL` já configurada no servidor.

- `npm run ops:backup`: cria um dump PostgreSQL no formato custom, valida o catálogo, gera SHA-256 e remove arquivos além da retenção.
- `npm run ops:backup:verify`: verifica o checksum e a estrutura do backup mais recente.
- `npm run ops:check`: confirma os endpoints locais de saúde/prontidão e exige um backup recente.

Valores padrão de produção:

- diretório: `/var/backups/farmavale-central`;
- retenção: 14 dias;
- backup diário: 02:15 em `America/Sao_Paulo`;
- verificação operacional: a cada 5 minutos;
- idade máxima aceita para o backup: 27 horas.

As unidades de referência estão em `ops/systemd`. Antes de habilitá-las, crie o diretório com proprietário restrito:

```bash
sudo install -d -m 0700 -o ncesarx -g ncesarx /var/backups/farmavale-central
sudo install -m 0644 ops/systemd/farmavale-backup.service /etc/systemd/system/
sudo install -m 0644 ops/systemd/farmavale-backup.timer /etc/systemd/system/
sudo install -m 0644 ops/systemd/farmavale-operations-check.service /etc/systemd/system/
sudo install -m 0644 ops/systemd/farmavale-operations-check.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now farmavale-backup.timer farmavale-operations-check.timer
```

Execute primeiro `npm run ops:backup` e `npm run ops:backup:verify`. Uma restauração deve ser testada periodicamente em banco isolado; nunca restaure diretamente sobre a produção durante uma verificação.
