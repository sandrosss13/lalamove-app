import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient instance across hot-reloads in development.
// Next.js clears the module cache on each request in dev, which would otherwise
// exhaust the database connection pool by creating a new client every time.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
