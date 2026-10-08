// Sets the wall screen's background photo: node set-kiosk-photo.mjs <household id> <photo.jpg>
// Shrink big phone photos first (macOS: sips -Z 2000 -s format jpeg in.heic --out photo.jpg).
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { Client } from "pg";

const [householdId, file] = process.argv.slice(2);
const mimeType = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" }[extname(file ?? "").toLowerCase()];
if (!Number.isInteger(Number(householdId)) || !mimeType) {
  console.error("Usage: node set-kiosk-photo.mjs <household id> <photo.jpg|.png|.webp>");
  process.exit(1);
}
const bytes = readFileSync(file);
if (bytes.length > 3 * 1024 * 1024) {
  console.error(`That photo is ${(bytes.length / 1024 / 1024).toFixed(1)} MB. Shrink it under 3 MB first.`);
  process.exit(1);
}

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query(
  `INSERT INTO "kiosk_photos" ("household_id", "mime_type", "bytes", "updated_at") VALUES ($1, $2, $3, now())
   ON CONFLICT ("household_id") DO UPDATE SET "mime_type" = EXCLUDED."mime_type", "bytes" = EXCLUDED."bytes", "updated_at" = now()`,
  [Number(householdId), mimeType, bytes],
);
await client.end();
console.log(`Saved ${(bytes.length / 1024).toFixed(0)} KB photo for household ${householdId}.`);
