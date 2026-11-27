import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

export function createAppPrismaClient(connectionString: string) {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    // Space records are returned as JSON. Only the sync endpoint needs the bigint.
    omit: { prayerFamilySpace: { version: true } },
  });
}
