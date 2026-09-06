import { injectable } from 'tsyringe';

import { Database } from '../config/database';

export interface ValidRefreshToken {
  jti: string;
  session_id: string;
  user_id: string;
  remember: boolean;
}

export interface SessionRow {
  session_id: string;
  user_agent: string | null;
  ip: string | null;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  remember: boolean;
}

// Bảng mới của riêng api-sso (a_session/a_refresh_token, xem
// db/migrations/) - SQL thuần qua Database.raw(), không qua stored procedure
// như phần còn lại của DB (xem comment trong config/database.ts).
@injectable()
export class SessionRepository {
  constructor(private db: Database) {}

  async createSession(params: {
    sessionId: string;
    userId: string;
    expiresAt: Date;
    remember: boolean;
    userAgent?: string;
    ip?: string;
  }): Promise<void> {
    await this.db.raw(
      `INSERT INTO a_session (session_id, user_id, expires_at, remember, user_agent, ip)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        params.sessionId,
        params.userId,
        params.expiresAt,
        params.remember,
        params.userAgent ?? null,
        params.ip ?? null,
      ],
    );
  }

  async createRefreshToken(params: {
    jti: string;
    sessionId: string;
    userId: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.db.raw(
      `INSERT INTO a_refresh_token (jti, session_id, user_id, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [params.jti, params.sessionId, params.userId, params.expiresAt],
    );
  }

  // Điều kiện thu hồi: token tồn tại, chưa bị revoke, chưa hết hạn, và session
  // cha cũng chưa bị revoke (logout revoke cả 2 tầng - xem revokeSession).
  async getValidRefreshToken(jti: string): Promise<ValidRefreshToken | null> {
    const rows = await this.db.raw(
      `SELECT rt.jti, rt.session_id, rt.user_id, s.remember
       FROM a_refresh_token rt
       JOIN a_session s ON s.session_id = rt.session_id
       WHERE rt.jti = $1
         AND rt.revoked_at IS NULL
         AND rt.expires_at > now()
         AND s.revoked_at IS NULL`,
      [jti],
    );
    return rows[0] ?? null;
  }

  async touchSession(sessionId: string): Promise<void> {
    await this.db.raw(`UPDATE a_session SET last_seen_at = now() WHERE session_id = $1`, [
      sessionId,
    ]);
  }

  async isSessionActive(sessionId: string, userId: string): Promise<boolean> {
    const rows = await this.db.raw(
      `SELECT 1
       FROM a_session
       WHERE session_id = $1
         AND user_id = $2
         AND revoked_at IS NULL
         AND expires_at > now()
       LIMIT 1`,
      [sessionId, userId],
    );
    return rows.length > 0;
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.db.raw(`UPDATE a_session SET revoked_at = now() WHERE session_id = $1`, [
      sessionId,
    ]);
    await this.db.raw(
      `UPDATE a_refresh_token SET revoked_at = now() WHERE session_id = $1`,
      [sessionId],
    );
  }

  // Trang "Quản lý tài khoản" - liệt kê phiên đang hoạt động của chính user.
  async listByUser(userId: string): Promise<SessionRow[]> {
    return this.db.raw(
      `SELECT session_id, user_agent, ip, created_at, last_seen_at, expires_at, remember
       FROM a_session
       WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
       ORDER BY last_seen_at DESC`,
      [userId],
    );
  }

  // Thu hồi 1 phiên - ràng buộc user_id để không thu hồi được phiên người
  // khác. Trả số dòng session bị đổi (0 = không phải phiên của user này).
  async revokeSessionForUser(sessionId: string, userId: string): Promise<number> {
    const rows = await this.db.raw(
      `UPDATE a_session SET revoked_at = now()
       WHERE session_id = $1 AND user_id = $2 AND revoked_at IS NULL
       RETURNING session_id`,
      [sessionId, userId],
    );
    if (rows.length > 0) {
      await this.db.raw(
        `UPDATE a_refresh_token SET revoked_at = now() WHERE session_id = $1`,
        [sessionId],
      );
    }
    return rows.length;
  }
}
