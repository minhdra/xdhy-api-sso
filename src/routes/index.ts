import { Router } from 'express';

import accountRouter from './accountRouter';
import adminAppRouter from './adminAppRouter';
import adminOrgRouter from './adminOrgRouter';
import authRouter from './authRouter';
import brandingRouter from './brandingRouter';
import docsRouter from './docsRouter';

const router = Router();

// Swagger mở, không qua requireAuth (giống api-core/api-task).
router.use('/docs', docsRouter);

router.use('/', authRouter);
// Có route công khai GET /branding - mount TRƯỚC adminAppRouter (router đó
// requireAuth mọi request đi qua nó).
router.use('/', brandingRouter);
router.use('/', accountRouter);
// Tự bảo vệ bằng requireAuth + requireAdmin bên trong (xem adminAppRouter.ts).
router.use('/', adminAppRouter);
router.use('/', adminOrgRouter);

export default router;
