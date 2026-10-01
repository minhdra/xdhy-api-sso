-- 0004_sync_outbox.sql
-- Muc dich: hang doi dong bo SSO -> cac app (finance = api-core, task, chat,
-- meeting). api-sso la nguon master user/to chuc/nhom quyen tu 26/09/2026; moi
-- thay doi ghi 1 dong/target vao day, worker (src/jobs/syncOutboxJob.ts) doc
-- theo thu tu id, doc SNAPSHOT hien tai cua entity luc gui roi goi
-- /internal/sync/* cua target. Loi -> retry backoff; qua so lan toi da ->
-- status 'failed', admin xem/thu lai o sso-web.
--
-- entity: user | user_roles | branch | department | position | role
-- op:     upsert | delete
-- entity_id: khoa cua entity (user_id / branch_id ...). user_roles theo user_id.
-- payload: chi dung cho delete (snapshot luc xoa, vd user_name cho chat) -
--          upsert luon doc lai tu DB luc gui.
--
-- Ap dung: sau 0003, len DATABASE "sso_management".
-- Rollback: DROP TABLE IF EXISTS a_sync_outbox;

CREATE TABLE IF NOT EXISTS a_sync_outbox (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  target         varchar(20)  NOT NULL,
  entity         varchar(20)  NOT NULL,
  op             varchar(10)  NOT NULL,
  entity_id      varchar(64)  NOT NULL,
  payload        jsonb,
  status         varchar(10)  NOT NULL DEFAULT 'pending',
  attempts       integer      NOT NULL DEFAULT 0,
  next_retry_at  timestamptz  NOT NULL DEFAULT now(),
  last_error     varchar(1000),
  created_by     varchar(36),
  created_at     timestamptz  NOT NULL DEFAULT now(),
  updated_at     timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT ck_a_sync_outbox_status CHECK (status IN ('pending', 'done', 'failed')),
  CONSTRAINT ck_a_sync_outbox_op CHECK (op IN ('upsert', 'delete'))
);

-- Worker: lay dong pending theo target, thu tu id.
CREATE INDEX IF NOT EXISTS idx_a_sync_outbox_pending
  ON a_sync_outbox (target, id) WHERE status = 'pending';
-- Gop upsert trung: da co dong pending cung target+entity+entity_id thi khong them.
CREATE INDEX IF NOT EXISTS idx_a_sync_outbox_dedupe
  ON a_sync_outbox (target, entity, entity_id) WHERE status = 'pending';
-- Man quan tri: loc dong failed.
CREATE INDEX IF NOT EXISTS idx_a_sync_outbox_failed
  ON a_sync_outbox (target, id) WHERE status = 'failed';
-- Job don: xoa dong done cu.
CREATE INDEX IF NOT EXISTS idx_a_sync_outbox_done_updated
  ON a_sync_outbox (updated_at) WHERE status = 'done';
