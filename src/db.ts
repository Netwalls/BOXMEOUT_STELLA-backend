import { PrismaClient } from "@prisma/client";

// Singleton guard: in development, ts-node-dev hot-reloads modules which would
// create a new PrismaClient on every reload, exhausting the connection pool.
// Storing the instance on globalThis ensures only one client exists per process.

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const db: PrismaClient =
  globalThis.__prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = db;
}
