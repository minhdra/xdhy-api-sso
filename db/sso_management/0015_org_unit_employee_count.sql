-- 0015_org_unit_employee_count.sql (14/10/2026)
-- Muc dich: man To chuc (sso-web) hien them cot "So nhan su" cho CHI NHANH va PHONG BAN (chuc vu da co
-- tu 0014): SearchBranch / SearchDepartment tra them employee_count = so nhan su DANG HOAT DONG
-- (employee.active_flag = 1 va tai khoan system_users.active_flag = 1) thuoc chi nhanh/phong ban do.
-- Giu nguyen chu ky; them ORDER BY trong jsonb_agg de thu tu trang khong phu thuoc may.
-- Ap dung: sau 0014, len DATABASE "sso_management". Chay lai an toan (CREATE OR REPLACE).
-- Rollback: tao lai SearchBranch/SearchDepartment ban 0002 (khong co employee_count).

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
                             b.address,
                             (SELECT count(*) FROM employee e
                                JOIN system_users s ON s.user_id = e.employee_id AND s.active_flag = 1
                               WHERE e.branch_id = b.branch_id AND e.active_flag = 1) AS employee_count
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
                                  coalesce((SELECT jsonb_agg(to_jsonb(paged) ORDER BY paged.row_number) FROM paged), '[]'::jsonb))
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
                             b.address,
                             (SELECT count(*) FROM employee e
                                JOIN system_users s ON s.user_id = e.employee_id AND s.active_flag = 1
                               WHERE e.department_id = b.department_id AND e.active_flag = 1) AS employee_count
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
                                  coalesce((SELECT jsonb_agg(to_jsonb(paged) ORDER BY paged.row_number) FROM paged), '[]'::jsonb))
        INTO p_result;
    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{}'::jsonb;
            p_error_code := -500;
            p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
    END;
END;
$procedure$;
