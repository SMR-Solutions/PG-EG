import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function migrate() {
  console.log("Fixing rooms.floor column type text → integer...");
  // Safe: rooms table is empty, just recreate the column
  await sql`ALTER TABLE rooms DROP COLUMN floor`;
  await sql`ALTER TABLE rooms ADD COLUMN floor integer NOT NULL DEFAULT 1`;
  await sql`ALTER TABLE rooms ALTER COLUMN rent_amount SET DEFAULT 0`;
  console.log("✅ Done");
}

migrate().catch(console.error);
