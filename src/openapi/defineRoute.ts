import { type RouteConfig } from '@asteasolutions/zod-to-openapi';
import { type RequestHandler } from 'express';

import { validate, type RequestSchema } from '../middlewares/validate';

import { registry } from './registry';

type DefineRouteOptions = Omit<RouteConfig, 'request' | 'responses'> & {
  schema?: RequestSchema;
  responses: RouteConfig['responses'];
};

/**
 * Single source of truth for a route: registers the OpenAPI path (so docs
 * stay accurate) and returns the validation middleware for the same schema,
 * so the schema is written once and never drifts between docs and runtime.
 * Usage: router.post('/create', ...defineRoute({...}), controller.handler)
 */
export function defineRoute(options: DefineRouteOptions): RequestHandler[] {
  const { schema, ...rest } = options;

  registry.registerPath({
    ...rest,
    request: schema
      ? {
          params: schema.params,
          query: schema.query,
          body: schema.body
            ? { content: { 'application/json': { schema: schema.body } } }
            : undefined,
        }
      : undefined,
  });

  return schema ? [validate(schema)] : [];
}
