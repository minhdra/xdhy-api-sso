"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncProfileToTask = syncProfileToTask;
const config_1 = require("../config/config");
async function syncProfileToTask(payload) {
    if (!config_1.config.taskSync.secret)
        return;
    try {
        const res = await fetch(`${config_1.config.taskSync.baseUrl}/internal/sync/users/profile`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Internal-Secret': config_1.config.taskSync.secret,
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
            console.warn(`[taskSync] POST users/profile failed: HTTP ${res.status}`);
        }
    }
    catch (error) {
        console.warn('[taskSync] POST users/profile error:', error.message);
    }
}
