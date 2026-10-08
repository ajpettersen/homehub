import assert from "node:assert/strict";
import { parseKioskPhoto } from "../src/routes/household";

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const dataUrl = (mimeType: string, bytes: Buffer) => `data:${mimeType};base64,${bytes.toString("base64")}`;

const ok = parseKioskPhoto(dataUrl("image/jpeg", jpeg));
assert.ok(ok.ok);
assert.equal(ok.mimeType, "image/jpeg");
assert.deepEqual(ok.bytes, jpeg);
assert.ok(parseKioskPhoto(dataUrl("image/png", png)).ok);

const rejected = (value: unknown) => {
  const result = parseKioskPhoto(value);
  assert.ok(!result.ok);
  return result.status;
};
assert.equal(rejected(undefined), 400);
assert.equal(rejected("not a data url"), 400);
assert.equal(rejected(dataUrl("image/jpeg", png)), 400, "the bytes must match the claimed type");
assert.equal(rejected(dataUrl("image/svg+xml", Buffer.from("<svg/>"))), 400, "SVG could carry script");
assert.equal(rejected(dataUrl("image/gif", Buffer.from("GIF89a"))), 400);
assert.equal(
  rejected(dataUrl("image/jpeg", Buffer.concat([jpeg, Buffer.alloc(5 * 1024 * 1024)]))),
  413,
  "photos over 5 MB are refused",
);

console.log("kiosk photo validation tests passed");
