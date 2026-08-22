import { spawnSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const artifactDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(artifactDir, ".notification-test-dist");
const outputFile = path.join(outputDir, "notifications.integration.mjs");

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

let exitStatus = 0;
try {
  await build({
    entryPoints: [path.join(artifactDir, "test", "notifications.integration.ts")],
    outfile: outputFile,
    platform: "node",
    bundle: true,
    format: "esm",
    logLevel: "warning",
    external: ["*.node", "pg-native"],
    banner: {
      js: `import { createRequire as __testCreateRequire } from "node:module";
const require = __testCreateRequire(import.meta.url);`,
    },
  });

  const result = spawnSync(process.execPath, [outputFile], {
    cwd: artifactDir,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  exitStatus = result.status ?? 1;
} finally {
  await rm(outputDir, { recursive: true, force: true });
}

if (exitStatus !== 0) process.exit(exitStatus);