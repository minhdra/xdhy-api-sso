import crypto from 'crypto';

import nodemailer from 'nodemailer';
import { injectable } from 'tsyringe';
import { v4 as uuidv4 } from 'uuid';

import { toPublicAvatarUrl } from '../config/avatarUpload';
import { config } from '../config/config';
import { AppError } from '../errors/AppError';
import { OrgRepository, type PagedRows } from '../repositories/orgRepository';
import { SessionRepository } from '../repositories/sessionRepository';
import { type OutboxEvent } from '../repositories/syncOutboxRepository';
import {
  type CreateUserInput,
  type UpdateUserInput,
  type UpsertBranchInput,
  type UpsertDepartmentInput,
  type UpsertPositionInput,
  type UpsertRoleInput,
} from '../schemas/adminOrg.schema';
import { hashPassword } from '../utilities/password';

import { SyncService } from './syncService';

// Mật khẩu ban đầu khi admin tạo user không nhập (form SSO đã bỏ ô mật khẩu) -
// admin báo cho người dùng, người dùng tự đổi ở trang Tài khoản > Mật khẩu.
export const DEFAULT_NEW_PASSWORD = '123456';

// role_code của nhóm "Quản trị hệ thống" - chốt chặn admin (a_IsUserAdmin).
const ADMIN_ROLE_CODE = 'sa';

// Lỗi nghiệp vụ proc (p_error_code != 0) -> Database throw Error(message) ->
// quy về 400. Lỗi hệ thống (SQLSTATE ...) vẫn 400 kèm message proc - giống
// appService.toAppError.
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  // 2 request đồng thời cùng SĐT lọt qua bước kiểm tra -> index unique chặn.
  if (error instanceof Error && error.message.includes('ux_user_profiles_phone_active')) {
    return new AppError(409, 'Số điện thoại này đã được dùng cho tài khoản khác. Vui lòng dùng số khác.', {
      code: 'PHONE_TAKEN',
      field: 'phone_number',
    });
  }
  if (error instanceof Error && error.message.includes('ux_user_profiles_email_active')) {
    return new AppError(409, 'Email này đã được dùng cho tài khoản khác. Vui lòng dùng email khác.', {
      code: 'EMAIL_TAKEN',
      field: 'email',
    });
  }
  if (error instanceof Error) return new AppError(400, error.message);
  return new AppError(500, 'Lỗi không xác định.');
}

function splitFullName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first_name: '', middle_name: '', last_name: parts[0] ?? '' };
  if (parts.length === 2) return { first_name: parts[0], middle_name: '', last_name: parts[1] };
  return { first_name: parts[0], middle_name: parts.slice(1, -1).join(' '), last_name: parts[parts.length - 1] };
}

function paged(result: PagedRows, pageIndex: number, pageSize: number) {
  return {
    totalItems: result.record_count,
    page: pageIndex,
    pageSize,
    pageCount: Math.ceil(result.record_count / (pageSize || 1)),
    data: result.rows,
  };
}

// Mật khẩu ngẫu nhiên cho "đặt lại mật khẩu" (admin) - crypto thay vì
// Math.random như api-core cũ.
function randomPassword(length = 10): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

@injectable()
export class OrgService {
  constructor(
    private repo: OrgRepository,
    private sessions: SessionRepository,
    private sync: SyncService,
  ) {}

  // ===== Người dùng =====
  async searchUsers(input: {
    pageIndex: number;
    pageSize: number;
    search_content: string;
    branch_id: number | null;
    department_id: number | null;
  }) {
    const result = await this.repo.searchUser(input);
    result.rows = result.rows.map((r) => ({ ...r, avatar: toPublicAvatarUrl(r.avatar) }));
    return paged(result, input.pageIndex, input.pageSize);
  }

  async getUser(userId: string) {
    const user = await this.repo.getUserDetail(userId);
    if (!user) throw new AppError(404, 'Không tìm thấy người dùng.');
    return { ...user, avatar: toPublicAvatarUrl(user.avatar) };
  }

  async createUser(input: CreateUserInput, actorId: string): Promise<string> {
    if (await this.repo.userNameExists(input.user_name)) {
      throw new AppError(400, 'Tên đăng nhập đã tồn tại.');
    }
    // Trùng với tài khoản đã xoá mềm: hỏi admin khôi phục hay tạo mới. Khôi phục
    // giữ user_id -> các app nhận sync upsert theo id tự bật lại user cũ (kể cả
    // chat/meeting, nơi email/SĐT có ràng buộc unique, không tạo bản ghi mới).
    const deleted = await this.repo.findDeletedByUserName(input.user_name);
    if (deleted && !input.deleted_user_action) {
      throw new AppError(409, 'Tên đăng nhập trùng với một tài khoản đã xoá.', {
        code: 'DELETED_USER_EXISTS',
        deleted_user: deleted,
      });
    }
    // Khôi phục giữ user_id cũ -> loại chính nó khi kiểm tra trùng SĐT.
    const restoring = deleted && input.deleted_user_action === 'restore';
    await this.assertContactAvailable(input, restoring ? deleted.user_id : null).catch((error: unknown) => {
      // Khôi phục bị chặn vì SĐT/email đã thuộc người khác -> nói rõ là không
      // khôi phục được (admin đổi SĐT/email trong form rồi khôi phục lại).
      if (restoring && error instanceof AppError) {
        throw new AppError(error.statusCode, `Không thể khôi phục tài khoản "${deleted.user_name}": ${error.message}`, error.data);
      }
      throw error;
    });
    if (restoring) {
      return this.restoreDeletedUser(deleted.user_id, input, actorId);
    }
    const userId = uuidv4();
    try {
      await this.repo.createUser({
        user_id: userId,
        user_name: input.user_name,
        password: await hashPassword(input.password || DEFAULT_NEW_PASSWORD),
        branch_id: input.branch_id,
        department_id: input.department_id,
        position_id: input.position_id,
        type: input.type,
        description: input.description,
        ...splitFullName(input.full_name),
        full_name: input.full_name.trim(),
        gender: input.gender,
        date_of_birth: input.date_of_birth ?? null,
        email: input.email,
        phone_number: input.phone_number,
        created_by_user_id: actorId,
      });
      if (input.role_ids?.length) await this.writeUserRoles(userId, input.role_ids, actorId);
    } catch (error) {
      throw toAppError(error);
    }
    const events: OutboxEvent[] = [{ entity: 'user', op: 'upsert', entity_id: userId }];
    if (input.role_ids?.length) events.push({ entity: 'user_roles', op: 'upsert', entity_id: userId });
    // Tạo mới đè tên của tài khoản đã xoá: gửi lại "xoá" tài khoản cũ TRƯỚC để
    // chat/meeting nhả nickname/email/SĐT cũ (SyncService.deliverUserOnly) -
    // tài khoản xoá trước bản sửa 04/10/2026 vẫn còn giữ các giá trị đó.
    if (deleted) events.unshift({ entity: 'user', op: 'delete', entity_id: deleted.user_id });
    await this.releaseDeletedContacts(input, actorId);
    await this.sync.notify(events, actorId);
    return userId;
  }

  private async restoreDeletedUser(userId: string, input: CreateUserInput, actorId: string): Promise<string> {
    try {
      // Ghi hồ sơ (SĐT mới) TRƯỚC khi bật lại: SĐT cũ của tài khoản đã xoá có
      // thể đã thuộc người khác -> bật lại trước sẽ vướng index SĐT duy nhất.
      await this.repo.updateUser({
        user_id: userId,
        branch_id: input.branch_id,
        department_id: input.department_id,
        position_id: input.position_id,
        type: input.type,
        description: input.description,
        ...splitFullName(input.full_name),
        full_name: input.full_name.trim(),
        avatar: await this.rawAvatar(userId),
        gender: input.gender,
        date_of_birth: input.date_of_birth ?? null,
        email: input.email,
        phone_number: input.phone_number,
        lu_user_id: actorId,
      });
      await this.repo.restoreUser(userId, await hashPassword(input.password || DEFAULT_NEW_PASSWORD), actorId);
      // Nhóm quyền cũ đã bị tắt lúc xoá - ghi lại đúng theo form (rỗng = không nhóm).
      await this.writeUserRoles(userId, input.role_ids ?? [], actorId);
    } catch (error) {
      throw toAppError(error);
    }
    await this.releaseDeletedContacts(input, actorId);
    await this.sync.notify(
      [
        { entity: 'user', op: 'upsert', entity_id: userId },
        { entity: 'user_roles', op: 'upsert', entity_id: userId },
      ],
      actorId,
    );
    return userId;
  }

  async updateUser(input: UpdateUserInput, actorId: string): Promise<void> {
    const current = await this.repo.getUserDetail(input.user_id);
    if (!current) throw new AppError(404, 'Không tìm thấy người dùng.');
    if (input.role_ids) await this.assertNotRemovingOwnAdmin(input.user_id, input.role_ids, actorId);
    await this.assertContactAvailable(input, input.user_id);
    try {
      await this.repo.updateUser({
        user_id: input.user_id,
        branch_id: input.branch_id,
        department_id: input.department_id,
        position_id: input.position_id,
        type: input.type,
        description: input.description,
        ...splitFullName(input.full_name),
        full_name: input.full_name.trim(),
        // Form quản trị không sửa avatar - giữ nguyên path thô trong DB.
        avatar: await this.rawAvatar(input.user_id),
        gender: input.gender,
        date_of_birth: input.date_of_birth ?? null,
        email: input.email,
        phone_number: input.phone_number,
        lu_user_id: actorId,
      });
      if (input.role_ids) await this.writeUserRoles(input.user_id, input.role_ids, actorId);
    } catch (error) {
      throw toAppError(error);
    }
    const events: OutboxEvent[] = [{ entity: 'user', op: 'upsert', entity_id: input.user_id }];
    if (input.role_ids) events.push({ entity: 'user_roles', op: 'upsert', entity_id: input.user_id });
    await this.releaseDeletedContacts(input, actorId);
    await this.sync.notify(events, actorId);
  }

  // SĐT + email duy nhất trong số người dùng đang hoạt động (migration
  // 0012/0013) - chat/meeting cũng ràng buộc unique 2 trường này. Báo rõ tài
  // khoản đang giữ để admin biết sửa ai.
  async assertContactAvailable(
    c: { phone_number?: string | null; email?: string | null },
    excludeUserId: string | null,
  ): Promise<void> {
    const checks = [
      { kind: 'phone' as const, value: c.phone_number?.trim(), label: 'Số điện thoại', code: 'PHONE_TAKEN', field: 'phone_number', other: 'số khác' },
      { kind: 'email' as const, value: c.email?.trim(), label: 'Email', code: 'EMAIL_TAKEN', field: 'email', other: 'email khác' },
    ];
    for (const k of checks) {
      if (!k.value) continue;
      const owner = await this.repo.findContactOwner(k.kind, k.value, excludeUserId);
      if (!owner) continue;
      throw new AppError(
        409,
        `${k.label} ${k.value} đã được dùng cho tài khoản "${owner.full_name || owner.user_name}" (${owner.user_name}). Vui lòng dùng ${k.other}.`,
        { code: k.code, field: k.field },
      );
    }
  }

  // Trước khi gửi user mang SĐT/email sang chat/meeting: tài khoản ĐÃ XOÁ còn
  // giữ cùng giá trị ở phía đó (xoá trước bản sửa 04/10/2026) -> xếp lệnh
  // "xoá" lại cho chúng đi TRƯỚC để nhả giá trị (SyncService.deliverUserOnly).
  async releaseDeletedContacts(
    c: { phone_number?: string | null; email?: string | null },
    actorId: string,
  ): Promise<void> {
    const ids = await this.repo.findDeletedSharingContact(c.phone_number ?? null, c.email ?? null);
    await this.sync.releaseDeletedUsers(ids, actorId);
  }

  async deleteUsers(userIds: string[], actorId: string): Promise<void> {
    if (userIds.includes(actorId)) throw new AppError(400, 'Không thể tự xoá tài khoản đang đăng nhập.');
    try {
      await this.repo.deleteUsers(userIds, actorId);
    } catch (error) {
      throw toAppError(error);
    }
    await this.sync.notify(
      userIds.map((entity_id) => ({ entity: 'user', op: 'delete', entity_id })),
      actorId,
    );
  }

  // online_flag = 1 là KHOÁ (GetUserByAccount chỉ cho đăng nhập khi = 0) -
  // khoá thì thu hồi luôn các phiên đang mở, không đợi token hết hạn.
  async lockUser(userId: string, onlineFlag: number, actorId: string): Promise<void> {
    if (userId === actorId && onlineFlag === 1) {
      throw new AppError(400, 'Không thể tự khoá tài khoản đang đăng nhập.');
    }
    try {
      await this.repo.lockUser(userId, onlineFlag, actorId);
      if (onlineFlag === 1) await this.sessions.revokeAllForUser(userId);
    } catch (error) {
      throw toAppError(error);
    }
    await this.sync.notify([{ entity: 'user', op: 'upsert', entity_id: userId }], actorId);
  }

  // Đặt lại mật khẩu ngẫu nhiên, gửi email cho user (nếu có email) và trả mật
  // khẩu mới cho admin (như api-core cũ). Mật khẩu không đồng bộ sang app.
  async resetPassword(userId: string, actorId: string): Promise<{ new_password: string; emailed: boolean }> {
    const newPassword = randomPassword();
    let email: string | null;
    try {
      email = await this.repo.resetPasswordByAdmin(userId, await hashPassword(newPassword), actorId);
    } catch (error) {
      throw toAppError(error);
    }
    let emailed = false;
    if (email) {
      try {
        await nodemailer
          .createTransport({
            service: 'gmail',
            auth: { user: config.systemEmail.email, pass: config.systemEmail.password },
          })
          .sendMail({
            from: config.systemEmail.email,
            to: email,
            subject: 'Mật khẩu mới',
            html: `<p>Xin chào,</p><p>Quản trị viên đã đặt lại mật khẩu tài khoản của bạn.</p>
                   <p>Mật khẩu mới: <b>${newPassword}</b></p><p>Vui lòng đổi mật khẩu sau khi đăng nhập.</p>`,
          });
        emailed = true;
      } catch (error) {
        console.warn('[org] gửi email mật khẩu mới thất bại:', (error as Error).message);
      }
    }
    return { new_password: newPassword, emailed };
  }

  async setUserRoles(userId: string, roleIds: string[], actorId: string): Promise<void> {
    if (!(await this.repo.getUserDetail(userId))) throw new AppError(404, 'Không tìm thấy người dùng.');
    await this.assertNotRemovingOwnAdmin(userId, roleIds, actorId);
    try {
      await this.writeUserRoles(userId, roleIds, actorId);
    } catch (error) {
      throw toAppError(error);
    }
    await this.sync.notify([{ entity: 'user_roles', op: 'upsert', entity_id: userId }], actorId);
  }

  private async writeUserRoles(userId: string, roleIds: string[], actorId: string): Promise<void> {
    const unique = [...new Set(roleIds)];
    for (const roleId of unique) {
      if (!(await this.repo.getRole(roleId))) throw new AppError(400, 'Nhóm quyền không tồn tại.');
    }
    await this.repo.replaceUserRoles(
      userId,
      unique.map((role_id) => ({ role_id, user_role_id: uuidv4() })),
      actorId,
    );
  }

  // Chống tự khoá: admin không tự gỡ nhóm "sa" của chính mình.
  private async assertNotRemovingOwnAdmin(userId: string, roleIds: string[], actorId: string): Promise<void> {
    if (userId !== actorId) return;
    const current = await this.repo.getUserDetail(userId);
    for (const roleId of current?.role_ids ?? []) {
      const role = await this.repo.getRole(roleId);
      if (role?.role_code === ADMIN_ROLE_CODE && !roleIds.includes(roleId)) {
        throw new AppError(400, 'Không thể tự gỡ nhóm quyền quản trị của chính mình.');
      }
    }
  }

  private async rawAvatar(userId: string): Promise<string | null> {
    return this.repo.getRawAvatar(userId);
  }

  // ===== Chi nhánh / phòng ban / chức vụ =====
  async searchBranches(p: { pageIndex: number; pageSize: number; search_content: string }) {
    return paged(await this.repo.searchBranch(p), p.pageIndex, p.pageSize);
  }

  branchDropdown() {
    return this.repo.branchDropdown();
  }

  async upsertBranch(input: UpsertBranchInput, actorId: string): Promise<number> {
    let id: number;
    try {
      if (input.branch_id) {
        await this.repo.updateBranch({ ...input, branch_id: input.branch_id }, actorId);
        id = input.branch_id;
      } else {
        id = await this.repo.createBranch(input, actorId);
      }
    } catch (error) {
      throw toAppError(error);
    }
    await this.sync.notify([{ entity: 'branch', op: 'upsert', entity_id: String(id) }], actorId);
    return id;
  }

  async deleteBranches(ids: number[], actorId: string): Promise<void> {
    try {
      await this.repo.deleteBranches(ids, actorId);
    } catch (error) {
      throw toAppError(error);
    }
    await this.sync.notify(
      ids.map((id) => ({ entity: 'branch', op: 'delete', entity_id: String(id) })),
      actorId,
    );
  }

  async searchDepartments(p: { pageIndex: number; pageSize: number; search_content: string }) {
    return paged(await this.repo.searchDepartment(p), p.pageIndex, p.pageSize);
  }

  departmentDropdown() {
    return this.repo.departmentDropdown();
  }

  async upsertDepartment(input: UpsertDepartmentInput, actorId: string): Promise<number> {
    let id: number;
    try {
      if (input.department_id) {
        await this.repo.updateDepartment({ ...input, department_id: input.department_id }, actorId);
        id = input.department_id;
      } else {
        id = await this.repo.createDepartment(input, actorId);
      }
    } catch (error) {
      throw toAppError(error);
    }
    await this.sync.notify([{ entity: 'department', op: 'upsert', entity_id: String(id) }], actorId);
    return id;
  }

  async deleteDepartments(ids: number[], actorId: string): Promise<void> {
    try {
      await this.repo.deleteDepartments(ids, actorId);
    } catch (error) {
      throw toAppError(error);
    }
    await this.sync.notify(
      ids.map((id) => ({ entity: 'department', op: 'delete', entity_id: String(id) })),
      actorId,
    );
  }

  async searchPositions(p: { pageIndex: number; pageSize: number; search_content: string }) {
    return paged(await this.repo.searchPosition(p), p.pageIndex, p.pageSize);
  }

  positionDropdown() {
    return this.repo.positionDropdown();
  }

  async upsertPosition(input: UpsertPositionInput, actorId: string): Promise<number> {
    let id: number;
    try {
      if (input.position_id) {
        await this.repo.updatePosition({ ...input, position_id: input.position_id }, actorId);
        id = input.position_id;
      } else {
        id = await this.repo.createPosition(input, actorId);
      }
    } catch (error) {
      throw toAppError(error);
    }
    await this.sync.notify([{ entity: 'position', op: 'upsert', entity_id: String(id) }], actorId);
    return id;
  }

  async deletePositions(ids: number[], actorId: string): Promise<void> {
    try {
      await this.repo.deletePositions(ids, actorId);
    } catch (error) {
      throw toAppError(error);
    }
    await this.sync.notify(
      ids.map((id) => ({ entity: 'position', op: 'delete', entity_id: String(id) })),
      actorId,
    );
  }

  // ===== Nhóm quyền =====
  async searchRoles(p: { pageIndex: number; pageSize: number; search_content: string }) {
    return paged(await this.repo.searchRole(p), p.pageIndex, p.pageSize);
  }

  roleDropdown() {
    return this.repo.roleDropdown();
  }

  async upsertRole(input: UpsertRoleInput, actorId: string): Promise<string> {
    const roleId = input.role_id || uuidv4();
    if (await this.repo.roleCodeTaken(input.role_code, input.role_id ?? null)) {
      throw new AppError(400, 'Mã nhóm quyền đã tồn tại.');
    }
    try {
      if (input.role_id) {
        const current = await this.repo.getRole(input.role_id);
        if (!current) throw new AppError(404, 'Không tìm thấy nhóm quyền.');
        if (current.role_code === ADMIN_ROLE_CODE && input.role_code !== ADMIN_ROLE_CODE) {
          throw new AppError(400, 'Không được đổi mã của nhóm quyền quản trị hệ thống.');
        }
        await this.repo.updateRole({ ...input, role_id: roleId }, actorId);
      } else {
        await this.repo.createRole({ ...input, role_id: roleId }, actorId);
      }
    } catch (error) {
      throw toAppError(error);
    }
    await this.sync.notify([{ entity: 'role', op: 'upsert', entity_id: roleId }], actorId);
    return roleId;
  }

  async deleteRoles(roleIds: string[], actorId: string): Promise<void> {
    for (const roleId of roleIds) {
      const role = await this.repo.getRole(roleId);
      if (role?.role_code === ADMIN_ROLE_CODE) {
        throw new AppError(400, 'Không được xoá nhóm quyền quản trị hệ thống.');
      }
    }
    try {
      await this.repo.deleteRoles(roleIds, actorId);
    } catch (error) {
      throw toAppError(error);
    }
    await this.sync.notify(
      roleIds.map((id) => ({ entity: 'role', op: 'delete', entity_id: id })),
      actorId,
    );
  }
}
