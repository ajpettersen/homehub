import { boolean, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { userProfilesTable } from "./userProfiles";

// HomeHub's own sign-in (see api-server/src/lib/auth). `clerkId` is the
// account id used everywhere else in the app: Clerk's id for people who
// signed up before HomeHub ran its own login, a HomeHub-made id after.
// Emails are stored lowercased. Passwords are scrypt hashes, never returned
// to the browser or written to logs; null until the person sets one.
export const userCredentialsTable = pgTable("user_credentials", {
  clerkId: text("clerk_id").primaryKey().references(() => userProfilesTable.clerkId, { onDelete: "cascade" }),
  email: text("email").notNull(),
  displayName: text("display_name"),
  passwordHash: text("password_hash"),
  // True only for emails Clerk had verified. HomeHub doesn't send email, so
  // accounts created here are never verified.
  emailVerified: boolean("email_verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("user_credentials_email_unique").on(table.email),
]);

// One row per signed-in browser. Only a SHA-256 of the cookie's token is kept.
export const userSessionsTable = pgTable("user_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  clerkId: text("clerk_id").notNull().references(() => userCredentialsTable.clerkId, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => [
  index("user_sessions_clerk_id_idx").on(table.clerkId),
]);

// Single-use "set your password" links a household admin hands out.
export const passwordSetupTokensTable = pgTable("password_setup_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  clerkId: text("clerk_id").notNull().references(() => userCredentialsTable.clerkId, { onDelete: "cascade" }),
  createdByClerkId: text("created_by_clerk_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
}, (table) => [
  index("password_setup_tokens_clerk_id_idx").on(table.clerkId),
]);

export type UserCredentials = typeof userCredentialsTable.$inferSelect;
