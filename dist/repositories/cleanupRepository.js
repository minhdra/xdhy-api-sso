"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CleanupRepository = void 0;
const tsyringe_1 = require("tsyringe");
const database_1 = require("../config/database");
const emptyCounts = () => ({
    password_reset_tokens: 0,
    refresh_tokens: 0,
    sessions: 0,
    avatar_files: 0,
});
let CleanupRepository = class CleanupRepository {
    constructor(db) {
        this.db = db;
    }
    async cleanupBatch(params) {
        const rows = await this.db.raw(params.dryRun
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
           FROM lock`, [params.passwordResetRetentionDays, params.sessionRetentionDays, params.batchSize]);
        const row = rows[0];
        if (!row?.acquired)
            return { acquired: false, counts: emptyCounts() };
        return {
            acquired: true,
            counts: {
                password_reset_tokens: Number(row.password_reset_tokens ?? 0),
                refresh_tokens: Number(row.refresh_tokens ?? 0),
                sessions: Number(row.sessions ?? 0),
                avatar_files: 0,
            },
        };
    }
    async isAvatarPathReferenced(diskPath) {
        const publicUrl = `/api-sso/${diskPath.replace(/\\/g, '/')}`;
        const rows = await this.db.raw(`SELECT EXISTS (
         SELECT 1 FROM user_profiles
         WHERE avatar = $1 OR avatar = $2
       ) AS referenced`, [publicUrl, diskPath]);
        return rows[0]?.referenced === true;
    }
};
exports.CleanupRepository = CleanupRepository;
exports.CleanupRepository = CleanupRepository = __decorate([
    (0, tsyringe_1.injectable)(),
    __metadata("design:paramtypes", [database_1.Database])
], CleanupRepository);
