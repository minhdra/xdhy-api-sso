import { injectable } from 'tsyringe';

import { Database } from '../config/database';

export interface ValidRefreshToken {
  jti: string;
  session_id: string;
  user_id: string;
  remember: boolean;
}

// Bảng mới của riêng api-sso (auth_session/auth_refresh_token, xem
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
      `INSERT INTO auth_session (session_id, user_id, expires_at, remember, user_agent, ip)
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
      `INSERT INTO auth_refresh_token (jti, session_id, user_id, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [params.jti, params.sessionId, params.userId, params.expiresAt],
    );
  }

  // Điều kiện thu hồi: token tồn tại, chưa bị revoke, chưa hết hạn, và session
  // cha cũng chưa bị revoke (logout revoke cả 2 tầng - xem revokeSession).
  async getValidRefreshToken(jti: string): Promise<ValidRefreshToken | null> {
    const rows = await this.db.raw(
      `SELECT rt.jti, rt.session_id, rt.user_id, s.remember
       FROM auth_refresh_token rt
       JOIN auth_session s ON s.session_id = rt.session_id
       WHERE rt.jti = $1
         AND rt.revoked_at IS NULL
         AND rt.expires_at > now()
         AND s.revoked_at IS NULL`,
      [jti],
    );
    return rows[0] ?? null;
  }

  async touchSession(sessionId: string): Promise<void> {
    await this.db.raw(`UPDATE auth_session SET last_seen_at = now() WHERE session_id = $1`, [
      sessionId,
    ]);
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.db.raw(`UPDATE auth_session SET revoked_at = now() WHERE session_id = $1`, [
      sessionId,
    ]);
    await this.db.raw(
      `UPDATE auth_refresh_token SET revoked_at = now() WHERE session_id = $1`,
      [sessionId],
    );
  }
}
