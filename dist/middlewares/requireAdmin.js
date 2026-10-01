"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAdmin = void 0;
const tsyringe_1 = require("tsyringe");
const AppError_1 = require("../errors/AppError");
const appService_1 = require("../services/appService");
// Đặt SAU requireAuth (cần req.userId đã có). Tính lại mỗi request qua
// a_IsUserAdmin - không tin field role_group trong JWT vì access token lúc
// /refresh chỉ ký lại {user_id}, không mang role_group (xem authService.refresh).
const requireAdmin = async (req, _res, next) => {
    try {
        const appService = tsyringe_1.container.resolve(appService_1.AppService);
        const isAdmin = await appService.isAdmin(req.userId);
        if (!isAdmin) {
            next(new AppError_1.AppError(403, 'Chỉ quản trị viên mới truy cập được mục này.'));
            return;
        }
        next();
    }
    catch (error) {
        next(error);
    }
};
exports.requireAdmin = requireAdmin;
