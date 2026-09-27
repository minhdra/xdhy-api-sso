-- 0009_insert_user_order_for_cascade_fk.sql
-- Mục đích (27/09/2026): DB đã thêm khoá ngoại employee/user_profiles/user_roles/a_* -> system_users
-- ON DELETE CASCADE (xoá user kéo theo các bảng con). Proc tạo user cũ ghi employee TRƯỚC system_users
-- -> SQLSTATE 23503. Đổi thứ tự: system_users trước, rồi employee/user_profiles. Nội dung khác giữ nguyên.
-- Ghi lại luôn các khoá ngoại (idempotent - chỉ thêm nếu chưa có) để migration phản ánh đúng schema.
-- Chạy lại an toàn.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_user_id_fkey') THEN
    ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES system_users(user_id)
      ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_employee_id_fkey') THEN
    ALTER TABLE employee ADD CONSTRAINT employee_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES system_users(user_id)
      ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_user_id_fkey') THEN
    ALTER TABLE user_roles ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES system_users(user_id)
      ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'a_session_user_id_fkey') THEN
    ALTER TABLE a_session ADD CONSTRAINT a_session_user_id_fkey FOREIGN KEY (user_id) REFERENCES system_users(user_id)
      ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'a_refresh_token_user_id_fkey') THEN
    ALTER TABLE a_refresh_token ADD CONSTRAINT a_refresh_token_user_id_fkey FOREIGN KEY (user_id) REFERENCES system_users(user_id)
      ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'a_password_reset_token_user_id_fkey') THEN
    ALTER TABLE a_password_reset_token ADD CONSTRAINT a_password_reset_token_user_id_fkey FOREIGN KEY (user_id) REFERENCES system_users(user_id)
      ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'a_app_access_user_id_fkey') THEN
    ALTER TABLE a_app_access ADD CONSTRAINT a_app_access_user_id_fkey FOREIGN KEY (user_id) REFERENCES system_users(user_id)
      ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;

CREATE OR REPLACE PROCEDURE public."InsertUser"(IN p_branch_id integer, IN p_employee_id character varying, IN p_department_id integer, IN p_position_id integer, IN p_user_id character, IN p_user_name character varying, IN p_password character, IN p_type character varying, IN p_description character varying, IN p_first_name character varying, IN p_middle_name character varying, IN p_last_name character varying, IN p_full_name character varying, IN p_avatar character varying, IN p_gender integer, IN p_date_of_birth date, IN p_email character varying, IN p_phone_number character, IN p_is_guest smallint, IN p_created_by_user_id character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$

BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        IF EXISTS(SELECT 1 FROM system_users WHERE user_name = p_user_name) THEN
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
