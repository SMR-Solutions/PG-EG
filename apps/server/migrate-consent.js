/**
 * Migration: Add consent_version and consent_given_at columns to owners table (Chunk 8)
 * Backward-compatible: both columns are nullable, no existing rows are affected.
 * Run once: node migrate-consent.js
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config();

const sql = neon(process.env.DATABASE_URL);

async function migrate() {
  console.log("Running migration: add consent columns to owners...");

  await sql`
    ALTER TABLE owners
      ADD COLUMN IF NOT EXISTS consent_version  INTEGER,
      ADD COLUMN IF NOT EXISTS consent_given_at TIMESTAMPTZ
  `;
  console.log("  consent_version  (INTEGER, nullable) — added");
  console.log("  consent_given_at (TIMESTAMPTZ, nullable) — added");

  // Confirm the columns exist in the live schema
  const cols = await sql`
    SELECT column_name, data_type, is_nullable
    FROM   information_schema.columns
    WHERE  table_name = 'owners'
      AND  column_name IN ('consent_version', 'consent_given_at')
    ORDER  BY column_name
  `;
  console.log("\nVerified live columns:");
  cols.forEach(c => console.log(`  ${c.column_name}: ${c.data_type} (nullable=${c.is_nullable})`));

  console.log("\nMigration complete!");
}

migrate().catch((e) => { console.error("Migration failed:", e); process.exit(1); });
