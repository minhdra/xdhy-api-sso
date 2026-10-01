import { OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';

import { registry } from './registry';

// Called lazily per-request (not at import time) so it always reflects every
// route file imported by then, regardless of module import order.
export function generateOpenApiDocument() {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'SSO API',
      version: '1.0.0',
    },
    servers: [{ url: '/api-sso' }],
  });
}
