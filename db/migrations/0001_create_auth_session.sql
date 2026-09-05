-- 0001_create_auth_session.sql
-- Muc dich: bang phien dang nhap cho api-sso - cho phep thu hoi (logout,
-- danh cap token...), thay the co che refresh token stateless hien tai cua
-- api-core (chi ky {user_id}, khong revoke duoc).
-- Ap dung: chay 1 lan tren build_management (sandbox truoc, ban that sau khi
-- nghiem thu - xem plan "Duong len production").
-- Rollback: DROP TABLE IF EXISTS auth_session CASCADE;

CREATE TABLE IF NOT EXISTS auth_session (
  session_id    varchar(36)  PRIMARY KEY,
  user_id       varchar      NOT NULL REFERENCES system_users(user_id),
  created_at    timestamp    NOT NULL DEFAULT now(),
  last_seen_at  timestamp    NOT NULL DEFAULT now(),
  expires_at    timestamp    NOT NULL,
  revoked_at    timestamp,
  user_agent    varchar(255),
  ip            varchar(64),
  -- Ghi lai luc login co tick "Ghi nho dang nhap" hay khong - ban than han
  -- dung da nam o expires_at roi, cot nay chi de biet ly do (audit/debug).
  remember      boolean      NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_auth_session_user_id ON auth_session(user_id);
