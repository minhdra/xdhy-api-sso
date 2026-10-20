-- 0016_org_setting_show_short_name.sql
-- Muc dich: tuy chon hien ten viet tat canh logo o header sso-web. Thuong hieu
-- nao logo khong co chu (vd KATE) bat len de header van co ten.
-- Mac dinh false = giao dien cu khong doi.
-- Ap dung: sau 0015. Chay lai an toan.
-- Rollback: ALTER TABLE a_org_setting DROP COLUMN IF EXISTS show_short_name;

ALTER TABLE a_org_setting
  ADD COLUMN IF NOT EXISTS show_short_name boolean NOT NULL DEFAULT false;
