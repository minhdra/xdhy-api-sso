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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrandingService = void 0;
const crypto_1 = require("crypto");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const tsyringe_1 = require("tsyringe");
const avatarUpload_1 = require("../config/avatarUpload");
const AppError_1 = require("../errors/AppError");
const brandingRepository_1 = require("../repositories/brandingRepository");
const BRANDING_ROOT = 'uploads/branding';
// Không nhận SVG: ảnh phục vụ cùng origin với sso-web, SVG chứa script mở trực
// tiếp là XSS. Favicon cho thêm .ico.
const IMAGE_EXT = {
    logo_light: ['.png', '.jpg', '.jpeg', '.webp'],
    logo_dark: ['.png', '.jpg', '.jpeg', '.webp'],
    favicon: ['.png', '.ico'],
    login_background: ['.png', '.jpg', '.jpeg', '.webp'],
};
const MAX_BYTES = {
    logo_light: 2 * 1024 * 1024,
    logo_dark: 2 * 1024 * 1024,
    favicon: 512 * 1024,
    login_background: 5 * 1024 * 1024,
};
// Thông tin thương hiệu SSO (26/09/2026): đọc công khai (trang đăng nhập cần),
// sửa chỉ admin. Cache trong bộ nhớ, xoá khi sửa (1 instance/triển khai; nhiều
// instance thì lệch tối đa CACHE_MS).
const CACHE_MS = 60000;
let BrandingService = class BrandingService {
    constructor(repo) {
        this.repo = repo;
        this.cache = null;
    }
    async getPublic() {
        if (this.cache && Date.now() - this.cache.at < CACHE_MS)
            return this.cache.value;
        const row = await this.repo.get();
        if (!row)
            throw new AppError_1.AppError(500, 'Chưa cấu hình thông tin tổ chức (a_org_setting).');
        const value = {
            ...row,
            logo_light: (0, avatarUpload_1.toPublicAvatarUrl)(row.logo_light),
            logo_dark: (0, avatarUpload_1.toPublicAvatarUrl)(row.logo_dark),
            favicon: (0, avatarUpload_1.toPublicAvatarUrl)(row.favicon),
            login_background: (0, avatarUpload_1.toPublicAvatarUrl)(row.login_background),
        };
        this.cache = { at: Date.now(), value };
        return value;
    }
    async updateText(input, actor) {
        await this.repo.updateText(input, actor);
        this.cache = null;
    }
    async setImage(kind, file, actor) {
        if (!file)
            throw new AppError_1.AppError(400, 'Chưa chọn ảnh.');
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        if (!IMAGE_EXT[kind].includes(ext)) {
            throw new AppError_1.AppError(400, `Chỉ nhận ${IMAGE_EXT[kind].join(', ')}.`);
        }
        if (file.size > MAX_BYTES[kind]) {
            throw new AppError_1.AppError(400, `Ảnh tối đa ${Math.round(MAX_BYTES[kind] / 1024)}KB.`);
        }
        await promises_1.default.mkdir(BRANDING_ROOT, { recursive: true });
        // Tên file mới mỗi lần -> URL mới, trình duyệt không dùng ảnh cache cũ.
        const diskPath = path_1.default.join(BRANDING_ROOT, `${kind}-${(0, crypto_1.randomUUID)()}${ext}`);
        await promises_1.default.writeFile(diskPath, file.buffer);
        const value = '/api-sso/' + diskPath.split(path_1.default.sep).join('/');
        const previous = (await this.repo.get())?.[kind] ?? null;
        try {
            await this.repo.setImage(kind, value, actor);
        }
        catch (error) {
            await this.removeFile(value);
            throw error;
        }
        await this.removeFile(previous);
        this.cache = null;
        return (0, avatarUpload_1.toPublicAvatarUrl)(value);
    }
    // Về ảnh mặc định của sso-web.
    async resetImage(kind, actor) {
        const previous = (await this.repo.get())?.[kind] ?? null;
        await this.repo.setImage(kind, null, actor);
        await this.removeFile(previous);
        this.cache = null;
    }
    async removeFile(dbPath) {
        if (!dbPath?.startsWith('/api-sso/uploads/branding/'))
            return;
        const root = path_1.default.resolve(BRANDING_ROOT);
        const target = path_1.default.resolve(dbPath.replace(/^\/api-sso\//, ''));
        if (!target.startsWith(root + path_1.default.sep))
            return;
        await promises_1.default.unlink(target).catch(() => undefined);
    }
};
exports.BrandingService = BrandingService;
exports.BrandingService = BrandingService = __decorate([
    (0, tsyringe_1.injectable)(),
    __metadata("design:paramtypes", [brandingRepository_1.BrandingRepository])
], BrandingService);
