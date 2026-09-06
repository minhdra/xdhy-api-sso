-- 0004_account_stored_procs.sql
-- Muc dich: stored procedure cho trang "Quan ly tai khoan" cua sso-web. Theo
-- dung quy uoc DB hien co - moi nghiep vu nam trong proc, repository chi
-- CALL, khong viet SQL nghiep vu trong TypeScript. Prefix "a_" (module
-- auth/SSO) giong "t_" cua task.
-- Quy uoc OUT: p_result jsonb / p_error_code integer / p_error_message varchar
-- (Database.query/queryList tang chung tu unwrap).
-- Ap dung: sau 0001-0003.
-- Rollback:
--   DROP PROCEDURE IF EXISTS a_GetAccountProfile(varchar);
--   DROP PROCEDURE IF EXISTS a_GetUserPasswordHash(varchar);
--   DROP PROCEDURE IF EXISTS a_SetUserPassword(varchar, varchar, varchar);
--   DROP PROCEDURE IF EXISTS a_UpdateSelfProfile(varchar, varchar, varchar, varchar, integer, date, varchar);
--   DROP PROCEDURE IF EXISTS a_SetAvatar(varchar, varchar, varchar);

-- Ho so day du (gom phong ban / chuc vu / chi nhanh de HIEN THI, user khong sua).
CREATE OR REPLACE PROCEDURE public."a_GetAccountProfile"(
  IN p_user_id varchar,
  OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message varchar)
LANGUAGE plpgsql AS $$
BEGIN
  p_result := '{}'::jsonb; p_error_code := 0; p_error_message := '';
  BEGIN
    SELECT jsonb_build_object('rows', coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb))
    INTO p_result
    FROM (
      SELECT s.user_id, s.user_name, s.type,
             u.full_name, u.avatar, u.gender, u.date_of_birth, u.email, u.phone_number,
             p.position_name, d.department_name, b.branch_name
      FROM system_users s
      JOIN user_profiles u ON u.user_id = s.user_id
      JOIN employee e ON e.employee_id = s.user_id
      LEFT JOIN positions p ON p.position_id = e.position_id
      LEFT JOIN department d ON d.department_id = e.department_id
      LEFT JOIN branch b ON b.branch_id = e.branch_id
      WHERE s.user_id = p_user_id
        AND s.active_flag = 1 AND u.active_flag = 1 AND e.active_flag = 1
    ) q;
  EXCEPTION WHEN OTHERS THEN
    p_result := '{}'::jsonb; p_error_code := -500;
    p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
  END;
END; $$;

-- Tra hash mat khau hien tai - de verify mat khau cu bang bcrypt o tang app
-- (bcrypt.compare khong lam trong SQL duoc).
CREATE OR REPLACE PROCEDURE public."a_GetUserPasswordHash"(
  IN p_user_id varchar,
  OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message varchar)
LANGUAGE plpgsql AS $$
BEGIN
  p_result := '{}'::jsonb; p_error_code := 0; p_error_message := '';
  BEGIN
    SELECT jsonb_build_object('rows', jsonb_build_array(jsonb_build_object('password', password)))
    INTO p_result
    FROM system_users WHERE user_id = p_user_id AND active_flag = 1;
    IF NOT FOUND THEN
      p_error_code := -1; p_error_message := 'Khong tim thay tai khoan';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    p_result := '{}'::jsonb; p_error_code := -500;
    p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
  END;
END; $$;

-- Ghi mat khau moi (da hash bcrypt san o tang app). Dung cho:
--  - doi mat khau tu trang tai khoan (sau khi verify mat khau cu)
--  - nang cap hash MD5 -> bcrypt luc dang nhap thanh cong
CREATE OR REPLACE PROCEDURE public."a_SetUserPassword"(
  IN p_user_id varchar, IN p_new_password varchar, IN p_lu_user_id varchar,
  OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message varchar)
LANGUAGE plpgsql AS $$
BEGIN
  p_result := '{}'::jsonb; p_error_code := 0; p_error_message := '';
  BEGIN
    UPDATE system_users
    SET password = p_new_password, lu_user_id = p_lu_user_id, lu_updated = now()
    WHERE user_id = p_user_id AND active_flag = 1;
    IF NOT FOUND THEN
      p_error_code := -1; p_error_message := 'Khong tim thay tai khoan';
    ELSE
      p_result := jsonb_build_object('affected', 1);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    p_result := '{}'::jsonb; p_error_code := -500;
    p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
  END;
END; $$;

-- Cap nhat cac field HO SO TU PHUC VU (chi nhung field user duoc sua). Khong
-- dung proc UpdateUser cua api-core vi proc do set MOI field (17 tham so, gom
-- ca branch/department/position/type) - de sua ho so tu phuc vu phai nap lai
-- het roi merge, de vo. Proc rieng nay chi dong vao user_profiles +
-- dong bo email/phone/fullname sang employee, dung nhu UpdateUser lam.
CREATE OR REPLACE PROCEDURE public."a_UpdateSelfProfile"(
  IN p_user_id varchar, IN p_full_name varchar, IN p_email varchar,
  IN p_phone_number varchar, IN p_gender integer, IN p_date_of_birth date,
  IN p_lu_user_id varchar,
  OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message varchar)
LANGUAGE plpgsql AS $$
BEGIN
  p_result := '{}'::jsonb; p_error_code := 0; p_error_message := '';
  BEGIN
    UPDATE user_profiles
    SET full_name = p_full_name,
        email = p_email,
        phone_number = p_phone_number,
        gender = p_gender,
        date_of_birth = p_date_of_birth,
        lu_updated = now(),
        lu_user_id = p_lu_user_id
    WHERE user_id = p_user_id AND active_flag = 1;
    IF NOT FOUND THEN
      p_error_code := -1; p_error_message := 'Khong tim thay ho so';
      RETURN;
    END IF;

    UPDATE employee
    SET fullname = p_full_name, email = p_email, phone_number = p_phone_number,
        lu_updated = now(), lu_user_id = p_lu_user_id
    WHERE employee_id = p_user_id AND active_flag = 1;

    p_result := jsonb_build_object('affected', 1);
  EXCEPTION WHEN OTHERS THEN
    p_result := '{}'::jsonb; p_error_code := -500;
    p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
  END;
END; $$;

-- Doi anh dai dien (chi nam o user_profiles).
CREATE OR REPLACE PROCEDURE public."a_SetAvatar"(
  IN p_user_id varchar, IN p_avatar varchar, IN p_lu_user_id varchar,
  OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message varchar)
LANGUAGE plpgsql AS $$
BEGIN
  p_result := '{}'::jsonb; p_error_code := 0; p_error_message := '';
  BEGIN
    UPDATE user_profiles
    SET avatar = p_avatar, lu_updated = now(), lu_user_id = p_lu_user_id
    WHERE user_id = p_user_id AND active_flag = 1;
    IF NOT FOUND THEN
      p_error_code := -1; p_error_message := 'Khong tim thay ho so';
    ELSE
      p_result := jsonb_build_object('affected', 1);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    p_result := '{}'::jsonb; p_error_code := -500;
    p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
  END;
END; $$;
