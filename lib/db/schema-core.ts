import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Users
export const appUser = pgTable("app_user", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),

  // Legacy read-only compatibility. SAV-257 stopped active writes; retain these
  // columns until a separately approved export/retention migration removes them.
  streakCurrent: integer("streak_current").default(0).notNull(),
  streakLongest: integer("streak_longest").default(0).notNull(),
  lastPracticeDate: timestamp("last_practice_date", { withTimezone: true }),
});
