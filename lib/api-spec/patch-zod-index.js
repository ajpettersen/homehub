#!/usr/bin/env node
// Orval appends to barrel index files and leaves extra blank lines at the end
// of generated files. Normalize both so codegen output remains deterministic.
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

// 3. Keep generated source files to one trailing newline so git diff --check
//    remains clean after codegen.
const generatedFiles = [
  'lib/api-zod/src/generated/api.ts',
  'lib/api-client-react/src/generated/api.ts',
  'lib/api-client-react/src/generated/api.schemas.ts',
];

for (const relativePath of generatedFiles) {
  const filePath = path.join(root, relativePath);
  const content = fs.readFileSync(filePath, 'utf8');
  fs.writeFileSync(filePath, `${content.trimEnd()}\n`, 'utf8');
}
console.log('✓ Normalized generated file endings');
