-- 0003_delete_role_without_role_functions.sql
-- Muc dich: ban goc "DeleteRole" (build_management) xoa mem ca role_functions.
-- sso_management khong co bang tinh nang (thuoc tung app) -> viet lai chi xoa
-- mem roles. Moi app tu an map role -> tinh nang khi nhan su kien xoa role qua
-- dong bo (/internal/sync/roles/delete).
-- Ap dung: sau 0001, 0002. Chay lai an toan (CREATE OR REPLACE).
-- Rollback: khong can (ban goc khong chay duoc tren DB nay vi thieu role_functions).

CREATE OR REPLACE PROCEDURE public."DeleteRole"(IN p_json_list jsonb, IN p_lu_user_id character, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        WITH ids AS (SELECT x ->> 'role_id' role_id FROM jsonb_array_elements(coalesce(p_json_list, '[]'::jsonb)) x),
             u1
                 AS (UPDATE roles r SET active_flag = 0,lu_user_id = p_lu_user_id,lu_updated = now() FROM ids i WHERE r.role_id = i.role_id RETURNING r.role_id)
        SELECT jsonb_build_object('roles', (SELECT count(*) FROM u1))
        INTO p_result;
    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{}'::jsonb;
            p_error_code := -500;
            p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
    END;
END;
$procedure$;
