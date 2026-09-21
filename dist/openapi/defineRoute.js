"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defineRoute = defineRoute;
const validate_1 = require("../middlewares/validate");
const registry_1 = require("./registry");
/**
 * Single source of truth for a route: registers the OpenAPI path (so docs
 * stay accurate) and returns the validation middleware for the same schema,
 * so the schema is written once and never drifts between docs and runtime.
 * Usage: router.post('/create', ...defineRoute({...}), controller.handler)
 */
function defineRoute(options) {
    const { schema, ...rest } = options;
    registry_1.registry.registerPath({
        ...rest,
        request: schema
            ? {
                params: schema.params,
                query: schema.query,
                body: schema.body
                    ? { content: { 'application/json': { schema: schema.body } } }
                    : undefined,
            }
            : undefined,
    });
    return schema ? [(0, validate_1.validate)(schema)] : [];
}
