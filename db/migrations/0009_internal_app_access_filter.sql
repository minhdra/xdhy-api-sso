-- 0009_internal_app_access_filter.sql
-- Muc dich: cho phep service khac (api-task-management) hoi "trong danh sach
-- user nay, ai duoc phep truy cap app <app_key>?" bang 1 lan goi thay vi N lan
-- goi a_UserHasAppAccess. Dung o endpoint noi bo POST /internal/app-access/filter
-- (api-sso/src/routes/internalRouter.ts) - api-task loc danh sach chon nguoi o
-- man Phan quyen cong trinh ("phan quyen giam sat") theo quyen app 'task'.
-- Xem api-task-management/docs/phan_quyen_giam_sat_app_gate.md.
--
-- Ham chi BOC lai a_UserHasAppAccess (0006) - da co san admin-bypass (role
-- 'sa' luon true) + fail-closed (app_key sai/khong active -> false cho
-- non-admin). Khong lap lai logic phan quyen o day.
--
-- Ap dung: sau 0006 (can ham a_UserHasAppAccess).
-- Rollback: DROP FUNCTION IF EXISTS a_FilterUsersWithAppAccess(varchar, jsonb);

CREATE OR REPLACE FUNCTION public."a_FilterUsersWithAppAccess"(
  p_app_key varchar,
  p_user_ids jsonb
)
RETURNS TABLE(user_id varchar)
LANGUAGE sql STABLE AS $$
  SELECT DISTINCT x.value #>> '{}' AS user_id
  FROM jsonb_array_elements(coalesce(p_user_ids, '[]'::jsonb)) x
  WHERE "a_UserHasAppAccess"(x.value #>> '{}', p_app_key);
$$;
