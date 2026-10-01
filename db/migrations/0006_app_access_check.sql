-- 0006_app_access_check.sql
-- Muc dich: dong lo hong "co token hop le la vao thang duoc URL app, khong
-- can duoc cap quyen" - a_app/a_app_access (0005) truoc gio moi loc UI
-- (GET /apps), CHUA co ai kiem tra o tang backend. Ham nay cho phep BAT KY
-- app nao (goi qua GET /me?app=<app_key>) tu bao ve bang 1 lan goi, khong
-- can nhung them ha tang gateway rieng.
-- Ap dung: sau 0005.
-- Rollback: DROP FUNCTION IF EXISTS a_UserHasAppAccess(varchar, varchar);

-- Fail-closed: app_key khong ton tai/khong active -> false cho nguoi khong
-- phai admin (danh sai app_key khong vo tinh tat het kiem tra). Admin (sa)
-- luon true, dung nguyen tac da ap dung o a_ListAppsForUser.
CREATE OR REPLACE FUNCTION public."a_UserHasAppAccess"(p_user_id varchar, p_app_key varchar)
RETURNS boolean
LANGUAGE plpgsql AS $$
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
END; $$;
