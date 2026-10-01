import { type NextFunction, type Request, type Response } from 'express';
import { injectable } from 'tsyringe';

import { type FilterAppAccessInput } from '../schemas/internal.schema';
import { AppService } from '../services/appService';

@injectable()
export class InternalController {
  constructor(private appService: AppService) {}

  // POST /internal/app-access/filter
  // Body: { app_key, user_ids[] } -> { allowed_user_ids[] }
  // Gọi bởi api-task-management để lọc danh sách chọn người ở màn Phân quyền
  // công trình theo quyền app 'task'.
  async filterAppAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { app_key, user_ids } = req.body as FilterAppAccessInput;
      const allowed = await this.appService.filterUsersWithAppAccess(app_key, user_ids);
      res.json({ allowed_user_ids: allowed });
    } catch (error) {
      next(error);
    }
  }
}
