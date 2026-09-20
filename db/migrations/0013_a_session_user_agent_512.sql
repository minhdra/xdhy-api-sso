-- 0013_a_session_user_agent_512.sql
-- Muc dich: nang a_session.user_agent tu varchar(255) len varchar(512). UA
-- webview (Facebook/Instagram/Zalo Android...) co the dai 300-400 ky tu va
-- dat token nhan dien app (FBAN/FBAV...) o CUOI chuoi - cat o 255 thi mat token
-- do, man "Phien dang nhap" nhan nham thanh "Chrome". Code (SessionRepository.
-- createSession) cat 512 ky tu khop cot nay.
-- Nang gioi han varchar chi doi metadata, khong rewrite bang; khoa ngan.
-- Thu tu ap dung: chay migration NAY TRUOC khi deploy code cat 512 ky tu.
-- Chay lai an toan (idempotent).
-- Rollback: ALTER TABLE a_session ALTER COLUMN user_agent TYPE varchar(255);
--   (chi chay duoc khi khong con dong nao dai hon 255 ky tu.)

ALTER TABLE a_session ALTER COLUMN user_agent TYPE varchar(512);
