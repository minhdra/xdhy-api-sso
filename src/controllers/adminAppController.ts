import { type NextFunction, type Request, type Response } from 'express';
import { injectable } from 'tsyringe';

import { assertAppIcon, removeAppIcon, saveAppIcon } from '../config/appIconUpload';
import { AppError } from '../errors/AppError';
import { AppService } from '../services/appService';
import {
  type AppAccessCandidatesQuery,
  type AppIdParam,
  type DeleteAppInput,
  type MutateAppAccessInput,
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

  async uploadIcon(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { app_id } = req.params as unknown as AppIdParam;
      const app = (await this.appService.adminList()).find((item) => item.app_id === app_id);
      if (!app) throw new AppError(404, 'Không tìm thấy ứng dụng.');
      assertAppIcon(req.file);
      const icon = `/api-sso/uploads/app-icons/${app_id}.png`;
      await saveAppIcon(app_id, req.file.buffer);
      await this.appService.setAppIcon(app_id, icon, req.userId as string);
      res.json({ success: true, icon });
    } catch (error) { next(error); }
  }

  async deleteApp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { app_id } = req.body as DeleteAppInput;
      await this.appService.deleteApp(app_id, req.userId as string);
      await removeAppIcon(app_id);
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

  async listAccessCandidates(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { app_id } = req.params as unknown as AppIdParam;
      const query = req.query as unknown as AppAccessCandidatesQuery;
      const result = await this.appService.listAppAccessCandidates(app_id, {
        keyword: query.q,
        positionId: query.position_id,
        page: query.page,
        pageSize: query.page_size,
      });
      res.json({ ...result, page: query.page, page_size: query.page_size });
    } catch (error) {
      next(error);
    }
  }

  async addAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { app_id } = req.params as unknown as AppIdParam;
      const { user_ids } = req.body as MutateAppAccessInput;
      const affected = await this.appService.addAppAccess(app_id, user_ids, req.userId as string);
      res.json({ success: true, message: `Đã thêm quyền cho ${affected} người.`, affected });
    } catch (error) {
      next(error);
    }
  }

  async removeAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { app_id } = req.params as unknown as AppIdParam;
      const { user_ids } = req.body as MutateAppAccessInput;
      const affected = await this.appService.removeAppAccess(app_id, user_ids);
      res.json({ success: true, message: `Đã gỡ quyền của ${affected} người.`, affected });
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
