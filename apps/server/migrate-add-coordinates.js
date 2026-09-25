/**
 * Migration: Add latitude + longitude columns to the pgs table
 * Run once: node migrate-add-coordinates.js
 */
import dotenv from "dotenv";
dotenv.config();

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

async function migrate() {
  console.log("🔧 Running migration: add latitude/longitude to pgs table...");
  try {
    await sql`
      ALTER TABLE pgs
        ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
    `;
    console.log("✅ Migration complete! latitude and longitude columns added to pgs.");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  }
}

migrate();
