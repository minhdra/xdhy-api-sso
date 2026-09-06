import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

// Single registry shared by every schema/route module. Route files register
// their paths here at import time; the docs endpoint reads it lazily so
// import order never matters.
export const registry = new OpenAPIRegistry();
