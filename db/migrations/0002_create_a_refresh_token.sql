-- 0002_create_a_refresh_token.sql
-- Muc dich: bang refresh token thu hoi duoc, gan voi 1 a_session. Cot
-- rotated_to de san cho rotation (doi refresh token moi lan /refresh) - CHUA
-- bat trong milestone nay, chi de cho schema san sang cho sau nay.
-- Quy uoc dat ten: tien to "a_" cho bang moi module SSO/auth.
-- Ap dung: chay sau 0001_create_a_session.sql, cung 1 dot.
-- Rollback: DROP TABLE IF EXISTS a_refresh_token CASCADE;

CREATE TABLE IF NOT EXISTS a_refresh_token (
  jti          varchar(36)  PRIMARY KEY,
  session_id   varchar(36)  NOT NULL REFERENCES a_session(session_id),
  user_id      varchar      NOT NULL REFERENCES system_users(user_id),
  issued_at    timestamp    NOT NULL DEFAULT now(),
  expires_at   timestamp    NOT NULL,
  rotated_to   varchar(36),
  revoked_at   timestamp
);

CREATE INDEX IF NOT EXISTS idx_a_refresh_token_session_id ON a_refresh_token(session_id);
