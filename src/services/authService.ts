import crypto from 'crypto';

import nodemailer from 'nodemailer';
import { injectable } from 'tsyringe';
import { v4 as uuidv4 } from 'uuid';

import { config } from '../config/config';
import { Action } from '../models/action';
import { AppRepository } from '../repositories/appRepository';
import { PasswordResetRepository } from '../repositories/passwordResetRepository';
import { SessionRepository } from '../repositories/sessionRepository';
import { UserRepository } from '../repositories/userRepository';
import { hashPassword, isBcryptHash } from '../utilities/password';
import { Tree } from '../utilities/tree';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1h

const REMEMBER_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30d - hạn dòng a_refresh_token khi remember
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7d - khi không remember

export interface LoginResult {
  sessionId: string;
  jti: string;
  remember: boolean;
  accessExpiresIn: string;
  refreshExpiresIn: string;
  user: {
    user_id: string;
    full_name: string;
    user_name: string;
    role_group: string;
  };
}

@injectable()
export class AuthService {
  constructor(
    private userRepository: UserRepository,
    private sessionRepository: SessionRepository,
    private passwordResetRepository: PasswordResetRepository,
    private treeUtility: Tree,
    private appRepository: AppRepository,
  ) {}

  async login(
    identifier: string,
    password: string,
    remember: boolean,
    meta: { userAgent?: string; ip?: string },
  ): Promise<LoginResult | null> {
    // identifier: username, email hoặc số điện thoại - quy về đúng user_name
    // trước khi đi tiếp (xem UserRepository.resolveUsername).
    const username = await this.userRepository.resolveUsername(identifier);
    if (!username) return null;

    const user = await this.userRepository.authenticate(username, password);
    if (!user) return null;

    // Nâng cấp hash cũ (MD5) lên bcrypt ngay khi đăng nhập thành công - copy
    // nguyên logic từ api-core/src/services/userService.ts (UserService.authenticate).
    // Ghi qua ResetPasswordByAdmin (proc "ChangePassword" mà bản gốc gọi KHÔNG
    // tồn tại trong build_management - đường này âm thầm hỏng mỗi lần).
    if (!isBcryptHash(user.password)) {
      try {
        const upgradedHash = await hashPassword(password);
        await this.userRepository.setPassword(user.user_id, upgradedHash, user.user_id);
      } catch (error) {
        console.error('Không nâng cấp được hash mật khẩu MD5 -> bcrypt:', error);
      }
    }

    const sessionId = uuidv4();
    const jti = uuidv4();
    const expiresAt = new Date(Date.now() + (remember ? REMEMBER_TTL_MS : DEFAULT_TTL_MS));

    await this.sessionRepository.createSession({
      sessionId,
      userId: user.user_id,
      expiresAt,
      remember,
      userAgent: meta.userAgent,
      ip: meta.ip,
    });
    await this.sessionRepository.createRefreshToken({
      jti,
      sessionId,
      userId: user.user_id,
      expiresAt,
    });

    return {
      sessionId,
      jti,
      remember,
      accessExpiresIn: remember ? '1d' : '15m',
      refreshExpiresIn: remember ? '30d' : '7d',
      user: {
        user_id: user.user_id,
        full_name: user.full_name,
        user_name: user.user_name,
        role_group: user.role_group,
      },
    };
  }

  async refresh(
    sessionId: string,
    jti: string,
  ): Promise<{
    user_id: string;
    session_id: string;
    remember: boolean;
    accessExpiresIn: string;
  } | null> {
    const row = await this.sessionRepository.getValidRefreshToken(jti);
    if (!row || row.session_id !== sessionId) return null;

    await this.sessionRepository.touchSession(row.session_id);
    return {
      user_id: row.user_id,
      session_id: row.session_id,
      remember: row.remember,
      accessExpiresIn: row.remember ? '1d' : '15m',
    };
  }

  async logout(sessionId?: string | null): Promise<void> {
    if (sessionId) {
      await this.sessionRepository.revokeSession(sessionId);
    }
  }

  // Copy nguyên logic từ api-core/src/services/userService.ts (UserService.authorize).
  async me(userId: string): Promise<any | null> {
    const user = await this.userRepository.getUserById(userId);
    if (!user) return null;

    const functions = await this.userRepository.getFunctionByUserId(user.user_id);
    const functionTree = this.treeUtility.getFunctionTree(functions, 1, '0');
    const actions = await this.userRepository.getActionByUserId(user.user_id);
    const action_results = actions.map((row) => (row as Action).action_code);
    // Dùng ở FE để hiện/ẩn tab "Quản lý ứng dụng" - tính lại mỗi lần gọi
    // (không cache trong token, xem requireAdmin.ts).
    const is_admin = await this.appRepository.isAdmin(user.user_id);

    return {
      is_admin,
      user_id: user.user_id,
      first_name: user.first_name,
      middle_name: user.middle_name,
      last_name: user.last_name,
      full_name: user.full_name,
      avatar: user.avatar,
      gender: user.gender,
      date_of_birth: user.date_of_birth,
      email: user.email,
      phone_number: user.phone_number,
      user_name: user.user_name,
      online_flag: user.online_flag,
      is_guest: user.is_guest,
      position_id: user.position_id,
      position_name: user.position_name,
      functions: functionTree,
      actions: action_results,
    };
  }

  private mailTransporter() {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: config.systemEmail.email,
        pass: config.systemEmail.password,
      },
    });
  }

  // Bước 1 của "quên mật khẩu" - chỉ cần email. KHÔNG lộ ra ngoài email này
  // có tồn tại hay không (controller luôn trả 1 message chung bất kể tìm
  // thấy hay không) - âm thầm return nếu không tìm thấy, không throw.
  async forgotPassword(email: string): Promise<void> {
    const user = await this.userRepository.findByEmail(email);
    if (!user) return;

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    // created_at và expires_at đều do PostgreSQL tính từ cùng một `now()`.
    // Không truyền Date từ Node vào cột timestamp vì timezone của process và
    // session DB có thể khác nhau, làm token vừa tạo đã bị coi là hết hạn.
    await this.passwordResetRepository.create({
      tokenHash,
      userId: user.user_id,
      ttlMs: RESET_TOKEN_TTL_MS,
    });

    const resetLink = `${config.frontendResetUrl}?token=${rawToken}`;
    const emailBody = `
      <div style="font-family:-apple-system,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fcfafc;">
        <div style="background:#ffffff;border:1px solid #e8eaed;border-radius:12px;padding:32px;">
          <h2 style="color:#16222c;margin:0 0 8px;font-size:20px;">Đặt lại mật khẩu</h2>
          <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 8px;">
            Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản XDHY của bạn
            (<b>${user.user_name}</b>). Bấm nút bên dưới để tạo mật khẩu mới.
          </p>
          <div style="text-align:center;margin:28px 0;">
            <a href="${resetLink}"
               style="display:inline-block;background:#2563a6;color:#ffffff;text-decoration:none;
                      padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;">
              Đặt lại mật khẩu
            </a>
          </div>
          <p style="color:#9a9fa6;font-size:12px;line-height:1.6;margin:0;">
            Link có hiệu lực trong 1 giờ. Nếu bạn không yêu cầu đổi mật khẩu, hãy bỏ qua email này -
            mật khẩu hiện tại vẫn giữ nguyên.
          </p>
        </div>
        <p style="color:#9a9fa6;font-size:11px;text-align:center;margin-top:16px;">© XDHY</p>
      </div>
    `;

    this.mailTransporter().sendMail(
      {
        from: `XDHY <${config.systemEmail.email}>`,
        to: email,
        subject: 'Đặt lại mật khẩu — XDHY',
        text:
          `Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản XDHY ` +
          `(${user.user_name}).\n\nĐặt lại mật khẩu tại: ${resetLink}\n\n` +
          `Link có hiệu lực trong 1 giờ. Nếu bạn không yêu cầu đổi mật khẩu, ` +
          `hãy bỏ qua email này.`,
        html: emailBody,
      },
      (err) => {
        if (err) console.error('Gửi email đặt lại mật khẩu thất bại:', err);
      },
    );
  }

  // Bước 2 - user bấm link trong email, nhập mật khẩu mới. Token 1 lần dùng
  // (đánh dấu used_at ngay sau khi đổi thành công), hết hạn sau 1h.
  async resetPasswordConfirm(token: string, newPassword: string): Promise<boolean> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const row = await this.passwordResetRepository.findValid(tokenHash);
    if (!row) return false;

    const account = await this.userRepository.getUsernameEmailById(row.user_id);
    if (!account) return false;

    const hashed = await hashPassword(newPassword);
    const changed = await this.userRepository.resetPassword(account.user_name, account.email, hashed);
    if (!changed) return false;

    await this.passwordResetRepository.markUsed(tokenHash);
    return true;
  }
}
