import { pgTable, uuid, text, timestamp, integer, numeric, jsonb, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Users
export const appUser = pgTable("app_user", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Interview sessions
export const interviewSession = pgTable("interview_session", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => appUser.id).notNull(),
  role: text("role").default("pm"),
  roundType: text("round_type").notNull(),
  mode: text("mode").notNull(),
  persona: text("persona"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
}, (table) => ({
  roundTypeCheck: check(
    "round_type_check",
    sql`${table.roundType} IN ('behavioral', 'product_sense', 'execution', 'strategy')`
  ),
  modeCheck: check(
    "mode_check",
    sql`${table.mode} IN ('voice_video', 'text')`
  ),
}));

// Turn-level transcript
export const transcriptTurn = pgTable("transcript_turn", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").references(() => interviewSession.id).notNull(),
  speaker: text("speaker").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  text: text("text"),
  audioMs: integer("audio_ms"),
  latencyMs: integer("latency_ms"),
  section: text("section"),
}, (table) => ({
  speakerCheck: check(
    "speaker_check",
    sql`${table.speaker} IN ('user', 'interviewer')`
  ),
}));

// Feedback / scoring
export const feedback = pgTable("feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").references(() => interviewSession.id).unique().notNull(),
  structureScore: integer("structure_score"),
  clarityScore: integer("clarity_score"),
  insightScore: integer("insight_score"),
  communicationScore: integer("communication_score"),
  leadershipScore: integer("leadership_score"),
  overallScore: numeric("overall_score"),
  strengths: jsonb("strengths"),
  improvements: jsonb("improvements"),
  drills: jsonb("drills"),
  summary: text("summary"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
