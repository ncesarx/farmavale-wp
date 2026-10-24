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

## IA assistida local (Ollama)

A assistência é opcional e não envia mensagens. Atendentes responsáveis e liderança podem gerar resumo, intenção e sugestão; “Usar como rascunho” preenche apenas um campo vazio. O envio continua manual. As respostas podem conter erros e precisam ser conferidas, especialmente informações comerciais e clínicas.

No ambiente do processo Next.js, configure:

```dotenv
AI_ASSIST_ENABLED="true"
OLLAMA_BASE_URL="http://172.30.172.222:11434"
OLLAMA_MODEL="qwen3:4b-instruct"
```

Somente o servidor Next.js acessa o Ollama. Restrinja a porta 11434 ao IP do servidor Farmavale e reserve os dois endereços no DHCP. Não publique a porta na Internet. Não use variáveis NEXT_PUBLIC para esta configuração.

São enviados até 12 textos recentes, com até 500 caracteres cada, excluindo notas internas e mensagens com status FAILED ou QUEUED. Emails, telefones e CPF reconhecíveis são substituídos antes do envio; isso não é anonimização completa: outros dados pessoais e de saúde presentes no texto podem permanecer. Nomes e dados cadastrais não são consultados. A auditoria registra modelo e quantidade de mensagens, sem gravar prompt ou resposta. A resposta não é persistida como mensagem.

Uma única geração por processo é permitida, com até três solicitações por usuário/minuto e timeout de 90 segundos. Com múltiplos processos, estes limites não são compartilhados entre processos; dimensione a fila do Ollama antes de escalar. Mudanças de responsável/status e novas mensagens durante a geração invalidam a resposta. O limite efetivo do contexto é 4096, mesmo que o catálogo do modelo anuncie um contexto maior.

Valide primeiro em checkout isolado: npm ci, npm test, npm run lint e npm run build. Não há migração de banco. Na implantação, mantenha um build anterior para reversão e reinicie somente o processo farmavale-central pelo PM2 com --update-env após configurar o ambiente. Em produção, evite gerar o novo build sobre os arquivos .next em uso; use um diretório de release separado conforme o procedimento do servidor.

Para desabilitar, defina AI_ASSIST_ENABLED=false e reinicie apenas o processo Farmavale. O envio normal de mensagens não depende da disponibilidade da IA.

## Ade — acolhimento automático no WhatsApp

A Ade usa mensagens controladas para acolher, coletar nome preferido (opcional) e motivo inicial, resumir e liberar a distribuição para a equipe. Não usa o Ollama para redigir mensagens automáticas, não consulta preço/estoque e não orienta sobre saúde ou pagamentos. A assistência por IA ao atendente permanece separada e manual.

O fluxo só começa em conversas novas, no canal WhatsApp configurado e para os números autorizados. Conversas existentes não são reiniciadas. Informações já fornecidas são aproveitadas quando reconhecidas; em caso de dúvida, encaminha para a equipe. Áudio, imagem, documento e pedido por uma pessoa seguem diretamente para continuidade humana. Não promete prazo nem disponibilidade imediata.

Configuração de ativação, somente após migração e testes:

```dotenv
ADE_WELCOME_ENABLED="false"
ADE_WELCOME_PHONE_NUMBER_ID="ID_DO_NUMERO_NA_META"
ADE_WELCOME_ALLOWLIST="DDINUMERO_DE_TESTE"
```

A allowlist vazia não autoriza nenhum número; "*" autoriza todos explicitamente. O ID é o phone_number_id da Meta, não o telefone. Primeiro habilite para um número de teste e depois amplie deliberadamente. Para interromper, defina ADE_WELCOME_ENABLED=false e reinicie o processo e o worker. Pendências não tentadas serão canceladas e conversas liberarão a equipe. Um envio já iniciado na Meta pode chegar mesmo após interrupção.

### Estado e entrega

A migração 20261024190000_ade_welcome adiciona somente campos de acolhimento à Conversation e um índice. Execute backup, teste a migração em banco isolado e aplique antes de iniciar esta versão (mesmo com acolhimento desabilitado). O código anterior continua compatível com os campos adicionais.

Mensagens da Ade ficam persistidas em Message com origem ade_welcome, sem senderId humano e com chave única por mensagem de entrada. A mudança de etapa e a criação da resposta são transacionais. Recebimentos concorrentes são serializados por organização com o mesmo lock da distribuição. Perguntas ainda não enviadas são substituídas quando chegam novas informações. Webhooks repetidos não criam novas respostas. Mensagens antigas não abrem respostas fora do período conservador de 23 horas; mensagens fora de ordem não fazem a etapa retroceder.

A entrega ocorre após responder ao webhook e por um worker periódico de recuperação. Não há garantia de entrega exatamente uma vez pelo provedor: uma tentativa com timeout ou resultado incerto NÃO é reenviada automaticamente, e o caso segue para a equipe. Falhas de entrega, pedidos sem resposta por 10 minutos e intervenção humana liberam o atendimento. O histórico mostra o resumo ou o motivo de recuperação; firstResponseAt e o SLA de primeira resposta continuam reservados à resposta humana.

### Worker obrigatório

Instale farmavale-ade.service e farmavale-ade.timer em ops/systemd. Ajuste WorkingDirectory para a pasta da release real antes de instalar (referência: /home/ncesarx/farmavale-central-release-24). O worker usa o .env dessa pasta, não apenas as variáveis do PM2. Confirme a configuração em ambos os processos.

```bash
npm run ade:process
sudo install -m 0644 ops/systemd/farmavale-ade.service /etc/systemd/system/
sudo install -m 0644 ops/systemd/farmavale-ade.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now farmavale-ade.timer
```

Uma rotina de até 20 tentativas usa timeout HTTP de 15 segundos por envio; o timer não inicia uma segunda execução simultânea da mesma unidade. A aplicação e o worker coordenam os envios pelo banco. A recuperação persiste atualizações; o barramento em memória não compartilha eventos de tela entre processos, portanto atualizações feitas só pelo worker podem exigir recarregar a página.

### Validação isolada sem WhatsApp real

npm test cobre o fluxo e os limites. npm run ade:test:integration usa um remetente simulado e exige ADE_TEST_DATABASE_URL apontando para um banco separado chamado farmavale_ade_test, diferente do DATABASE_URL da aplicação. Migre primeiro esse banco isolado com DATABASE_URL configurado para ele. O teste exige banco vazio, cria os próprios registros e remove esses registros ao terminar; não executa chamadas reais à Meta. Não inicie a aplicação de teste com o banco de produção para testar esse fluxo antes de aplicar a migração.

Depois valide um contato de teste autorizado: saudação → nome → motivo → resumo e equipe. Verifique também repetição de webhook, áudio, intervenção manual, falha simulada e desligamento. Não altere a URL de webhook da produção durante o teste isolado.
