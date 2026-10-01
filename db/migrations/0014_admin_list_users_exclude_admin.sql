-- 0014_admin_list_users_exclude_admin.sql
-- Muc dich: admin (role 'sa') bypass moi app (a_UserHasAppAccess) nen khong the/khong can
-- duoc cap quyen - cac proc cap quyen (a_AdminAddAppAccess) va ung vien
-- (a_AdminListAppAccessCandidates) da loai admin, nhung 3 proc duoi day chua:
--   1. a_AdminListUsers (GET /admin/users): tai khoan sa hien trong modal
--      "Phan quyen truy cap app" dau tick/bo tick vo tac dung.
--   2. a_AdminListAppAccess: liet ke ca dong cap quyen truc tiep cua admin (0007 da
--      seed cap finance+task cho MOI user active, ke ca admin).
--   3. a_AdminListApps: direct_access_count/eligible_user_count dem ca admin -> mau
--      so "eligible" phong len so admin, ma admin khong the nam trong tu so khi
--      cap moi. Loai admin khoi CA tu so lan mau so de ti le direct/eligible nhat
--      quan (khong vuot 100%). effective_access_count giu nguyen (admin + duoc cap).
-- Ap dung: sau 0013, len database "build_management". Chay lai an toan.
-- Rollback: CREATE OR REPLACE lai 3 proc bo dieu kien NOT "a_IsUserAdmin" (ban 0008 va 0011).

CREATE OR REPLACE PROCEDURE public."a_AdminListUsers"(
  OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
LANGUAGE plpgsql AS $procedure$
BEGIN
  p_result := '{}'::jsonb; p_error_code := 0; p_error_message := '';
  BEGIN
    SELECT jsonb_build_object('rows', coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.full_name), '[]'::jsonb))
    INTO p_result
    FROM (
      SELECT s.user_id, s.user_name, u.full_name, u.avatar, p.position_name
      FROM system_users s
      JOIN user_profiles u ON u.user_id = s.user_id
      JOIN employee e ON e.employee_id = s.user_id
      LEFT JOIN positions p ON p.position_id = e.position_id
      WHERE s.active_flag = 1 AND u.active_flag = 1
        AND NOT "a_IsUserAdmin"(s.user_id)
    ) q;
  EXCEPTION WHEN OTHERS THEN
    p_result := '{}'::jsonb; p_error_code := -500;
    p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
  END;
END; $procedure$;

CREATE OR REPLACE PROCEDURE public."a_AdminListAppAccess"(
  IN p_app_id character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
LANGUAGE plpgsql AS $procedure$
BEGIN
  p_result := '{}'::jsonb; p_error_code := 0; p_error_message := '';
  BEGIN
    SELECT jsonb_build_object('rows', coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.full_name), '[]'::jsonb))
    INTO p_result
    FROM (
      SELECT s.user_id, s.user_name, u.full_name, u.avatar, p.position_name
      FROM a_app_access aa
      JOIN system_users s ON s.user_id = aa.user_id
      JOIN user_profiles u ON u.user_id = s.user_id
      JOIN employee e ON e.employee_id = s.user_id
      LEFT JOIN positions p ON p.position_id = e.position_id
      WHERE aa.app_id = p_app_id AND s.active_flag = 1
        AND NOT "a_IsUserAdmin"(s.user_id)
    ) q;
  EXCEPTION WHEN OTHERS THEN
    p_result := '{}'::jsonb; p_error_code := -500;
    p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
  END;
END; $procedure$;

CREATE OR REPLACE PROCEDURE public."a_AdminListApps"(
  OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
LANGUAGE plpgsql AS $procedure$
BEGIN
  p_result := '{}'::jsonb; p_error_code := 0; p_error_message := '';
  BEGIN
    SELECT jsonb_build_object('rows', coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.sort_order), '[]'::jsonb))
    INTO p_result
    FROM (
      SELECT a.app_id, a.app_key, a.app_name, a.description, a.url, a.color, a.sort_order,
             (SELECT count(*)
                FROM a_app_access aa
                JOIN system_users s ON s.user_id = aa.user_id AND s.active_flag = 1
                JOIN user_profiles u ON u.user_id = s.user_id AND u.active_flag = 1
                JOIN employee e ON e.employee_id = s.user_id
               WHERE aa.app_id = a.app_id
                 AND NOT "a_IsUserAdmin"(s.user_id)) AS direct_access_count,
             (SELECT count(*)
                FROM system_users s
                JOIN user_profiles u ON u.user_id = s.user_id AND u.active_flag = 1
                JOIN employee e ON e.employee_id = s.user_id
               WHERE s.active_flag = 1
                 AND NOT "a_IsUserAdmin"(s.user_id)) AS eligible_user_count,
             (SELECT count(*)
                FROM system_users s
                JOIN user_profiles u ON u.user_id = s.user_id AND u.active_flag = 1
                JOIN employee e ON e.employee_id = s.user_id
               WHERE s.active_flag = 1
                 AND ("a_IsUserAdmin"(s.user_id)
                      OR EXISTS (SELECT 1 FROM a_app_access aa
                                  WHERE aa.app_id = a.app_id AND aa.user_id = s.user_id)))
               AS effective_access_count
      FROM a_app a
      WHERE a.active_flag = 1
    ) q;
  EXCEPTION WHEN OTHERS THEN
    p_result := '{}'::jsonb; p_error_code := -500;
    p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
  END;
END; $procedure$;
