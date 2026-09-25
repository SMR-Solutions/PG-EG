import dotenv from "dotenv";
dotenv.config();
import { neon } from "@neondatabase/serverless";

async function run() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`ALTER TABLE owners ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'owner'`;
  console.log("✅ Done: role column added to owners table");
}
run().catch((e) => { console.error(e); process.exit(1); });
