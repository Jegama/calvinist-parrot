import { createAppPrismaClient } from "./prisma-client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

export default createAppPrismaClient(connectionString);
