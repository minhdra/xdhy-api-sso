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
  // Đích từ chối dữ liệu (400/404/409/422...) - gửi lại y nguyên vẫn lỗi. Trừ
  // 408/429 (tạm thời) và lỗi mạng/5xx (status null hoặc >= 500) thì thử lại.
  get permanent(): boolean {
    return this.status !== null && this.status >= 400 && this.status < 500 && ![408, 429].includes(this.status);
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
      kickSyncWorker();
    } catch (error) {
      console.error('[sync] ghi outbox thất bại:', (error as Error).message, events);
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

  listFailed(target: SyncTarget | null) {
    return this.outbox.listFailed(target, 200);
  }

  async retryFailed(target: SyncTarget | null): Promise<number> {
    const n = await this.outbox.retryFailed(target);
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
            // Đích từ chối dữ liệu (vd thiếu số điện thoại) -> 'failed' ngay và
            // gửi tiếp dòng sau: thử lại không có ích, và để nguyên sẽ chặn cả
            // hàng đợi của đích này hàng giờ (FIFO). Admin sửa dữ liệu rồi bấm
            // "Thử lại lỗi" ở tab Đồng bộ.
            if (error instanceof SyncHttpError && error.permanent) {
              await this.outbox.markError(row.id, message, 1);
              continue;
            }
            await this.outbox.markError(row.id, message, config.sync.maxAttempts);
            return; // lỗi tạm thời (mạng/5xx) - giữ thứ tự, target này chờ lượt sau
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
