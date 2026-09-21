"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startDataCleanupJob = void 0;
const tsyringe_1 = require("tsyringe");
const config_1 = require("../config/config");
const cleanupService_1 = require("../services/cleanupService");
const startDataCleanupJob = () => {
    if (!config_1.config.cleanup.enabled)
        return () => undefined;
    let running = false;
    const run = async () => {
        if (running)
            return;
        running = true;
        try {
            const result = await tsyringe_1.container.resolve(cleanupService_1.CleanupService).run();
            if (!result.acquired) {
                console.log('[data-cleanup] Bỏ qua vì instance khác đang chạy.');
            }
            else {
                console.log(`[data-cleanup]${config_1.config.cleanup.dryRun ? ' DRY-RUN' : ''} ` +
                    `reset=${result.counts.password_reset_tokens}, ` +
                    `refresh=${result.counts.refresh_tokens}, session=${result.counts.sessions}, ` +
                    `avatar_files=${result.counts.avatar_files}`);
            }
        }
        catch (error) {
            console.error('[data-cleanup] Lỗi khi chạy job:', error);
        }
        finally {
            running = false;
        }
    };
    const initialTimer = setTimeout(() => void run(), config_1.config.cleanup.initialDelayMs ?? 2 * 60 * 1000);
    initialTimer.unref();
    const intervalTimer = setInterval(() => void run(), config_1.config.cleanup.intervalMs ?? 24 * 60 * 60 * 1000);
    intervalTimer.unref();
    return () => {
        clearTimeout(initialTimer);
        clearInterval(intervalTimer);
    };
};
exports.startDataCleanupJob = startDataCleanupJob;
