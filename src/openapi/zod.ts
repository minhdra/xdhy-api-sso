import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// Adds `.openapi()` to every zod schema. Must run before any schema file
// calls `.openapi()`, so every schema module imports `z` from here instead
// of importing `zod` directly.
extendZodWithOpenApi(z);

export { z };
