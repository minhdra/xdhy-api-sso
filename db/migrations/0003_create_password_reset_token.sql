-- 0003_create_password_reset_token.sql
-- Muc dich: token 1 lan dung cho luong "quen mat khau" that (email -> link ->
-- trang doi mat khau), thay cho ban cu sinh mat khau ngau nhien gui thang qua
-- email. Chi luu HASH cua token (sha256), khong luu token that - giong quy
-- uoc mat khau, phong truong hop DB bi doc duoc thi token cu cung khong dung
-- lai duoc.
-- Ap dung: chay sau 0001, 0002 (sandbox truoc, ban that sau khi nghiem thu).
-- Rollback: DROP TABLE IF EXISTS password_reset_token CASCADE;

CREATE TABLE IF NOT EXISTS password_reset_token (
  token_hash  varchar(64)  PRIMARY KEY,
  user_id     varchar      NOT NULL REFERENCES system_users(user_id),
  created_at  timestamp    NOT NULL DEFAULT now(),
  expires_at  timestamp    NOT NULL,
  used_at     timestamp
);

CREATE INDEX IF NOT EXISTS idx_password_reset_token_user_id ON password_reset_token(user_id);
