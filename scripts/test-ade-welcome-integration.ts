import assert from "node:assert/strict";

process.loadEnvFile(".env");
const originalUrl = process.env.DATABASE_URL;
const testUrl = process.env.ADE_TEST_DATABASE_URL;
if (!testUrl || testUrl === originalUrl || new URL(testUrl).pathname !== "/farmavale_ade_test") {
  throw new Error("Configure ADE_TEST_DATABASE_URL para o banco isolado farmavale_ade_test, diferente de DATABASE_URL.");
}
process.env.DATABASE_URL = testUrl;
process.env.ADE_WELCOME_ENABLED = "true";
process.env.ADE_WELCOME_PHONE_NUMBER_ID = "ade-test-channel";
process.env.ADE_WELCOME_ALLOWLIST = "5511999999999";
process.env.VAPID_PRIVATE_KEY = "";
process.env.VAPID_PUBLIC_KEY = "";
// No real WhatsApp requests are made. The sender is injected below.
async function main() {
  const { prisma } = await import("../lib/prisma");
  const { processMetaWebhook } = await import("../lib/meta-webhook-handler");
  const { processAdeWelcomeQueue, recoverAdeWelcome, stopAdeWelcome, lockAdeOrganization } = await import("../lib/ade-welcome");
  const { drainQueuedConversations } = await import("../lib/conversation-assignment");
  let organizationId: string | null = null;
  const sent: string[] = [];
  const fakeSender = async (_to: string, body: string) => {
    sent.push(body);
    return { messages: [{ id: "ade-fake-" + sent.length }] };
  };
  const inbound = (id: string, text: string) => ({
    entry: [{ changes: [{ field: "messages", value: {
      metadata: { phone_number_id: "ade-test-channel" },
      contacts: [{ wa_id: "5511999999999", profile: { name: "Perfil WhatsApp" } }],
      messages: [{ from: "5511999999999", id, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } }],
    } }] }],
  });
  try {
    assert.equal(await prisma.organization.count(), 0, "O banco de teste deve estar vazio");
    const organization = await prisma.organization.create({ data: { name: "Teste Ade", slug: "farmavale" } });
    organizationId = organization.id;
    const user = await prisma.user.create({ data: {
      organizationId, email: "ade-test@example.invalid", name: "Atendente Teste",
      role: "AGENT", status: "ACTIVE", agentStatus: "AVAILABLE",
    } });
    await Promise.all([processMetaWebhook(inbound("ade-in-1", "Olá")), processMetaWebhook(inbound("ade-in-1", "Olá"))]);
    let conversation = await prisma.conversation.findFirstOrThrow();
    assert.equal(conversation.welcomeStage, "NAME");
    assert.equal(conversation.assignedAgentId, null);
    await drainQueuedConversations(organizationId);
    assert.equal((await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).assignedAgentId, null);
    await processMetaWebhook(inbound("ade-in-1", "Olá"));
    assert.equal(await prisma.message.count({ where: { direction: "OUTBOUND" } }), 1, "Webhook repetido não cria outra resposta");
    await processAdeWelcomeQueue(20, fakeSender);
    assert.equal(sent.length, 1);
    assert.match(sent[0], /assistente virtual/);
    await processMetaWebhook(inbound("ade-in-2", "Carlos"));
    await processAdeWelcomeQueue(20, fakeSender);
    assert.match(sent[1], /Prazer, Carlos/);
    await processMetaWebhook(inbound("ade-in-3", "Quero consultar o preço de um medicamento"));
    await processAdeWelcomeQueue(20, fakeSender);
    conversation = await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } });
    assert.equal(conversation.welcomeStage, "HUMAN");
    assert.equal(conversation.assignedAgentId, user.id);
    assert.equal(conversation.firstResponseAt, null, "Resposta automática não encerra SLA humano");
    assert.equal(sent.length, 3);
    assert.equal(await prisma.message.count({ where: { direction: "INTERNAL" } }), 1);
    await processMetaWebhook(inbound("ade-in-4", "Obrigado"));
    await processAdeWelcomeQueue(20, fakeSender);
    assert.equal(sent.length, 3, "Ade não continua após o transbordo");

    // A fresh session, with a duplicated webhook and a manual takeover before delivery.
    await prisma.conversation.update({ where: { id: conversation.id }, data: { status: "CLOSED", assignedAgentId: null } });
    await processMetaWebhook(inbound("ade-in-5", "Olá"));
    const second = await prisma.conversation.findFirstOrThrow({ where: { status: "QUEUED" } });
    await prisma.$transaction(async tx => {
      await lockAdeOrganization(tx, organization.id);
      await stopAdeWelcome(tx, second.id);
      await tx.conversation.update({ where: { id: second.id }, data: { assignedAgentId: user.id, status: "OPEN" } });
    });
    await processAdeWelcomeQueue(20, fakeSender);
    assert.equal(sent.length, 3, "Assumir manualmente cancela a resposta pendente");

    await prisma.conversation.update({ where: { id: second.id }, data: { status: "CLOSED", assignedAgentId: null } });
    await processMetaWebhook(inbound("ade-in-6", "Olá"));
    const third = await prisma.conversation.findFirstOrThrow({ where: { status: "QUEUED" } });
    let failures = 0;
    await processAdeWelcomeQueue(20, async () => { failures += 1; throw new Error("simulated_timeout"); });
    assert.equal(failures, 1);
    assert.equal((await prisma.conversation.findUniqueOrThrow({ where: { id: third.id } })).welcomeStage, "HUMAN");
    await processAdeWelcomeQueue(20, fakeSender);
    assert.equal(sent.length, 3, "Entrega incerta não é reenviada automaticamente");

    await prisma.conversation.update({ where: { id: third.id }, data: { status: "CLOSED", assignedAgentId: null } });
    await processMetaWebhook(inbound("ade-in-7", "Olá"));
    const fourth = await prisma.conversation.findFirstOrThrow({ where: { status: "QUEUED" } });
    await prisma.conversation.update({ where: { id: fourth.id }, data: { welcomeUpdatedAt: new Date(Date.now() - 11 * 60_000) } });
    await recoverAdeWelcome();
    assert.equal((await prisma.conversation.findUniqueOrThrow({ where: { id: fourth.id } })).welcomeStage, "HUMAN");
    console.log("Ade: integração aprovada — fluxo, duplicatas, fila, resumo, SLA, intervenção humana, falha e inatividade. Nenhum WhatsApp enviado.");
  } finally {
    if (organizationId) {
      await prisma.conversation.deleteMany({ where: { organizationId } });
      await prisma.organization.delete({ where: { id: organizationId } });
    }
    await prisma.$disconnect();
  }
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
