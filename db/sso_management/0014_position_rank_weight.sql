-- 0014_position_rank_weight.sql (14/10/2026)
-- Muc dich: quan ly TRONG SO CAP BAC chuc vu (positions.rank_weight) tap trung o SSO. Truoc day cot
-- nay chi nam o DB cua app Cong viec (task_management) va khong co giao dien nao de nhap
-- (xem 0006: sso_management khong co cot nay). Tu nay:
--   * positions.rank_weight smallint NULL (so lon = cap cao, NULL = chua xep cap, 1..1000).
--   * InsertPosition / UpdatePosition nhan them p_rank_weight (kiem tra 1..1000, sai -> -400).
--   * SearchPosition tra them rank_weight va employee_count (so nhan su DANG HOAT DONG thuoc chuc vu),
--     sap theo trong so giam dan (NULL cuoi) roi theo ten.
--   * api-sso day rank_weight sang finance (build_management) va task (task_management) qua dong bo
--     chuc vu (xem api-sso/src/services/syncService.ts). Nguon chinh = DB nay.
-- DU LIEU: cot moi NULL cho moi chuc vu. Truoc khi bat dong bo moi phai chep trong so dang dung o
-- task_management sang (scripts/sso-management/backfill-position-rank-weight.js) - neu khong, lan dong
-- bo chuc vu ke tiep se ghi de trong so ben task bang NULL.
-- Ap dung: sau 0013, len DATABASE "sso_management". Chay lai an toan.
-- Rollback: DROP PROCEDURE "InsertPosition"(varchar, varchar, integer, varchar); DROP PROCEDURE "UpdatePosition"(integer, varchar, varchar, integer, varchar);
--           tao lai SearchPosition ban 0006; ALTER TABLE positions DROP COLUMN rank_weight.

ALTER TABLE public.positions ADD COLUMN IF NOT EXISTS rank_weight smallint;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'positions_rank_weight_chk') THEN
    ALTER TABLE public.positions
      ADD CONSTRAINT positions_rank_weight_chk CHECK (rank_weight IS NULL OR rank_weight BETWEEN 1 AND 1000);
  END IF;
END $$;

-- GIU NGUYEN 2 ban chu ky cu (3/4 tham so, tu 0002): doi chu ky bang overload moi (7/8 tham so) de api-sso
-- BAN CU dang chay van goi duoc trong luc deploy (migrate DB truoc, deploy code sau). Ban cu khong dong
-- vao rank_weight (Insert -> NULL, Update -> giu nguyen). Code moi: updatePosition KHONG gui rank_weight
-- thi goi ban 4 tham so (giu nguyen trong so), co gui (ke ca null = xoa) thi goi ban moi.

CREATE OR REPLACE PROCEDURE public."InsertPosition"(
  IN p_position_name character varying, IN p_description character varying, IN p_rank_weight integer,
  IN p_created_by_user_id character varying,
  OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
LANGUAGE plpgsql
AS $procedure$
DECLARE v_position_id integer;
BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        IF p_rank_weight IS NOT NULL AND (p_rank_weight < 1 OR p_rank_weight > 1000) THEN
            p_error_code := -400; p_error_message := 'Trọng số chức vụ phải là số nguyên từ 1 đến 1000 (hoặc để trống)'; RETURN;
        END IF;
        INSERT INTO positions(position_name, description, rank_weight, active_flag, created_by_user_id, created_date_time)
        VALUES (p_position_name, p_description, p_rank_weight, 1, p_created_by_user_id, now())
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

CREATE OR REPLACE PROCEDURE public."UpdatePosition"(
  IN p_position_id integer, IN p_position_name character varying, IN p_description character varying,
  IN p_rank_weight integer, IN p_lu_user_id character varying,
  OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
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
        IF p_rank_weight IS NOT NULL AND (p_rank_weight < 1 OR p_rank_weight > 1000) THEN
            p_error_code := -400; p_error_message := 'Trọng số chức vụ phải là số nguyên từ 1 đến 1000 (hoặc để trống)'; RETURN;
        END IF;
        UPDATE positions
        SET position_name = p_position_name,
            description = p_description,
            rank_weight = p_rank_weight,
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

CREATE OR REPLACE PROCEDURE public."SearchPosition"(IN p_pageindex integer, IN p_pagesize integer, IN p_search_content character varying, IN p_position_id integer, IN p_position_name character varying, IN p_description character varying, OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message character varying)
 LANGUAGE plpgsql
AS $procedure$
BEGIN
    p_result := '{}'::jsonb;
    p_error_code := 0;
    p_error_message := '';
    BEGIN
        WITH base AS (SELECT row_number() OVER (ORDER BY p.rank_weight DESC NULLS LAST, p.position_name) row_number,
                             p.position_id, p.position_name, p.description, p.rank_weight,
                             (SELECT count(*) FROM employee e
                                JOIN system_users s ON s.user_id = e.employee_id AND s.active_flag = 1
                               WHERE e.position_id = p.position_id AND e.active_flag = 1) AS employee_count
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
