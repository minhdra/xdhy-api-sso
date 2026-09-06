-- 0007_seed_app_access_finance_task.sql
-- Muc dich: bat enforcement /me?app= that cho build-web (app_key "finance")
-- va task-web (app_key "task") - xem build-web/src/constant/config.ts,
-- task-web/src/constant/config.ts, api-task-management/docs/
-- task_management_split_plan.md. Truoc doi nay build-web/task-web KHONG goi
-- kem ?app=, ai dang nhap cung dung duoc ca 2 - a_app_access dang RONG cho 2
-- app nay. Bat enforcement ma KHONG seed truoc se khoa nham TOAN BO cong ty
-- ngay luc deploy (dung y het canh bao da ghi o
-- technical_decisions.md muc "Chua lam (rollout...)").
-- Cap quyen CA HAI app cho MOI user active hien co - dung hanh vi truoc gio
-- (build-web chua tach, ai dang nhap cung dung duoc toan bo tinh nang ke ca
-- task). Admin (role "sa") da bypass san qua a_IsUserAdmin, khong can insert
-- rieng nhung insert luon cho dong bo/de nhin trong bang quan tri.
-- Ap dung: sau 0005 (can bang a_app + 2 app_key nay da ton tai).
-- Idempotent: ON CONFLICT DO NOTHING (PK kep app_id+user_id) - chay lai an
-- toan, khong ghi de user da bi thu quyen tay qua trang quan tri sau nay.
-- Rollback: DELETE FROM a_app_access WHERE app_id IN
--   (SELECT app_id FROM a_app WHERE app_key IN ('finance','task'));
--   (se khoa lai toan bo neu enforcement dang bat - can nhac ky truoc khi chay).

INSERT INTO a_app_access (app_id, user_id, created_by_user_id)
SELECT a.app_id, s.user_id, 'system'
FROM a_app a
CROSS JOIN system_users s
WHERE a.app_key IN ('finance', 'task')
  AND a.active_flag = 1
  AND s.active_flag = 1
ON CONFLICT (app_id, user_id) DO NOTHING;
