-- 0008_search_user_newest_first.sql
-- Muc dich: danh sach nguoi dung (man Nguoi dung sso-web) sap xep MOI TAO TRUOC
-- (created_date_time DESC, user_id de on dinh khi trung gio) thay vi cu truoc; jsonb_agg giu dung
-- thu tu trang (truoc day khong ORDER BY - thu tu khong dam bao).
-- Ap dung: sau 0007. Chay lai an toan (CREATE OR REPLACE).
-- Rollback: CREATE OR REPLACE lai ban trong 0002.

CREATE OR REPLACE PROCEDURE public."SearchUser"(IN p_pageindex integer, IN p_pagesize integer, IN p_search_content character varying, IN p_branch_id integer, IN p_department_id integer, IN p_customer_id character varying, IN p_user_id character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$

BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        WITH base AS (SELECT row_number() OVER (ORDER BY s.created_date_time DESC, s.user_id) row_number,
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
