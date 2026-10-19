/**
 * Migration: Create pg_events table for PG view-event tracking (Chunk 2 — Leads)
 * Run once: node migrate-pg-events.js
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config();

const sql = neon(process.env.DATABASE_URL);

async function migrate() {
  console.log("🔧 Running migration: create pg_events table...");

  await sql`
    CREATE TABLE IF NOT EXISTS pg_events (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      pg_id       UUID        NOT NULL REFERENCES pgs(id) ON DELETE CASCADE,
      event_type  TEXT        NOT NULL,
      visitor_id  TEXT        NOT NULL,
      created_at  TIMESTAMP   NOT NULL DEFAULT NOW()
    )
  `;
  console.log("✅ Created pg_events table");

  await sql`CREATE INDEX IF NOT EXISTS idx_pg_events_pg_id       ON pg_events(pg_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_pg_events_event_type  ON pg_events(event_type)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_pg_events_created_at  ON pg_events(created_at)`;
  console.log("✅ Created indexes on pg_events");

  console.log("\n🎉 Migration complete!");
}

migrate().catch((e) => { console.error("❌ Migration failed:", e); process.exit(1); });
