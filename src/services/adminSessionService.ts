import { injectable } from 'tsyringe';

import { AppError } from '../errors/AppError';
import { SessionRepository } from '../repositories/sessionRepository';

// Quản trị xem/thu hồi phiên đăng nhập của mọi người (20/10/2026). Phiên đang
// gọi và tài khoản của chính admin không thu hồi được ở đây - dùng Đăng xuất /
// tab "Của tôi", tránh tự đá mình ra.
@injectable()
export class AdminSessionService {
  constructor(private sessions: SessionRepository) {}

  async list(params: { q: string; page: number; pageSize: number }, currentSessionId: string | null) {
    const { rows, total } = await this.sessions.listActiveAll({
      q: params.q,
      limit: params.pageSize,
      offset: (params.page - 1) * params.pageSize,
    });
    return {
      items: rows.map((s) => ({ ...s, current: s.session_id === currentSessionId })),
      total,
      page: params.page,
      page_size: params.pageSize,
    };
  }

  async revoke(sessionId: string, currentSessionId: string | null): Promise<void> {
    if (sessionId === currentSessionId) {
      throw new AppError(400, 'Không thể thu hồi phiên hiện tại - dùng Đăng xuất.');
    }
    const affected = await this.sessions.revokeSessionAny(sessionId);
    if (affected === 0) throw new AppError(404, 'Phiên không tồn tại hoặc đã bị thu hồi.');
  }

  async revokeUser(userId: string, actorId: string): Promise<void> {
    if (userId === actorId) {
      throw new AppError(400, 'Không thể thu hồi toàn bộ phiên của chính bạn - dùng Đăng xuất.');
    }
    await this.sessions.revokeAllForUser(userId);
  }
}
