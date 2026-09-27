"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncOutboxRepository = void 0;
const tsyringe_1 = require("tsyringe");
const database_1 = require("../config/database");
// Bảng a_sync_outbox (db/sso_management/0004) là bảng riêng của api-sso nên
// thao tác bằng SQL thuần, giống a_session (xem sessionRepository.ts).
let SyncOutboxRepository = class SyncOutboxRepository {
    constructor(db) {
        this.db = db;
    }
    // Gộp upsert trùng: dòng pending mới nhất cùng target+entity+entity_id đã là
    // upsert thì bỏ qua (worker đọc snapshot lúc gửi nên 1 lần là đủ). Delete
    // luôn ghi thêm để giữ đúng thứ tự.
    async enqueue(targets, events, createdBy) {
        if (!targets.length || !events.length)
            return;
        await this.db.raw(`WITH input AS (
         SELECT t.target, e.x ->> 'entity' AS entity, e.x ->> 'op' AS op,
                e.x ->> 'entity_id' AS entity_id, e.x -> 'payload' AS payload, e.ord, t.tord
         FROM unnest($1::varchar[]) WITH ORDINALITY AS t(target, tord)
         -- jsonb_to_recordset không dùng được WITH ORDINALITY kèm danh sách cột
         -- (lỗi Postgres) -> tách phần tử bằng jsonb_array_elements.
         CROSS JOIN jsonb_array_elements($2::jsonb) WITH ORDINALITY AS e(x, ord)
       )
       INSERT INTO a_sync_outbox (target, entity, op, entity_id, payload, created_by)
       SELECT i.target, i.entity, i.op, i.entity_id, nullif(i.payload, 'null'::jsonb), $3
       FROM input i
       WHERE i.op = 'delete' OR NOT EXISTS (
         SELECT 1 FROM a_sync_outbox o
         WHERE o.status = 'pending' AND o.target = i.target AND o.entity = i.entity
           AND o.entity_id = i.entity_id AND o.op = 'upsert'
           AND o.id = (SELECT max(o2.id) FROM a_sync_outbox o2
                       WHERE o2.status = 'pending' AND o2.target = i.target
                         AND o2.entity = i.entity AND o2.entity_id = i.entity_id)
       )
       ORDER BY i.ord, i.tord`, [targets, JSON.stringify(events.map((e) => ({ ...e, payload: e.payload ?? null }))), createdBy]);
    }
    // Nhận (lease 2 phút) dòng pending ĐẦU TIÊN của target nếu đã đến hạn.
    // FIFO theo target: dòng đầu chưa đến hạn (đang backoff) thì cả target chờ,
    // không gửi vượt thứ tự. Lease thay advisory lock - chạy nhiều instance
    // api-sso cũng không gửi trùng (instance khác thấy next_retry_at ở tương lai).
    async claimHead(target) {
        const rows = await this.db.raw(`UPDATE a_sync_outbox o
       SET next_retry_at = now() + interval '2 minutes', updated_at = now()
       WHERE o.id = (SELECT id FROM a_sync_outbox
                     WHERE status = 'pending' AND target = $1
                     ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED)
         AND o.next_retry_at <= now()
       RETURNING o.id::text, o.target, o.entity, o.op, o.entity_id, o.payload, o.attempts, o.created_by`, [target]);
        return rows[0] ?? null;
    }
    async markDone(id) {
        await this.db.raw(`UPDATE a_sync_outbox SET status = 'done', last_error = NULL, updated_at = now() WHERE id = $1`, [id]);
    }
    // Backoff lũy thừa (5s, 10s, 20s ... tối đa 30 phút); quá maxAttempts -> failed.
    async markError(id, error, maxAttempts) {
        await this.db.raw(`UPDATE a_sync_outbox
       SET attempts = attempts + 1,
           last_error = left($2, 1000),
           status = CASE WHEN attempts + 1 >= $3 THEN 'failed' ELSE 'pending' END,
           next_retry_at = now() + least(interval '30 minutes', interval '5 seconds' * power(2, attempts)),
           updated_at = now()
       WHERE id = $1`, [id, error, maxAttempts]);
    }
    async summary() {
        return this.db.raw(`SELECT target,
              count(*) FILTER (WHERE status = 'pending')::int AS pending,
              count(*) FILTER (WHERE status = 'failed')::int AS failed,
              (array_agg(last_error ORDER BY id DESC) FILTER (WHERE status <> 'done' AND last_error IS NOT NULL))[1] AS last_error,
              min(created_at) FILTER (WHERE status = 'pending') AS oldest_pending
       FROM a_sync_outbox
       WHERE status <> 'done'
       GROUP BY target`);
    }
    async listFailed(target, limit) {
        return this.db.raw(`SELECT id::text, target, entity, op, entity_id, attempts, last_error, created_at, updated_at
       FROM a_sync_outbox
       WHERE status = 'failed' AND ($1::varchar IS NULL OR target = $1)
       ORDER BY id DESC
       LIMIT $2`, [target, limit]);
    }
    async retryFailed(target) {
        const rows = await this.db.raw(`UPDATE a_sync_outbox
       SET status = 'pending', attempts = 0, next_retry_at = now(), updated_at = now()
       WHERE status = 'failed' AND ($1::varchar IS NULL OR target = $1)
       RETURNING id`, [target]);
        return rows.length;
    }
    async purgeDone(retentionDays) {
        const rows = await this.db.raw(`DELETE FROM a_sync_outbox
       WHERE id IN (SELECT id FROM a_sync_outbox
                    WHERE status = 'done' AND updated_at < now() - make_interval(days => $1)
                    LIMIT 5000)
       RETURNING id`, [retentionDays]);
        return rows.length;
    }
};
exports.SyncOutboxRepository = SyncOutboxRepository;
exports.SyncOutboxRepository = SyncOutboxRepository = __decorate([
    (0, tsyringe_1.injectable)(),
    __metadata("design:paramtypes", [database_1.Database])
], SyncOutboxRepository);
