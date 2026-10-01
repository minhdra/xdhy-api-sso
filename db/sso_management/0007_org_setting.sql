-- 0007_org_setting.sql
-- Muc dich: thong tin thuong hieu cua SSO luu DB de moi cong ty/to chuc (moi
-- trien khai rieng) tu doi, khong phai sua code/build lai: ten to chuc, ten
-- viet tat, ten app, cau khau hieu, chu trang dang nhap, mau chu dao, footer,
-- logo (sang/toi), favicon, anh nen trang dang nhap. 1 dong duy nhat (id = 1).
-- Anh luu uploads/branding/ cua api-sso, cot luu "/api-sso/uploads/branding/...";
-- NULL = dung file mac dinh cua sso-web (/logo.png, /favicon.ico...).
-- Ap dung: sau 0006. Chay lai an toan.
-- Rollback: DROP TABLE IF EXISTS a_org_setting;

CREATE TABLE IF NOT EXISTS a_org_setting (
  id                 smallint      PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  org_name           varchar(150)  NOT NULL,
  short_name         varchar(50)   NOT NULL,
  app_name           varchar(100)  NOT NULL,
  tagline            varchar(250),
  login_heading      varchar(150),
  login_description  varchar(500),
  primary_color      varchar(9)    NOT NULL DEFAULT '#2563a6',
  footer_text        varchar(250),
  footer_links       jsonb         NOT NULL DEFAULT '[]'::jsonb,
  logo_light         varchar(500),
  logo_dark          varchar(500),
  favicon            varchar(500),
  login_background   varchar(500),
  lu_user_id         varchar(36),
  lu_updated         timestamptz   NOT NULL DEFAULT now()
);

-- Mac dinh = dung noi dung dang ghi cung trong sso-web (26/09/2026) -> trien
-- khai xong giao dien khong doi.
INSERT INTO a_org_setting (id, org_name, short_name, app_name, tagline, login_heading, login_description,
                           primary_color, footer_text)
VALUES (1, 'An Trường Phát Hưng Yên', 'XDHY', 'Tài khoản', 'Một tài khoản cho mọi ứng dụng',
        'Cổng truy cập chung của doanh nghiệp',
        'Đăng nhập một lần để sử dụng các ứng dụng nội bộ được kết nối trong hệ thống.',
        '#2563a6', '© {year} An Trường Phát Hưng Yên. All rights reserved.')
ON CONFLICT (id) DO NOTHING;
