import { pgTable, serial, text, timestamp, date, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { propertiesTable } from "./properties";

export const peopleTable = pgTable("people", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id").references(() => propertiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  groups: text("groups").array().notNull().default([]),
  photoUrl: text("photo_url"),
  phone: text("phone"),
  email: text("email"),
  notes: text("notes"),
  lastContactedAt: date("last_contacted_at"),
  nextFollowUpAt: date("next_follow_up_at"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contractorsTable = pgTable("contractors", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id").references(() => propertiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  trade: text("trade").notNull(),
  phone: text("phone"),
  email: text("email"),
  notes: text("notes"),
  pastWork: text("past_work"),
  preferred: boolean("preferred").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPersonSchema = createInsertSchema(peopleTable).omit({ id: true, createdAt: true });
export type InsertPerson = z.infer<typeof insertPersonSchema>;
export type Person = typeof peopleTable.$inferSelect;
export const insertContractorSchema = createInsertSchema(contractorsTable).omit({ id: true, createdAt: true });
export type InsertContractor = z.infer<typeof insertContractorSchema>;
export type Contractor = typeof contractorsTable.$inferSelect;