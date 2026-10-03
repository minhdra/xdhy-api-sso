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
exports.SyncSnapshotRepository = void 0;
const tsyringe_1 = require("tsyringe");
const database_1 = require("../config/database");
// Đọc SNAPSHOT hiện tại của entity để worker đồng bộ gửi đi (SQL thuần, chỉ
// SELECT trên DB riêng sso_management). Entity không còn / đã xoá mềm -> null,
// worker hiểu là "xoá" ở phía app.
let SyncSnapshotRepository = class SyncSnapshotRepository {
    constructor(db) {
        this.db = db;
    }
    async user(userId) {
        const rows = await this.db.raw(`SELECT s.user_id, s.user_name, s.type, s.description, s.online_flag,
              u.first_name, u.middle_name, u.last_name, u.full_name, u.avatar, u.gender,
              to_char(u.date_of_birth, 'YYYY-MM-DD') AS date_of_birth, u.email, u.phone_number,
              e.branch_id, e.department_id, e.position_id, s.created_by_user_id,
              "a_IsUserAdmin"(s.user_id) AS is_admin
       FROM system_users s
       JOIN user_profiles u ON u.user_id = s.user_id
       LEFT JOIN employee e ON e.employee_id = s.user_id
       WHERE s.user_id = $1 AND s.active_flag = 1 AND u.active_flag = 1`, [userId]);
        return rows[0] ?? null;
    }
    // User đã xoá mềm - để gửi bản "nhả định danh" sang chat/meeting (xem
    // SyncService.releasedUserPayload).
    async deletedUser(userId) {
        const rows = await this.db.raw(`SELECT s.user_id, s.user_name, s.type, s.description, s.online_flag,
              u.first_name, u.middle_name, u.last_name, u.full_name, u.avatar, u.gender,
              to_char(u.date_of_birth, 'YYYY-MM-DD') AS date_of_birth, u.email, u.phone_number,
              e.branch_id, e.department_id, e.position_id, s.created_by_user_id,
              false AS is_admin
       FROM system_users s
       LEFT JOIN user_profiles u ON u.user_id = s.user_id
       LEFT JOIN employee e ON e.employee_id = s.user_id
       WHERE s.user_id = $1 AND s.active_flag = 0`, [userId]);
        return rows[0] ?? null;
    }
    async userRoles(userId) {
        return this.db.raw(`SELECT ur.user_role_id, ur.role_id, ur.created_by_user_id
       FROM user_roles ur
       WHERE ur.user_id = $1 AND ur.active_flag = 1
       ORDER BY ur.created_date_time, ur.user_role_id`, [userId]);
    }
    async branch(id) {
        const rows = await this.db.raw(`SELECT branch_id, branch_name, phone, fax, address, created_by_user_id
       FROM branch WHERE branch_id = $1::int AND active_flag = 1`, [id]);
        return rows[0] ?? null;
    }
    async department(id) {
        const rows = await this.db.raw(`SELECT department_id, department_name, phone, fax, address, created_by_user_id
       FROM department WHERE department_id = $1::int AND active_flag = 1`, [id]);
        return rows[0] ?? null;
    }
    async position(id) {
        const rows = await this.db.raw(`SELECT position_id, position_name, description, created_by_user_id
       FROM positions WHERE position_id = $1::int AND active_flag = 1`, [id]);
        return rows[0] ?? null;
    }
    async role(id) {
        const rows = await this.db.raw(`SELECT role_id, role_code, role_name, description, created_by_user_id
       FROM roles WHERE role_id = $1 AND active_flag = 1`, [id]);
        return rows[0] ?? null;
    }
    // Id mọi entity còn hiệu lực - cho "đồng bộ lại toàn bộ" 1 target.
    async allActiveIds() {
        const [rows] = await this.db.raw(`SELECT
         (SELECT coalesce(array_agg(branch_id::text ORDER BY branch_id), '{}') FROM branch WHERE active_flag = 1) AS branch,
         (SELECT coalesce(array_agg(department_id::text ORDER BY department_id), '{}') FROM department WHERE active_flag = 1) AS department,
         (SELECT coalesce(array_agg(position_id::text ORDER BY position_id), '{}') FROM positions WHERE active_flag = 1) AS position,
         (SELECT coalesce(array_agg(role_id ORDER BY role_id), '{}') FROM roles WHERE active_flag = 1) AS role,
         (SELECT coalesce(array_agg(user_id ORDER BY user_id), '{}') FROM system_users WHERE active_flag = 1) AS "user"`);
        return rows;
    }
};
exports.SyncSnapshotRepository = SyncSnapshotRepository;
exports.SyncSnapshotRepository = SyncSnapshotRepository = __decorate([
    (0, tsyringe_1.injectable)(),
    __metadata("design:paramtypes", [database_1.Database])
], SyncSnapshotRepository);
