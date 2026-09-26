import { injectable } from 'tsyringe';

import { Database } from '../config/database';

export interface UserSnapshot {
  user_id: string;
  user_name: string;
  type: string | null;
  description: string | null;
  online_flag: number | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  full_name: string | null;
  avatar: string | null;
  gender: number | null;
  date_of_birth: string | null;
  email: string | null;
  phone_number: string | null;
  branch_id: number | null;
  department_id: number | null;
  position_id: number | null;
  created_by_user_id: string;
  is_admin: boolean;
}

// Đọc SNAPSHOT hiện tại của entity để worker đồng bộ gửi đi (SQL thuần, chỉ
// SELECT trên DB riêng sso_management). Entity không còn / đã xoá mềm -> null,
// worker hiểu là "xoá" ở phía app.
@injectable()
export class SyncSnapshotRepository {
  constructor(private db: Database) {}

  async user(userId: string): Promise<UserSnapshot | null> {
    const rows = await this.db.raw(
      `SELECT s.user_id, s.user_name, s.type, s.description, s.online_flag,
              u.first_name, u.middle_name, u.last_name, u.full_name, u.avatar, u.gender,
              to_char(u.date_of_birth, 'YYYY-MM-DD') AS date_of_birth, u.email, u.phone_number,
              e.branch_id, e.department_id, e.position_id, s.created_by_user_id,
              "a_IsUserAdmin"(s.user_id) AS is_admin
       FROM system_users s
       JOIN user_profiles u ON u.user_id = s.user_id
       LEFT JOIN employee e ON e.employee_id = s.user_id
       WHERE s.user_id = $1 AND s.active_flag = 1 AND u.active_flag = 1`,
      [userId],
    );
    return rows[0] ?? null;
  }

  async userRoles(userId: string): Promise<{ user_role_id: string; role_id: string; created_by_user_id: string }[]> {
    return this.db.raw(
      `SELECT ur.user_role_id, ur.role_id, ur.created_by_user_id
       FROM user_roles ur
       WHERE ur.user_id = $1 AND ur.active_flag = 1
       ORDER BY ur.created_date_time, ur.user_role_id`,
      [userId],
    );
  }

  async branch(id: string): Promise<Record<string, unknown> | null> {
    const rows = await this.db.raw(
      `SELECT branch_id, branch_name, phone, fax, address, created_by_user_id
       FROM branch WHERE branch_id = $1::int AND active_flag = 1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async department(id: string): Promise<Record<string, unknown> | null> {
    const rows = await this.db.raw(
      `SELECT department_id, department_name, phone, fax, address, created_by_user_id
       FROM department WHERE department_id = $1::int AND active_flag = 1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async position(id: string): Promise<Record<string, unknown> | null> {
    const rows = await this.db.raw(
      `SELECT position_id, position_name, description, created_by_user_id
       FROM positions WHERE position_id = $1::int AND active_flag = 1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async role(id: string): Promise<Record<string, unknown> | null> {
    const rows = await this.db.raw(
      `SELECT role_id, role_code, role_name, description, created_by_user_id
       FROM roles WHERE role_id = $1 AND active_flag = 1`,
      [id],
    );
    return rows[0] ?? null;
  }

  // Id mọi entity còn hiệu lực - cho "đồng bộ lại toàn bộ" 1 target.
  async allActiveIds(): Promise<{
    branch: string[];
    department: string[];
    position: string[];
    role: string[];
    user: string[];
  }> {
    const [rows] = await this.db.raw(
      `SELECT
         (SELECT coalesce(array_agg(branch_id::text ORDER BY branch_id), '{}') FROM branch WHERE active_flag = 1) AS branch,
         (SELECT coalesce(array_agg(department_id::text ORDER BY department_id), '{}') FROM department WHERE active_flag = 1) AS department,
         (SELECT coalesce(array_agg(position_id::text ORDER BY position_id), '{}') FROM positions WHERE active_flag = 1) AS position,
         (SELECT coalesce(array_agg(role_id ORDER BY role_id), '{}') FROM roles WHERE active_flag = 1) AS role,
         (SELECT coalesce(array_agg(user_id ORDER BY user_id), '{}') FROM system_users WHERE active_flag = 1) AS "user"`,
    );
    return rows;
  }
}
