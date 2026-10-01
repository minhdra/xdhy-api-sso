"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registry = void 0;
const zod_to_openapi_1 = require("@asteasolutions/zod-to-openapi");
// Single registry shared by every schema/route module. Route files register
// their paths here at import time; the docs endpoint reads it lazily so
// import order never matters.
exports.registry = new zod_to_openapi_1.OpenAPIRegistry();
