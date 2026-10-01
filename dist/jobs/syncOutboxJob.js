"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startSyncOutboxJob = void 0;
const tsyringe_1 = require("tsyringe");
const config_1 = require("../config/config");
const syncService_1 = require("../services/syncService");
// Worker đồng bộ SSO -> app: quét a_sync_outbox theo chu kỳ + được đánh thức
// ngay khi có sự kiện mới (SyncService.notify). Chạy nhiều instance an toàn -
// mỗi dòng được "lease" trước khi gửi (xem SyncOutboxRepository.claimHead).
const startSyncOutboxJob = () => {
    if (!config_1.config.sync.enabled)
        return () => undefined;
    let running = false;
    let again = false;
    let lastPurge = 0;
    const run = async () => {
        if (running) {
            again = true;
            return;
        }
        running = true;
        try {
            const service = tsyringe_1.container.resolve(syncService_1.SyncService);
            do {
                again = false;
                const { sent } = await service.runOnce();
                if (sent > 0)
                    again = true; // còn dòng thì quét tiếp ngay
            } while (again);
            if (Date.now() - lastPurge > 6 * 60 * 60 * 1000) {
                lastPurge = Date.now();
                const purged = await service.purgeDone();
                if (purged)
                    console.log(`[sync] dọn ${purged} dòng outbox đã xong`);
            }
        }
        catch (error) {
            console.error('[sync] lỗi worker:', error.message);
        }
        finally {
            running = false;
        }
    };
    (0, syncService_1.registerSyncWorkerWake)(() => void run());
    const timer = setInterval(() => void run(), config_1.config.sync.intervalMs);
    timer.unref();
    const initial = setTimeout(() => void run(), 3000);
    initial.unref();
    return () => {
        (0, syncService_1.registerSyncWorkerWake)(null);
        clearInterval(timer);
        clearTimeout(initial);
    };
};
exports.startSyncOutboxJob = startSyncOutboxJob;
