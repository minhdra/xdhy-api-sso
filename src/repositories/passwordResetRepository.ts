import { injectable } from 'tsyringe';

import { Database } from '../config/database';

export interface ValidResetToken {
  user_id: string;
}

// Bảng mới của riêng api-sso (a_password_reset_token, xem db/migrations/) - SQL
// thuần qua Database.raw(), cùng quy ước với SessionRepository.
@injectable()
export class PasswordResetRepository {
  constructor(private db: Database) {}

  async create(params: { tokenHash: string; userId: string; ttlMs: number }): Promise<void> {
    await this.db.raw(
      `INSERT INTO a_password_reset_token (token_hash, user_id, expires_at)
       VALUES ($1, $2, now() + ($3 * interval '1 millisecond'))`,
      [params.tokenHash, params.userId, params.ttlMs],
    );
  }

  async findValid(tokenHash: string): Promise<ValidResetToken | null> {
    const rows = await this.db.raw(
      `SELECT user_id FROM a_password_reset_token
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
      [tokenHash],
    );
    return rows[0] ?? null;
  }

  async markUsed(tokenHash: string): Promise<void> {
    await this.db.raw(`UPDATE a_password_reset_token SET used_at = now() WHERE token_hash = $1`, [
      tokenHash,
    ]);
  }
}
