import { type NextFunction, type Request, type Response } from 'express';
import { container } from 'tsyringe';

import { AppError } from '../errors/AppError';
import { AppService } from '../services/appService';

// Đặt SAU requireAuth (cần req.userId đã có). Tính lại mỗi request qua
// a_IsUserAdmin - không tin field role_group trong JWT vì access token lúc
// /refresh chỉ ký lại {user_id}, không mang role_group (xem authService.refresh).
export const requireAdmin = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const appService = container.resolve(AppService);
    const isAdmin = await appService.isAdmin(req.userId as string);
    if (!isAdmin) {
      next(new AppError(403, 'Chỉ quản trị viên mới truy cập được mục này.'));
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
};
