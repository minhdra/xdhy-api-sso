-- 0006_positions_without_rank_weight.sql
-- Muc dich: sso_management khong co cot positions.rank_weight (thuoc app Cong viec, xem 0001) nhung
-- 2 proc baseline copy tu build_management van doc cot nay -> loi SQLSTATE 42703:
--   GetPositionDropdown (ORDER BY rank_weight) -> sap theo ten chuc vu.
--   SearchPosition (SELECT p.rank_weight)      -> bo cot.
-- Ap dung: sau 0005. Chay lai an toan (CREATE OR REPLACE).
-- Rollback: khong can (ban cu khong chay duoc tren DB nay).

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
                                                 ORDER BY position_name) q))
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
                             p.position_id, p.position_name, p.description
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
