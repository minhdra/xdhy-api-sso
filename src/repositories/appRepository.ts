import { injectable } from 'tsyringe';

import { Database } from '../config/database';

export interface SsoApp {
  app_id: string;
  app_key: string;
  app_name: string;
  description: string | null;
  url: string;
  color: string;
  icon: string | null;
}

export interface SsoAppAdmin extends SsoApp {
  sort_order: number;
  direct_access_count: number;
  eligible_user_count: number;
  effective_access_count: number;
}

export interface SsoAppUser {
  user_id: string;
  user_name: string;
  full_name: string;
  // Đường dẫn lưu DB (chưa phải URL gọi được) - 2 dạng: legacy "uploads\..."
  // (api-core cũ) hoặc "/api-sso/uploads/..." (mới). FE tự dựng URL đầy đủ
  // (xem sso-web/src/api.ts avatarSrc()), BE trả nguyên văn.
  avatar: string | null;
  position_name: string | null;
}

export interface SsoAppAccessCandidate extends SsoAppUser {
  position_id: number | null;
}

// Mọi thao tác ở đây chỉ CALL stored procedure (0005_app_registry.sql) -
// không viết SQL nghiệp vụ ở tầng TypeScript, theo đúng quy ước của DB này.
@injectable()
export class AppRepository {
  constructor(private db: Database) {}

  async isAdmin(userId: string): Promise<boolean> {
    const rows = await this.db.raw(`SELECT "a_IsUserAdmin"($1) AS v`, [userId]);
    return Boolean(rows[0]?.v);
  }

  // Cổng chặn thật ở backend (không chỉ ẩn/hiện UI) - app nào gọi GET
  // /me?app=<key> đều tự bảo vệ được bằng 1 hàm này. Admin luôn true, app_key
  // sai/không active luôn false cho non-admin (fail-closed) - logic nằm
  // trong DB (a_UserHasAppAccess), không lặp lại ở TS.
  async hasAccessToApp(userId: string, appKey: string): Promise<boolean> {
    const rows = await this.db.raw(`SELECT "a_UserHasAppAccess"($1, $2) AS v`, [userId, appKey]);
    return Boolean(rows[0]?.v);
  }

  async listForUser(userId: string): Promise<SsoApp[]> {
    const result = await this.db.queryList(
      `CALL "a_ListAppsForUser"($1, NULL, NULL, NULL)`,
      [userId],
    );
    return this.attachIcons(result.rows as SsoApp[]);
  }

  async adminList(): Promise<SsoAppAdmin[]> {
    const result = await this.db.queryList(`CALL "a_AdminListApps"(NULL, NULL, NULL)`, []);
    return this.attachIcons(result.rows as SsoAppAdmin[]);
  }

  private async attachIcons<T extends SsoApp>(apps: T[]): Promise<T[]> {
    if (apps.length === 0) return apps;
    const result = await this.db.queryList(`CALL "a_ListAppIcons"(NULL, NULL, NULL)`, []);
    const icons = new Map<string, string | null>(
      (result.rows as { app_id: string; icon: string | null }[]).map((row) => [row.app_id, row.icon]),
    );
    return apps.map((app) => ({ ...app, icon: icons.get(app.app_id) ?? null }));
  }

  async adminSetIcon(appId: string, icon: string, actorUserId: string): Promise<void> {
    await this.db.query(`CALL "a_AdminSetAppIcon"($1, $2, $3, NULL, NULL, NULL)`, [appId, icon, actorUserId]);
  }

  async adminUpsert(app: {
    app_id: string | null;
    app_key: string;
    app_name: string;
    description: string;
    url: string;
    color: string;
    sort_order: number;
    lu_user_id: string;
  }): Promise<{ app_id: string }> {
    return this.db.query(
      `CALL "a_AdminUpsertApp"($1,$2,$3,$4,$5,$6,$7,$8,NULL,NULL,NULL)`,
      [
        app.app_id,
        app.app_key,
        app.app_name,
        app.description,
        app.url,
        app.color,
        app.sort_order,
        app.lu_user_id,
      ],
    );
  }

  async adminDelete(appId: string, luUserId: string): Promise<void> {
    await this.db.query(`CALL "a_AdminDeleteApp"($1, $2, NULL, NULL, NULL)`, [appId, luUserId]);
  }

  async adminListAccess(appId: string): Promise<SsoAppUser[]> {
    const result = await this.db.queryList(
      `CALL "a_AdminListAppAccess"($1, NULL, NULL, NULL)`,
      [appId],
    );
    return result.rows as SsoAppUser[];
  }

  async adminSetAccess(appId: string, userIds: string[], luUserId: string): Promise<void> {
    await this.db.query(
      `CALL "a_AdminSetAppAccess"($1, $2::jsonb, $3, NULL, NULL, NULL)`,
      [appId, JSON.stringify(userIds), luUserId],
    );
  }

  async adminListAccessCandidates(
    appId: string,
    filters: { keyword: string; positionId?: number; page: number; pageSize: number },
  ): Promise<{ rows: SsoAppAccessCandidate[]; record_count: number }> {
    const result = await this.db.queryList(
      `CALL "a_AdminListAppAccessCandidates"($1, $2, $3, $4, $5, NULL, NULL, NULL)`,
      [appId, filters.keyword, filters.positionId ?? null, filters.page, filters.pageSize],
    );
    return { rows: result.rows as SsoAppAccessCandidate[], record_count: result.record_count };
  }

  async adminAddAccess(appId: string, userIds: string[], luUserId: string): Promise<number> {
    const result = await this.db.query(
      `CALL "a_AdminAddAppAccess"($1, $2::jsonb, $3, NULL, NULL, NULL)`,
      [appId, JSON.stringify(userIds), luUserId],
    );
    return Number(result?.affected ?? 0);
  }

  async adminRemoveAccess(appId: string, userIds: string[]): Promise<number> {
    const result = await this.db.query(
      `CALL "a_AdminRemoveAppAccess"($1, $2::jsonb, NULL, NULL, NULL)`,
      [appId, JSON.stringify(userIds)],
    );
    return Number(result?.affected ?? 0);
  }

  async adminListUsers(): Promise<SsoAppUser[]> {
    const result = await this.db.queryList(`CALL "a_AdminListUsers"(NULL, NULL, NULL)`, []);
    return result.rows as SsoAppUser[];
  }

  // Lọc 1 tập user_id, trả về những người được phép truy cập app_key (gồm cả
  // admin bypass) - dùng ở endpoint nội bộ POST /internal/app-access/filter.
  // a_FilterUsersWithAppAccess (0009) chỉ bọc lại a_UserHasAppAccess, không
  // lặp logic phân quyền ở TS.
  async filterUsersWithAppAccess(appKey: string, userIds: string[]): Promise<string[]> {
    const rows = await this.db.raw(
      `SELECT user_id FROM "a_FilterUsersWithAppAccess"($1, $2::jsonb)`,
      [appKey, JSON.stringify(userIds)],
    );
    return rows.map((r) => String(r.user_id));
  }
}
