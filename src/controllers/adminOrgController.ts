import { type NextFunction, type Request, type Response } from 'express';
import { injectable } from 'tsyringe';

import { AppError } from '../errors/AppError';
import {
  type CreateUserInput,
  type IntIdsInput,
  type LockUserInput,
  type RoleIdsInput,
  type SetUserRolesInput,
  type SyncResyncInput,
  type SyncTargetInput,
  type UpdateUserInput,
  type UpsertBranchInput,
  type UpsertDepartmentInput,
  type UpsertPositionInput,
  type UpsertRoleInput,
  type UserIdInput,
  type UserIdsInput,
} from '../schemas/adminOrg.schema';
import { AvatarService } from '../services/avatarService';
import { OrgService } from '../services/orgService';
import { SyncService } from '../services/syncService';

type Handler = (req: Request, actorId: string) => Promise<unknown>;

// Controller mỏng: mọi handler cùng khuôn đọc body -> gọi service -> res.json,
// lỗi đi next() (errorHandler map AppError -> status).
function handle(fn: Handler) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await fn(req, req.userId as string));
    } catch (error) {
      next(error);
    }
  };
}

const ok = (message: string, extra: Record<string, unknown> = {}) => ({ success: true, message, ...extra });

@injectable()
export class AdminOrgController {
  constructor(
    private org: OrgService,
    private sync: SyncService,
    private avatar: AvatarService,
  ) {}

  // ===== Người dùng =====
  searchUsers = handle((req) => this.org.searchUsers(req.body));
  getUser = handle((req) => this.org.getUser(String(req.params.user_id)));
  createUser = handle(async (req, actor) =>
    ok('Đã thêm người dùng.', { user_id: await this.org.createUser(req.body as CreateUserInput, actor) }),
  );
  updateUser = handle(async (req, actor) => {
    await this.org.updateUser(req.body as UpdateUserInput, actor);
    return ok('Đã cập nhật người dùng.');
  });
  deleteUsers = handle(async (req, actor) => {
    await this.org.deleteUsers((req.body as UserIdsInput).user_ids, actor);
    return ok('Đã xoá người dùng.');
  });
  lockUser = handle(async (req, actor) => {
    const { user_id, online_flag } = req.body as LockUserInput;
    await this.org.lockUser(user_id, online_flag, actor);
    return ok('Đã cập nhật trạng thái người dùng.');
  });
  resetPassword = handle(async (req, actor) =>
    ok('Đã đặt lại mật khẩu.', await this.org.resetPassword((req.body as UserIdInput).user_id, actor)),
  );
  // multipart field "file" (avatarUpload) - admin đổi avatar hộ user.
  setUserAvatar = handle(async (req, actor) =>
    ok('Đã cập nhật ảnh đại diện.', {
      avatar: await this.avatar.replace(String(req.params.user_id), req.file, actor),
    }),
  );
  setUserRoles = handle(async (req, actor) => {
    await this.org.setUserRoles(String(req.params.user_id), (req.body as SetUserRolesInput).role_ids, actor);
    return ok('Đã cập nhật nhóm quyền.');
  });

  // ===== Chi nhánh / phòng ban / chức vụ =====
  searchBranches = handle((req) => this.org.searchBranches(req.body));
  branchDropdown = handle(() => this.org.branchDropdown());
  upsertBranch = handle(async (req, actor) =>
    ok('Đã lưu chi nhánh.', { branch_id: await this.org.upsertBranch(req.body as UpsertBranchInput, actor) }),
  );
  deleteBranches = handle(async (req, actor) => {
    await this.org.deleteBranches((req.body as IntIdsInput).ids, actor);
    return ok('Đã xoá chi nhánh.');
  });

  searchDepartments = handle((req) => this.org.searchDepartments(req.body));
  departmentDropdown = handle(() => this.org.departmentDropdown());
  upsertDepartment = handle(async (req, actor) =>
    ok('Đã lưu phòng ban.', {
      department_id: await this.org.upsertDepartment(req.body as UpsertDepartmentInput, actor),
    }),
  );
  deleteDepartments = handle(async (req, actor) => {
    await this.org.deleteDepartments((req.body as IntIdsInput).ids, actor);
    return ok('Đã xoá phòng ban.');
  });

  searchPositions = handle((req) => this.org.searchPositions(req.body));
  positionDropdown = handle(() => this.org.positionDropdown());
  upsertPosition = handle(async (req, actor) =>
    ok('Đã lưu chức vụ.', { position_id: await this.org.upsertPosition(req.body as UpsertPositionInput, actor) }),
  );
  deletePositions = handle(async (req, actor) => {
    await this.org.deletePositions((req.body as IntIdsInput).ids, actor);
    return ok('Đã xoá chức vụ.');
  });

  // ===== Nhóm quyền =====
  searchRoles = handle((req) => this.org.searchRoles(req.body));
  roleDropdown = handle(() => this.org.roleDropdown());
  upsertRole = handle(async (req, actor) =>
    ok('Đã lưu nhóm quyền.', { role_id: await this.org.upsertRole(req.body as UpsertRoleInput, actor) }),
  );
  deleteRoles = handle(async (req, actor) => {
    await this.org.deleteRoles((req.body as RoleIdsInput).role_ids, actor);
    return ok('Đã xoá nhóm quyền.');
  });

  // ===== Đồng bộ =====
  syncStatus = handle(async () => ({
    enabled_targets: this.sync.enabledTargets(),
    summary: await this.sync.summary(),
    failed: await this.sync.listFailed(null),
  }));
  syncRetry = handle(async (req) =>
    ok('Đã đưa lại vào hàng đợi.', { count: await this.sync.retryFailed((req.body as SyncTargetInput).target ?? null) }),
  );
  syncResync = handle(async (req, actor) => {
    const { target } = req.body as SyncResyncInput;
    if (!this.sync.enabledTargets().includes(target)) {
      throw new AppError(400, `Đích "${target}" đang tắt (chưa cấu hình secret).`);
    }
    return ok('Đã xếp hàng đồng bộ lại toàn bộ.', { count: await this.sync.resyncAll(target, actor) });
  });
}
