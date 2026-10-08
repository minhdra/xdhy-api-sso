import { injectable } from 'tsyringe';

import { config } from '../config/config';
import {
  type OutboxEvent,
  type OutboxRow,
  type SyncEntity,
  SyncOutboxRepository,
  type SyncTarget,
} from '../repositories/syncOutboxRepository';
import { SyncSnapshotRepository, type UserSnapshot } from '../repositories/syncSnapshotRepository';

const ALL_TARGETS: SyncTarget[] = ['finance', 'task', 'chat', 'meeting'];
// finance (api-core) + task dùng CHUNG hợp đồng /internal/sync/* (proc UPSERT,
// xem api-task-management/src/routes/internalSyncRouter.ts). Chat/meeting chỉ
// nhận user (hợp đồng riêng của 2 team đó).
const ORG_TARGETS: SyncTarget[] = ['finance', 'task'];
const USER_ONLY_TARGETS: SyncTarget[] = ['chat', 'meeting'];

class SyncHttpError extends Error {
  constructor(
    message: string,
    public status: number | null = null,
  ) {
    super(message);
  }
  // Phân loại để quyết định có chặn hàng đợi của đích hay không:
  //  - rejected: đích từ chối dữ liệu (4xx trừ 408/429) - gửi lại y nguyên vẫn
  //    lỗi -> 'failed' ngay, gửi tiếp dòng sau.
  //  - server: đích nhận được nhưng xử lý lỗi (500/501...) - thường cũng là lỗi
  //    dữ liệu (vd chat/meeting trả 500 khi trùng SĐT unique) -> thử vài lần
  //    rồi 'failed', KHÔNG chặn hàng đợi mãi (sự cố thật 10/2026).
  //  - unavailable: mất kết nối/timeout/502-504/408/429 - đích đang tạm sập ->
  //    giữ thứ tự, chờ backoff rồi thử lại.
  get kind(): 'rejected' | 'server' | 'unavailable' {
    const s = this.status;
    if (s === null || [408, 429, 502, 503, 504].includes(s)) return 'unavailable';
    if (s >= 500) return 'server';
    return 'rejected';
  }
}

// Hạ dữ liệu hệ thống tên "Nguyễn Văn An" -> first/middle/last như api-core cũ
// (UserService.splitFullName) - chat/meeting cần 3 phần riêng.
function splitFullName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first_name: '', middle_name: '', last_name: parts[0] ?? '' };
  if (parts.length === 2) return { first_name: parts[0], middle_name: '', last_name: parts[1] };
  return {
    first_name: parts[0],
    middle_name: parts.slice(1, -1).join(' '),
    last_name: parts[parts.length - 1],
  };
}

@injectable()
export class SyncService {
  constructor(
    private outbox: SyncOutboxRepository,
    private snapshot: SyncSnapshotRepository,
  ) {}

  // Target bật = có secret và không nằm trong SYNC_DISABLED_TARGETS.
  enabledTargets(): SyncTarget[] {
    return ALL_TARGETS.filter(
      (t) => Boolean(config.sync.targets[t].secret) && !config.sync.disabledTargets.includes(t),
    );
  }

  // Ghi sự kiện vào outbox cho mọi target bật và quan tâm entity đó. Gọi SAU
  // khi proc ghi sso_management thành công. KHÔNG throw - lỗi ghi outbox chỉ
  // log (đã có "đồng bộ lại toàn bộ" để bù), không làm hỏng thao tác chính.
  async notify(events: OutboxEvent[], actorId: string | null): Promise<void> {
    try {
      const enabled = this.enabledTargets();
      const org = enabled.filter((t) => ORG_TARGETS.includes(t));
      const userOnly = enabled.filter((t) => USER_ONLY_TARGETS.includes(t));
      await this.outbox.enqueue(org, events, actorId);
      // Chat/meeting: chỉ user; đổi nhóm quyền có thể đổi admin/user -> gửi lại user.
      const userEvents: OutboxEvent[] = events
        .filter((e) => e.entity === 'user' || e.entity === 'user_roles')
        .map((e) => (e.entity === 'user_roles' ? { ...e, entity: 'user' as SyncEntity, op: 'upsert' as const } : e));
      await this.outbox.enqueue(userOnly, userEvents, actorId);
      // Dòng cũ của chính entity này đang chờ thử lại (vd lỗi trùng SĐT vừa
      // được admin sửa) -> gửi lại ngay, không đợi hết backoff.
      await this.outbox.wakeEntities(org, events);
      await this.outbox.wakeEntities(userOnly, userEvents);
      kickSyncWorker();
    } catch (error) {
      console.error('[sync] ghi outbox thất bại:', (error as Error).message, events);
    }
  }

  // Gửi lại "xoá" user đã xoá mềm CHỈ sang chat/meeting (đích có unique
  // SĐT/email) để nhả các giá trị đó trước khi user khác dùng lại. Finance/
  // task không cần (chỉ so user đang hoạt động). Không throw, như notify().
  async releaseDeletedUsers(userIds: string[], actorId: string | null): Promise<void> {
    if (!userIds.length) return;
    try {
      const targets = this.enabledTargets().filter((t) => USER_ONLY_TARGETS.includes(t));
      await this.outbox.enqueue(
        targets,
        userIds.map((entity_id) => ({ entity: 'user' as SyncEntity, op: 'delete' as const, entity_id })),
        actorId,
      );
    } catch (error) {
      console.error('[sync] ghi outbox nhả user đã xoá thất bại:', (error as Error).message, userIds);
    }
  }

  // Đẩy lại toàn bộ dữ liệu hiện có sang 1 target (đối soát / target mới bật).
  // Thứ tự: tổ chức + nhóm quyền trước, user, rồi gán nhóm quyền.
  async resyncAll(target: SyncTarget, actorId: string): Promise<number> {
    const ids = await this.snapshot.allActiveIds();
    const events: OutboxEvent[] = [];
    const push = (entity: SyncEntity, list: string[]) =>
      list.forEach((entity_id) => events.push({ entity, op: 'upsert', entity_id }));
    if (ORG_TARGETS.includes(target)) {
      push('branch', ids.branch);
      push('department', ids.department);
      push('position', ids.position);
      push('role', ids.role);
      push('user', ids.user);
      push('user_roles', ids.user);
    } else {
      push('user', ids.user);
    }
    await this.outbox.enqueue([target], events, actorId);
    kickSyncWorker();
    return events.length;
  }

  summary() {
    return this.outbox.summary();
  }

  history(filter: Parameters<SyncOutboxRepository['history']>[0]) {
    return this.outbox.history(filter);
  }

  async retry(target: SyncTarget | null, ids: string[] | null): Promise<number> {
    const n = await this.outbox.retry(target, ids);
    kickSyncWorker();
    return n;
  }

  async skip(target: SyncTarget | null, ids: string[] | null, actorName: string): Promise<number> {
    const n = await this.outbox.skip(target, ids, `Bỏ qua bởi ${actorName}`);
    kickSyncWorker();
    return n;
  }

  purgeDone(): Promise<number> {
    return this.outbox.purgeDone(config.sync.doneRetentionDays);
  }

  // 1 lượt worker: mỗi target bật xử lý tối đa batchSize dòng, tuần tự FIFO.
  async runOnce(): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;
    await Promise.all(
      this.enabledTargets().map(async (target) => {
        for (let i = 0; i < config.sync.batchSize; i++) {
          const row = await this.outbox.claimHead(target);
          if (!row) return;
          try {
            await this.deliver(row);
            await this.outbox.markDone(row.id);
            sent++;
          } catch (error) {
            failed++;
            const message = (error as Error).message;
            console.warn(`[sync] ${target} ${row.entity}:${row.entity_id} lỗi (lần ${row.attempts + 1}): ${message}`);
            const kind = error instanceof SyncHttpError ? error.kind : 'server';
            const maxAttempts =
              kind === 'rejected' ? 1 : kind === 'server' ? config.sync.serverErrorAttempts : config.sync.maxAttempts;
            const status = await this.outbox.markError(row.id, message, maxAttempts, config.sync.maxBackoffSeconds);
            // Dòng đã 'failed' -> gửi tiếp dòng sau (admin sửa dữ liệu rồi bấm
            // "Thử lại" ở tab Đồng bộ). Còn 'pending' (đang backoff) -> giữ thứ
            // tự, target này chờ lượt sau.
            if (status === 'failed') continue;
            return;
          }
        }
      }),
    );
    return { sent, failed };
  }

  private async deliver(row: OutboxRow): Promise<void> {
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

  private async deliverOrgUser(row: OutboxRow, actor: string): Promise<void> {
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
  private async deliverUserRoles(row: OutboxRow, actor: string): Promise<void> {
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

  private async deliverOrgEntity(row: OutboxRow, actor: string): Promise<void> {
    const spec = {
      branch: { path: 'branches', idKey: 'branch_id', load: (id: string) => this.snapshot.branch(id) },
      department: { path: 'departments', idKey: 'department_id', load: (id: string) => this.snapshot.department(id) },
      position: { path: 'positions', idKey: 'position_id', load: (id: string) => this.snapshot.position(id) },
      role: { path: 'roles', idKey: 'role_id', load: (id: string) => this.snapshot.role(id) },
    }[row.entity as 'branch' | 'department' | 'position' | 'role'];

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
  private async deliverUserOnly(row: OutboxRow, actor: string): Promise<void> {
    const u = await this.snapshot.user(row.entity_id);
    if (!u) {
      // Chat/meeting xoá MỀM nhưng vẫn giữ nickname (= user_name), email, SĐT
      // với ràng buộc UNIQUE -> tạo lại người dùng cùng tên/email/SĐT bị từ chối
      // (lỗi thật 04/10/2026: "nickname must be unique"). Trước khi xoá, upsert
      // (theo id) bản ghi cũ với định danh gắn hậu tố để nhả các giá trị đó.
      // Khôi phục sau này gửi lại upsert thường -> định danh thật quay lại.
      const deleted = await this.snapshot.deletedUser(row.entity_id);
      if (deleted) await this.post(row.target, 'users', this.releasedUserPayload(deleted, actor));
      await this.post(row.target, 'users/delete', {
        json_list: [{ user_id: row.entity_id }],
        updated_by_id: actor,
      });
      return;
    }
    await this.post(row.target, 'users', this.chatUserPayload(u, actor));
  }

  private chatUserPayload(u: UserSnapshot, actor: string) {
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

  private releasedUserPayload(u: UserSnapshot, actor: string) {
    const tag = u.user_id.replace(/[^0-9a-f]/gi, '').slice(0, 8).toLowerCase();
    // SĐT giả 10 số bắt đầu "00" (số thật không có dạng này) - không trùng số thật.
    const phone = `00${String(parseInt(tag || '0', 16) % 1e8).padStart(8, '0')}`;
    return {
      ...this.chatUserPayload(u, actor),
      user_name: `${u.user_name}.del-${tag}`,
      email: u.email ? `del-${tag}.${u.email}` : `del-${tag}@deleted.invalid`,
      phone_number: phone,
      active_flag: 0,
    };
  }

  private async post(target: SyncTarget, path: string, body: unknown): Promise<void> {
    const { baseUrl, secret } = config.sync.targets[target];
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/internal/sync/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': secret },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(config.sync.requestTimeoutMs),
      });
    } catch (error) {
      throw new SyncHttpError(`POST ${path}: ${(error as Error).message}`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new SyncHttpError(`POST ${path}: HTTP ${res.status} ${text.slice(0, 300)}`, res.status);
    }
  }
}

// Worker (jobs/syncOutboxJob.ts) đăng ký hàm đánh thức - notify() gọi để gửi
// ngay thay vì chờ tới chu kỳ kế tiếp.
let wake: (() => void) | null = null;
export function registerSyncWorkerWake(fn: (() => void) | null): void {
  wake = fn;
}
function kickSyncWorker(): void {
  wake?.();
}
