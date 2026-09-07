-- 0008_admin_users_avatar.sql
-- Muc dich: them cot avatar vao a_AdminListUsers/a_AdminListAppAccess - man
-- "Phan quyen truy cap app" (sso-web AppsAdminPanel) truoc gio khong co
-- avatar that, phai dung mau nen hash (avatarColor) LAM CHINH thay vi lam
-- fallback dung khi khong co anh - sai muc dich ban dau cua avatarColor.
--
-- Ap dung: sau 0007, len database "build_management".
-- Rollback: CREATE OR REPLACE lai 2 proc bo cot avatar (xem git history file
-- nay lay ban truoc).

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
    ) q;
  EXCEPTION WHEN OTHERS THEN
    p_result := '{}'::jsonb; p_error_code := -500;
    p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
  END;
END; $procedure$;
