"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppError = void 0;
class AppError extends Error {
    constructor(statusCode, message, 
    // Dữ liệu kèm theo để FE xử lý tiếp (vd 409 trùng tài khoản đã xoá).
    data) {
        super(message);
        this.statusCode = statusCode;
        this.data = data;
        this.name = 'AppError';
    }
}
exports.AppError = AppError;
