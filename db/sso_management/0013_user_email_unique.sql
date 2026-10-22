-- 0013_user_email_unique.sql (08/10/2026)
-- Muc dich: email la DUY NHAT (khong phan biet hoa thuong) trong so nguoi dung DANG HOAT
-- DONG - cung ly do voi SDT (0012): chat/meeting rang buoc UNIQUE email, trung email lam
-- dong bo sang chat/hop loi; dang nhap cung nhan email lam dinh danh. Email rong khong tinh.
-- Service (OrgService.assertContactAvailable) kiem tra truoc de bao loi than thien; index
-- la chot chan cuoi.
-- DU LIEU CU TRUNG: file nay DUNG LAI (RAISE EXCEPTION) va liet ke email trung + tai khoan.
-- Admin sua o sso-web roi chay lai migrate.
-- Ap dung: sau 0012, len DATABASE "sso_management". Chay lai an toan.
-- Rollback: DROP INDEX IF EXISTS ux_user_profiles_email_active;

DO $$
DECLARE
  v_dups text;
BEGIN
  SELECT string_agg(format('%s: %s', email, accounts), E'\n')
  INTO v_dups
  FROM (
    SELECT lower(trim(u.email)) AS email,
           string_agg(format('%s (%s)', s.user_name, coalesce(u.full_name, '')), ', ' ORDER BY s.user_name) AS accounts
    FROM user_profiles u
    JOIN system_users s ON s.user_id = u.user_id
    WHERE u.active_flag = 1 AND coalesce(trim(u.email), '') <> ''
    GROUP BY lower(trim(u.email))
    HAVING count(*) > 1
  ) d;
  IF v_dups IS NOT NULL THEN
    RAISE EXCEPTION E'Con email bi trung giua cac nguoi dung dang hoat dong - sua o sso-web roi chay lai migrate:\n%', v_dups;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_user_profiles_email_active
  ON public.user_profiles (lower(trim(email)))
  WHERE active_flag = 1 AND coalesce(trim(email), '') <> '';
