-- 0010_user_name_reuse_after_delete.sql (04/10/2026)
-- Muc dich: user da XOA MEM (active_flag = 0, xem 0005) van giu user_name -> them
-- nguoi dung moi trung ten dang nhap bi bao "da ton tai". Tu nay:
--   * Ten dang nhap chi duy nhat trong so user DANG HOAT DONG (index unique mot phan).
--   * "InsertUser" chi chan trung voi user dang hoat dong (so khong phan biet hoa thuong).
--   * "RestoreUser" (moi): khoi phuc user da xoa - giu nguyen user_id nen lich su task/
--     tai chinh va ban ghi chat/meeting (upsert theo id) tu bat lai, khong vuong unique
--     email/so dien thoai phia chat.
--   * "GetUserByAccount"/"ResetPassword": moi lan tra theo user_name chi lay user dang
--     hoat dong (truoc day co the trung vao ban ghi da xoa cung ten).
-- Ap dung: sau 0009. Chay lai an toan (CREATE OR REPLACE / IF NOT EXISTS).
-- Rollback: DROP INDEX ux_system_users_user_name_active; DROP PROCEDURE "RestoreUser";
--   CREATE OR REPLACE lai 3 proc tu 0009 / 0002.

CREATE UNIQUE INDEX IF NOT EXISTS ux_system_users_user_name_active
  ON public.system_users (lower(user_name)) WHERE active_flag = 1;

CREATE OR REPLACE PROCEDURE public."InsertUser"(IN p_branch_id integer, IN p_employee_id character varying, IN p_department_id integer, IN p_position_id integer, IN p_user_id character, IN p_user_name character varying, IN p_password character, IN p_type character varying, IN p_description character varying, IN p_first_name character varying, IN p_middle_name character varying, IN p_last_name character varying, IN p_full_name character varying, IN p_avatar character varying, IN p_gender integer, IN p_date_of_birth date, IN p_email character varying, IN p_phone_number character, IN p_is_guest smallint, IN p_created_by_user_id character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$

BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        IF EXISTS(SELECT 1 FROM system_users WHERE lower(user_name) = lower(p_user_name) AND active_flag = 1) THEN
            p_error_code := -1;p_error_message := 'Tài khoản người dùng này đã tồn tại!';RETURN;
        END IF;
        INSERT INTO system_users(user_id, user_name, password, type, description, online_flag, active_flag,
                                 created_by_user_id, created_date_time)
        VALUES (p_user_id, p_user_name, p_password, p_type, p_description, 0, 1, p_created_by_user_id, now());
        INSERT INTO employee(branch_id, employee_id, fullname, phone_number, email, position_id, department_id,
                             active_flag, created_by_user_id, created_date_time)
        VALUES (p_branch_id, p_employee_id, p_full_name, p_phone_number, p_email, p_position_id, p_department_id, 1,
                p_created_by_user_id, now());
        INSERT INTO user_profiles(user_id, first_name, middle_name, last_name, full_name, avatar, gender, date_of_birth,
                                  email, phone_number, active_flag, created_by_user_id, created_date_time)
        VALUES (p_user_id, p_first_name, p_middle_name, p_last_name, p_full_name, p_avatar, p_gender, p_date_of_birth,
                p_email, p_phone_number, 1, p_created_by_user_id, now());
        p_result := jsonb_build_object('user_id', p_user_id);
    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{}'::jsonb;
            p_error_code := -500;
            p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
    END;
END;
$procedure$;

-- Bat lai 3 bang chinh + dat mat khau moi. Thong tin ho so/to chuc/nhom quyen do
-- service ghi tiep bang "UpdateUser"/"InsertUserRole" (cung luong sua nguoi dung).
-- Quyen truy cap app (a_app_access) da bi go luc xoa - KHONG tu cap lai.
CREATE OR REPLACE PROCEDURE public."RestoreUser"(IN p_user_id character varying, IN p_password character varying, IN p_lu_user_id character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$
DECLARE
    v_user_name varchar;
BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        SELECT user_name INTO v_user_name FROM system_users WHERE user_id = p_user_id AND active_flag = 0;
        IF v_user_name IS NULL THEN
            p_error_code := -1;p_error_message := 'Không tìm thấy tài khoản đã xoá để khôi phục!';RETURN;
        END IF;
        IF EXISTS(SELECT 1 FROM system_users WHERE lower(user_name) = lower(v_user_name) AND active_flag = 1) THEN
            p_error_code := -1;p_error_message := 'Tài khoản người dùng này đã tồn tại!';RETURN;
        END IF;
        UPDATE system_users SET active_flag = 1, online_flag = 0, password = p_password,
                                lu_user_id = p_lu_user_id, lu_updated = now()
        WHERE user_id = p_user_id;
        UPDATE user_profiles SET active_flag = 1, lu_user_id = p_lu_user_id, lu_updated = now()
        WHERE user_id = p_user_id;
        UPDATE employee SET active_flag = 1, lu_user_id = p_lu_user_id, lu_updated = now()
        WHERE employee_id = p_user_id;
        p_result := jsonb_build_object('user_id', p_user_id);
    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{}'::jsonb;
            p_error_code := -500;
            p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
    END;
END;
$procedure$;

CREATE OR REPLACE PROCEDURE public."GetUserByAccount"(IN p_user_name character, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$

BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        SELECT jsonb_build_object(
                       'user', coalesce((SELECT jsonb_agg(to_jsonb(q))
                                         FROM (SELECT s.user_id,
                                                      u.first_name,
                                                      u.middle_name,
                                                      u.last_name,
                                                      u.full_name,
                                                      u.avatar,
                                                      u.gender,
                                                      u.date_of_birth,
                                                      u.email,
                                                      u.phone_number,
                                                      s.user_name,
                                                      s.online_flag,
                                                      s.description,
                                                      s.password,
                                                      (SELECT string_agg(r.role_code, ', ' ORDER BY r.role_code)
                                                       FROM user_roles ur
                                                                JOIN roles r ON r.role_id = ur.role_id
                                                       WHERE ur.user_id = s.user_id
                                                         AND ur.active_flag = 1
                                                         AND r.active_flag = 1) role_group
                                               FROM system_users s
                                                        JOIN user_profiles u ON u.user_id = s.user_id
                                               WHERE s.user_name = p_user_name
                                                 AND s.active_flag = 1
                                                 AND u.active_flag = 1
                                                 AND s.online_flag = 0) q), '[]'::jsonb),
                       'employees', coalesce((SELECT jsonb_agg(to_jsonb(q))
                                                  FROM (SELECT su.user_id, su.user_name
                                                        FROM system_users su
                                                                 LEFT JOIN employee e ON e.employee_id = su.user_id
                                                        WHERE su.active_flag = 1
                                                          AND ((SELECT position_id
                                                                FROM employee
                                                                WHERE employee_id =
                                                                      (SELECT user_id FROM system_users WHERE user_name = p_user_name AND active_flag = 1 LIMIT 1)) =
                                                               0 OR e.department_id = (SELECT department_id
                                                                                       FROM employee
                                                                                       WHERE employee_id =
                                                                                             (SELECT user_id FROM system_users WHERE user_name = p_user_name AND active_flag = 1 LIMIT 1)))) q),
                                                 '[]'::jsonb))
        INTO p_result;
    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{}'::jsonb;
            p_error_code := -500;
            p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
    END;
END;
$procedure$;

CREATE OR REPLACE PROCEDURE public."ResetPassword"(IN p_user_name character varying, IN p_email character varying, IN p_new_password character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$

BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        UPDATE system_users su
        SET password=p_new_password,
            lu_user_id='system',
            lu_updated=now()
        FROM user_profiles up
        WHERE su.user_id = up.user_id
          AND su.user_name = p_user_name
          AND su.active_flag = 1
          AND up.active_flag = 1
          AND up.email = p_email;
        IF NOT FOUND THEN p_error_code := -1;p_error_message := 'Tên đăng nhập hoặc email không đúng!'; END IF;
        p_result := jsonb_build_object('changed', FOUND);
    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{}'::jsonb;
            p_error_code := -500;
            p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
    END;
END;
$procedure$;
