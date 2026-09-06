import { type NextFunction, type Request, type Response } from 'express';
import { injectable } from 'tsyringe';

import { toAvatarUrl } from '../config/avatarUpload';
import { REFRESH_COOKIE } from '../config/cookie';
import { verifyToken } from '../config/jwt';
import { AppError } from '../errors/AppError';
import { AccountService } from '../services/accountService';
import { AppService } from '../services/appService';
import { type ChangePasswordInput, type RevokeSessionInput, type UpdateProfileInput } from '../schemas/account.schema';

// session_id của phiên đang gọi - nằm trong refresh token cookie (payload
// refresh = { user_id, session_id, jti }). Access token không mang session_id.
function currentSessionId(req: Request): string | null {
  const token = req.cookies?.[REFRESH_COOKIE];
  const decoded = token ? verifyToken(token) : null;
  return decoded && decoded.type === 'refresh' && decoded.session_id ? decoded.session_id : null;
}

@injectable()
export class AccountController {
  constructor(
    private accountService: AccountService,
    private appService: AppService,
  ) {}

  // Danh sách app cho trang chủ - trước đây là config tĩnh (src/config/apps.ts),
  // giờ lấy từ bảng a_app + phân quyền a_app_access (xem AppService, migration
  // 0005_app_registry.sql). Admin thấy hết, người khác chỉ thấy app được cấp.
  async listApps(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json(await this.appService.listForUser(req.userId as string));
    } catch (error) {
      next(error);
    }
  }

  async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profile = await this.accountService.getProfile(req.userId as string);
      if (!profile) {
        res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ.' });
        return;
      }
      res.json(profile);
    } catch (error) {
      next(error);
    }
  }

  async updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.accountService.updateProfile(req.userId as string, req.body as UpdateProfileInput);
      res.json({ success: true, message: 'Đã cập nhật thông tin.' });
    } catch (error) {
      next(error);
    }
  }

  async uploadAvatar(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file) {
        throw new AppError(400, 'Chưa chọn ảnh.');
      }
      const url = await this.accountService.setAvatar(req.userId as string, toAvatarUrl(req.file.path));
      res.json({ success: true, message: 'Đã cập nhật ảnh đại diện.', avatar: url });
    } catch (error) {
      next(error);
    }
  }

  async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { oldPassword, newPassword } = req.body as ChangePasswordInput;
      await this.accountService.changePassword(req.userId as string, oldPassword, newPassword);
      res.json({ success: true, message: 'Đã đổi mật khẩu.' });
    } catch (error) {
      next(error);
    }
  }

  async listSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const sessions = await this.accountService.listSessions(
        req.userId as string,
        currentSessionId(req),
      );
      res.json(sessions);
    } catch (error) {
      next(error);
    }
  }

  async revokeSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { session_id } = req.body as RevokeSessionInput;
      await this.accountService.revokeSession(
        req.userId as string,
        session_id,
        currentSessionId(req),
      );
      res.json({ success: true, message: 'Đã thu hồi phiên đăng nhập.' });
    } catch (error) {
      next(error);
    }
  }
}
