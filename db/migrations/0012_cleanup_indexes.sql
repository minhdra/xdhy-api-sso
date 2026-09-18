-- 0012_cleanup_indexes.sql
-- Index phuc vu job dinh ky don token/session het han, tranh full scan khi
-- cac bang auth tang dan theo thoi gian.
-- Rollback: DROP INDEX IF EXISTS idx_a_*_cleanup_* (cac index ben duoi).

CREATE INDEX IF NOT EXISTS idx_a_refresh_token_cleanup_expires
  ON a_refresh_token (expires_at);
CREATE INDEX IF NOT EXISTS idx_a_refresh_token_cleanup_revoked
  ON a_refresh_token (revoked_at) WHERE revoked_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_a_session_cleanup_expires
  ON a_session (expires_at);
CREATE INDEX IF NOT EXISTS idx_a_session_cleanup_revoked
  ON a_session (revoked_at) WHERE revoked_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_a_password_reset_cleanup_expires
  ON a_password_reset_token (expires_at);
CREATE INDEX IF NOT EXISTS idx_a_password_reset_cleanup_used
  ON a_password_reset_token (used_at) WHERE used_at IS NOT NULL;
