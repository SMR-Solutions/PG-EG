const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { neon } = require('@neondatabase/serverless');

if (!process.env.DATABASE_URL) {
  console.error("No DATABASE_URL found");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function run() {
  console.log('Running migration for live_video columns on pgs table...');
  await sql`ALTER TABLE pgs ADD COLUMN IF NOT EXISTS live_video_url TEXT`;
  await sql`ALTER TABLE pgs ADD COLUMN IF NOT EXISTS live_video TEXT`;
  console.log('Migration OK: live_video_url and live_video added to pgs');
}

run().catch((e) => {
  console.error('Migration error:', e.message);
  process.exit(1);
});
