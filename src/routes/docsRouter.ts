import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';

import { generateOpenApiDocument } from '../openapi/document';

const docsRouter = Router();

docsRouter.get('/openapi.json', (_req, res) => {
  res.json(generateOpenApiDocument());
});

docsRouter.use(
  '/',
  swaggerUi.serve,
  swaggerUi.setup(undefined, {
    swaggerOptions: { url: 'openapi.json' },
  }),
);

export default docsRouter;
