#!/usr/bin/env node
// orval appends to barrel index files instead of cleanly overwriting them.
// This script normalizes both affected index files after each codegen run.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');

// 1. api-zod: export only zod schemas (api.ts); the types subfolder conflicts
//    with zod schema value exports of the same names.
const zodIndex = path.join(root, 'lib/api-zod/src/index.ts');
fs.writeFileSync(zodIndex, 'export * from "./generated/api";\n', 'utf8');
console.log('✓ Normalized api-zod/src/index.ts');

// 2. api-client-react: keep the original manual barrel (custom-fetch exports +
//    generated api + schemas). Orval appends single-quote duplicates; strip them.
const clientIndex = path.join(root, 'lib/api-client-react/src/index.ts');
const canonical =
  'export * from "./generated/api";\n' +
  'export * from "./generated/api.schemas";\n' +
  'export { setBaseUrl, setAuthTokenGetter } from "./custom-fetch";\n' +
  'export type { AuthTokenGetter } from "./custom-fetch";\n';
fs.writeFileSync(clientIndex, canonical, 'utf8');
console.log('✓ Normalized api-client-react/src/index.ts');
