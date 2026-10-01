"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const tsyringe_1 = require("tsyringe");
const appIconUpload_1 = require("../config/appIconUpload");
const adminAppController_1 = require("../controllers/adminAppController");
const auth_1 = require("../middlewares/auth");
const requireAdmin_1 = require("../middlewares/requireAdmin");
const defineRoute_1 = require("../openapi/defineRoute");
const adminApp_schema_1 = require("../schemas/adminApp.schema");
const adminAppRouter = (0, express_1.Router)();
const controller = tsyringe_1.container.resolve(adminAppController_1.AdminAppController);
const tags = ['Admin apps'];
// Chỉ quản trị viên (role_code 'sa') mới vào được toàn bộ router này - xem
// requireAdmin.ts.
adminAppRouter.use(auth_1.requireAuth, requireAdmin_1.requireAdmin);
adminAppRouter.get('/admin/apps', ...(0, defineRoute_1.defineRoute)({
    method: 'get',
    path: '/admin/apps',
    tags,
    summary: 'Danh sách ứng dụng (quản trị) kèm số người đã được cấp quyền',
    responses: { 200: { description: 'OK' }, 403: { description: 'Không phải quản trị viên' } },
}), controller.listApps.bind(controller));
adminAppRouter.post('/admin/apps', ...(0, defineRoute_1.defineRoute)({
    method: 'post',
    path: '/admin/apps',
    tags,
    summary: 'Tạo mới hoặc cập nhật ứng dụng (app_id rỗng = tạo mới)',
    schema: { body: adminApp_schema_1.upsertAppSchema },
    responses: { 200: { description: 'Đã lưu' }, 400: { description: 'Mã ứng dụng đã tồn tại' } },
}), controller.upsertApp.bind(controller));
adminAppRouter.post('/admin/apps/:app_id/icon', ...(0, defineRoute_1.defineRoute)({
    method: 'post', path: '/admin/apps/{app_id}/icon', tags,
    summary: 'Tải icon PNG 46 × 46, tối đa 1MB',
    schema: { params: adminApp_schema_1.appIdParamSchema },
    responses: { 200: { description: 'Đã lưu icon' }, 400: { description: 'Ảnh không hợp lệ' } },
}), appIconUpload_1.appIconUpload, controller.uploadIcon.bind(controller));
adminAppRouter.post('/admin/apps/delete', ...(0, defineRoute_1.defineRoute)({
    method: 'post',
    path: '/admin/apps/delete',
    tags,
    summary: 'Xoá (mềm) 1 ứng dụng - xoá luôn toàn bộ quyền đã cấp trên app đó',
    schema: { body: adminApp_schema_1.deleteAppSchema },
    responses: { 200: { description: 'Đã xoá' }, 400: { description: 'Không tìm thấy' } },
}), controller.deleteApp.bind(controller));
adminAppRouter.get('/admin/apps/:app_id/access', ...(0, defineRoute_1.defineRoute)({
    method: 'get',
    path: '/admin/apps/{app_id}/access',
    tags,
    summary: 'Danh sách người đang được cấp quyền truy cập 1 ứng dụng',
    schema: { params: adminApp_schema_1.appIdParamSchema },
    responses: { 200: { description: 'OK' } },
}), controller.listAccess.bind(controller));
adminAppRouter.post('/admin/apps/:app_id/access', ...(0, defineRoute_1.defineRoute)({
    method: 'post',
    path: '/admin/apps/{app_id}/access',
    tags,
    summary: 'Thay toàn bộ danh sách người được cấp quyền truy cập 1 ứng dụng',
    schema: { params: adminApp_schema_1.appIdParamSchema, body: adminApp_schema_1.setAppAccessSchema },
    responses: { 200: { description: 'Đã cập nhật' }, 400: { description: 'Không tìm thấy app' } },
}), controller.setAccess.bind(controller));
adminAppRouter.get('/admin/apps/:app_id/access-candidates', ...(0, defineRoute_1.defineRoute)({
    method: 'get',
    path: '/admin/apps/{app_id}/access-candidates',
    tags,
    summary: 'Danh sách người chưa có quyền hiệu lực, có tìm kiếm và phân trang',
    schema: { params: adminApp_schema_1.appIdParamSchema, query: adminApp_schema_1.appAccessCandidatesQuerySchema },
    responses: { 200: { description: 'OK' }, 400: { description: 'Không tìm thấy app' } },
}), controller.listAccessCandidates.bind(controller));
adminAppRouter.post('/admin/apps/:app_id/access/add', ...(0, defineRoute_1.defineRoute)({
    method: 'post',
    path: '/admin/apps/{app_id}/access/add',
    tags,
    summary: 'Cộng quyền truy cập cho các user hợp lệ chưa có quyền',
    schema: { params: adminApp_schema_1.appIdParamSchema, body: adminApp_schema_1.mutateAppAccessSchema },
    responses: { 200: { description: 'Đã thêm' }, 400: { description: 'Dữ liệu không hợp lệ' } },
}), controller.addAccess.bind(controller));
adminAppRouter.post('/admin/apps/:app_id/access/remove', ...(0, defineRoute_1.defineRoute)({
    method: 'post',
    path: '/admin/apps/{app_id}/access/remove',
    tags,
    summary: 'Gỡ quyền truy cập theo danh sách user',
    schema: { params: adminApp_schema_1.appIdParamSchema, body: adminApp_schema_1.mutateAppAccessSchema },
    responses: { 200: { description: 'Đã gỡ' }, 400: { description: 'Dữ liệu không hợp lệ' } },
}), controller.removeAccess.bind(controller));
adminAppRouter.get('/admin/users', ...(0, defineRoute_1.defineRoute)({
    method: 'get',
    path: '/admin/users',
    tags,
    summary: 'Danh sách người dùng active - dùng cho ô chọn cấp quyền app',
    responses: { 200: { description: 'OK' } },
}), controller.listUsers.bind(controller));
exports.default = adminAppRouter;
