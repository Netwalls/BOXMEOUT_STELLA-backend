import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";

interface ValidateTarget {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

export function validate(schemas: ValidateTarget) {
  return (req: Request, res: Response, next: NextFunction): void => {
    for (const key of ["body", "query", "params"] as const) {
      const schema = schemas[key];
      if (!schema) continue;

      const result = schema.safeParse(req[key]);
      if (!result.success) {
        res.status(400).json({
          error: "Validation failed",
          code: "VALIDATION_ERROR",
          details: result.error.flatten(),
        });
        return;
      }

      (req as Record<string, unknown>)[key] = result.data;
    }

    next();
  };
}
