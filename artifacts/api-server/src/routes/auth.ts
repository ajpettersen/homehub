import { createHash } from "node:crypto";
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import {
  clearAttempts,
  createSession,
  destroyOtherSessions,
  destroySession,
  displayNameFor,
  getAuthUserByEmail,
  getAuthUserById,
  getDummyHash,
  hashPassword,
  newUserId,
  normalizeEmail,
  recordFailedAttempt,
  safeEqualStrings,
  tooManyAttempts,
  validatePassword,
  verifyPassword,
} from "../lib/auth";

const router: IRouter = Router();

const GLOBAL_KEY = "global";
const SETUP_KEY = "setup-code";

function setupCode(): string | null {
  const code = process.env.HOMEHUB_SETUP_CODE?.trim();
  return code && code.length >= 12 ? code : null;
}

function setupCodeMatches(provided: unknown): boolean {
  const code = setupCode();
  return !!code && typeof provided === "string" && provided.length <= 200 && safeEqualStrings(provided.trim(), code);
}

function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, 80);
  return trimmed || null;
}

/** Existing HomeHub accounts (from the Clerk era) that nobody has claimed a password for yet. */
async function unclaimedProfiles(): Promise<{ id: string; name: string; role: string }[]> {
  const result = await db.execute(sql`
    SELECT p.clerk_id, p.role, f.name AS member_name
    FROM user_profiles p
    LEFT JOIN family_members f ON f.id = p.linked_family_member_id
    WHERE p.role IN ('family', 'cleaner')
      AND p.clerk_id <> 'homehub_dev_preview'
      AND NOT EXISTS (SELECT 1 FROM auth_users a WHERE a.id = p.clerk_id)
    ORDER BY p.created_at ASC
  `);
  return result.rows.map((row, index) => ({
    id: String(row.clerk_id),
    name: (row.member_name as string | null) ?? `Unnamed ${row.role === "cleaner" ? "cleaner" : "family"} account ${index + 1}`,
    role: String(row.role),
  }));
}

async function inviteIsUsable(token: unknown): Promise<boolean> {
  if (typeof token !== "string" || token.length < 32 || token.length > 128) return false;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const result = await db.execute(sql`
    SELECT 1 FROM household_invites
    WHERE token_hash = ${tokenHash} AND revoked_at IS NULL AND redeemed_at IS NULL AND expires_at > now()
    LIMIT 1
  `);
  return result.rows.length > 0;
}

/** GET /api/auth/session — who is signed in (or null). */
router.get("/auth/session", async (req, res): Promise<void> => {
  const userId = req.homeHubUserId;
  const user = userId ? await getAuthUserById(userId) : null;
  res.json({
    user: user ? { id: user.id, email: user.email, name: displayNameFor(user) } : null,
    setupAvailable: !!setupCode(),
  });
});

/** POST /api/auth/sign-in */
router.post("/auth/sign-in", async (req, res): Promise<void> => {
  const email = normalizeEmail(req.body?.email);
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const failure = () => res.status(401).json({ error: "That email and password don't match." });
  if (!email || !password || password.length > 200) return void failure();

  const emailKey = `signin:${email}`;
  if (tooManyAttempts(emailKey, 8) || tooManyAttempts(GLOBAL_KEY, 50)) {
    res.status(429).json({ error: "Too many attempts. Wait 15 minutes and try again." });
    return;
  }

  try {
    const user = await getAuthUserByEmail(email);
    const ok = await verifyPassword(password, user?.passwordHash ?? await getDummyHash());
    if (!user || !ok) {
      recordFailedAttempt(emailKey);
      recordFailedAttempt(GLOBAL_KEY);
      return void failure();
    }
    clearAttempts(emailKey);
    await createSession(res, user.id);
    res.json({ user: { id: user.id, email: user.email, name: displayNameFor(user) } });
  } catch (err) {
    req.log.error({ err }, "Sign-in failed");
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

/**
 * POST /api/auth/setup/accounts — with the household setup code, list the
 * existing accounts that still need a password, so each person can claim theirs.
 */
router.post("/auth/setup/accounts", async (req, res): Promise<void> => {
  if (tooManyAttempts(SETUP_KEY, 10)) {
    res.status(429).json({ error: "Too many attempts. Wait 15 minutes and try again." });
    return;
  }
  if (!setupCodeMatches(req.body?.setupCode)) {
    recordFailedAttempt(SETUP_KEY);
    res.status(403).json({ error: "That setup code isn't right." });
    return;
  }
  try {
    res.json({ accounts: await unclaimedProfiles() });
  } catch (err) {
    req.log.error({ err }, "Failed to list unclaimed accounts");
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

/**
 * POST /api/auth/sign-up — create a login. Allowed only with either:
 *  - the household setup code (HOMEHUB_SETUP_CODE), optionally claiming an
 *    existing account via `claimAccountId`, or
 *  - a valid, unredeemed household invite token (new account only; the
 *    client then redeems the invite as usual).
 */
router.post("/auth/sign-up", async (req, res): Promise<void> => {
  const email = normalizeEmail(req.body?.email);
  if (!email) {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }
  const passwordError = validatePassword(req.body?.password);
  if (passwordError) {
    res.status(400).json({ error: passwordError });
    return;
  }
  const password = req.body.password as string;
  const firstName = cleanName(req.body?.firstName);
  const lastName = cleanName(req.body?.lastName);
  const claimAccountId = typeof req.body?.claimAccountId === "string" ? req.body.claimAccountId : null;

  if (tooManyAttempts(SETUP_KEY, 10) || tooManyAttempts(GLOBAL_KEY, 50)) {
    res.status(429).json({ error: "Too many attempts. Wait 15 minutes and try again." });
    return;
  }

  const viaSetupCode = setupCodeMatches(req.body?.setupCode);
  const viaInvite = !viaSetupCode && await inviteIsUsable(req.body?.inviteToken);
  if (!viaSetupCode && !viaInvite) {
    recordFailedAttempt(SETUP_KEY);
    res.status(403).json({ error: "New accounts need a household invite link or the setup code." });
    return;
  }

  try {
    let userId = newUserId();
    let defaultFirstName: string | null = null;
    if (claimAccountId) {
      if (!viaSetupCode) {
        res.status(403).json({ error: "Claiming an existing account needs the setup code." });
        return;
      }
      const claimable = (await unclaimedProfiles()).find(account => account.id === claimAccountId);
      if (!claimable) {
        res.status(409).json({ error: "That account has already been claimed." });
        return;
      }
      userId = claimable.id;
      defaultFirstName = claimable.name.startsWith("Unnamed ") ? null : claimable.name;
    }

    const passwordHash = await hashPassword(password);
    const inserted = await db.execute(sql`
      INSERT INTO auth_users (id, email, password_hash, first_name, last_name)
      VALUES (${userId}, ${email}, ${passwordHash}, ${firstName ?? defaultFirstName}, ${lastName})
      ON CONFLICT DO NOTHING
      RETURNING id
    `);
    if (inserted.rows.length === 0) {
      res.status(409).json({ error: "An account with that email already exists. Sign in instead." });
      return;
    }

    await createSession(res, userId);
    const user = await getAuthUserById(userId);
    res.status(201).json({ user: user && { id: user.id, email: user.email, name: displayNameFor(user) } });
  } catch (err) {
    req.log.error({ err }, "Sign-up failed");
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

/** POST /api/auth/sign-out */
router.post("/auth/sign-out", async (req, res): Promise<void> => {
  try {
    await destroySession(req, res);
  } catch (err) {
    req.log.error({ err }, "Sign-out failed");
  }
  res.json({ ok: true });
});

/** POST /api/auth/change-password — also signs out every other device. */
router.post("/auth/change-password", async (req, res): Promise<void> => {
  const userId = req.homeHubUserId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const passwordError = validatePassword(req.body?.newPassword);
  if (passwordError) {
    res.status(400).json({ error: passwordError });
    return;
  }
  const key = `change:${userId}`;
  if (tooManyAttempts(key, 8)) {
    res.status(429).json({ error: "Too many attempts. Wait 15 minutes and try again." });
    return;
  }
  try {
    const user = await getAuthUserById(userId);
    const withHash = user ? await getAuthUserByEmail(user.email) : null;
    const current = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
    if (!withHash || !(await verifyPassword(current, withHash.passwordHash))) {
      recordFailedAttempt(key);
      res.status(403).json({ error: "Your current password isn't right." });
      return;
    }
    await db.execute(sql`
      UPDATE auth_users SET password_hash = ${await hashPassword(req.body.newPassword)}, updated_at = now()
      WHERE id = ${userId}
    `);
    await destroyOtherSessions(req, userId);
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Password change failed");
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
});

export default router;
