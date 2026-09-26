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

// role_code của nhóm "Quản trị hệ thống" - chốt chặn admin (a_IsUserAdmin).
const ADMIN_ROLE_CODE = 'sa';

// Lỗi nghiệp vụ proc (p_error_code != 0) -> Database throw Error(message) ->
// quy về 400. Lỗi hệ thống (SQLSTATE ...) vẫn 400 kèm message proc - giống
// appService.toAppError.
function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
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
    const userId = uuidv4();
    try {
      await this.repo.createUser({
        user_id: userId,
        user_name: input.user_name,
        password: await hashPassword(input.password),
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
    await this.sync.notify(events, actorId);
    return userId;
  }

  async updateUser(input: UpdateUserInput, actorId: string): Promise<void> {
    const current = await this.repo.getUserDetail(input.user_id);
    if (!current) throw new AppError(404, 'Không tìm thấy người dùng.');
    if (input.role_ids) await this.assertNotRemovingOwnAdmin(input.user_id, input.role_ids, actorId);
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
    await this.sync.notify(events, actorId);
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
    const detail = await this.repo.getUserDetail(userId);
    return detail?.avatar ?? null;
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
