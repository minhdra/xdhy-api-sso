import { injectable } from 'tsyringe';

import { Database } from '../config/database';

export interface PagedRows<T = any> {
  rows: T[];
  record_count: number;
}

// Quản trị user/tổ chức/nhóm quyền trên sso_management - mọi thao tác GHI đi
// qua stored procedure. Bộ lọc Search* không dùng truyền NULL (không phải ''):
// proc so `cột ILIKE '%' || p || '%'`, cột NULL với '' ra NULL -> mất dòng (bản copy nguyên văn từ build_management, xem
// db/sso_management/0002_baseline_procs.sql), đúng chữ ký api-core từng gọi.
@injectable()
export class OrgRepository {
  constructor(private db: Database) {}

  // ===== Người dùng =====
  searchUser(p: {
    pageIndex: number;
    pageSize: number;
    search_content: string;
    branch_id: number | null;
    department_id: number | null;
  }): Promise<PagedRows> {
    return this.db.queryList(`CALL "SearchUser"($1,$2,$3,$4,$5,$6,$7,NULL,NULL,NULL)`, [
      p.pageIndex,
      p.pageSize,
      p.search_content,
      p.branch_id,
      p.department_id,
      '',
      '',
    ]);
  }

  // GetUserById không trả type/description/branch/department... đủ cho form
  // sửa -> đọc thẳng (chỉ SELECT) theo đúng cột form cần.
  async getUserDetail(userId: string): Promise<any | null> {
    const rows = await this.db.raw(
      `SELECT s.user_id, s.user_name, s.type, s.description, s.online_flag,
              u.full_name, u.avatar, u.gender, to_char(u.date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
              u.email, u.phone_number, e.branch_id, e.department_id, e.position_id,
              coalesce((SELECT array_agg(ur.role_id ORDER BY ur.role_id) FROM user_roles ur
                        JOIN roles r ON r.role_id = ur.role_id AND r.active_flag = 1
                        WHERE ur.user_id = s.user_id AND ur.active_flag = 1), '{}') AS role_ids
       FROM system_users s
       JOIN user_profiles u ON u.user_id = s.user_id
       LEFT JOIN employee e ON e.employee_id = s.user_id
       WHERE s.user_id = $1 AND s.active_flag = 1`,
      [userId],
    );
    return rows[0] ?? null;
  }

  async createUser(u: {
    user_id: string;
    user_name: string;
    password: string;
    branch_id: number;
    department_id: number;
    position_id: number;
    type: string;
    description: string;
    first_name: string;
    middle_name: string;
    last_name: string;
    full_name: string;
    gender: number | null;
    date_of_birth: string | null;
    email: string;
    phone_number: string;
    created_by_user_id: string;
  }): Promise<void> {
    await this.db.query(
      `CALL "InsertUser"($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,NULL,NULL,NULL)`,
      [
        u.branch_id,
        u.user_id, // employee_id = user_id (quy ước sẵn có)
        u.department_id,
        u.position_id,
        u.user_id,
        u.user_name,
        u.password,
        u.type,
        u.description,
        u.first_name,
        u.middle_name,
        u.last_name,
        u.full_name,
        null, // avatar - user tự đổi ở trang tài khoản
        u.gender,
        u.date_of_birth,
        u.email,
        u.phone_number,
        0, // is_guest
        u.created_by_user_id,
      ],
    );
  }

  async updateUser(u: {
    user_id: string;
    branch_id: number;
    department_id: number;
    position_id: number;
    type: string;
    description: string;
    first_name: string;
    middle_name: string;
    last_name: string;
    full_name: string;
    avatar: string | null;
    gender: number | null;
    date_of_birth: string | null;
    email: string;
    phone_number: string;
    lu_user_id: string;
  }): Promise<void> {
    await this.db.query(
      `CALL "UpdateUser"($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NULL,NULL,NULL)`,
      [
        u.branch_id,
        u.user_id,
        u.department_id,
        u.position_id,
        u.user_id,
        u.type,
        u.description,
        u.first_name,
        u.middle_name,
        u.last_name,
        u.full_name,
        u.avatar,
        u.gender,
        u.date_of_birth,
        u.email,
        u.phone_number,
        u.lu_user_id,
      ],
    );
  }

  async deleteUsers(userIds: string[], luUserId: string): Promise<void> {
    await this.db.query(`CALL "DeleteUser"($1::jsonb,$2,NULL,NULL,NULL)`, [
      JSON.stringify(userIds.map((user_id) => ({ user_id }))),
      luUserId,
    ]);
  }

  async lockUser(userId: string, onlineFlag: number, luUserId: string): Promise<void> {
    await this.db.query(`CALL "LockUser"($1,$2,$3,NULL,NULL,NULL)`, [userId, onlineFlag, luUserId]);
  }

  // Trả email của user (proc tự đọc) - null nếu user không có email.
  async resetPasswordByAdmin(userId: string, hash: string, luUserId: string): Promise<string | null> {
    const result = await this.db.query(`CALL "ResetPasswordByAdmin"($1,$2,$3,NULL,NULL,NULL)`, [
      userId,
      hash,
      luUserId,
    ]);
    return result?.email ?? null;
  }

  // Chỉ tính user đang hoạt động - user đã xoá mềm không giữ chỗ tên đăng nhập
  // (index ux_system_users_user_name_active, migration 0010).
  async userNameExists(userName: string): Promise<boolean> {
    const rows = await this.db.raw(
      `SELECT 1 FROM system_users WHERE lower(user_name) = lower($1) AND active_flag = 1 LIMIT 1`,
      [userName],
    );
    return rows.length > 0;
  }

  // Tài khoản đã xoá mềm gần nhất cùng tên đăng nhập (để hỏi admin khôi phục).
  // Path avatar thô trong DB, kể cả user đã xoá mềm (khôi phục ghi hồ sơ
  // trước khi bật lại tài khoản - getUserDetail chỉ đọc user đang hoạt động).
  async getRawAvatar(userId: string): Promise<string | null> {
    const rows = await this.db.raw(`SELECT avatar FROM user_profiles WHERE user_id = $1`, [userId]);
    return rows[0]?.avatar ?? null;
  }

  // Người dùng ĐANG HOẠT ĐỘNG khác đang giữ SĐT/email này (duy nhất - index
  // ux_user_profiles_phone_active / ux_user_profiles_email_active, migration
  // 0012/0013). Giá trị rỗng không tính; email không phân biệt hoa thường.
  async findContactOwner(
    kind: 'phone' | 'email',
    value: string,
    excludeUserId: string | null,
  ): Promise<{ user_id: string; user_name: string; full_name: string | null } | null> {
    if (!value.trim()) return null;
    const match = kind === 'phone' ? 'trim(u.phone_number) = trim($1)' : 'lower(trim(u.email)) = lower(trim($1))';
    const rows = await this.db.raw(
      `SELECT s.user_id, s.user_name, u.full_name
       FROM user_profiles u
       JOIN system_users s ON s.user_id = u.user_id AND s.active_flag = 1
       WHERE u.active_flag = 1 AND ${match}
         AND ($2::varchar IS NULL OR u.user_id <> $2)
       LIMIT 1`,
      [value, excludeUserId],
    );
    return rows[0] ?? null;
  }

  // User ĐÃ XOÁ MỀM còn mang SĐT/email này - chat/meeting có thể vẫn giữ
  // (tài khoản xoá trước bản sửa 04/10/2026) -> phải gửi lại "xoá" để nhả.
  async findDeletedSharingContact(phone: string | null, email: string | null): Promise<string[]> {
    const rows = await this.db.raw(
      `SELECT u.user_id
       FROM user_profiles u
       WHERE u.active_flag = 0
         AND ((coalesce(trim($1), '') <> '' AND trim(u.phone_number) = trim($1))
              OR (coalesce(trim($2), '') <> '' AND lower(trim(u.email)) = lower(trim($2))))`,
      [phone, email],
    );
    return rows.map((r: { user_id: string }) => r.user_id);
  }

  async findDeletedByUserName(userName: string): Promise<{
    user_id: string;
    user_name: string;
    full_name: string | null;
    email: string | null;
    phone_number: string | null;
    deleted_at: string | null;
  } | null> {
    const rows = await this.db.raw(
      `SELECT s.user_id, s.user_name, coalesce(u.full_name, e.fullname) AS full_name,
              coalesce(u.email, e.email) AS email,
              trim(coalesce(nullif(u.phone_number::text, ''), e.phone_number)) AS phone_number,
              s.lu_updated AS deleted_at
       FROM system_users s
       LEFT JOIN user_profiles u ON u.user_id = s.user_id
       LEFT JOIN employee e ON e.employee_id = s.user_id
       WHERE lower(s.user_name) = lower($1) AND s.active_flag = 0
       ORDER BY s.lu_updated DESC NULLS LAST
       LIMIT 1`,
      [userName],
    );
    return rows[0] ?? null;
  }

  async restoreUser(userId: string, hash: string, luUserId: string): Promise<void> {
    await this.db.query(`CALL "RestoreUser"($1,$2,$3,NULL,NULL,NULL)`, [userId, hash, luUserId]);
  }

  // ===== Gán nhóm quyền =====
  // "InsertUserRole" thay TOÀN BỘ nhóm quyền của user có trong danh sách.
  async replaceUserRoles(
    userId: string,
    roles: { role_id: string; user_role_id: string }[],
    actorId: string,
  ): Promise<void> {
    if (roles.length) {
      await this.db.query(`CALL "InsertUserRole"($1::jsonb,$2,NULL,NULL,NULL)`, [
        JSON.stringify(roles.map((r) => ({ ...r, user_id: userId, active_flag: 1 }))),
        actorId,
      ]);
      return;
    }
    const current = await this.db.raw(
      `SELECT role_id FROM user_roles WHERE user_id = $1 AND active_flag = 1`,
      [userId],
    );
    if (!current.length) return;
    await this.db.query(`CALL "DeleteUserRole"($1::jsonb,$2::varchar,NULL,NULL,NULL)`, [
      JSON.stringify(current.map((r: { role_id: string }) => ({ user_id: userId, role_id: r.role_id }))),
      actorId,
    ]);
  }

  // ===== Chi nhánh =====
  searchBranch(p: { pageIndex: number; pageSize: number; search_content: string }): Promise<PagedRows> {
    return this.db.queryList(`CALL "SearchBranch"($1,$2,$3,$4,$5,$6,$7,NULL,NULL,NULL)`, [
      p.pageIndex,
      p.pageSize,
      p.search_content,
      '',
      '',
      '',
      '',
    ]);
  }

  async branchDropdown(): Promise<any[]> {
    return (await this.db.queryList(`CALL "GetBranchDropdown"(NULL,NULL,NULL)`)).rows;
  }

  async createBranch(b: { branch_name: string; phone: string; fax: string; address: string }, actor: string) {
    const result = await this.db.query(`CALL "InsertBranch"($1,$2,$3,$4,$5,NULL,NULL,NULL)`, [
      b.branch_name,
      b.phone,
      b.fax,
      b.address,
      actor,
    ]);
    return Number(result?.branch_id);
  }

  async updateBranch(
    b: { branch_id: number; branch_name: string; phone: string; fax: string; address: string },
    actor: string,
  ): Promise<void> {
    await this.db.query(`CALL "UpdateBranch"($1,$2,$3,$4,$5,$6,NULL,NULL,NULL)`, [
      b.branch_id,
      b.branch_name,
      b.phone,
      b.fax,
      b.address,
      actor,
    ]);
  }

  async deleteBranches(ids: number[], actor: string): Promise<void> {
    await this.db.query(`CALL "DeleteBranchMulti"($1::jsonb,$2,NULL,NULL,NULL)`, [
      JSON.stringify(ids.map((branch_id) => ({ branch_id }))),
      actor,
    ]);
  }

  // ===== Phòng ban =====
  searchDepartment(p: { pageIndex: number; pageSize: number; search_content: string }): Promise<PagedRows> {
    return this.db.queryList(`CALL "SearchDepartment"($1,$2,$3,$4,$5,$6,$7,$8,NULL,NULL,NULL)`, [
      p.pageIndex,
      p.pageSize,
      p.search_content,
      null,
      '',
      '',
      '',
      '',
    ]);
  }

  async departmentDropdown(): Promise<any[]> {
    return (await this.db.queryList(`CALL "GetDepartmentDropdown"(NULL,NULL,NULL)`)).rows;
  }

  async createDepartment(
    d: { department_name: string; phone: string; fax: string; address: string },
    actor: string,
  ): Promise<number> {
    const result = await this.db.query(`CALL "InsertDepartment"($1,$2,$3,$4,$5,NULL,NULL,NULL)`, [
      d.department_name,
      d.phone,
      d.fax,
      d.address,
      actor,
    ]);
    return Number(result?.department_id);
  }

  async updateDepartment(
    d: { department_id: number; department_name: string; phone: string; fax: string; address: string },
    actor: string,
  ): Promise<void> {
    await this.db.query(`CALL "UpdateDepartment"($1,$2,$3,$4,$5,$6,NULL,NULL,NULL)`, [
      d.department_id,
      d.department_name,
      d.phone,
      d.fax,
      d.address,
      actor,
    ]);
  }

  async deleteDepartments(ids: number[], actor: string): Promise<void> {
    await this.db.query(`CALL "DeleteDepartmentMulti"($1::jsonb,$2,NULL,NULL,NULL)`, [
      JSON.stringify(ids.map((department_id) => ({ department_id }))),
      actor,
    ]);
  }

  // ===== Chức vụ =====
  searchPosition(p: { pageIndex: number; pageSize: number; search_content: string }): Promise<PagedRows> {
    return this.db.queryList(`CALL "SearchPosition"($1,$2,$3,$4,$5,$6,NULL,NULL,NULL)`, [
      p.pageIndex,
      p.pageSize,
      p.search_content,
      null,
      null,
      null,
    ]);
  }

  async positionDropdown(): Promise<any[]> {
    return (await this.db.queryList(`CALL "GetPositionDropdown"(NULL,NULL,NULL)`)).rows;
  }

  async createPosition(p: { position_name: string; description: string }, actor: string): Promise<number> {
    const result = await this.db.query(`CALL "InsertPosition"($1,$2,$3,NULL,NULL,NULL)`, [
      p.position_name,
      p.description,
      actor,
    ]);
    return Number(result?.position_id);
  }

  async updatePosition(
    p: { position_id: number; position_name: string; description: string },
    actor: string,
  ): Promise<void> {
    await this.db.query(`CALL "UpdatePosition"($1,$2,$3,$4,NULL,NULL,NULL)`, [
      p.position_id,
      p.position_name,
      p.description,
      actor,
    ]);
  }

  async deletePositions(ids: number[], actor: string): Promise<void> {
    await this.db.query(`CALL "DeletePositionMulti"($1::jsonb,$2,NULL,NULL,NULL)`, [
      JSON.stringify(ids.map((position_id) => ({ position_id }))),
      actor,
    ]);
  }

  // ===== Nhóm quyền =====
  searchRole(p: { pageIndex: number; pageSize: number; search_content: string }): Promise<PagedRows> {
    return this.db.queryList(`CALL "SearchRole"($1,$2,$3,$4,$5,$6,$7,NULL,NULL,NULL)`, [
      p.pageIndex,
      p.pageSize,
      p.search_content,
      null,
      null,
      null,
      null,
    ]);
  }

  async roleDropdown(): Promise<any[]> {
    return (await this.db.queryList(`CALL "GetRoleDropdown"(NULL,NULL,NULL)`)).rows;
  }

  async getRole(roleId: string): Promise<{ role_id: string; role_code: string } | null> {
    const rows = await this.db.raw(
      `SELECT role_id, role_code FROM roles WHERE role_id = $1 AND active_flag = 1`,
      [roleId],
    );
    return rows[0] ?? null;
  }

  async roleCodeTaken(roleCode: string, exceptRoleId: string | null): Promise<boolean> {
    const rows = await this.db.raw(
      `SELECT 1 FROM roles WHERE lower(role_code) = lower($1) AND active_flag = 1
         AND ($2::varchar IS NULL OR role_id <> $2) LIMIT 1`,
      [roleCode, exceptRoleId],
    );
    return rows.length > 0;
  }

  async createRole(
    r: { role_id: string; role_code: string; role_name: string; description: string },
    actor: string,
  ): Promise<void> {
    await this.db.query(`CALL "InsertRole"($1,$2,$3,$4,$5,NULL,NULL,NULL)`, [
      r.role_id,
      r.role_code,
      r.role_name,
      r.description,
      actor,
    ]);
  }

  async updateRole(
    r: { role_id: string; role_code: string; role_name: string; description: string },
    actor: string,
  ): Promise<void> {
    await this.db.query(`CALL "UpdateRole"($1,$2,$3,$4,$5,NULL,NULL,NULL)`, [
      r.role_id,
      r.role_code,
      r.role_name,
      r.description,
      actor,
    ]);
  }

  async deleteRoles(roleIds: string[], actor: string): Promise<void> {
    await this.db.query(`CALL "DeleteRole"($1::jsonb,$2,NULL,NULL,NULL)`, [
      JSON.stringify(roleIds.map((role_id) => ({ role_id }))),
      actor,
    ]);
  }

  // User đang giữ các role - để gửi lại nhóm quyền (user_roles) sang app sau
  // khi xoá role (phía app ẩn map theo role, nhưng user_roles vẫn trỏ role cũ).
  async userIdsWithRoles(roleIds: string[]): Promise<string[]> {
    const rows = await this.db.raw(
      `SELECT DISTINCT user_id FROM user_roles WHERE role_id = ANY($1) AND active_flag = 1`,
      [roleIds],
    );
    return rows.map((r: { user_id: string }) => r.user_id);
  }
}
