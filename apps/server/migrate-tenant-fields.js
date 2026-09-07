const { neon } = require("@neondatabase/serverless");
require("dotenv").config();

const sql = neon(process.env.DATABASE_URL);

async function migrate() {
  await sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS alt_phone TEXT`;
  await sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS emergency_contact TEXT`;
  await sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS emergency_relation TEXT`;
  await sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS payment_mode TEXT`;
  console.log("✅ Migration done! New columns added to tenants table.");
}

migrate().catch((e) => { console.error("Migration failed:", e); process.exit(1); });
