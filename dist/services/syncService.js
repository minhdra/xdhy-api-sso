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
exports.SyncService = void 0;
exports.registerSyncWorkerWake = registerSyncWorkerWake;
const tsyringe_1 = require("tsyringe");
const config_1 = require("../config/config");
const syncOutboxRepository_1 = require("../repositories/syncOutboxRepository");
const syncSnapshotRepository_1 = require("../repositories/syncSnapshotRepository");
const ALL_TARGETS = ['finance', 'task', 'chat', 'meeting'];
// finance (api-core) + task dùng CHUNG hợp đồng /internal/sync/* (proc UPSERT,
// xem api-task-management/src/routes/internalSyncRouter.ts). Chat/meeting chỉ
// nhận user (hợp đồng riêng của 2 team đó).
const ORG_TARGETS = ['finance', 'task'];
const USER_ONLY_TARGETS = ['chat', 'meeting'];
class SyncHttpError extends Error {
}
// Hạ dữ liệu hệ thống tên "Nguyễn Văn An" -> first/middle/last như api-core cũ
// (UserService.splitFullName) - chat/meeting cần 3 phần riêng.
function splitFullName(fullName) {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length <= 1)
        return { first_name: '', middle_name: '', last_name: parts[0] ?? '' };
    if (parts.length === 2)
        return { first_name: parts[0], middle_name: '', last_name: parts[1] };
    return {
        first_name: parts[0],
        middle_name: parts.slice(1, -1).join(' '),
        last_name: parts[parts.length - 1],
    };
}
let SyncService = class SyncService {
    constructor(outbox, snapshot) {
        this.outbox = outbox;
        this.snapshot = snapshot;
    }
    // Target bật = có secret và không nằm trong SYNC_DISABLED_TARGETS.
    enabledTargets() {
        return ALL_TARGETS.filter((t) => Boolean(config_1.config.sync.targets[t].secret) && !config_1.config.sync.disabledTargets.includes(t));
    }
    // Ghi sự kiện vào outbox cho mọi target bật và quan tâm entity đó. Gọi SAU
    // khi proc ghi sso_management thành công. KHÔNG throw - lỗi ghi outbox chỉ
    // log (đã có "đồng bộ lại toàn bộ" để bù), không làm hỏng thao tác chính.
    async notify(events, actorId) {
        try {
            const enabled = this.enabledTargets();
            const org = enabled.filter((t) => ORG_TARGETS.includes(t));
            const userOnly = enabled.filter((t) => USER_ONLY_TARGETS.includes(t));
            await this.outbox.enqueue(org, events, actorId);
            // Chat/meeting: chỉ user; đổi nhóm quyền có thể đổi admin/user -> gửi lại user.
            const userEvents = events
                .filter((e) => e.entity === 'user' || e.entity === 'user_roles')
                .map((e) => (e.entity === 'user_roles' ? { ...e, entity: 'user', op: 'upsert' } : e));
            await this.outbox.enqueue(userOnly, userEvents, actorId);
            kickSyncWorker();
        }
        catch (error) {
            console.error('[sync] ghi outbox thất bại:', error.message, events);
        }
    }
    // Đẩy lại toàn bộ dữ liệu hiện có sang 1 target (đối soát / target mới bật).
    // Thứ tự: tổ chức + nhóm quyền trước, user, rồi gán nhóm quyền.
    async resyncAll(target, actorId) {
        const ids = await this.snapshot.allActiveIds();
        const events = [];
        const push = (entity, list) => list.forEach((entity_id) => events.push({ entity, op: 'upsert', entity_id }));
        if (ORG_TARGETS.includes(target)) {
            push('branch', ids.branch);
            push('department', ids.department);
            push('position', ids.position);
            push('role', ids.role);
            push('user', ids.user);
            push('user_roles', ids.user);
        }
        else {
            push('user', ids.user);
        }
        await this.outbox.enqueue([target], events, actorId);
        kickSyncWorker();
        return events.length;
    }
    summary() {
        return this.outbox.summary();
    }
    listFailed(target) {
        return this.outbox.listFailed(target, 200);
    }
    async retryFailed(target) {
        const n = await this.outbox.retryFailed(target);
        kickSyncWorker();
        return n;
    }
    purgeDone() {
        return this.outbox.purgeDone(config_1.config.sync.doneRetentionDays);
    }
    // 1 lượt worker: mỗi target bật xử lý tối đa batchSize dòng, tuần tự FIFO.
    async runOnce() {
        let sent = 0;
        let failed = 0;
        await Promise.all(this.enabledTargets().map(async (target) => {
            for (let i = 0; i < config_1.config.sync.batchSize; i++) {
                const row = await this.outbox.claimHead(target);
                if (!row)
                    return;
                try {
                    await this.deliver(row);
                    await this.outbox.markDone(row.id);
                    sent++;
                }
                catch (error) {
                    failed++;
                    const message = error.message;
                    console.warn(`[sync] ${target} ${row.entity}:${row.entity_id} lỗi (lần ${row.attempts + 1}): ${message}`);
                    await this.outbox.markError(row.id, message, config_1.config.sync.maxAttempts);
                    return; // giữ thứ tự - target này chờ lượt sau
                }
            }
        }));
        return { sent, failed };
    }
    async deliver(row) {
        const actor = row.created_by ?? 'system';
        if (USER_ONLY_TARGETS.includes(row.target)) {
            await this.deliverUserOnly(row, actor);
            return;
        }
        switch (row.entity) {
            case 'user':
                return this.deliverOrgUser(row, actor);
            case 'user_roles':
                return this.deliverUserRoles(row, actor);
            case 'branch':
            case 'department':
            case 'position':
            case 'role':
                return this.deliverOrgEntity(row, actor);
            default:
                throw new Error(`entity không hỗ trợ: ${row.entity}`);
        }
    }
    async deliverOrgUser(row, actor) {
        const u = await this.snapshot.user(row.entity_id);
        if (!u) {
            await this.post(row.target, 'users/delete', {
                json_list: [{ user_id: row.entity_id }],
                lu_user_id: actor,
            });
            return;
        }
        await this.post(row.target, 'users', {
            branch_id: u.branch_id,
            employee_id: u.user_id,
            department_id: u.department_id,
            position_id: u.position_id,
            user_id: u.user_id,
            user_name: u.user_name,
            type: u.type,
            description: u.description,
            first_name: u.first_name,
            middle_name: u.middle_name,
            last_name: u.last_name,
            full_name: u.full_name,
            avatar: u.avatar,
            gender: u.gender,
            date_of_birth: u.date_of_birth,
            email: u.email,
            phone_number: u.phone_number,
            created_by_user_id: actor,
        });
        await this.post(row.target, 'users/lock', {
            user_id: u.user_id,
            online_flag: u.online_flag,
            lu_user_id: actor,
        });
    }
    // "InsertUserRole" phía app THAY TOÀN BỘ nhóm quyền của user có mặt trong
    // danh sách. User không còn nhóm nào -> không biểu diễn được bằng danh sách
    // rỗng, nên gỡ theo từng cặp (user, mọi role đang có ở phía app).
    async deliverUserRoles(row, actor) {
        const roles = await this.snapshot.userRoles(row.entity_id);
        if (roles.length) {
            await this.post(row.target, 'user-roles', {
                user_role_list: roles.map((r) => ({
                    user_id: row.entity_id,
                    role_id: r.role_id,
                    user_role_id: r.user_role_id,
                    active_flag: 1,
                })),
                created_by_user_id: actor,
            });
            return;
        }
        await this.post(row.target, 'user-roles/clear', {
            user_id: row.entity_id,
            updated_by_id: actor,
        });
    }
    async deliverOrgEntity(row, actor) {
        const spec = {
            branch: { path: 'branches', idKey: 'branch_id', load: (id) => this.snapshot.branch(id) },
            department: { path: 'departments', idKey: 'department_id', load: (id) => this.snapshot.department(id) },
            position: { path: 'positions', idKey: 'position_id', load: (id) => this.snapshot.position(id) },
            role: { path: 'roles', idKey: 'role_id', load: (id) => this.snapshot.role(id) },
        }[row.entity];
        const data = await spec.load(row.entity_id);
        if (!data) {
            const id = row.entity === 'role' ? row.entity_id : Number(row.entity_id);
            await this.post(row.target, `${spec.path}/delete`, {
                json_list: [{ [spec.idKey]: id }],
                updated_by_id: actor,
            });
            return;
        }
        await this.post(row.target, spec.path, { ...data, created_by_user_id: actor });
    }
    // Hợp đồng chat/meeting (giữ nguyên như api-core gửi trước đây): POST
    // users = upsert theo user_id, POST users/delete nhận json_list.
    async deliverUserOnly(row, actor) {
        const u = await this.snapshot.user(row.entity_id);
        if (!u) {
            await this.post(row.target, 'users/delete', {
                json_list: [{ user_id: row.entity_id }],
                updated_by_id: actor,
            });
            return;
        }
        await this.post(row.target, 'users', this.chatUserPayload(u, actor));
    }
    chatUserPayload(u, actor) {
        const names = u.first_name || u.last_name ? u : splitFullName(u.full_name ?? '');
        return {
            user_id: u.user_id,
            user_name: u.user_name,
            first_name: names.first_name || names.last_name || u.user_name,
            middle_name: names.middle_name || null,
            last_name: names.last_name || u.user_name,
            email: u.email,
            phone_number: u.phone_number || '',
            avatar: u.avatar || null,
            role: u.is_admin ? 'admin' : 'user',
            active_flag: 1,
            created_by_user_id: actor,
        };
    }
    async post(target, path, body) {
        const { baseUrl, secret } = config_1.config.sync.targets[target];
        let res;
        try {
            res = await fetch(`${baseUrl}/internal/sync/${path}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': secret },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(config_1.config.sync.requestTimeoutMs),
            });
        }
        catch (error) {
            throw new SyncHttpError(`POST ${path}: ${error.message}`);
        }
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new SyncHttpError(`POST ${path}: HTTP ${res.status} ${text.slice(0, 300)}`);
        }
    }
};
exports.SyncService = SyncService;
exports.SyncService = SyncService = __decorate([
    (0, tsyringe_1.injectable)(),
    __metadata("design:paramtypes", [syncOutboxRepository_1.SyncOutboxRepository,
        syncSnapshotRepository_1.SyncSnapshotRepository])
], SyncService);
// Worker (jobs/syncOutboxJob.ts) đăng ký hàm đánh thức - notify() gọi để gửi
// ngay thay vì chờ tới chu kỳ kế tiếp.
let wake = null;
function registerSyncWorkerWake(fn) {
    wake = fn;
}
function kickSyncWorker() {
    wake?.();
}
