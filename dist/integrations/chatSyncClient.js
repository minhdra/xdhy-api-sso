"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertUserToChat = upsertUserToChat;
const config_1 = require("../config/config");
async function upsertUserToChat(payload) {
    if (!config_1.config.chatSync.secret)
        return;
    try {
        const res = await fetch(`${config_1.config.chatSync.baseUrl}/internal/sync/users`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Internal-Secret': config_1.config.chatSync.secret,
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
            console.warn(`[chatSync] POST users failed: HTTP ${res.status}`);
        }
    }
    catch (error) {
        console.warn('[chatSync] POST users error:', error.message);
    }
}
