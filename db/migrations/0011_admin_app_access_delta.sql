-- 0011_admin_app_access_delta.sql
-- Nang API quan ly quyen app: count dung user active, danh sach ung vien co
-- loc/phan trang, va mutation cong/tru quyen idempotent theo delta.
-- Ap dung: sau 0010, len database build_management.

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
               WHERE aa.app_id = a.app_id) AS direct_access_count,
             (SELECT count(*)
                FROM system_users s
                JOIN user_profiles u ON u.user_id = s.user_id AND u.active_flag = 1
                JOIN employee e ON e.employee_id = s.user_id
               WHERE s.active_flag = 1) AS eligible_user_count,
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

CREATE OR REPLACE PROCEDURE public."a_AdminListAppAccessCandidates"(
  IN p_app_id character varying, IN p_keyword character varying,
  IN p_position_id integer, IN p_page integer, IN p_page_size integer,
  OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
LANGUAGE plpgsql AS $procedure$
DECLARE
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 100);
  v_keyword varchar := nullif(trim(coalesce(p_keyword, '')), '');
BEGIN
  p_result := '{}'::jsonb; p_error_code := 0; p_error_message := '';
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM a_app WHERE app_id = p_app_id AND active_flag = 1) THEN
      p_error_code := -1; p_error_message := 'Không tìm thấy ứng dụng.';
      RETURN;
    END IF;

    WITH candidates AS (
      SELECT s.user_id, s.user_name, u.full_name, u.avatar,
             e.position_id, p.position_name
      FROM system_users s
      JOIN user_profiles u ON u.user_id = s.user_id AND u.active_flag = 1
      JOIN employee e ON e.employee_id = s.user_id
      LEFT JOIN positions p ON p.position_id = e.position_id
      WHERE s.active_flag = 1
        AND NOT "a_IsUserAdmin"(s.user_id)
        AND NOT EXISTS (SELECT 1 FROM a_app_access aa
                         WHERE aa.app_id = p_app_id AND aa.user_id = s.user_id)
        AND (p_position_id IS NULL OR e.position_id = p_position_id)
        AND (v_keyword IS NULL
             OR u.full_name ILIKE '%' || v_keyword || '%'
             OR s.user_name ILIKE '%' || v_keyword || '%')
    ), paged AS (
      SELECT * FROM candidates
      ORDER BY position_name NULLS LAST, full_name, user_id
      OFFSET (v_page - 1) * v_page_size LIMIT v_page_size
    )
    SELECT jsonb_build_object(
      'rows', coalesce((SELECT jsonb_agg(to_jsonb(paged)
                         ORDER BY position_name NULLS LAST, full_name, user_id) FROM paged), '[]'::jsonb),
      'record_count', (SELECT count(*) FROM candidates)
    ) INTO p_result;
  EXCEPTION WHEN OTHERS THEN
    p_result := '{}'::jsonb; p_error_code := -500;
    p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
  END;
END; $procedure$;

CREATE OR REPLACE PROCEDURE public."a_AdminAddAppAccess"(
  IN p_app_id character varying, IN p_user_ids jsonb, IN p_lu_user_id character varying,
  OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
LANGUAGE plpgsql AS $procedure$
DECLARE v_affected integer := 0;
BEGIN
  p_result := '{}'::jsonb; p_error_code := 0; p_error_message := '';
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM a_app WHERE app_id = p_app_id AND active_flag = 1) THEN
      p_error_code := -1; p_error_message := 'Không tìm thấy ứng dụng.';
      RETURN;
    END IF;
    IF jsonb_typeof(coalesce(p_user_ids, '[]'::jsonb)) <> 'array' THEN
      p_error_code := -1; p_error_message := 'Danh sách người dùng không hợp lệ.';
      RETURN;
    END IF;

    INSERT INTO a_app_access (app_id, user_id, created_by_user_id)
    SELECT DISTINCT p_app_id, ids.user_id, p_lu_user_id
    FROM jsonb_array_elements_text(coalesce(p_user_ids, '[]'::jsonb)) ids(user_id)
    JOIN system_users s ON s.user_id = ids.user_id AND s.active_flag = 1
    JOIN user_profiles u ON u.user_id = s.user_id AND u.active_flag = 1
    JOIN employee e ON e.employee_id = s.user_id
    WHERE NOT "a_IsUserAdmin"(s.user_id)
    ON CONFLICT (app_id, user_id) DO NOTHING;
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    p_result := jsonb_build_object('affected', v_affected);
  EXCEPTION WHEN OTHERS THEN
    p_result := '{}'::jsonb; p_error_code := -500;
    p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
  END;
END; $procedure$;

CREATE OR REPLACE PROCEDURE public."a_AdminRemoveAppAccess"(
  IN p_app_id character varying, IN p_user_ids jsonb,
  OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
LANGUAGE plpgsql AS $procedure$
DECLARE v_affected integer := 0;
BEGIN
  p_result := '{}'::jsonb; p_error_code := 0; p_error_message := '';
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM a_app WHERE app_id = p_app_id AND active_flag = 1) THEN
      p_error_code := -1; p_error_message := 'Không tìm thấy ứng dụng.';
      RETURN;
    END IF;
    IF jsonb_typeof(coalesce(p_user_ids, '[]'::jsonb)) <> 'array' THEN
      p_error_code := -1; p_error_message := 'Danh sách người dùng không hợp lệ.';
      RETURN;
    END IF;

    DELETE FROM a_app_access aa
    USING (SELECT DISTINCT value AS user_id
           FROM jsonb_array_elements_text(coalesce(p_user_ids, '[]'::jsonb))) ids
    WHERE aa.app_id = p_app_id AND aa.user_id = ids.user_id;
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    p_result := jsonb_build_object('affected', v_affected);
  EXCEPTION WHEN OTHERS THEN
    p_result := '{}'::jsonb; p_error_code := -500;
    p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
  END;
END; $procedure$;
