import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

import { seedChurchFixtures } from "./seed/church-fixtures.mjs";
import { seedDevUserFixtures } from "./seed/journal-fixtures.mjs";

const LOCAL_DB_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Seeding inserts the test@test.com user plus journal and church fixtures, so it
 * must never run against a staging/production database. Allow it only when the
 * target clearly looks local (localhost host, or a *_dev / *_shadow / *_test
 * database name) unless the operator explicitly opts in with ALLOW_REMOTE_SEED=1.
 */
function assertLocalSeedTarget(databaseUrl) {
  if (process.env.ALLOW_REMOTE_SEED === "1") {
    console.warn(
      "ALLOW_REMOTE_SEED=1 set — skipping the local-database safety check. Ensure this is intentional.",
    );
    return;
  }

  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL is not a valid connection string.");
  }

  const host = parsed.hostname;
  const databaseName = parsed.pathname.replace(/^\//, "");
  const looksLocalHost = LOCAL_DB_HOSTS.has(host);
  const looksLocalName = /(_dev|_shadow|_test)$/.test(databaseName);

  if (!looksLocalHost && !looksLocalName) {
    throw new Error(
      `Refusing to seed non-local database "${databaseName}" at host "${host}". ` +
        "Seeding is for local development only. Point DATABASE_URL at the local Docker Postgres " +
        "(see .env.template), or set ALLOW_REMOTE_SEED=1 to override.",
    );
  }
}

function createPrismaClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to seed local development data.");
  }

  assertLocalSeedTarget(process.env.DATABASE_URL);

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
