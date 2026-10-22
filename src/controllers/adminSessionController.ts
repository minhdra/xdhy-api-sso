import { type NextFunction, type Request, type Response } from 'express';
import { injectable } from 'tsyringe';

import { AdminSessionService } from '../services/adminSessionService';
import {
  type AdminRevokeUserSessionsInput,
  type AdminSessionsQuery,
} from '../schemas/adminSession.schema';
import { type RevokeSessionInput } from '../schemas/account.schema';
import { currentSessionId } from './accountController';

@injectable()
export class AdminSessionController {
  constructor(private service: AdminSessionService) {}

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as unknown as AdminSessionsQuery;
      res.json(
        await this.service.list(
          { q: query.q, page: query.page, pageSize: query.page_size },
          currentSessionId(req),
        ),
      );
    } catch (error) {
      next(error);
    }
  }

  async revoke(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { session_id } = req.body as RevokeSessionInput;
      await this.service.revoke(session_id, currentSessionId(req));
      res.json({ success: true, message: 'Đã thu hồi phiên.' });
    } catch (error) {
      next(error);
    }
  }

  async revokeUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { user_id } = req.body as AdminRevokeUserSessionsInput;
      await this.service.revokeUser(user_id, req.userId as string);
      res.json({ success: true, message: 'Đã thu hồi mọi phiên của người dùng.' });
    } catch (error) {
      next(error);
    }
  }
}
