"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.z = void 0;
const zod_to_openapi_1 = require("@asteasolutions/zod-to-openapi");
const zod_1 = require("zod");
Object.defineProperty(exports, "z", { enumerable: true, get: function () { return zod_1.z; } });
// Adds `.openapi()` to every zod schema. Must run before any schema file
// calls `.openapi()`, so every schema module imports `z` from here instead
// of importing `zod` directly.
(0, zod_to_openapi_1.extendZodWithOpenApi)(zod_1.z);
