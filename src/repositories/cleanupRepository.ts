import { injectable } from 'tsyringe';

import { Database } from '../config/database';

export interface SsoCleanupCounts {
  password_reset_tokens: number;
  refresh_tokens: number;
  sessions: number;
}

const emptyCounts = (): SsoCleanupCounts => ({
  password_reset_tokens: 0,
  refresh_tokens: 0,
  sessions: 0,
});

@injectable()
export class CleanupRepository {
  constructor(private db: Database) {}

  async cleanupBatch(params: {
    sessionRetentionDays: number;
    passwordResetRetentionDays: number;
    batchSize: number;
    dryRun: boolean;
  }): Promise<{ acquired: boolean; counts: SsoCleanupCounts }> {
    const rows = await this.db.raw(
      params.dryRun
        ? `WITH lock AS (SELECT pg_try_advisory_xact_lock(6005001) AS acquired)
           SELECT lock.acquired,
             CASE WHEN lock.acquired THEN (
               SELECT count(*)::int FROM (
                 SELECT 1 FROM a_password_reset_token
                 WHERE expires_at < now() - ($1 * interval '1 day')
                    OR used_at < now() - ($1 * interval '1 day')
                 LIMIT $3
               ) q
             ) ELSE 0 END AS password_reset_tokens,
             CASE WHEN lock.acquired THEN (
               SELECT count(*)::int FROM (
                 SELECT 1 FROM a_refresh_token
                 WHERE expires_at < now() - ($2 * interval '1 day')
                    OR revoked_at < now() - ($2 * interval '1 day')
                 LIMIT $3
               ) q
             ) ELSE 0 END AS refresh_tokens,
             CASE WHEN lock.acquired THEN (
               SELECT count(*)::int FROM (
                 SELECT 1 FROM a_session s
                 WHERE (s.expires_at < now() - ($2 * interval '1 day')
                    OR s.revoked_at < now() - ($2 * interval '1 day'))
                   AND NOT EXISTS (
                     SELECT 1 FROM a_refresh_token rt WHERE rt.session_id = s.session_id
                   )
                 LIMIT $3
               ) q
             ) ELSE 0 END AS sessions
           FROM lock`
        : `WITH lock AS (
             SELECT pg_try_advisory_xact_lock(6005001) AS acquired
           ), deleted_reset AS (
             DELETE FROM a_password_reset_token
             WHERE token_hash IN (
               SELECT token_hash FROM a_password_reset_token, lock
               WHERE lock.acquired
                 AND (expires_at < now() - ($1 * interval '1 day')
                   OR used_at < now() - ($1 * interval '1 day'))
               ORDER BY expires_at
               LIMIT $3
             ) RETURNING 1
           ), deleted_refresh AS (
             DELETE FROM a_refresh_token
             WHERE jti IN (
               SELECT jti FROM a_refresh_token, lock
               WHERE lock.acquired
                 AND (expires_at < now() - ($2 * interval '1 day')
                   OR revoked_at < now() - ($2 * interval '1 day'))
               ORDER BY expires_at
               LIMIT $3
             ) RETURNING 1
           ), deleted_session AS (
             DELETE FROM a_session s
             WHERE s.session_id IN (
               SELECT candidate.session_id
               FROM a_session candidate, lock
               WHERE lock.acquired
                 AND (candidate.expires_at < now() - ($2 * interval '1 day')
                   OR candidate.revoked_at < now() - ($2 * interval '1 day'))
                 AND NOT EXISTS (
                   SELECT 1 FROM a_refresh_token rt
                   WHERE rt.session_id = candidate.session_id
                 )
               ORDER BY candidate.expires_at
               LIMIT $3
             ) RETURNING 1
           )
           SELECT lock.acquired,
             (SELECT count(*)::int FROM deleted_reset) AS password_reset_tokens,
             (SELECT count(*)::int FROM deleted_refresh) AS refresh_tokens,
             (SELECT count(*)::int FROM deleted_session) AS sessions
           FROM lock`,
      [params.passwordResetRetentionDays, params.sessionRetentionDays, params.batchSize],
    );

    const row = rows[0];
    if (!row?.acquired) return { acquired: false, counts: emptyCounts() };
    return {
      acquired: true,
      counts: {
        password_reset_tokens: Number(row.password_reset_tokens ?? 0),
        refresh_tokens: Number(row.refresh_tokens ?? 0),
        sessions: Number(row.sessions ?? 0),
      },
    };
  }
}
