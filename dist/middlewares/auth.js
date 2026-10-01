"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = void 0;
const tsyringe_1 = require("tsyringe");
const cookie_1 = require("../config/cookie");
const jwt_1 = require("../config/jwt");
const AppError_1 = require("../errors/AppError");
const sessionRepository_1 = require("../repositories/sessionRepository");
const sessionRepository = tsyringe_1.container.resolve(sessionRepository_1.SessionRepository);
// Bảo vệ route cần đăng nhập (accountRouter, GET /apps). Đọc access token từ
// cookie httpOnly hoặc header Authorization (client không dùng cookie được -
// vd mobile), verify chữ ký RS256, gắn req.userId. Tách từ logic vốn lặp
// trong authController.me.
const requireAuth = async (req, _res, next) => {
    const token = req.cookies?.[cookie_1.ACCESS_COOKIE] || req.headers.authorization?.split(' ')[1];
    if (!token) {
        next(new AppError_1.AppError(401, 'Bạn không được cấp quyền!'));
        return;
    }
    const decoded = (0, jwt_1.verifyToken)(token);
    if (!decoded || decoded.type !== 'access' || !decoded.user_id || !decoded.session_id) {
        next(new AppError_1.AppError(401, 'Bạn không được cấp quyền!'));
        return;
    }
    try {
        const active = await sessionRepository.isSessionActive(decoded.session_id, decoded.user_id);
        if (!active) {
            next(new AppError_1.AppError(401, 'Phiên đăng nhập đã bị thu hồi hoặc hết hạn.'));
            return;
        }
        req.userId = decoded.user_id;
        req.sessionId = decoded.session_id;
        // Ghi nhận "hoạt động lần cuối" - fire-and-forget, throttle 5' trong SQL
        // nên mỗi request qua gateway (/session/validate) không thành 1 write.
        void sessionRepository.touchSessionThrottled(decoded.session_id).catch(() => { });
        next();
    }
    catch (error) {
        next(error);
    }
};
exports.requireAuth = requireAuth;
