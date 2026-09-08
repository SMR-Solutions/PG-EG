const { neon } = require("@neondatabase/serverless");
require("dotenv").config();

const sql = neon(process.env.DATABASE_URL);

async function migrate() {
  // Add paidAmount to rent_payments
  await sql`ALTER TABLE rent_payments ADD COLUMN IF NOT EXISTS paid_amount INTEGER NOT NULL DEFAULT 0`;
  console.log("✅ Added paid_amount to rent_payments");

  // Create rent_payment_transactions table
  await sql`
    CREATE TABLE IF NOT EXISTS rent_payment_transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      rent_payment_id UUID NOT NULL REFERENCES rent_payments(id) ON DELETE CASCADE,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      pg_id UUID NOT NULL REFERENCES pgs(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL,
      payment_mode TEXT NOT NULL DEFAULT 'cash',
      note TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `;
  console.log("✅ Created rent_payment_transactions table");

  // Migrate existing paid records: set paidAmount = amount for records already marked paid
  await sql`UPDATE rent_payments SET paid_amount = amount WHERE status = 'paid' AND paid_amount = 0`;
  console.log("✅ Migrated existing paid records");

  console.log("\n🎉 Migration complete!");
}

migrate().catch((e) => { console.error("Migration failed:", e); process.exit(1); });
