// Re-export the canonical singleton from src/db.ts so legacy imports don't
// create a second PrismaClient instance.
// #1229 B-51: This file is kept only for backward-compatible imports.
// Prefer importing directly from "../../db" or "../db" instead.
export { db, db as default } from "../db";
