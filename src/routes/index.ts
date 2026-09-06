import { Router } from 'express';

import accountRouter from './accountRouter';
import authRouter from './authRouter';
import docsRouter from './docsRouter';

const router = Router();

// Swagger mở, không qua requireAuth (giống api-core/api-task).
router.use('/docs', docsRouter);

router.use('/', authRouter);
router.use('/', accountRouter);

export default router;
