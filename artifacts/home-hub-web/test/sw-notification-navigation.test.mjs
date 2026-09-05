import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
const listeners = new Map();
let openedUrl = null;

const self = {
  registration: {
    scope: "https://example.test/home-hub-web/",
    showNotification() {},
  },
  location: {
    origin: "https://example.test",
  },
  clients: {
    claim() {},
    async matchAll() {
      return [];
    },
    async openWindow(url) {
      openedUrl = url;
    },
  },
  addEventListener(type, listener) {
    listeners.set(type, listener);
  },
  skipWaiting() {},
};

vm.runInNewContext(source, {
  self,
  URL,
  Map,
  Set,
  caches: {
    async keys() {
      return [];
    },
    async delete() {},
  },
});

async function clickNotification(url) {
  openedUrl = null;
  let completion;
  listeners.get("notificationclick")({
    notification: {
      data: { url },
      close() {},
    },
    waitUntil(promise) {
      completion = promise;
    },
  });
  await completion;
  return openedUrl;
}

assert.equal(
  await clickNotification("/maintenance"),
  "https://example.test/home-hub-web/properties",
  "legacy maintenance notifications should open Properties",
);
assert.equal(
  await clickNotification("/tasks?from=notification"),
  "https://example.test/home-hub-web/tasks?from=notification",
  "notification routes should stay inside the artifact base path",
);
assert.equal(
  await clickNotification("/tasks?view=maintenance"),
  "https://example.test/home-hub-web/tasks?view=maintenance",
  "maintenance notifications should open the maintenance view inside Tasks",
);
assert.equal(
  await clickNotification("https://example.test/home-hub-web/workouts#history"),
  "https://example.test/home-hub-web/workouts#history",
  "already-scoped notification URLs should remain intact",
);
assert.equal(
  await clickNotification("https://malicious.example/tasks"),
  "https://example.test/home-hub-web/",
  "off-site notification targets should fall back to HomeHub",
);
assert.equal(
  await clickNotification("/removed-route"),
  "https://example.test/home-hub-web/",
  "unknown notification routes should fall back to HomeHub",
);

console.log("Service worker notification navigation test passed");