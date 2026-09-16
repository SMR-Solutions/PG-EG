require('dotenv').config();
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);
sql`ALTER TABLE owners ADD COLUMN IF NOT EXISTS photo_url TEXT`
  .then(() => { console.log('Migration OK: photo_url added to owners'); })
  .catch(e => { console.error('Migration error:', e.message); process.exit(1); });
