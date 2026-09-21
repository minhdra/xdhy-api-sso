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
exports.CleanupService = void 0;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const tsyringe_1 = require("tsyringe");
const config_1 = require("../config/config");
const cleanupRepository_1 = require("../repositories/cleanupRepository");
let CleanupService = class CleanupService {
    constructor(cleanupRepository) {
        this.cleanupRepository = cleanupRepository;
    }
    async run() {
        const batchSize = config_1.config.cleanup.batchSize ?? 500;
        const maxBatches = config_1.config.cleanup.maxBatches ?? 20;
        const totals = {
            password_reset_tokens: 0,
            refresh_tokens: 0,
            sessions: 0,
            avatar_files: 0,
        };
        for (let batch = 0; batch < maxBatches; batch += 1) {
            const result = await this.cleanupRepository.cleanupBatch({
                sessionRetentionDays: config_1.config.cleanup.sessionRetentionDays ?? 30,
                passwordResetRetentionDays: config_1.config.cleanup.passwordResetRetentionDays ?? 7,
                batchSize,
                dryRun: config_1.config.cleanup.dryRun,
            });
            if (!result.acquired)
                return { acquired: false, counts: totals };
            totals.password_reset_tokens += result.counts.password_reset_tokens;
            totals.refresh_tokens += result.counts.refresh_tokens;
            totals.sessions += result.counts.sessions;
            const batchTotal = Object.values(result.counts).reduce((sum, count) => sum + count, 0);
            // Session có refresh token vừa bị xóa trong cùng data-modifying CTE chỉ
            // trở thành ứng viên ở statement kế tiếp (các CTE dùng chung snapshot).
            // Vì vậy chạy thêm một batch khi vừa xóa refresh token, dù tổng chưa đầy.
            if (config_1.config.cleanup.dryRun ||
                (batchTotal < batchSize && result.counts.refresh_tokens === 0)) {
                break;
            }
        }
        totals.avatar_files = await this.cleanupOrphanAvatars();
        return { acquired: true, counts: totals };
    }
    async cleanupOrphanAvatars() {
        const avatarRoot = node_path_1.default.resolve(process.cwd(), 'uploads/avatars');
        const cutoffMs = Date.now() - (config_1.config.cleanup.orphanAvatarGraceHours ?? 24) * 60 * 60 * 1000;
        const maxFiles = config_1.config.cleanup.orphanAvatarMaxFilesPerRun ?? 1000;
        let scannedFiles = 0;
        let orphanFiles = 0;
        const walk = async (directory) => {
            if (scannedFiles >= maxFiles)
                return;
            let entries;
            try {
                entries = await promises_1.default.readdir(directory, { withFileTypes: true });
            }
            catch (error) {
                if (error?.code === 'ENOENT')
                    return;
                throw error;
            }
            for (const entry of entries) {
                if (scannedFiles >= maxFiles)
                    break;
                const absolutePath = node_path_1.default.join(directory, entry.name);
                if (entry.isDirectory()) {
                    await walk(absolutePath);
                    continue;
                }
                if (!entry.isFile())
                    continue;
                scannedFiles += 1;
                const stat = await promises_1.default.stat(absolutePath);
                if (stat.mtimeMs >= cutoffMs)
                    continue;
                const relativePath = node_path_1.default.relative(process.cwd(), absolutePath).split(node_path_1.default.sep).join('/');
                if (await this.cleanupRepository.isAvatarPathReferenced(relativePath))
                    continue;
                orphanFiles += 1;
                if (!config_1.config.cleanup.dryRun) {
                    try {
                        await promises_1.default.unlink(absolutePath);
                    }
                    catch (error) {
                        if (error?.code !== 'ENOENT')
                            throw error;
                    }
                }
            }
            if (directory !== avatarRoot) {
                try {
                    await promises_1.default.rmdir(directory);
                }
                catch (error) {
                    if (!['ENOENT', 'ENOTEMPTY'].includes(error?.code))
                        throw error;
                }
            }
        };
        await walk(avatarRoot);
        return orphanFiles;
    }
};
exports.CleanupService = CleanupService;
exports.CleanupService = CleanupService = __decorate([
    (0, tsyringe_1.injectable)(),
    __metadata("design:paramtypes", [cleanupRepository_1.CleanupRepository])
], CleanupService);
