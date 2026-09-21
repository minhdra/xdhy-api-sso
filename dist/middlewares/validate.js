"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = void 0;
const zod_1 = require("zod");
const AppError_1 = require("../errors/AppError");
const formatZodError = (error) => error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ');
// Parses+replaces req.body/query/params with the schema's output, so
// downstream code (controllers, services) can trust the shape without
// re-checking or casting.
const validate = (schema) => (req, _res, next) => {
    try {
        if (schema.params)
            req.params = schema.params.parse(req.params);
        if (schema.query)
            req.query = schema.query.parse(req.query);
        if (schema.body)
            req.body = schema.body.parse(req.body);
        next();
    }
    catch (error) {
        if (error instanceof zod_1.ZodError) {
            return next(new AppError_1.AppError(400, formatZodError(error)));
        }
        next(error);
    }
};
exports.validate = validate;
