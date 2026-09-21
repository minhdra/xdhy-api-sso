"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateOpenApiDocument = generateOpenApiDocument;
const zod_to_openapi_1 = require("@asteasolutions/zod-to-openapi");
const registry_1 = require("./registry");
// Called lazily per-request (not at import time) so it always reflects every
// route file imported by then, regardless of module import order.
function generateOpenApiDocument() {
    return new zod_to_openapi_1.OpenApiGeneratorV31(registry_1.registry.definitions).generateDocument({
        openapi: '3.1.0',
        info: {
            title: 'SSO API',
            version: '1.0.0',
        },
        servers: [{ url: '/api-sso' }],
    });
}
