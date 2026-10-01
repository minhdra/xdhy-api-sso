"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const document_1 = require("../openapi/document");
const docsRouter = (0, express_1.Router)();
docsRouter.get('/openapi.json', (_req, res) => {
    res.json((0, document_1.generateOpenApiDocument)());
});
docsRouter.use('/', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(undefined, {
    swaggerOptions: { url: 'openapi.json' },
}));
exports.default = docsRouter;
