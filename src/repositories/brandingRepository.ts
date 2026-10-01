import { injectable } from 'tsyringe';

import { Database } from '../config/database';

export const BRANDING_IMAGE_KINDS = ['logo_light', 'logo_dark', 'favicon', 'login_background'] as const;
export type BrandingImageKind = (typeof BRANDING_IMAGE_KINDS)[number];

export interface BrandingRow {
  org_name: string;
  short_name: string;
  app_name: string;
  tagline: string | null;
  login_heading: string | null;
  login_description: string | null;
  primary_color: string;
  footer_text: string | null;
  footer_links: { label: string; url: string }[];
  logo_light: string | null;
  logo_dark: string | null;
  favicon: string | null;
  login_background: string | null;
  lu_updated: string;
}

export type BrandingText = Omit<BrandingRow, BrandingImageKind | 'lu_updated'>;

// Bảng a_org_setting (db/sso_management/0007) - bảng riêng api-sso, 1 dòng,
// thao tác SQL thuần như a_session.
@injectable()
export class BrandingRepository {
  constructor(private db: Database) {}

  async get(): Promise<BrandingRow | null> {
    const rows = await this.db.raw(
      `SELECT org_name, short_name, app_name, tagline, login_heading, login_description, primary_color,
              footer_text, footer_links, logo_light, logo_dark, favicon, login_background, lu_updated
       FROM a_org_setting WHERE id = 1`,
    );
    return rows[0] ?? null;
  }

  async updateText(t: BrandingText, actor: string): Promise<void> {
    await this.db.raw(
      `UPDATE a_org_setting SET org_name = $1, short_name = $2, app_name = $3, tagline = $4,
              login_heading = $5, login_description = $6, primary_color = $7, footer_text = $8,
              footer_links = $9::jsonb, lu_user_id = $10, lu_updated = now()
       WHERE id = 1`,
      [
        t.org_name,
        t.short_name,
        t.app_name,
        t.tagline,
        t.login_heading,
        t.login_description,
        t.primary_color,
        t.footer_text,
        JSON.stringify(t.footer_links),
        actor,
      ],
    );
  }

  // kind lấy từ whitelist BRANDING_IMAGE_KINDS (không phải input thô) nên
  // ghép tên cột an toàn.
  async setImage(kind: BrandingImageKind, value: string | null, actor: string): Promise<void> {
    if (!BRANDING_IMAGE_KINDS.includes(kind)) throw new Error('kind không hợp lệ');
    await this.db.raw(
      `UPDATE a_org_setting SET ${kind} = $1, lu_user_id = $2, lu_updated = now() WHERE id = 1`,
      [value, actor],
    );
  }
}
