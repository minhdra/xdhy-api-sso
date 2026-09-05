-- 0002_create_auth_refresh_token.sql
-- Muc dich: bang refresh token thu hoi duoc, gan voi 1 auth_session. Cot
-- rotated_to de san cho rotation (doi refresh token moi lan /refresh) - CHUA
-- bat trong milestone sandbox nay, chi de cho schema san sang cho sau nay.
-- Ap dung: chay sau 0001_create_auth_session.sql, cung 1 dot (sandbox truoc,
-- ban that sau khi nghiem thu).
-- Rollback: DROP TABLE IF EXISTS auth_refresh_token CASCADE;

CREATE TABLE IF NOT EXISTS auth_refresh_token (
  jti          varchar(36)  PRIMARY KEY,
  session_id   varchar(36)  NOT NULL REFERENCES auth_session(session_id),
  user_id      varchar      NOT NULL REFERENCES system_users(user_id),
  issued_at    timestamp    NOT NULL DEFAULT now(),
  expires_at   timestamp    NOT NULL,
  rotated_to   varchar(36),
  revoked_at   timestamp
);

CREATE INDEX IF NOT EXISTS idx_auth_refresh_token_session_id ON auth_refresh_token(session_id);
