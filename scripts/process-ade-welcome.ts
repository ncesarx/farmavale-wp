process.loadEnvFile(".env");

async function main() {
  const { processAdeWelcomeQueue, recoverAdeWelcome } = await import("../lib/ade-welcome");
  const { prisma } = await import("../lib/prisma");
  try {
    await recoverAdeWelcome();
    await processAdeWelcomeQueue();
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(error => {
  console.error("ade_worker_failed", { error: error instanceof Error ? error.name : "UnknownError" });
  process.exitCode = 1;
});
