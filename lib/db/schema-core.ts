import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Users
export const appUser = pgTable("app_user", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),

  // MOTI-001: Practice streak tracking
  streakCurrent: integer("streak_current").default(0).notNull(),
  streakLongest: integer("streak_longest").default(0).notNull(),
  lastPracticeDate: timestamp("last_practice_date", { withTimezone: true }),
});
