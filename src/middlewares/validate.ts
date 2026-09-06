import { type NextFunction, type Request, type Response } from 'express';
import { type ZodObject, ZodError } from 'zod';

import { AppError } from '../errors/AppError';

export interface RequestSchema {
  body?: ZodObject;
  query?: ZodObject;
  params?: ZodObject;
}

const formatZodError = (error: ZodError): string =>
  error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ');

// Parses+replaces req.body/query/params with the schema's output, so
// downstream code (controllers, services) can trust the shape without
// re-checking or casting.
export const validate =
  (schema: RequestSchema) => (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schema.params) req.params = schema.params.parse(req.params) as Request['params'];
      if (schema.query) req.query = schema.query.parse(req.query) as Request['query'];
      if (schema.body) req.body = schema.body.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return next(new AppError(400, formatZodError(error)));
      }
      next(error);
    }
  };
