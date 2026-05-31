import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

import { seedChurchFixtures } from "./seed/church-fixtures.mjs";
import { seedDevUserFixtures } from "./seed/journal-fixtures.mjs";

function createPrismaClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to seed local development data.");
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  return { pool, prisma };
}

async function main() {
  const { pool, prisma } = createPrismaClient();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const journal = await seedDevUserFixtures(tx);
      const churches = await seedChurchFixtures(tx);

      return { churches, journal };
    });

    console.log(
      `Seeded ${result.journal.fixtureCount} fixture journal entries for test@test.com; ${result.journal.journalEntriesCount} total personal entries.`,
    );
    console.log(`Seeded ${result.churches.fixtureCount} church finder fixtures.`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
