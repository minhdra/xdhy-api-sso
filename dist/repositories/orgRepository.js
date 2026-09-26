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
exports.OrgRepository = void 0;
const tsyringe_1 = require("tsyringe");
const database_1 = require("../config/database");
// Quản trị user/tổ chức/nhóm quyền trên sso_management - mọi thao tác GHI đi
// qua stored procedure (bản copy nguyên văn từ build_management, xem
// db/sso_management/0002_baseline_procs.sql), đúng chữ ký api-core từng gọi.
let OrgRepository = class OrgRepository {
    constructor(db) {
        this.db = db;
    }
    // ===== Người dùng =====
    searchUser(p) {
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
    async getUserDetail(userId) {
        const rows = await this.db.raw(`SELECT s.user_id, s.user_name, s.type, s.description, s.online_flag,
              u.full_name, u.avatar, u.gender, to_char(u.date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
              u.email, u.phone_number, e.branch_id, e.department_id, e.position_id,
              coalesce((SELECT array_agg(ur.role_id ORDER BY ur.role_id) FROM user_roles ur
                        JOIN roles r ON r.role_id = ur.role_id AND r.active_flag = 1
                        WHERE ur.user_id = s.user_id AND ur.active_flag = 1), '{}') AS role_ids
       FROM system_users s
       JOIN user_profiles u ON u.user_id = s.user_id
       LEFT JOIN employee e ON e.employee_id = s.user_id
       WHERE s.user_id = $1 AND s.active_flag = 1`, [userId]);
        return rows[0] ?? null;
    }
    async createUser(u) {
        await this.db.query(`CALL "InsertUser"($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,NULL,NULL,NULL)`, [
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
        ]);
    }
    async updateUser(u) {
        await this.db.query(`CALL "UpdateUser"($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NULL,NULL,NULL)`, [
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
        ]);
    }
    async deleteUsers(userIds, luUserId) {
        await this.db.query(`CALL "DeleteUser"($1::jsonb,$2,NULL,NULL,NULL)`, [
            JSON.stringify(userIds.map((user_id) => ({ user_id }))),
            luUserId,
        ]);
    }
    async lockUser(userId, onlineFlag, luUserId) {
        await this.db.query(`CALL "LockUser"($1,$2,$3,NULL,NULL,NULL)`, [userId, onlineFlag, luUserId]);
    }
    // Trả email của user (proc tự đọc) - null nếu user không có email.
    async resetPasswordByAdmin(userId, hash, luUserId) {
        const result = await this.db.query(`CALL "ResetPasswordByAdmin"($1,$2,$3,NULL,NULL,NULL)`, [
            userId,
            hash,
            luUserId,
        ]);
        return result?.email ?? null;
    }
    async userNameExists(userName) {
        const rows = await this.db.raw(`SELECT 1 FROM system_users WHERE lower(user_name) = lower($1) LIMIT 1`, [
            userName,
        ]);
        return rows.length > 0;
    }
    // ===== Gán nhóm quyền =====
    // "InsertUserRole" thay TOÀN BỘ nhóm quyền của user có trong danh sách.
    async replaceUserRoles(userId, roles, actorId) {
        if (roles.length) {
            await this.db.query(`CALL "InsertUserRole"($1::jsonb,$2,NULL,NULL,NULL)`, [
                JSON.stringify(roles.map((r) => ({ ...r, user_id: userId, active_flag: 1 }))),
                actorId,
            ]);
            return;
        }
        const current = await this.db.raw(`SELECT role_id FROM user_roles WHERE user_id = $1 AND active_flag = 1`, [userId]);
        if (!current.length)
            return;
        await this.db.query(`CALL "DeleteUserRole"($1::jsonb,$2::varchar,NULL,NULL,NULL)`, [
            JSON.stringify(current.map((r) => ({ user_id: userId, role_id: r.role_id }))),
            actorId,
        ]);
    }
    // ===== Chi nhánh =====
    searchBranch(p) {
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
    async branchDropdown() {
        return (await this.db.queryList(`CALL "GetBranchDropdown"(NULL,NULL,NULL)`)).rows;
    }
    async createBranch(b, actor) {
        const result = await this.db.query(`CALL "InsertBranch"($1,$2,$3,$4,$5,NULL,NULL,NULL)`, [
            b.branch_name,
            b.phone,
            b.fax,
            b.address,
            actor,
        ]);
        return Number(result?.branch_id);
    }
    async updateBranch(b, actor) {
        await this.db.query(`CALL "UpdateBranch"($1,$2,$3,$4,$5,$6,NULL,NULL,NULL)`, [
            b.branch_id,
            b.branch_name,
            b.phone,
            b.fax,
            b.address,
            actor,
        ]);
    }
    async deleteBranches(ids, actor) {
        await this.db.query(`CALL "DeleteBranchMulti"($1::jsonb,$2,NULL,NULL,NULL)`, [
            JSON.stringify(ids.map((branch_id) => ({ branch_id }))),
            actor,
        ]);
    }
    // ===== Phòng ban =====
    searchDepartment(p) {
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
    async departmentDropdown() {
        return (await this.db.queryList(`CALL "GetDepartmentDropdown"(NULL,NULL,NULL)`)).rows;
    }
    async createDepartment(d, actor) {
        const result = await this.db.query(`CALL "InsertDepartment"($1,$2,$3,$4,$5,NULL,NULL,NULL)`, [
            d.department_name,
            d.phone,
            d.fax,
            d.address,
            actor,
        ]);
        return Number(result?.department_id);
    }
    async updateDepartment(d, actor) {
        await this.db.query(`CALL "UpdateDepartment"($1,$2,$3,$4,$5,$6,NULL,NULL,NULL)`, [
            d.department_id,
            d.department_name,
            d.phone,
            d.fax,
            d.address,
            actor,
        ]);
    }
    async deleteDepartments(ids, actor) {
        await this.db.query(`CALL "DeleteDepartmentMulti"($1::jsonb,$2,NULL,NULL,NULL)`, [
            JSON.stringify(ids.map((department_id) => ({ department_id }))),
            actor,
        ]);
    }
    // ===== Chức vụ =====
    searchPosition(p) {
        return this.db.queryList(`CALL "SearchPosition"($1,$2,$3,$4,$5,$6,NULL,NULL,NULL)`, [
            p.pageIndex,
            p.pageSize,
            p.search_content,
            null,
            '',
            '',
        ]);
    }
    async positionDropdown() {
        return (await this.db.queryList(`CALL "GetPositionDropdown"(NULL,NULL,NULL)`)).rows;
    }
    async createPosition(p, actor) {
        const result = await this.db.query(`CALL "InsertPosition"($1,$2,$3,NULL,NULL,NULL)`, [
            p.position_name,
            p.description,
            actor,
        ]);
        return Number(result?.position_id);
    }
    async updatePosition(p, actor) {
        await this.db.query(`CALL "UpdatePosition"($1,$2,$3,$4,NULL,NULL,NULL)`, [
            p.position_id,
            p.position_name,
            p.description,
            actor,
        ]);
    }
    async deletePositions(ids, actor) {
        await this.db.query(`CALL "DeletePositionMulti"($1::jsonb,$2,NULL,NULL,NULL)`, [
            JSON.stringify(ids.map((position_id) => ({ position_id }))),
            actor,
        ]);
    }
    // ===== Nhóm quyền =====
    searchRole(p) {
        return this.db.queryList(`CALL "SearchRole"($1,$2,$3,$4,$5,$6,$7,NULL,NULL,NULL)`, [
            p.pageIndex,
            p.pageSize,
            p.search_content,
            null,
            '',
            '',
            null,
        ]);
    }
    async roleDropdown() {
        return (await this.db.queryList(`CALL "GetRoleDropdown"(NULL,NULL,NULL)`)).rows;
    }
    async getRole(roleId) {
        const rows = await this.db.raw(`SELECT role_id, role_code FROM roles WHERE role_id = $1 AND active_flag = 1`, [roleId]);
        return rows[0] ?? null;
    }
    async roleCodeTaken(roleCode, exceptRoleId) {
        const rows = await this.db.raw(`SELECT 1 FROM roles WHERE lower(role_code) = lower($1) AND active_flag = 1
         AND ($2::varchar IS NULL OR role_id <> $2) LIMIT 1`, [roleCode, exceptRoleId]);
        return rows.length > 0;
    }
    async createRole(r, actor) {
        await this.db.query(`CALL "InsertRole"($1,$2,$3,$4,$5,NULL,NULL,NULL)`, [
            r.role_id,
            r.role_code,
            r.role_name,
            r.description,
            actor,
        ]);
    }
    async updateRole(r, actor) {
        await this.db.query(`CALL "UpdateRole"($1,$2,$3,$4,$5,NULL,NULL,NULL)`, [
            r.role_id,
            r.role_code,
            r.role_name,
            r.description,
            actor,
        ]);
    }
    async deleteRoles(roleIds, actor) {
        await this.db.query(`CALL "DeleteRole"($1::jsonb,$2,NULL,NULL,NULL)`, [
            JSON.stringify(roleIds.map((role_id) => ({ role_id }))),
            actor,
        ]);
    }
    // User đang giữ các role - để gửi lại nhóm quyền (user_roles) sang app sau
    // khi xoá role (phía app ẩn map theo role, nhưng user_roles vẫn trỏ role cũ).
    async userIdsWithRoles(roleIds) {
        const rows = await this.db.raw(`SELECT DISTINCT user_id FROM user_roles WHERE role_id = ANY($1) AND active_flag = 1`, [roleIds]);
        return rows.map((r) => r.user_id);
    }
};
exports.OrgRepository = OrgRepository;
exports.OrgRepository = OrgRepository = __decorate([
    (0, tsyringe_1.injectable)(),
    __metadata("design:paramtypes", [database_1.Database])
], OrgRepository);
