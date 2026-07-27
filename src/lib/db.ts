// Re-export the canonical singleton from src/db.ts so legacy imports don't
// create a second PrismaClient instance.
export { db as default } from "../db";
