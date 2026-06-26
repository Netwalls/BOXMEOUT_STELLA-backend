import { timingSafeEqual } from "crypto";
import type { Request, Response, NextFunction } from "express";

/**
 * Middleware — validates Authorization: Bearer <ADMIN_API_KEY> header.
 * Uses crypto.timingSafeEqual to prevent timing attacks.
 * Returns 401 { error, code } on any failure.
 */
export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
    return;
  }

  const provided = authHeader.slice(7);
  const expected = process.env.ADMIN_API_KEY ?? "";

  if (!expected) {
    res.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
    return;
  }

  try {
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    const len = Math.max(a.length, b.length);
    const bufA = Buffer.alloc(len);
    const bufB = Buffer.alloc(len);
    a.copy(bufA);
    b.copy(bufB);

    if (!timingSafeEqual(bufA, bufB) || a.length !== b.length) {
      res.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
      return;
    }
  } catch {
    res.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
    return;
  }

  next();
}
