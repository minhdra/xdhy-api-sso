-- Sinh tự động bởi scripts/sso-management/generate-baseline.js từ build_management (26/09/2026).
-- 59 proc/function (a_* + CRUD user/tổ chức/nhóm quyền), nguyên văn pg_get_functiondef.
-- Chạy trên DB sso_management rỗng. Đã commit thì KHÔNG sinh lại đè lên - đổi schema bằng file mới.

-- Function LANGUAGE sql kiểm tra thân lúc tạo -> tắt để không phụ thuộc thứ tự tạo.
SET LOCAL check_function_bodies = false;

CREATE OR REPLACE PROCEDURE public."DeleteBranchMulti"(IN p_json_list jsonb, IN p_updated_by_id character, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$

BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        WITH ids AS (SELECT x ->> 'branch_id' branch_id
                     FROM jsonb_array_elements(coalesce(p_json_list, '[]'::jsonb)) x),
             upd
                 AS (UPDATE branch b SET active_flag = 0,lu_user_id = p_updated_by_id,lu_updated = now() FROM ids i WHERE b.branch_id::text = i.branch_id RETURNING b.branch_id)
        SELECT jsonb_build_object('affected', count(*))
        INTO p_result
        FROM upd;
    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{}'::jsonb;
            p_error_code := -500;
            p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
    END;
END;
$procedure$;

CREATE OR REPLACE PROCEDURE public."DeleteDepartmentMulti"(IN p_json_list jsonb, IN p_updated_by_id character, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$

BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        WITH ids AS (SELECT x ->> 'department_id' department_id
                     FROM jsonb_array_elements(coalesce(p_json_list, '[]'::jsonb)) x),
             upd
                 AS (UPDATE department d SET active_flag = 0,lu_user_id = p_updated_by_id,lu_updated = now() FROM ids i WHERE d.department_id::text = i.department_id RETURNING d.department_id)
        SELECT jsonb_build_object('affected', count(*))
        INTO p_result
        FROM upd;
    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{}'::jsonb;
            p_error_code := -500;
            p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
    END;
END;
$procedure$;

CREATE OR REPLACE PROCEDURE public."DeleteEmployeeMulti"(IN p_json_list jsonb, IN p_updated_by_id character, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$

BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        WITH ids AS (SELECT x ->> 'employee_id' employee_id
                     FROM jsonb_array_elements(coalesce(p_json_list, '[]'::jsonb)) x),
             u1
                 AS (UPDATE employee e SET active_flag = 0,lu_user_id = p_updated_by_id,lu_updated = now() FROM ids i WHERE e.employee_id = i.employee_id RETURNING e.employee_id)
           SELECT jsonb_build_object('employees_affected', (SELECT count(*) FROM u1))
        INTO p_result;
    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{}'::jsonb;
            p_error_code := -500;
            p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
    END;
END;
$procedure$;

CREATE OR REPLACE PROCEDURE public."DeletePositionMulti"(IN p_json_list jsonb, IN p_updated_by_id character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        WITH ids AS (SELECT x ->> 'position_id' position_id
                     FROM jsonb_array_elements(coalesce(p_json_list, '[]'::jsonb)) x),
             upd AS (UPDATE positions p SET active_flag = 0, lu_user_id = p_updated_by_id, lu_updated = now()
                     FROM ids i WHERE p.position_id::text = i.position_id RETURNING p.position_id)
        SELECT jsonb_build_object('affected', count(*))
        INTO p_result
        FROM upd;
    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{}'::jsonb;
            p_error_code := -500;
            p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
    END;
END;
$procedure$;

CREATE OR REPLACE PROCEDURE public."DeleteUser"(IN p_json_list jsonb, IN p_lu_user_id character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$

BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        WITH ids AS (SELECT x ->> 'user_id' user_id FROM jsonb_array_elements(coalesce(p_json_list, '[]'::jsonb)) x),
             d1 AS (DELETE FROM user_roles ur USING ids i WHERE ur.user_id = i.user_id RETURNING ur.user_role_id),
             d2 AS (DELETE FROM user_profiles up USING ids i WHERE up.user_id = i.user_id RETURNING up.user_id),
             d3 AS (DELETE FROM system_users su USING ids i WHERE su.user_id = i.user_id RETURNING su.user_id),
             d4 AS (DELETE FROM employee e USING ids i WHERE e.employee_id = i.user_id RETURNING e.employee_id)
        SELECT jsonb_build_object('user_roles', (SELECT count(*) FROM d1), 'profiles', (SELECT count(*) FROM d2),
                                  'users', (SELECT count(*) FROM d3), 'employees', (SELECT count(*) FROM d4))
        INTO p_result;
    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{}'::jsonb;
            p_error_code := -500;
            p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
    END;
END;
$procedure$;

CREATE OR REPLACE PROCEDURE public."DeleteUserRole"(IN p_user_id character varying, IN p_role_id character varying, IN p_lu_user_id character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$

BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        WITH upd
                 AS (UPDATE user_roles ur SET active_flag = 0,lu_user_id = p_lu_user_id,lu_updated = now() WHERE ur.user_id = p_user_id AND ur.role_id = p_role_id RETURNING ur.user_role_id)
        SELECT jsonb_build_object('affected', count(*))
        INTO p_result
        FROM upd;
    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{}'::jsonb;
            p_error_code := -500;
            p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
    END;
END;
$procedure$;

CREATE OR REPLACE PROCEDURE public."DeleteUserRole"(IN p_json_list jsonb, IN p_updated_by_id character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        WITH pairs AS (
            SELECT x ->> 'user_id' user_id, x ->> 'role_id' role_id
            FROM jsonb_array_elements(coalesce(p_json_list, '[]'::jsonb)) x
        ),
        upd AS (
            UPDATE user_roles ur
            SET active_flag = 0, lu_user_id = p_updated_by_id, lu_updated = now()
            FROM pairs p
            WHERE ur.user_id = p.user_id AND ur.role_id = p.role_id AND ur.active_flag = 1
            RETURNING ur.user_role_id
        )
        SELECT jsonb_build_object('affected', count(*))
        INTO p_result
        FROM upd;
    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{}'::jsonb;
            p_error_code := -500;
            p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
    END;
END;
$procedure$;

CREATE OR REPLACE PROCEDURE public."GetBranchById"(IN p_branch_id character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$

BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        SELECT jsonb_build_object('rows', (SELECT coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb)
                                           FROM (SELECT * FROM branch WHERE branch_id = p_branch_id AND active_flag = 1) q))
        INTO p_result;
    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{}'::jsonb;
            p_error_code := -500;
            p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
    END;
END;
$procedure$;

CREATE OR REPLACE PROCEDURE public."GetBranchDropdown"(OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$

BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        SELECT jsonb_build_object('rows', (SELECT coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb)
                                           FROM (SELECT branch_name label, branch_id value
                                                 FROM branch
                                                 WHERE active_flag = 1
                                                 ORDER BY branch_name) q))
        INTO p_result;
    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{}'::jsonb;
            p_error_code := -500;
            p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
    END;
END;
$procedure$;

CREATE OR REPLACE PROCEDURE public."GetDepartmentById"(IN p_department_id character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$

BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        SELECT jsonb_build_object('rows', (SELECT coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb)
                                           FROM (SELECT * FROM Department WHERE department_id = p_department_id AND active_flag = 1) q))
        INTO p_result;
    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{}'::jsonb;
            p_error_code := -500;
            p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
    END;
END;
$procedure$;

CREATE OR REPLACE PROCEDURE public."GetDepartmentDropdown"(OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$

BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        SELECT jsonb_build_object('rows', (SELECT coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb)
                                           FROM (SELECT department_id value, department_name label
                                                 FROM department
                                                 WHERE active_flag = 1
                                                 ORDER BY department_name) q))
        INTO p_result;
    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{}'::jsonb;
            p_error_code := -500;
            p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
    END;
END;
$procedure$;

CREATE OR REPLACE PROCEDURE public."GetEmployeeDropdown"(OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$

BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        SELECT jsonb_build_object('rows', (SELECT coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb)
                                           FROM (SELECT fullname label, employee_id value
                                                 FROM employee
                                                 WHERE active_flag = 1
                                                 ORDER BY fullname) q))
        INTO p_result;
    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{}'::jsonb;
            p_error_code := -500;
            p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
    END;
END;
$procedure$;

CREATE OR REPLACE PROCEDURE public."GetEmployeeDropdownbyEmployeeId"(IN p_employee_id character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$

BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        SELECT jsonb_build_object('rows', coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb))
        INTO p_result
        FROM (SELECT e.fullname label, e.employee_id value
              FROM employee e
              WHERE e.active_flag = 1
                AND (EXISTS(SELECT 1
                            FROM employee me
                            WHERE me.employee_id = p_employee_id AND me.position_id IN (4, 5, 6)) OR
                     e.employee_id = p_employee_id OR
                     (e.branch_id IS NOT DISTINCT FROM (SELECT branch_id FROM employee WHERE employee_id = p_employee_id) AND
                      e.department_id IS NOT DISTINCT FROM (SELECT department_id FROM employee WHERE employee_id = p_employee_id) AND
                      (SELECT position_id FROM employee WHERE employee_id = p_employee_id) IN (1, 2)))
              ORDER BY e.fullname) q;
    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{}'::jsonb;
            p_error_code := -500;
            p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
    END;
END;
$procedure$;

CREATE OR REPLACE PROCEDURE public."GetPositionById"(IN p_position_id character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        SELECT jsonb_build_object('rows', (SELECT coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb)
                                           FROM (SELECT * FROM positions WHERE position_id::text = p_position_id AND active_flag = 1) q))
        INTO p_result;
    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{}'::jsonb;
            p_error_code := -500;
            p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
    END;
END;
$procedure$;

CREATE OR REPLACE PROCEDURE public."GetPositionDropdown"(OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$

BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        SELECT jsonb_build_object('rows', (SELECT coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb)
                                           FROM (SELECT position_name label, position_id value
                                                 FROM positions
                                                 WHERE active_flag = 1
                                                 ORDER BY rank_weight DESC) q))
        INTO p_result;
    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{}'::jsonb;
            p_error_code := -500;
            p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
    END;
END;
$procedure$;

CREATE OR REPLACE PROCEDURE public."GetRoleById"(IN p_role_id character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$

BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        SELECT jsonb_build_object('rows', (SELECT coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb)
                                           FROM (SELECT * FROM roles WHERE role_id = p_role_id AND active_flag = 1) q))
        INTO p_result;
    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{}'::jsonb;
            p_error_code := -500;
            p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
    END;
END;
$procedure$;

CREATE OR REPLACE PROCEDURE public."GetRoleByUserId"(IN p_user_id character, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$

BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        SELECT jsonb_build_object('rows', (SELECT coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb)
                                           FROM (SELECT r.*
                                                 FROM roles r
                                                 WHERE r.role_id IN (SELECT ur.role_id
                                                                     FROM user_roles ur
                                                                     WHERE ur.user_id = p_user_id
                                                                       AND ur.active_flag = 1)
                                                   AND r.active_flag = 1) q))
        INTO p_result;
    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{}'::jsonb;
            p_error_code := -500;
            p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
    END;
END;
$procedure$;

CREATE OR REPLACE PROCEDURE public."GetRoleDropdown"(OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$

BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        SELECT jsonb_build_object('rows', (SELECT coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb)
                                           FROM (SELECT role_name label, role_id value
                                                 FROM roles
                                                 WHERE active_flag = 1
                                                 ORDER BY created_date_time DESC) q))
        INTO p_result;
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
                                                                      (SELECT user_id FROM system_users WHERE user_name = p_user_name LIMIT 1)) =
                                                               0 OR e.department_id = (SELECT department_id
                                                                                       FROM employee
                                                                                       WHERE employee_id =
                                                                                             (SELECT user_id FROM system_users WHERE user_name = p_user_name LIMIT 1)))) q),
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

CREATE OR REPLACE PROCEDURE public."GetUserById"(IN p_user_id character, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$

BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        SELECT jsonb_build_object('rows', (SELECT coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb)
                                           FROM (SELECT s.user_id,
                                                        u.full_name,
                                                        u.avatar,
                                                        u.gender,
                                                        u.date_of_birth,
                                                        u.email,
                                                        u.phone_number,
                                                        s.user_name,
                                                        s.online_flag,
                                                        s.description,
                                                        e.position_id,
                                                        p.position_name,
                                                        e.department_id,
                                                        e.branch_id
                                                 FROM system_users s
                                                          JOIN user_profiles u ON s.user_id = u.user_id
                                                          JOIN employee e ON e.employee_id = s.user_id
                                                          LEFT JOIN positions p ON p.position_id = e.position_id
                                                 WHERE s.user_id = p_user_id
                                                   AND s.active_flag = 1
                                                   AND u.active_flag = 1
                                                   AND e.active_flag = 1) q))
        INTO p_result;
    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{}'::jsonb;
            p_error_code := -500;
            p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
    END;
END;
$procedure$;

CREATE OR REPLACE PROCEDURE public."InsertBranch"(IN p_branch_name character varying, IN p_phone character varying, IN p_fax character varying, IN p_address character varying, IN p_created_by_user_id character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$
DECLARE v_branch_id integer;
BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        INSERT INTO branch(branch_name, phone, fax, address, active_flag, created_by_user_id, created_date_time)
        VALUES (p_branch_name, p_phone, p_fax, p_address, 1, p_created_by_user_id, now())
        RETURNING branch_id INTO v_branch_id;
        p_result := jsonb_build_object('affected', 1, 'branch_id', v_branch_id);
    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{}'::jsonb;
            p_error_code := -500;
            p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
    END;
END;
$procedure$;

CREATE OR REPLACE PROCEDURE public."InsertDepartment"(IN p_department_name character varying, IN p_phone character varying, IN p_fax character varying, IN p_address character varying, IN p_created_by_user_id character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$
DECLARE v_department_id integer;
BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        INSERT INTO department(department_name, phone, fax, address, active_flag, created_by_user_id, created_date_time)
        VALUES (p_department_name, p_phone, p_fax, p_address, 1, p_created_by_user_id, now())
        RETURNING department_id INTO v_department_id;
        p_result := jsonb_build_object('affected', 1, 'department_id', v_department_id);
    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{}'::jsonb;
            p_error_code := -500;
            p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
    END;
END;
$procedure$;

CREATE OR REPLACE PROCEDURE public."InsertPosition"(IN p_position_name character varying, IN p_description character varying, IN p_created_by_user_id character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$
DECLARE v_position_id integer;
BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        INSERT INTO positions(position_name, description, active_flag, created_by_user_id, created_date_time)
        VALUES (p_position_name, p_description, 1, p_created_by_user_id, now())
        RETURNING position_id INTO v_position_id;
        p_result := jsonb_build_object('position_id', v_position_id);
    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{}'::jsonb;
            p_error_code := -500;
            p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
    END;
END;
$procedure$;

CREATE OR REPLACE PROCEDURE public."InsertRole"(IN p_role_id character varying, IN p_role_code character varying, IN p_role_name character varying, IN p_description character varying, IN p_created_by_user_id character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$

BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        INSERT INTO roles(role_id, role_code, role_name, description, active_flag, created_by_user_id,
                          created_date_time)
        VALUES (p_role_id, p_role_code, p_role_name, p_description, 1, p_created_by_user_id, now());
        p_result := jsonb_build_object('role_id', p_role_id);
    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{}'::jsonb;
            p_error_code := -500;
            p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
    END;
END;
$procedure$;

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
        INSERT INTO employee(branch_id, employee_id, fullname, phone_number, email, position_id, department_id,
                             active_flag, created_by_user_id, created_date_time)
        VALUES (p_branch_id, p_employee_id, p_full_name, p_phone_number, p_email, p_position_id, p_department_id, 1,
                p_created_by_user_id, now());
        INSERT INTO system_users(user_id, user_name, password, type, description, online_flag, active_flag,
                                 created_by_user_id, created_date_time)
        VALUES (p_user_id, p_user_name, p_password, p_type, p_description, 0, 1, p_created_by_user_id, now());
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

CREATE OR REPLACE PROCEDURE public."InsertUserRole"(IN p__user_role_list jsonb, IN p_created_by_user_id character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';

    BEGIN
        WITH input AS (
            SELECT *
            FROM jsonb_to_recordset(
                coalesce(p__user_role_list, '[]'::jsonb)
            ) AS x(
                user_id varchar(36),
                role_id varchar(36),
                user_role_id varchar(36),
                active_flag integer
            )
        ),
        del AS (
            DELETE FROM user_roles ur
            WHERE ur.user_id IN (
                SELECT DISTINCT i.user_id
                FROM input i
                WHERE i.user_id IS NOT NULL
            )
            RETURNING ur.user_role_id
        ),
        ins AS (
            INSERT INTO user_roles (
                user_role_id,
                user_id,
                role_id,
                created_by_user_id,
                created_date_time,
                active_flag
            )
            SELECT
                user_role_id,
                user_id,
                role_id,
                p_created_by_user_id,
                now(),
                active_flag
            FROM input
            RETURNING user_role_id
        )
        SELECT jsonb_build_object(
            'deleted', (SELECT count(*) FROM del),
            'inserted', (SELECT count(*) FROM ins)
        )
        INTO p_result;

    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{}'::jsonb;
            p_error_code := -500;
            p_error_message := left(
                format('SQLSTATE %s: %s', SQLSTATE, SQLERRM),
                500
            );
    END;
END;
$procedure$;

CREATE OR REPLACE PROCEDURE public."LockUser"(IN p_user_id character varying, IN p_online_flag smallint, IN p_lu_user_id character, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$

BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        WITH upd
                 AS (UPDATE system_users SET online_flag = p_online_flag,lu_updated = now(),lu_user_id = p_lu_user_id WHERE user_id = p_user_id RETURNING user_id)
        SELECT jsonb_build_object('affected', count(*))
        INTO p_result
        FROM upd;
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

CREATE OR REPLACE PROCEDURE public."ResetPasswordByAdmin"(IN p_user_id character varying, IN p_new_password character varying, IN p_lu_user_id character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$

BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        IF NOT EXISTS(SELECT 1 FROM system_users WHERE user_id = p_user_id) THEN
            p_error_code := -1;p_error_message := 'Không tìm thấy người dùng';RETURN;
        END IF;
        UPDATE system_users
        SET password=p_new_password, lu_user_id=p_lu_user_id, lu_updated=now()
        WHERE user_id = p_user_id;
        SELECT jsonb_build_object('email', (SELECT email FROM user_profiles WHERE user_id = p_user_id LIMIT 1))
        INTO p_result;
    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{}'::jsonb;
            p_error_code := -500;
            p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
    END;
END;
$procedure$;

CREATE OR REPLACE PROCEDURE public."SearchBranch"(IN p_pageindex integer, IN p_pagesize integer, IN p_search_content character varying, IN p_branch_name character varying, IN p_phone character varying, IN p_fax character varying, IN p_address character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$

BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        WITH base AS (SELECT row_number() OVER (ORDER BY b.branch_name) row_number,
                             b.branch_id,
                             b.branch_name,
                             b.phone,
                             b.fax,
                             b.address
                      FROM branch b
                      WHERE b.active_flag = 1
                        AND (p_search_content IS NULL OR
                             concat(coalesce(b.branch_name, ''), coalesce(b.phone, ''), coalesce(b.fax, '')) ILIKE
                             '%' || trim(p_search_content) || '%')),
             paged AS (SELECT *
                       FROM base
                       WHERE p_pageSize = 0
                          OR row_number BETWEEN ((p_pageIndex - 1) * p_pageSize) + 1 AND p_pageIndex * p_pageSize)
        SELECT jsonb_build_object('record_count', (SELECT count(*) FROM base), 'rows',
                                  coalesce((SELECT jsonb_agg(to_jsonb(paged)) FROM paged), '[]'::jsonb))
        INTO p_result;
    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{}'::jsonb;
            p_error_code := -500;
            p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
    END;
END;
$procedure$;

CREATE OR REPLACE PROCEDURE public."SearchDepartment"(IN p_pageindex integer, IN p_pagesize integer, IN p_search_content character varying, IN p_department_id integer, IN p_department_name character varying, IN p_phone character varying, IN p_fax character varying, IN p_address character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$

BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        WITH base AS (SELECT row_number() OVER (ORDER BY b.department_name) row_number,
                             b.department_id,
                             b.department_name,
                             b.phone,
                             b.fax,
                             b.address
                      FROM department b
                      WHERE b.active_flag = 1
                        AND (p_search_content IS NULL OR
                             concat(coalesce(b.department_name, ''), coalesce(b.phone, ''), coalesce(b.fax, '')) ILIKE
                             '%' || trim(p_search_content) || '%')),
             paged AS (SELECT *
                       FROM base
                       WHERE p_pageSize = 0
                          OR row_number BETWEEN ((p_pageIndex - 1) * p_pageSize) + 1 AND p_pageIndex * p_pageSize)
        SELECT jsonb_build_object('record_count', (SELECT count(*) FROM base), 'rows',
                                  coalesce((SELECT jsonb_agg(to_jsonb(paged)) FROM paged), '[]'::jsonb))
        INTO p_result;
    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{}'::jsonb;
            p_error_code := -500;
            p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
    END;
END;
$procedure$;

CREATE OR REPLACE PROCEDURE public."SearchPosition"(IN p_pageindex integer, IN p_pagesize integer, IN p_search_content character varying, IN p_position_id integer, IN p_position_name character varying, IN p_description character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        WITH base AS (SELECT row_number() OVER (ORDER BY p.position_name) row_number,
                             p.position_id, p.position_name, p.description, p.rank_weight
                      FROM positions p
                      WHERE p.active_flag = 1
                        AND (p_position_id IS NULL OR p.position_id = p_position_id)
                        AND (p_position_name IS NULL OR p.position_name ILIKE '%' || trim(p_position_name) || '%')
                        AND (p_description IS NULL OR p.description ILIKE '%' || trim(p_description) || '%')
                        AND (p_search_content IS NULL OR
                             concat(coalesce(p.position_name, ''), coalesce(p.description, '')) ILIKE
                             '%' || trim(p_search_content) || '%')),
             paged AS (SELECT *
                       FROM base
                       WHERE p_pageSize = 0
                          OR row_number BETWEEN ((p_pageIndex - 1) * p_pageSize) + 1 AND p_pageIndex * p_pageSize)
        SELECT jsonb_build_object('record_count', (SELECT count(*) FROM base), 'rows',
                                  coalesce((SELECT jsonb_agg(to_jsonb(paged)) FROM paged), '[]'::jsonb))
        INTO p_result;
    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{}'::jsonb;
            p_error_code := -500;
            p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
    END;
END;
$procedure$;

CREATE OR REPLACE PROCEDURE public."SearchRole"(IN p_pageindex integer, IN p_pagesize integer, IN p_search_content character varying, IN p_role_id character, IN p_role_code character varying, IN p_role_name character varying, IN p_description character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$

BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        WITH base AS (SELECT row_number() OVER (ORDER BY a.created_date_time) row_number, a.*
                      FROM roles a
                      WHERE a.active_flag = 1
                        AND (p_role_id IS NULL OR a.role_id = p_role_id)
                        AND (p_role_code IS NULL OR a.role_code ILIKE '%' || p_role_code || '%')
                        AND (p_role_name IS NULL OR a.role_name ILIKE '%' || p_role_name || '%')
                        AND (p_description IS NULL OR a.description ILIKE '%' || p_description || '%')
                        AND (p_search_content IS NULL OR
                             concat(coalesce(a.role_id, ''), coalesce(a.role_code, ''), coalesce(a.role_name, ''),
                                    coalesce(a.description, '')) ILIKE '%' || trim(p_search_content) || '%')),
             paged AS (SELECT *
                       FROM base
                       WHERE p_pageSize = 0
                          OR row_number BETWEEN ((p_pageIndex - 1) * p_pageSize) + 1 AND p_pageIndex * p_pageSize)
        SELECT jsonb_build_object('record_count', (SELECT count(*) FROM base), 'rows',
                                  coalesce((SELECT jsonb_agg(to_jsonb(paged)) FROM paged), '[]'::jsonb))
        INTO p_result;
    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{}'::jsonb;
            p_error_code := -500;
            p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
    END;
END;
$procedure$;

CREATE OR REPLACE PROCEDURE public."SearchUser"(IN p_pageindex integer, IN p_pagesize integer, IN p_search_content character varying, IN p_branch_id integer, IN p_department_id integer, IN p_customer_id character varying, IN p_user_id character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$

BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        WITH base AS (SELECT row_number() OVER (ORDER BY s.created_date_time) row_number,
                             s.user_id,
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
                             s.created_date_time,
                             d.department_name,
                             p.position_name,
                             b.branch_name,
                             (SELECT string_agg(r.role_name, ', ' ORDER BY r.role_name)
                              FROM user_roles ur
                                       JOIN roles r ON r.role_id = ur.role_id
                              WHERE ur.user_id = s.user_id
                                AND ur.active_flag = 1
                                AND r.active_flag = 1)                        role_group
                      FROM system_users s
                               JOIN user_profiles u ON u.user_id = s.user_id
                               JOIN employee e ON e.employee_id = s.user_id
                               JOIN branch b ON b.branch_id = e.branch_id
                               JOIN positions p ON p.position_id = e.position_id
                               JOIN department d ON d.department_id = e.department_id
                      WHERE s.active_flag = 1
                        AND u.active_flag = 1
                        AND s.user_id <> 'sa'
                        AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
                        AND (p_department_id IS NULL OR d.department_id = p_department_id) 
                        AND (p_search_content IS NULL OR p_search_content = '' OR
                             concat_ws('', d.department_name, b.branch_name, s.user_name, s.description, u.full_name,
                                       u.gender::text, u.date_of_birth::text, u.email, u.phone_number) ILIKE
                             '%' || trim(p_search_content) || '%')),
             paged AS (SELECT *
                       FROM base
                       WHERE p_pageSize = 0
                          OR row_number BETWEEN ((p_pageIndex - 1) * p_pageSize) + 1 AND p_pageIndex * p_pageSize)
        SELECT jsonb_build_object('record_count', (SELECT count(*) FROM base), 'rows',
                                  coalesce((SELECT jsonb_agg(to_jsonb(paged)) FROM paged), '[]'::jsonb))
        INTO p_result;
    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{}'::jsonb;
            p_error_code := -500;
            p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
    END;
END;
$procedure$;

CREATE OR REPLACE PROCEDURE public."UpdateBranch"(IN p_branch_id integer, IN p_branch_name character varying, IN p_phone character varying, IN p_fax character varying, IN p_address character varying, IN p_lu_user_id character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$

BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        UPDATE branch
        SET branch_name=p_branch_name,
            phone=p_phone,
            fax=p_fax,
            address=p_address,
            lu_user_id=p_lu_user_id,
            lu_updated=now()
        WHERE branch_id = p_branch_id;
        p_result := jsonb_build_object('success', true);
    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{}'::jsonb;
            p_error_code := -500;
            p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
    END;
END;
$procedure$;

CREATE OR REPLACE PROCEDURE public."UpdateDepartment"(IN p_department_id integer, IN p_department_name character varying, IN p_phone character varying, IN p_fax character varying, IN p_address character varying, IN p_lu_user_id character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$

BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        IF NOT EXISTS(SELECT 1 FROM department WHERE department_id = p_department_id AND active_flag = 1) THEN
            p_error_code := -1;p_error_message := 'Mã phòng ban không tồn tại';RETURN;
        END IF;
        UPDATE department
        SET department_name=p_department_name,
            phone=p_phone,
            fax=p_fax,
            address=p_address,
            lu_user_id=p_lu_user_id,
            lu_updated=now()
        WHERE department_id = p_department_id;
        p_result := jsonb_build_object('success', true);
    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{}'::jsonb;
            p_error_code := -500;
            p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
    END;
END;
$procedure$;

CREATE OR REPLACE PROCEDURE public."UpdatePosition"(IN p_position_id integer, IN p_position_name character varying, IN p_description character varying, IN p_lu_user_id character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        IF NOT EXISTS(SELECT 1 FROM positions WHERE position_id = p_position_id AND active_flag = 1) THEN
            p_error_code := -1; p_error_message := 'Mã chức vụ không tồn tại'; RETURN;
        END IF;
        UPDATE positions
        SET position_name = p_position_name,
            description = p_description,
            lu_user_id = p_lu_user_id,
            lu_updated = now()
        WHERE position_id = p_position_id;
        p_result := jsonb_build_object('success', true);
    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{}'::jsonb;
            p_error_code := -500;
            p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
    END;
END;
$procedure$;

CREATE OR REPLACE PROCEDURE public."UpdateRole"(IN p_role_id character, IN p_role_code character varying, IN p_role_name character varying, IN p_description character varying, IN p_lu_user_id character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$

BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        UPDATE roles
        SET role_code=p_role_code,
            role_name=p_role_name,
            description=p_description,
            lu_updated=now(),
            lu_user_id=p_lu_user_id
        WHERE role_id = p_role_id;
        p_result := jsonb_build_object('success', true);
    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{}'::jsonb;
            p_error_code := -500;
            p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
    END;
END;
$procedure$;

CREATE OR REPLACE PROCEDURE public."UpdateUser"(IN p_branch_id integer, IN p_employee_id character varying, IN p_department_id integer, IN p_position_id integer, IN p_user_id character, IN p_type character varying, IN p_description character varying, IN p_first_name character varying, IN p_middle_name character varying, IN p_last_name character varying, IN p_full_name character varying, IN p_avatar character varying, IN p_gender integer, IN p_date_of_birth date, IN p_email character varying, IN p_phone_number character varying, IN p_lu_user_id character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$

BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        UPDATE employee
        SET branch_id=p_branch_id,
            fullname=p_full_name,
            phone_number=p_phone_number,
            email=p_email,
            position_id=p_position_id,
            department_id=p_department_id,
            lu_updated=now(),
            lu_user_id=p_lu_user_id
        WHERE employee_id = p_employee_id;
        UPDATE user_profiles
        SET first_name=p_first_name,
            middle_name=p_middle_name,
            last_name=p_last_name,
            full_name=p_full_name,
            avatar=p_avatar,
            gender=p_gender,
            date_of_birth=p_date_of_birth,
            email=p_email,
            phone_number=p_phone_number,
            lu_updated=now(),
            lu_user_id=p_lu_user_id
        WHERE user_id = p_user_id;
        UPDATE system_users
        SET type=p_type,
            description=p_description,
            lu_updated=now(),
            lu_user_id=p_lu_user_id
        WHERE user_id = p_user_id;
        p_result := jsonb_build_object('success', true);
    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{}'::jsonb;
            p_error_code := -500;
            p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
    END;
END;
$procedure$;

CREATE OR REPLACE PROCEDURE public."a_AdminAddAppAccess"(IN p_app_id character varying, IN p_user_ids jsonb, IN p_lu_user_id character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$
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

CREATE OR REPLACE PROCEDURE public."a_AdminDeleteApp"(IN p_app_id character varying, IN p_lu_user_id character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
  p_result := '{}'::jsonb; p_error_code := 0; p_error_message := '';
  BEGIN
    UPDATE a_app SET active_flag = 0, lu_user_id = p_lu_user_id, lu_updated = now()
    WHERE app_id = p_app_id AND active_flag = 1;
    IF NOT FOUND THEN
      p_error_code := -1; p_error_message := 'Không tìm thấy ứng dụng.';
      RETURN;
    END IF;
    DELETE FROM a_app_access WHERE app_id = p_app_id;
    p_result := jsonb_build_object('affected', 1);
  EXCEPTION WHEN OTHERS THEN
    p_result := '{}'::jsonb; p_error_code := -500;
    p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
  END;
END; $procedure$;

CREATE OR REPLACE PROCEDURE public."a_AdminListAppAccess"(IN p_app_id character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$
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

CREATE OR REPLACE PROCEDURE public."a_AdminListAppAccessCandidates"(IN p_app_id character varying, IN p_keyword character varying, IN p_position_id integer, IN p_page integer, IN p_page_size integer, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$
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

CREATE OR REPLACE PROCEDURE public."a_AdminListApps"(OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$
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

CREATE OR REPLACE PROCEDURE public."a_AdminListUsers"(OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$
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

CREATE OR REPLACE PROCEDURE public."a_AdminRemoveAppAccess"(IN p_app_id character varying, IN p_user_ids jsonb, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$
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

CREATE OR REPLACE PROCEDURE public."a_AdminSetAppAccess"(IN p_app_id character varying, IN p_user_ids jsonb, IN p_lu_user_id character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
  p_result := '{}'::jsonb; p_error_code := 0; p_error_message := '';
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM a_app WHERE app_id = p_app_id AND active_flag = 1) THEN
      p_error_code := -1; p_error_message := 'Không tìm thấy ứng dụng.';
      RETURN;
    END IF;
    DELETE FROM a_app_access WHERE app_id = p_app_id;
    INSERT INTO a_app_access (app_id, user_id, created_by_user_id)
    SELECT p_app_id, x.value #>> '{}', p_lu_user_id
    FROM jsonb_array_elements(coalesce(p_user_ids, '[]'::jsonb)) x;
    p_result := jsonb_build_object('affected', jsonb_array_length(coalesce(p_user_ids, '[]'::jsonb)));
  EXCEPTION WHEN OTHERS THEN
    p_result := '{}'::jsonb; p_error_code := -500;
    p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
  END;
END; $procedure$;

CREATE OR REPLACE PROCEDURE public."a_AdminSetAppIcon"(IN p_app_id character varying, IN p_icon character varying, IN p_lu_user_id character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
  p_result := '{}'::jsonb; p_error_code := 0; p_error_message := '';
  BEGIN
    UPDATE public.a_app
    SET icon = p_icon, lu_user_id = p_lu_user_id, lu_updated = now()
    WHERE app_id = p_app_id AND active_flag = 1;
    IF NOT FOUND THEN
      p_error_code := -1; p_error_message := 'Không tìm thấy ứng dụng.';
      RETURN;
    END IF;
    p_result := jsonb_build_object('app_id', p_app_id, 'icon', p_icon);
  EXCEPTION WHEN OTHERS THEN
    p_result := '{}'::jsonb; p_error_code := -500;
    p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
  END;
END; $procedure$;

CREATE OR REPLACE PROCEDURE public."a_AdminUpsertApp"(IN p_app_id character varying, IN p_app_key character varying, IN p_app_name character varying, IN p_description character varying, IN p_url character varying, IN p_color character varying, IN p_sort_order integer, IN p_lu_user_id character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$
DECLARE v_app_id varchar;
BEGIN
  p_result := '{}'::jsonb; p_error_code := 0; p_error_message := '';
  BEGIN
    IF p_app_id IS NULL OR p_app_id = '' THEN
      IF EXISTS (SELECT 1 FROM a_app WHERE app_key = p_app_key AND active_flag = 1) THEN
        p_error_code := -1; p_error_message := 'Mã ứng dụng đã tồn tại.';
        RETURN;
      END IF;
      v_app_id := gen_random_uuid()::text;
      INSERT INTO a_app (app_id, app_key, app_name, description, url, color, sort_order, created_by_user_id)
      VALUES (v_app_id, p_app_key, p_app_name, coalesce(p_description, ''), coalesce(p_url, ''),
              coalesce(p_color, '#2563a6'), coalesce(p_sort_order, 0), p_lu_user_id);
    ELSE
      v_app_id := p_app_id;
      IF EXISTS (SELECT 1 FROM a_app WHERE app_key = p_app_key AND active_flag = 1 AND app_id <> v_app_id) THEN
        p_error_code := -1; p_error_message := 'Mã ứng dụng đã tồn tại.';
        RETURN;
      END IF;
      UPDATE a_app
      SET app_key = p_app_key, app_name = p_app_name, description = coalesce(p_description, ''),
          url = coalesce(p_url, ''), color = coalesce(p_color, '#2563a6'),
          sort_order = coalesce(p_sort_order, 0), lu_user_id = p_lu_user_id, lu_updated = now()
      WHERE app_id = v_app_id AND active_flag = 1;
      IF NOT FOUND THEN
        p_error_code := -1; p_error_message := 'Không tìm thấy ứng dụng.';
        RETURN;
      END IF;
    END IF;
    p_result := jsonb_build_object('app_id', v_app_id);
  EXCEPTION WHEN OTHERS THEN
    p_result := '{}'::jsonb; p_error_code := -500;
    p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
  END;
END; $procedure$;

CREATE OR REPLACE FUNCTION public."a_FilterUsersWithAppAccess"(p_app_key character varying, p_user_ids jsonb)
 RETURNS TABLE(user_id character varying)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT DISTINCT x.value #>> '{}' AS user_id
  FROM jsonb_array_elements(coalesce(p_user_ids, '[]'::jsonb)) x
  WHERE "a_UserHasAppAccess"(x.value #>> '{}', p_app_key);
$function$;

CREATE OR REPLACE PROCEDURE public."a_GetAccountProfile"(IN p_user_id character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
  p_result := '{}'::jsonb; p_error_code := 0; p_error_message := '';
  BEGIN
    SELECT jsonb_build_object('rows', coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb))
    INTO p_result
    FROM (
      SELECT s.user_id, s.user_name, s.type,
             u.full_name, u.avatar, u.gender, u.date_of_birth, u.email, u.phone_number,
             p.position_name, d.department_name, b.branch_name,
             "a_IsUserAdmin"(s.user_id) AS is_admin
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
END; $procedure$;

CREATE OR REPLACE PROCEDURE public."a_GetUserPasswordHash"(IN p_user_id character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$
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
END; $procedure$;

CREATE OR REPLACE FUNCTION public."a_IsUserAdmin"(p_user_id character varying)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
DECLARE v_is_admin boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON r.role_id = ur.role_id
    WHERE ur.user_id = p_user_id AND ur.active_flag = 1
      AND r.active_flag = 1 AND r.role_code = 'sa'
  ) INTO v_is_admin;
  RETURN coalesce(v_is_admin, false);
END; $function$;

CREATE OR REPLACE PROCEDURE public."a_ListAppIcons"(OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
  p_result := '{}'::jsonb; p_error_code := 0; p_error_message := '';
  BEGIN
    SELECT jsonb_build_object('rows', coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb))
    INTO p_result
    FROM (SELECT app_id, icon FROM public.a_app WHERE active_flag = 1) q;
  EXCEPTION WHEN OTHERS THEN
    p_result := '{}'::jsonb; p_error_code := -500;
    p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
  END;
END; $procedure$;

CREATE OR REPLACE PROCEDURE public."a_ListAppsForUser"(IN p_user_id character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$
DECLARE v_is_admin boolean;
BEGIN
  p_result := '{}'::jsonb; p_error_code := 0; p_error_message := '';
  BEGIN
    v_is_admin := "a_IsUserAdmin"(p_user_id);
    SELECT jsonb_build_object('rows', coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.sort_order), '[]'::jsonb))
    INTO p_result
    FROM (
      SELECT a.app_id, a.app_key, a.app_name, a.description, a.url, a.color, a.sort_order
      FROM a_app a
      WHERE a.active_flag = 1
        AND (
          v_is_admin
          OR EXISTS (SELECT 1 FROM a_app_access x WHERE x.app_id = a.app_id AND x.user_id = p_user_id)
        )
    ) q;
  EXCEPTION WHEN OTHERS THEN
    p_result := '{}'::jsonb; p_error_code := -500;
    p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
  END;
END; $procedure$;

CREATE OR REPLACE PROCEDURE public."a_SetAvatar"(IN p_user_id character varying, IN p_avatar character varying, IN p_lu_user_id character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$
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
END; $procedure$;

CREATE OR REPLACE PROCEDURE public."a_SetUserPassword"(IN p_user_id character varying, IN p_new_password character varying, IN p_lu_user_id character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$
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
END; $procedure$;

CREATE OR REPLACE PROCEDURE public."a_UpdateSelfProfile"(IN p_user_id character varying, IN p_full_name character varying, IN p_email character varying, IN p_phone_number character varying, IN p_gender integer, IN p_date_of_birth date, IN p_lu_user_id character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$
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
END; $procedure$;

CREATE OR REPLACE FUNCTION public."a_UserHasAppAccess"(p_user_id character varying, p_app_key character varying)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
DECLARE v_has boolean;
BEGIN
  IF "a_IsUserAdmin"(p_user_id) THEN
    RETURN true;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM a_app a
    JOIN a_app_access x ON x.app_id = a.app_id
    WHERE a.app_key = p_app_key AND a.active_flag = 1 AND x.user_id = p_user_id
  ) INTO v_has;

  RETURN coalesce(v_has, false);
END; $function$;
