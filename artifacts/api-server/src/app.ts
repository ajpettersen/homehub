import path from "node:path";
import fs from "node:fs";
import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";
import { serializeRequestForLog } from "./lib/requestLogging";

const app: Express = express();

// Invite tokens are bearer credentials. Browsers must not forward an invite
// fragment or any other HomeHub URL as a referrer to another origin.
app.use((_req, res, next) => {
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

app.use(
  pinoHttp({
    logger,
    serializers: {
        req: serializeRequestForLog,
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Clerk proxy — mount before body parsers (streams raw bytes)
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// Same-origin browser requests (the normal case now that this server also
// serves the built frontend) carry no Origin header at all and are never
// subject to CORS regardless of this config. This allowlist only matters
// for the handful of legitimate cross-origin cases: local dev (Vite on a
// different port than the API), and any other real deployment of this app.
const DEFAULT_ALLOWED_ORIGINS = [
  "https://homehub-production-5db0.up.railway.app",
  "https://home-life-manager.replit.app",
];
const EXTRA_ALLOWED_ORIGINS = (process.env.EXTRA_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const ALLOWED_ORIGINS = new Set([...DEFAULT_ALLOWED_ORIGINS, ...EXTRA_ALLOWED_ORIGINS]);

app.use(cors({
  credentials: true,
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (process.env.NODE_ENV !== "production") return callback(null, true);
    if (ALLOWED_ORIGINS.has(origin)) return callback(null, true);
    callback(new Error("Not allowed by CORS"));
  },
}));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true }));

// Clerk auth middleware
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

// Replit's deployment router combines the frontend and backend into one URL
// automatically. Outside Replit there's no such magic, so in production this
// same server also serves the frontend's already-built files directly.
if (process.env.NODE_ENV === "production") {
  const staticDir = path.resolve(import.meta.dirname, "../../home-hub-web/dist/public");
  if (fs.existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.sendFile(path.join(staticDir, "index.html"));
    });
  } else {
    logger.warn({ staticDir }, "Built frontend not found; skipping static file serving");
  }
}

export default app;
