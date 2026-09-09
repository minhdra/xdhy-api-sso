-- 0010_session_timestamps_to_timestamptz.sql
-- Muc dich: doi 4 cot gio cua a_session + 3 cot cua a_refresh_token tu
-- `timestamp without time zone` sang `timestamptz`.
--
-- Ly do: DB chay TimeZone = Asia/Bangkok. `now()` ghi vao cot naive lam roi
-- mat offset -> cot giu "gio treo tuong ICT". Driver pg (process TZ khac) doc
-- lai theo TZ cua process -> serialize ra JSON lech ~7-14h. Man "Phien dang
-- nhap" o sso-web tinh `Date.now() - last_seen_at` ra so AM -> nhanh
-- `min < 1` -> moi phien deu hien "Hoat dong vua xong".
--
-- Sau migration: `now()` va node-pg round-trip dung instant bat ke TZ process.
-- Code TS KHONG can sua (createSession van truyen JS Date; touchSession van
-- dung now()).
--
-- CHAY 1 LAN - KHONG idempotent (chay lai se chuyen doi 2 lan). Chay tay len
-- build_management (112.78.1.3) - khong co auto-migrate.
-- Rollback: doi lai TYPE timestamp USING (col AT TIME ZONE 'Asia/Bangkok'),
--   nhung du lieu expires_at cu (da tinh lai o duoi) se khong khoi phuc dung.

-- ── a_session ───────────────────────────────────────────────────────────────
-- created_at / last_seen_at / revoked_at: do `now()` sinh ra -> gio ICT.
ALTER TABLE a_session
  ALTER COLUMN created_at   TYPE timestamptz USING created_at   AT TIME ZONE 'Asia/Bangkok',
  ALTER COLUMN last_seen_at TYPE timestamptz USING last_seen_at AT TIME ZONE 'Asia/Bangkok',
  ALTER COLUMN revoked_at   TYPE timestamptz USING revoked_at   AT TIME ZONE 'Asia/Bangkok',
  ALTER COLUMN expires_at   TYPE timestamptz USING expires_at   AT TIME ZONE 'Asia/Bangkok';

-- expires_at cu bi lech (JS Date qua driver pg + cot naive). Tinh lai tu
-- created_at + TTL (REMEMBER_TTL_MS = 30d, DEFAULT_TTL_MS = 7d - xem
-- src/services/authService.ts).
UPDATE a_session
SET expires_at = created_at + (CASE WHEN remember THEN interval '30 days' ELSE interval '7 days' END);

ALTER TABLE a_session ALTER COLUMN created_at   SET DEFAULT now();
ALTER TABLE a_session ALTER COLUMN last_seen_at SET DEFAULT now();

-- ── a_refresh_token ─────────────────────────────────────────────────────────
ALTER TABLE a_refresh_token
  ALTER COLUMN issued_at  TYPE timestamptz USING issued_at  AT TIME ZONE 'Asia/Bangkok',
  ALTER COLUMN revoked_at TYPE timestamptz USING revoked_at AT TIME ZONE 'Asia/Bangkok',
  ALTER COLUMN expires_at TYPE timestamptz USING expires_at AT TIME ZONE 'Asia/Bangkok';

UPDATE a_refresh_token rt
SET expires_at = rt.issued_at
  + (CASE WHEN s.remember THEN interval '30 days' ELSE interval '7 days' END)
FROM a_session s
WHERE s.session_id = rt.session_id;

ALTER TABLE a_refresh_token ALTER COLUMN issued_at SET DEFAULT now();
