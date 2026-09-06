import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const organization = await prisma.organization.upsert({
    where: { slug: "farmavale" },
    update: {},
    create: {
      name: "Farmavale",
      slug: "farmavale",
      timezone: "America/Sao_Paulo",
    },
  });

  const tags = [
    ["Prioridade alta", "#FF5E7D"],
    ["Cliente recorrente", "#5A1E7A"],
    ["Entrega expressa", "#FFC709"],
    ["Receita digital", "#00A859"],
  ];

  for (const [name, color] of tags) {
    await prisma.tag.upsert({
      where: { organizationId_name: { organizationId: organization.id, name } },
      update: { color },
      create: { organizationId: organization.id, name, color },
    });
  }

  console.info("Farmavale foundation seeded", { organizationId: organization.id });
}

main().finally(() => prisma.$disconnect());
