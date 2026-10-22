-- 0012_user_phone_unique.sql (08/10/2026)
-- Muc dich: so dien thoai la DUY NHAT trong so nguoi dung DANG HOAT DONG (active_flag = 1).
-- Ly do: chat/meeting co rang buoc UNIQUE so dien thoai -> 2 user trung so lam dong bo
-- sang chat/hop loi mai (su co that 10/2026); dang nhap cung nhan SDT lam dinh danh.
-- So rong khong tinh. User da xoa mem khong giu so (khoi phuc thi kiem tra lai - xem
-- OrgService.restoreDeletedUser).
-- Service (OrgService/AccountService) kiem tra truoc de bao loi than thien; index nay la
-- chot chan cuoi (2 request dong thoi).
--
-- DU LIEU CU TRUNG SO: file nay DUNG LAI (RAISE EXCEPTION) va liet ke cac so trung + tai
-- khoan. Admin sua SDT o sso-web (Quan tri nguoi dung) cho het trung roi chay lai migrate
-- (node scripts/sso-management/migrate.js) - khong tu y doi so cua khach.
-- Ap dung: sau 0011, len DATABASE "sso_management". Chay lai an toan.
-- Rollback: DROP INDEX IF EXISTS ux_user_profiles_phone_active;

DO $$
DECLARE
  v_dups text;
BEGIN
  SELECT string_agg(format('%s: %s', phone, accounts), E'\n')
  INTO v_dups
  FROM (
    SELECT trim(u.phone_number) AS phone,
           string_agg(format('%s (%s)', s.user_name, coalesce(u.full_name, '')), ', ' ORDER BY s.user_name) AS accounts
    FROM user_profiles u
    JOIN system_users s ON s.user_id = u.user_id
    WHERE u.active_flag = 1 AND coalesce(trim(u.phone_number), '') <> ''
    GROUP BY trim(u.phone_number)
    HAVING count(*) > 1
  ) d;
  IF v_dups IS NOT NULL THEN
    RAISE EXCEPTION E'Con so dien thoai bi trung giua cac nguoi dung dang hoat dong - sua o sso-web roi chay lai migrate:\n%', v_dups;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_user_profiles_phone_active
  ON public.user_profiles (trim(phone_number))
  WHERE active_flag = 1 AND coalesce(trim(phone_number), '') <> '';
