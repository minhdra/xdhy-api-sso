"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
const config_1 = require("../config/config");
const AppError_1 = require("./AppError");
const errorHandler = (err, req, res, _next) => {
    const requestId = res.locals.requestId;
    console.error('Lỗi:', { requestId, method: req.method, path: req.path, error: err });
    if (err instanceof AppError_1.AppError) {
        return res
            .status(err.statusCode)
            .json({ success: false, message: err.message, request_id: requestId });
    }
    res.status(500).json({
        success: false,
        message: config_1.config.env === 'production' ? 'Lỗi máy chủ' : err.message,
        request_id: requestId,
    });
};
exports.errorHandler = errorHandler;
