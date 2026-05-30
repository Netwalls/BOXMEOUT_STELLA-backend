import type { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError, ZodIssue } from 'zod';

type Target = 'body' | 'params' | 'query';

function formatErrors(err: ZodError) {
  return err.issues.map((e: ZodIssue) => ({
    field: e.path.join('.'),
    message: e.message,
  }));
}

export function validate(schema: ZodSchema, target: Target = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      res.status(422).json({ errors: formatErrors(result.error) });
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any)[target] = result.data;
    next();
  };
}

// Convenience aliases kept for backward compatibility
export const validateBody = (schema: ZodSchema) => validate(schema, 'body');
export const validateQuery = (schema: ZodSchema) => validate(schema, 'query');
export const validateParams = (schema: ZodSchema) => validate(schema, 'params');
