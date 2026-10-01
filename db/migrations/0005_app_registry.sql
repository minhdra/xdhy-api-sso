-- 0005_app_registry.sql
-- Muc dich: thay danh sach app hard-code (src/config/apps.ts) bang bang DB +
-- phan quyen theo tung nguoi dung, quan tri boi role "sa" (Quan tri he thong,
-- roles.role_code = 'sa' - da co san, dung lai dung khai niem "admin" hien co
-- trong he thong thay vi bay ra khai niem moi).
-- Tien to "a_" (module SSO/auth), theo dung quy uoc bang/proc moi da chot.
-- Ap dung: sau 0001-0004.
-- Rollback:
--   DROP FUNCTION IF EXISTS a_IsUserAdmin(varchar);
--   DROP PROCEDURE IF EXISTS a_ListAppsForUser(varchar);
--   DROP PROCEDURE IF EXISTS a_AdminListApps();
--   DROP PROCEDURE IF EXISTS a_AdminUpsertApp(varchar,varchar,varchar,varchar,varchar,varchar,integer,varchar);
--   DROP PROCEDURE IF EXISTS a_AdminDeleteApp(varchar,varchar);
--   DROP PROCEDURE IF EXISTS a_AdminListAppAccess(varchar);
--   DROP PROCEDURE IF EXISTS a_AdminSetAppAccess(varchar,jsonb,varchar);
--   DROP PROCEDURE IF EXISTS a_AdminListUsers();
--   DROP TABLE IF EXISTS a_app_access CASCADE;
--   DROP TABLE IF EXISTS a_app CASCADE;

-- ===== Bảng =====

-- Field đề xuất: app_key (slug ổn định, FE/URL không đổi dù đổi tên hiển
-- thị), app_name/description (hiển thị), url (đích chuyển hướng), color (ô
-- icon chữ cái đầu, đồng bộ cách làm hiện có), sort_order (thứ tự trang chủ),
-- active_flag + created/lu_* (đúng khuôn audit dùng xuyên suốt DB này, xem
-- department/branch/positions).
CREATE TABLE IF NOT EXISTS a_app (
  app_id              varchar(36)   PRIMARY KEY,
  app_key             varchar(50)   NOT NULL,
  app_name            varchar(150)  NOT NULL,
  description         varchar(250),
  url                 varchar(500)  NOT NULL DEFAULT '',
  color               varchar(9)    NOT NULL DEFAULT '#2563a6',
  sort_order          integer       NOT NULL DEFAULT 0,
  active_flag         integer       NOT NULL DEFAULT 1,
  created_by_user_id  varchar(36)   NOT NULL,
  created_date_time   timestamp     NOT NULL DEFAULT now(),
  lu_user_id          varchar(36),
  lu_updated          timestamp
);
-- Unique CÓ ĐIỀU KIỆN (chỉ trên dòng active) - cho phép tạo lại app_key sau
-- khi app cũ bị xoá mềm, giống cách active_flag được dùng ở nơi khác trong DB.
CREATE UNIQUE INDEX IF NOT EXISTS ux_a_app_key_active ON a_app(app_key) WHERE active_flag = 1;

-- Cấp quyền theo TỪNG NGƯỜI (không theo role) - đúng yêu cầu "mỗi ứng dụng
-- chọn người được phép truy cập". PK kép chặn cấp trùng.
CREATE TABLE IF NOT EXISTS a_app_access (
  app_id              varchar(36)  NOT NULL REFERENCES a_app(app_id),
  user_id             varchar      NOT NULL REFERENCES system_users(user_id),
  created_by_user_id  varchar(36)  NOT NULL,
  created_date_time   timestamp    NOT NULL DEFAULT now(),
  PRIMARY KEY (app_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_a_app_access_user_id ON a_app_access(user_id);

-- Seed 4 app mặc định (idempotent qua unique index app_key). url để trống -
-- admin tự điền qua giao diện quản lý, migration không đoán domain thật.
INSERT INTO a_app (app_id, app_key, app_name, description, color, sort_order, created_by_user_id)
VALUES
  (gen_random_uuid()::text, 'finance', 'Tài chính',  'Quản lý tài chính công trình',   '#2563a6', 1, 'system'),
  (gen_random_uuid()::text, 'task',    'Nhiệm vụ',   'Giao việc, theo dõi tiến độ',    '#2f7d4f', 2, 'system'),
  (gen_random_uuid()::text, 'chat',    'Trò chuyện', 'Trao đổi nội bộ theo nhóm',      '#a15a1f', 3, 'system'),
  (gen_random_uuid()::text, 'meeting', 'Cuộc họp',   'Lịch họp, phòng họp trực tuyến', '#7c6bd6', 4, 'system')
ON CONFLICT (app_key) WHERE active_flag = 1 DO NOTHING;

-- ===== Function kiểm tra quyền quản trị =====

-- "Admin" = có role active với role_code = 'sa' ("Quản trị hệ thống") - đúng
-- khái niệm ĐÃ CÓ SẴN trong roles (xem role_group do GetUserByAccount tính,
-- string_agg role_code; api-gateway/middleware/index.js cũ cũng từng định
-- nghĩa admin qua 'sa'). Không bịa khái niệm admin mới. Tính lại mỗi lần gọi
-- (không tin JWT claim) vì access token lúc /refresh chỉ ký lại {user_id},
-- không mang role_group.
CREATE OR REPLACE FUNCTION public."a_IsUserAdmin"(p_user_id varchar)
RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE v_is_admin boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON r.role_id = ur.role_id
    WHERE ur.user_id = p_user_id AND ur.active_flag = 1
      AND r.active_flag = 1 AND r.role_code = 'sa'
  ) INTO v_is_admin;
  RETURN coalesce(v_is_admin, false);
END; $$;

-- ===== Trang chủ: app user này thấy được =====
-- Admin thấy TẤT CẢ app active (tiện quản lý/kiểm tra); người khác chỉ thấy
-- app đã được cấp qua a_app_access.
CREATE OR REPLACE PROCEDURE public."a_ListAppsForUser"(
  IN p_user_id varchar,
  OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message varchar)
LANGUAGE plpgsql AS $$
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
END; $$;

-- ===== Trang quản trị =====

CREATE OR REPLACE PROCEDURE public."a_AdminListApps"(
  OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message varchar)
LANGUAGE plpgsql AS $$
BEGIN
  p_result := '{}'::jsonb; p_error_code := 0; p_error_message := '';
  BEGIN
    SELECT jsonb_build_object('rows', coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.sort_order), '[]'::jsonb))
    INTO p_result
    FROM (
      SELECT a.app_id, a.app_key, a.app_name, a.description, a.url, a.color, a.sort_order,
             (SELECT count(*) FROM a_app_access x WHERE x.app_id = a.app_id) AS access_count
      FROM a_app a
      WHERE a.active_flag = 1
    ) q;
  EXCEPTION WHEN OTHERS THEN
    p_result := '{}'::jsonb; p_error_code := -500;
    p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
  END;
END; $$;

-- p_app_id NULL/rỗng -> tạo mới; có giá trị -> cập nhật. app_key trùng (còn
-- active) khi tạo mới -> lỗi -1.
CREATE OR REPLACE PROCEDURE public."a_AdminUpsertApp"(
  IN p_app_id varchar, IN p_app_key varchar, IN p_app_name varchar,
  IN p_description varchar, IN p_url varchar, IN p_color varchar,
  IN p_sort_order integer, IN p_lu_user_id varchar,
  OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message varchar)
LANGUAGE plpgsql AS $$
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
END; $$;

-- Xoá mềm + dọn luôn quyền đã cấp (app không còn thì quyền trên app đó vô nghĩa).
CREATE OR REPLACE PROCEDURE public."a_AdminDeleteApp"(
  IN p_app_id varchar, IN p_lu_user_id varchar,
  OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message varchar)
LANGUAGE plpgsql AS $$
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
END; $$;

CREATE OR REPLACE PROCEDURE public."a_AdminListAppAccess"(
  IN p_app_id varchar,
  OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message varchar)
LANGUAGE plpgsql AS $$
BEGIN
  p_result := '{}'::jsonb; p_error_code := 0; p_error_message := '';
  BEGIN
    SELECT jsonb_build_object('rows', coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.full_name), '[]'::jsonb))
    INTO p_result
    FROM (
      SELECT s.user_id, s.user_name, u.full_name, p.position_name
      FROM a_app_access aa
      JOIN system_users s ON s.user_id = aa.user_id
      JOIN user_profiles u ON u.user_id = s.user_id
      JOIN employee e ON e.employee_id = s.user_id
      LEFT JOIN positions p ON p.position_id = e.position_id
      WHERE aa.app_id = p_app_id AND s.active_flag = 1
    ) q;
  EXCEPTION WHEN OTHERS THEN
    p_result := '{}'::jsonb; p_error_code := -500;
    p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
  END;
END; $$;

-- Thay TOÀN BỘ danh sách người được cấp quyền trên 1 app bằng p_user_ids
-- (mảng jsonb user_id) - khớp UX chọn multi-select rồi Lưu 1 lượt, không cần
-- API cộng/trừ từng người.
CREATE OR REPLACE PROCEDURE public."a_AdminSetAppAccess"(
  IN p_app_id varchar, IN p_user_ids jsonb, IN p_lu_user_id varchar,
  OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message varchar)
LANGUAGE plpgsql AS $$
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
END; $$;

-- Danh sách người dùng cho ô chọn (multi-select) ở trang quản trị.
CREATE OR REPLACE PROCEDURE public."a_AdminListUsers"(
  OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message varchar)
LANGUAGE plpgsql AS $$
BEGIN
  p_result := '{}'::jsonb; p_error_code := 0; p_error_message := '';
  BEGIN
    SELECT jsonb_build_object('rows', coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.full_name), '[]'::jsonb))
    INTO p_result
    FROM (
      SELECT s.user_id, s.user_name, u.full_name, p.position_name
      FROM system_users s
      JOIN user_profiles u ON u.user_id = s.user_id
      JOIN employee e ON e.employee_id = s.user_id
      LEFT JOIN positions p ON p.position_id = e.position_id
      WHERE s.active_flag = 1 AND u.active_flag = 1
    ) q;
  EXCEPTION WHEN OTHERS THEN
    p_result := '{}'::jsonb; p_error_code := -500;
    p_error_message := left(format('SQLSTATE %s: %s', SQLSTATE, SQLERRM), 500);
  END;
END; $$;

-- ===== Bổ sung is_admin vào hồ sơ tài khoản (0004) =====
-- CREATE OR REPLACE lại - FE dùng field này để hiện/ẩn tab "Quản lý ứng dụng".
CREATE OR REPLACE PROCEDURE public."a_GetAccountProfile"(
  IN p_user_id varchar,
  OUT p_result jsonb, OUT p_error_code integer, OUT p_error_message varchar)
LANGUAGE plpgsql AS $$
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
END; $$;
