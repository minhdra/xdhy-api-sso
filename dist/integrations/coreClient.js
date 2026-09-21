"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resyncProfile = resyncProfile;
const config_1 = require("../config/config");
// Sau khi user tự sửa hồ sơ / đổi avatar ở sso-web (đã ghi build_management
// qua a_UpdateSelfProfile / a_SetAvatar), báo api-core đồng bộ xuống
// task_management + module chat + api-meeting. api-core là nơi DUY NHẤT giữ
// logic sync đó (split tên, tính isAdmin, hình dạng payload chat/meeting) +
// các secret downstream -
// api-sso chỉ cần 1 secret (CORE_INTERNAL_SECRET) để nói chuyện api-core.
//
// KHÔNG throw / KHÔNG chặn phản hồi sửa hồ sơ: lỗi mạng / api-core down /
// thiếu secret -> chỉ log.
async function resyncProfile(userId) {
    if (!config_1.config.coreInternal.secret)
        return;
    try {
        const res = await fetch(`${config_1.config.coreInternal.baseUrl}/internal/users/profile-resync`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Internal-Secret': config_1.config.coreInternal.secret,
            },
            body: JSON.stringify({ user_id: userId }),
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
            console.warn(`[coreResync] profile-resync failed: HTTP ${res.status}`);
        }
    }
    catch (error) {
        console.warn('[coreResync] profile-resync error:', error.message);
    }
}
