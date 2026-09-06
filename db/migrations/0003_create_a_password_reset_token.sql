-- 0003_create_a_password_reset_token.sql
-- Muc dich: token 1 lan dung cho luong "quen mat khau" that (email -> link ->
-- trang doi mat khau), thay cho ban cu sinh mat khau ngau nhien gui thang qua
-- email. Chi luu HASH cua token (sha256), khong luu token that.
-- Quy uoc dat ten: tien to "a_" cho bang moi module SSO/auth.
-- Ap dung: chay sau 0001, 0002.
-- Rollback: DROP TABLE IF EXISTS a_password_reset_token CASCADE;

CREATE TABLE IF NOT EXISTS a_password_reset_token (
  token_hash  varchar(64)  PRIMARY KEY,
  user_id     varchar      NOT NULL REFERENCES system_users(user_id),
  created_at  timestamp    NOT NULL DEFAULT now(),
  expires_at  timestamp    NOT NULL,
  used_at     timestamp
);

CREATE INDEX IF NOT EXISTS idx_a_password_reset_token_user_id ON a_password_reset_token(user_id);
