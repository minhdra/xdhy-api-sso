import { type NextFunction, type Request, type Response } from 'express';
import { injectable } from 'tsyringe';

import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieOptions,
  clearCookieOptions,
  refreshCookieOptions,
} from '../config/cookie';
import { generateAccessToken, generateRefreshToken, verifyToken } from '../config/jwt';
import { AppError } from '../errors/AppError';
import { AuthService } from '../services/authService';

interface LoginBody {
  username: string;
  password: string;
  remember?: boolean;
}

interface ForgotPasswordBody {
  email: string;
}

interface ResetPasswordConfirmBody {
  token: string;
  newPassword: string;
}

@injectable()
export class AuthController {
  constructor(private authService: AuthService) {}

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { username, password, remember } = req.body as LoginBody;
      if (!username || !password) {
        next(new AppError(400, 'Thiếu tài khoản hoặc mật khẩu.'));
        return;
      }
      const rememberFlag = remember === true;

      const result = await this.authService.login(username, password, rememberFlag, {
        userAgent: req.headers['user-agent'],
        ip: req.ip,
      });

      if (!result) {
        next(new AppError(401, 'Sai tài khoản hoặc mật khẩu.'));
        return;
      }

      const accessToken = generateAccessToken(
        {
          user_id: result.user.user_id,
          full_name: result.user.full_name,
          user_name: result.user.user_name,
          role_group: result.user.role_group,
        },
        result.accessExpiresIn,
      );
      const refreshToken = generateRefreshToken(
        { user_id: result.user.user_id, session_id: result.sessionId, jti: result.jti },
        result.refreshExpiresIn,
      );

      res.cookie(ACCESS_COOKIE, accessToken, accessCookieOptions(rememberFlag));
      res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions(rememberFlag));
      res.json(result.user);
    } catch (error) {
      next(error);
    }
  }

  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = req.cookies?.[REFRESH_COOKIE];
      if (!token) {
        next(new AppError(401, 'Bạn không được cấp quyền!'));
        return;
      }

      const decoded = verifyToken(token);
      if (!decoded || decoded.type !== 'refresh' || !decoded.session_id || !decoded.jti) {
        next(new AppError(401, 'Phiên đăng nhập hết hạn.'));
        return;
      }

      const result = await this.authService.refresh(decoded.session_id, decoded.jti);
      if (!result) {
        next(new AppError(401, 'Phiên đăng nhập đã bị thu hồi hoặc hết hạn.'));
        return;
      }

      const accessToken = generateAccessToken({ user_id: result.user_id }, result.accessExpiresIn);
      res.cookie(ACCESS_COOKIE, accessToken, accessCookieOptions(result.remember));
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = req.cookies?.[REFRESH_COOKIE];
      const decoded = token ? verifyToken(token) : null;
      await this.authService.logout(decoded?.session_id ?? null);

      res.clearCookie(ACCESS_COOKIE, clearCookieOptions());
      res.clearCookie(REFRESH_COOKIE, clearCookieOptions());
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }

  async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = req.cookies?.[ACCESS_COOKIE] || req.headers.authorization?.split(' ')[1];
      if (!token) {
        next(new AppError(401, 'Bạn không được cấp quyền!'));
        return;
      }

      const decoded = verifyToken(token);
      if (!decoded || decoded.type !== 'access') {
        next(new AppError(401, 'Bạn không được cấp quyền!'));
        return;
      }

      const result = await this.authService.me(decoded.user_id);
      if (!result) {
        next(new AppError(404, 'Bản ghi không tồn tại.'));
        return;
      }
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email } = req.body as ForgotPasswordBody;
      if (!email) {
        next(new AppError(400, 'Thiếu email.'));
        return;
      }
      // Luôn trả 1 message chung dù email có tồn tại hay không - tránh lộ
      // thông tin tài khoản nào tồn tại (service tự bỏ qua âm thầm nếu không
      // tìm thấy).
      await this.authService.forgotPassword(email);
      res.json({
        message: 'Nếu email tồn tại trong hệ thống, chúng tôi đã gửi link đặt lại mật khẩu.',
        success: true,
      });
    } catch (error) {
      next(error);
    }
  }

  async resetPasswordConfirm(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token, newPassword } = req.body as ResetPasswordConfirmBody;
      if (!token || !newPassword) {
        next(new AppError(400, 'Thiếu thông tin.'));
        return;
      }
      if (newPassword.length < 6) {
        next(new AppError(400, 'Mật khẩu mới phải có ít nhất 6 ký tự.'));
        return;
      }
      const ok = await this.authService.resetPasswordConfirm(token, newPassword);
      if (!ok) {
        next(new AppError(400, 'Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.'));
        return;
      }
      res.json({ message: 'Đổi mật khẩu thành công.', success: true });
    } catch (error) {
      next(error);
    }
  }
}
