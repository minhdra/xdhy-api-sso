-- 0015_app_icon.sql
-- Lưu đường dẫn icon ứng dụng vào a_app thay vì chỉ suy ra từ file trong volume.
-- Áp dụng sau 0014. Có thể chạy lại an toàn.
-- Rollback tham khảo:
--   DROP PROCEDURE IF EXISTS public."a_AdminSetAppIcon"(varchar, varchar, varchar);
--   DROP PROCEDURE IF EXISTS public."a_ListAppIcons"();
--   ALTER TABLE public.a_app DROP COLUMN IF EXISTS icon;

ALTER TABLE public.a_app ADD COLUMN IF NOT EXISTS icon varchar(500);

CREATE OR REPLACE PROCEDURE public."a_ListAppIcons"(
  OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message varchar)
LANGUAGE plpgsql AS $procedure$
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

CREATE OR REPLACE PROCEDURE public."a_AdminSetAppIcon"(
  IN p_app_id varchar, IN p_icon varchar, IN p_lu_user_id varchar,
  OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message varchar)
LANGUAGE plpgsql AS $procedure$
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
