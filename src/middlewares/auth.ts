import { type NextFunction, type Request, type Response } from 'express';
import { container } from 'tsyringe';

import { ACCESS_COOKIE } from '../config/cookie';
import { verifyToken } from '../config/jwt';
import { AppError } from '../errors/AppError';
import { SessionRepository } from '../repositories/sessionRepository';

const sessionRepository = container.resolve(SessionRepository);

// Bảo vệ route cần đăng nhập (accountRouter, GET /apps). Đọc access token từ
// cookie httpOnly hoặc header Authorization (client không dùng cookie được -
// vd mobile), verify chữ ký RS256, gắn req.userId. Tách từ logic vốn lặp
// trong authController.me.
export const requireAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  const token = req.cookies?.[ACCESS_COOKIE] || req.headers.authorization?.split(' ')[1];
  if (!token) {
    next(new AppError(401, 'Bạn không được cấp quyền!'));
    return;
  }

  const decoded = verifyToken(token);
  if (!decoded || decoded.type !== 'access' || !decoded.user_id || !decoded.session_id) {
    next(new AppError(401, 'Bạn không được cấp quyền!'));
    return;
  }

  try {
    const active = await sessionRepository.isSessionActive(decoded.session_id, decoded.user_id);
    if (!active) {
      next(new AppError(401, 'Phiên đăng nhập đã bị thu hồi hoặc hết hạn.'));
      return;
    }
    req.userId = decoded.user_id;
    req.sessionId = decoded.session_id;
    next();
  } catch (error) {
    next(error);
  }
};
