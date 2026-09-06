import { type NextFunction, type Request, type Response } from 'express';
import { injectable } from 'tsyringe';

import { AppService } from '../services/appService';
import {
  type AppIdParam,
  type DeleteAppInput,
  type SetAppAccessInput,
  type UpsertAppInput,
} from '../schemas/adminApp.schema';

@injectable()
export class AdminAppController {
  constructor(private appService: AppService) {}

  async listApps(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json(await this.appService.adminList());
    } catch (error) {
      next(error);
    }
  }

  async upsertApp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = req.body as UpsertAppInput;
      const result = await this.appService.upsertApp(input, req.userId as string);
      res.json({ success: true, message: 'Đã lưu ứng dụng.', app_id: result.app_id });
    } catch (error) {
      next(error);
    }
  }

  async deleteApp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { app_id } = req.body as DeleteAppInput;
      await this.appService.deleteApp(app_id, req.userId as string);
      res.json({ success: true, message: 'Đã xoá ứng dụng.' });
    } catch (error) {
      next(error);
    }
  }

  async listAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { app_id } = req.params as unknown as AppIdParam;
      res.json(await this.appService.listAppAccess(app_id));
    } catch (error) {
      next(error);
    }
  }

  async setAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { app_id } = req.params as unknown as AppIdParam;
      const { user_ids } = req.body as SetAppAccessInput;
      await this.appService.setAppAccess(app_id, user_ids, req.userId as string);
      res.json({ success: true, message: 'Đã cập nhật danh sách người được truy cập.' });
    } catch (error) {
      next(error);
    }
  }

  async listUsers(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json(await this.appService.listUsers());
    } catch (error) {
      next(error);
    }
  }
}
