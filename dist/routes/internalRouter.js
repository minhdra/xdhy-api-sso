"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const tsyringe_1 = require("tsyringe");
const internalController_1 = require("../controllers/internalController");
const validate_1 = require("../middlewares/validate");
const internal_schema_1 = require("../schemas/internal.schema");
// Route nội bộ - api-task-management gọi container-tới-container để hỏi quyền
// app của 1 tập user. KHÔNG mount dưới '/api-sso' (đó là phần gateway rewrite
// /api/api-sso/* -> /api-sso/* cho FE) - mount ở app level '/internal', bảo vệ
// bằng requireInternalSecret (app.ts), KHÔNG requireAuth. KHÔNG lên Swagger.
const internalRouter = (0, express_1.Router)();
const controller = tsyringe_1.container.resolve(internalController_1.InternalController);
internalRouter.post('/app-access/filter', (0, validate_1.validate)({ body: internal_schema_1.filterAppAccessSchema }), controller.filterAppAccess.bind(controller));
exports.default = internalRouter;
