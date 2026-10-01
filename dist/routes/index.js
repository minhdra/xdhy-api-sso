"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const accountRouter_1 = __importDefault(require("./accountRouter"));
const adminAppRouter_1 = __importDefault(require("./adminAppRouter"));
const adminOrgRouter_1 = __importDefault(require("./adminOrgRouter"));
const authRouter_1 = __importDefault(require("./authRouter"));
const brandingRouter_1 = __importDefault(require("./brandingRouter"));
const docsRouter_1 = __importDefault(require("./docsRouter"));
const router = (0, express_1.Router)();
// Swagger mở, không qua requireAuth (giống api-core/api-task).
router.use('/docs', docsRouter_1.default);
router.use('/', authRouter_1.default);
// Có route công khai GET /branding - mount TRƯỚC adminAppRouter (router đó
// requireAuth mọi request đi qua nó).
router.use('/', brandingRouter_1.default);
router.use('/', accountRouter_1.default);
// Tự bảo vệ bằng requireAuth + requireAdmin bên trong (xem adminAppRouter.ts).
router.use('/', adminAppRouter_1.default);
router.use('/', adminOrgRouter_1.default);
exports.default = router;
