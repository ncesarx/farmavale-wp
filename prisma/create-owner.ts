import "dotenv/config";
import { stdin, stdout } from "node:process";
import { hash } from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const EMAIL = "cesar@ncesar.work";
const NAME = "César Almeida";
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

function readHidden(prompt: string): Promise<string> {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    throw new Error("Execute este comando em um terminal interativo.");
  }

  return new Promise((resolve, reject) => {
    let value = "";
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      stdout.write("\n");
    };

    const onData = (key: string) => {
      if (key === "\u0003") {
        cleanup();
        reject(new Error("Operação cancelada."));
        return;
      }
      if (key === "\r" || key === "\n") {
        cleanup();
        resolve(value);
        return;
      }
      if (key === "\u007f") {
        value = value.slice(0, -1);
        return;
      }
      if (key >= " ") value += key;
    };

    stdin.on("data", onData);
  });
}

function validatePassword(password: string) {
  const valid =
    password.length >= 12 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password);

  if (!valid) {
    throw new Error(
      "A senha deve ter ao menos 12 caracteres, com maiúscula, minúscula, número e símbolo.",
    );
  }
}

async function main() {
  const organization = await prisma.organization.findUnique({
    where: { slug: "farmavale" },
  });
  if (!organization) throw new Error("Organização Farmavale não encontrada. Execute o seed.");

  const existing = await prisma.user.findUnique({
    where: {
      organizationId_email: {
        organizationId: organization.id,
        email: EMAIL,
      },
    },
  });
  if (existing?.passwordHash) {
    throw new Error("O usuário proprietário já existe. Nenhuma alteração foi realizada.");
  }

  const password = await readHidden("Nova senha do proprietário: ");
  const confirmation = await readHidden("Confirme a senha: ");
  if (password !== confirmation) throw new Error("As senhas não coincidem.");
  validatePassword(password);

  const passwordHash = await hash(password, 12);
  const owner = await prisma.user.upsert({
    where: {
      organizationId_email: {
        organizationId: organization.id,
        email: EMAIL,
      },
    },
    update: {
      name: NAME,
      passwordHash,
      role: "OWNER",
      status: "ACTIVE",
    },
    create: {
      organizationId: organization.id,
      name: NAME,
      email: EMAIL,
      passwordHash,
      role: "OWNER",
      status: "ACTIVE",
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: organization.id,
      actorId: owner.id,
      action: "OWNER_CREATED",
      entityType: "User",
      entityId: owner.id,
      metadata: { method: "secure-cli", email: EMAIL },
    },
  });

  stdout.write(`Proprietário criado com sucesso: ${owner.email}\n`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Erro inesperado.");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
