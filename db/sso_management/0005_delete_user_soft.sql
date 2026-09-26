-- 0005_delete_user_soft.sql
-- Muc dich: ban goc "DeleteUser" XOA CUNG system_users/user_profiles/employee/
-- user_roles -> luon loi FK (SQLSTATE 23503) voi user da tung dang nhap vi
-- a_session/a_refresh_token/a_app_access tham chieu system_users. Doi thanh
-- XOA MEM: active_flag = 0 cho ca 4 bang, thu hoi moi phien dang nhap con hieu
-- luc, go quyen truy cap app. Login/GetUserById/SearchUser da loc active_flag = 1
-- nen user da xoa khong dang nhap / hien thi duoc nua. Phia app (task/finance)
-- nhan su kien xoa qua dong bo (/internal/sync/users/delete, cung xoa mem).
-- Ap dung: sau 0004. Chay lai an toan (CREATE OR REPLACE).
-- Rollback: CREATE OR REPLACE lai ban trong 0002 (khong nen - ban do hong).

CREATE OR REPLACE PROCEDURE public."DeleteUser"(IN p_json_list jsonb, IN p_lu_user_id character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        WITH ids AS (SELECT x ->> 'user_id' user_id FROM jsonb_array_elements(coalesce(p_json_list, '[]'::jsonb)) x),
             u1 AS (UPDATE system_users s SET active_flag = 0, lu_user_id = p_lu_user_id, lu_updated = now()
                    FROM ids i WHERE s.user_id = i.user_id AND s.active_flag = 1 RETURNING s.user_id),
             u2 AS (UPDATE user_profiles p SET active_flag = 0, lu_user_id = p_lu_user_id, lu_updated = now()
                    FROM ids i WHERE p.user_id = i.user_id RETURNING p.user_id),
             u3 AS (UPDATE employee e SET active_flag = 0, lu_user_id = p_lu_user_id, lu_updated = now()
                    FROM ids i WHERE e.employee_id = i.user_id RETURNING e.employee_id),
             u4 AS (UPDATE user_roles ur SET active_flag = 0, lu_user_id = p_lu_user_id, lu_updated = now()
                    FROM ids i WHERE ur.user_id = i.user_id AND ur.active_flag = 1 RETURNING ur.user_role_id),
             s1 AS (UPDATE a_session a SET revoked_at = now()
                    FROM ids i WHERE a.user_id = i.user_id AND a.revoked_at IS NULL RETURNING a.session_id),
             s2 AS (UPDATE a_refresh_token t SET revoked_at = now()
                    FROM ids i WHERE t.user_id = i.user_id AND t.revoked_at IS NULL RETURNING t.jti),
             d1 AS (DELETE FROM a_app_access x USING ids i WHERE x.user_id = i.user_id RETURNING x.app_id)
        SELECT jsonb_build_object('users', (SELECT count(*) FROM u1), 'profiles', (SELECT count(*) FROM u2),
                                  'employees', (SELECT count(*) FROM u3), 'user_roles', (SELECT count(*) FROM u4),
                                  'sessions', (SELECT count(*) FROM s1), 'refresh_tokens', (SELECT count(*) FROM s2),
                                  'app_access', (SELECT count(*) FROM d1))
        INTO p_result;
    EXCEPTION
        WHEN OTHERS THEN
            p_result := '{}'::jsonb;
            p_error_code := -500;
            p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
    END;
END;
$procedure$;
