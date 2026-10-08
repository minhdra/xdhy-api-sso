-- 0011_sync_outbox_skip_history.sql (08/10/2026)
-- Muc dich: man "Dong bo" (sso-web) thao tac tron ven tren giao dien, khong phai vao DB:
--   * Trang thai moi 'skipped': admin "Bo qua" 1 dong / ca hang doi dang chan, hoac dong
--     'failed' cu tu dong chuyen 'skipped' khi 1 lan gui sau cung entity da thanh cong
--     (worker doc snapshot luc gui nen lan sau da dua du lieu moi nhat sang).
--   * Cot note: ly do bo qua / ghi chu hien thi trong nhat ky.
--   * Index phuc vu nhat ky (loc theo dich + trang thai, tim theo entity).
-- Ap dung: sau 0010, len DATABASE "sso_management". Chay lai an toan.
-- Rollback: UPDATE a_sync_outbox SET status = 'failed' WHERE status = 'skipped';
--   ALTER TABLE a_sync_outbox DROP CONSTRAINT ck_a_sync_outbox_status, ADD CONSTRAINT
--   ck_a_sync_outbox_status CHECK (status IN ('pending', 'done', 'failed'));
--   ALTER TABLE a_sync_outbox DROP COLUMN note; DROP INDEX idx_a_sync_outbox_history,
--   idx_a_sync_outbox_entity;

ALTER TABLE a_sync_outbox DROP CONSTRAINT IF EXISTS ck_a_sync_outbox_status;
ALTER TABLE a_sync_outbox
  ADD CONSTRAINT ck_a_sync_outbox_status CHECK (status IN ('pending', 'done', 'failed', 'skipped'));

ALTER TABLE a_sync_outbox ADD COLUMN IF NOT EXISTS note varchar(300);

-- Nhat ky: loc theo dich/trang thai, moi nhat truoc.
CREATE INDEX IF NOT EXISTS idx_a_sync_outbox_history ON a_sync_outbox (target, status, id DESC);
-- Doi dong 'failed' cu thanh 'skipped' khi entity gui thanh cong / reset backoff khi entity doi.
CREATE INDEX IF NOT EXISTS idx_a_sync_outbox_entity ON a_sync_outbox (target, entity, entity_id);

-- Job don: xoa ca dong 'skipped' cu (giong 'done').
DROP INDEX IF EXISTS idx_a_sync_outbox_done_updated;
CREATE INDEX IF NOT EXISTS idx_a_sync_outbox_finished_updated
  ON a_sync_outbox (updated_at) WHERE status IN ('done', 'skipped');
