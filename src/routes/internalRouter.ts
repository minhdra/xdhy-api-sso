import { Router } from 'express';
import { container } from 'tsyringe';

import { InternalController } from '../controllers/internalController';
import { validate } from '../middlewares/validate';
import { filterAppAccessSchema } from '../schemas/internal.schema';

// Route nội bộ - api-task-management gọi container-tới-container để hỏi quyền
// app của 1 tập user. KHÔNG mount dưới '/api-sso' (đó là phần gateway rewrite
// /api/api-sso/* -> /api-sso/* cho FE) - mount ở app level '/internal', bảo vệ
// bằng requireInternalSecret (app.ts), KHÔNG requireAuth. KHÔNG lên Swagger.
const internalRouter = Router();
const controller = container.resolve(InternalController);

internalRouter.post(
  '/app-access/filter',
  validate({ body: filterAppAccessSchema }),
  controller.filterAppAccess.bind(controller),
);

export default internalRouter;
