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
    // Gửi thành công -> các dòng 'failed' CŨ HƠN cùng target+entity không còn ý
    // nghĩa (lần gửi này đọc snapshot hiện tại, đã mang dữ liệu mới nhất sang)
    // -> 'skipped' kèm ghi chú, khỏi đọng trong ô "Lỗi".
    async markDone(id) {
        await this.db.raw(`WITH d AS (
         UPDATE a_sync_outbox SET status = 'done', last_error = NULL, note = NULL, updated_at = now()
         WHERE id = $1
         RETURNING id, target, entity, entity_id
       )
       UPDATE a_sync_outbox o
       SET status = 'skipped', note = 'Đã đồng bộ thành công ở lần gửi sau (#' || d.id || ')', updated_at = now()
       FROM d
       WHERE o.status = 'failed' AND o.target = d.target AND o.entity = d.entity
         AND o.entity_id = d.entity_id AND o.id < d.id`, [id]);
    }
    // Backoff lũy thừa (5s, 10s, 20s ... tối đa maxBackoffSeconds); quá
    // maxAttempts -> failed. Trả trạng thái mới để worker biết có được gửi tiếp
    // dòng sau không.
    async markError(id, error, maxAttempts, maxBackoffSeconds) {
        const rows = await this.db.raw(`UPDATE a_sync_outbox
       SET attempts = attempts + 1,
           last_error = left($2, 1000),
           status = CASE WHEN attempts + 1 >= $3 THEN 'failed' ELSE 'pending' END,
           next_retry_at = now() + make_interval(secs => least($4::int, 5 * power(2, attempts)::int)),
           updated_at = now()
       WHERE id = $1
       RETURNING status`, [id, error, maxAttempts, maxBackoffSeconds]);
        return rows[0]?.status === 'failed' ? 'failed' : 'pending';
    }
    // Thực thể vừa đổi (admin sửa dữ liệu) -> dòng đang chờ thử lại của nó gửi
    // lại NGAY thay vì đợi hết backoff (vd sửa SĐT trùng xong là đi luôn).
    async wakeEntities(targets, events) {
        if (!targets.length || !events.length)
            return;
        await this.db.raw(`UPDATE a_sync_outbox o
       SET next_retry_at = now(), updated_at = now()
       FROM jsonb_array_elements($2::jsonb) e(x)
       WHERE o.status = 'pending' AND o.attempts > 0 AND o.target = ANY($1::varchar[])
         AND o.entity = e.x ->> 'entity' AND o.entity_id = e.x ->> 'entity_id'
         AND o.next_retry_at > now()`, [targets, JSON.stringify(events.map((e) => ({ entity: e.entity, entity_id: e.entity_id })))]);
    }
    async summary() {
        return this.db.raw(`WITH heads AS (
         SELECT DISTINCT ON (target) target, last_error, attempts, next_retry_at
         FROM a_sync_outbox WHERE status = 'pending' ORDER BY target, id
       )
       SELECT a.target,
              count(*) FILTER (WHERE a.status = 'pending')::int AS pending,
              count(*) FILTER (WHERE a.status = 'pending' AND a.attempts > 0)::int AS retrying,
              count(*) FILTER (WHERE a.status = 'failed')::int AS failed,
              h.last_error AS head_error,
              h.attempts AS head_attempts,
              CASE WHEN h.attempts > 0 THEN h.next_retry_at END AS head_next_retry_at,
              min(a.created_at) FILTER (WHERE a.status = 'pending') AS oldest_pending,
              max(a.updated_at) FILTER (WHERE a.status = 'done') AS last_done_at
       FROM a_sync_outbox a
       LEFT JOIN heads h ON h.target = a.target
       GROUP BY a.target, h.last_error, h.attempts, h.next_retry_at`);
    }
    // Nhật ký đồng bộ: mọi dòng outbox (mới nhất trước), kèm tên hiển thị của
    // đối tượng + người thao tác. Lọc theo đích/trạng thái/loại, tìm theo mã
    // hoặc tên.
    async history(f) {
        const where = `WHERE ($1::varchar IS NULL OR o.target = $1)
         AND ($2::varchar IS NULL OR o.status = $2)
         AND ($3::varchar IS NULL OR o.entity = $3)
         AND ($4::varchar IS NULL OR o.entity_id ILIKE '%' || $4 || '%' OR l.label ILIKE '%' || $4 || '%')`;
        const labelJoin = `LEFT JOIN LATERAL (
           SELECT CASE
             WHEN o.entity IN ('user', 'user_roles') THEN
               (SELECT coalesce(nullif(u.full_name, ''), s.user_name) || ' (' || s.user_name || ')'
                FROM system_users s LEFT JOIN user_profiles u ON u.user_id = s.user_id
                WHERE s.user_id = o.entity_id)
             WHEN o.entity = 'branch' THEN
               (SELECT branch_name FROM branch WHERE branch_id::text = o.entity_id)
             WHEN o.entity = 'department' THEN
               (SELECT department_name FROM department WHERE department_id::text = o.entity_id)
             WHEN o.entity = 'position' THEN
               (SELECT position_name FROM positions WHERE position_id::text = o.entity_id)
             WHEN o.entity = 'role' THEN
               (SELECT role_name FROM roles WHERE role_id::text = o.entity_id)
           END AS label
         ) l ON true`;
        const params = [f.target, f.status, f.entity, f.search?.trim() || null];
        const [rows, count] = await Promise.all([
            this.db.raw(`SELECT o.id::text, o.target, o.entity, o.op, o.entity_id, l.label AS entity_label, o.status,
                o.attempts, o.last_error, o.note, o.next_retry_at, o.created_at, o.updated_at,
                o.created_by, coalesce(nullif(cu.full_name, ''), cs.user_name) AS created_by_name
         FROM a_sync_outbox o
         ${labelJoin}
         LEFT JOIN system_users cs ON cs.user_id = o.created_by
         LEFT JOIN user_profiles cu ON cu.user_id = o.created_by
         ${where}
         ORDER BY o.id DESC
         LIMIT $5 OFFSET $6`, [...params, f.pageSize, (f.pageIndex - 1) * f.pageSize]),
            // Không tìm theo tên thì khỏi tra tên từng dòng khi đếm.
            this.db.raw(`SELECT count(*)::int AS total FROM a_sync_outbox o ${params[3] ? labelJoin : 'CROSS JOIN (SELECT NULL::text AS label) l'} ${where}`, params),
        ]);
        return { rows, total: count[0]?.total ?? 0 };
    }
    // "Thử lại ngay": dòng lỗi (failed) và dòng đang chờ backoff về hàng đợi,
    // gửi ngay ở lượt worker kế tiếp. Theo danh sách id hoặc theo đích (null =
    // mọi đích). Dòng đã bỏ qua chỉ thử lại khi chọn theo id.
    async retry(target, ids) {
        const rows = await this.db.raw(`UPDATE a_sync_outbox
       SET status = 'pending', attempts = 0, next_retry_at = now(), note = NULL, updated_at = now()
       WHERE ($2::bigint[] IS NULL AND ($1::varchar IS NULL OR target = $1)
              AND (status = 'failed' OR (status = 'pending' AND attempts > 0)))
          OR ($2::bigint[] IS NOT NULL AND id = ANY($2::bigint[]) AND status IN ('failed', 'pending', 'skipped'))
       RETURNING id`, [target, ids]);
        return rows.length;
    }
    // "Bỏ qua": dòng đang chờ/lỗi -> 'skipped' (không gửi nữa), hàng đợi đi tiếp.
    // Thay cho việc vào DB xoá tay dòng kẹt.
    async skip(target, ids, note) {
        const rows = await this.db.raw(`UPDATE a_sync_outbox
       SET status = 'skipped', note = left($3, 300), updated_at = now()
       WHERE status IN ('pending', 'failed')
         AND (($2::bigint[] IS NULL AND ($1::varchar IS NULL OR target = $1))
              OR ($2::bigint[] IS NOT NULL AND id = ANY($2::bigint[])))
       RETURNING id`, [target, ids, note]);
        return rows.length;
    }
    async purgeDone(retentionDays) {
        const rows = await this.db.raw(`DELETE FROM a_sync_outbox
       WHERE id IN (SELECT id FROM a_sync_outbox
                    WHERE status IN ('done', 'skipped') AND updated_at < now() - make_interval(days => $1)
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
