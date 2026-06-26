import { Request, Response, NextFunction } from "express";

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers["x-admin-api-key"];
  if (!process.env.ADMIN_API_KEY || key !== process.env.ADMIN_API_KEY) {
    res.status(403).json({ error: "Forbidden", code: "INVALID_ADMIN_KEY" });
    return;
  }
  next();
}
