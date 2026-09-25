/**
 * Backfill: Expand existing locationLinks and store lat/lng for all PGs.
 * Run once: node migrate-backfill-coordinates.js
 */
import dotenv from "dotenv";
dotenv.config();

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { extractCoordsFromUrl, resolveMapsLink } from "./src/utils/maps.js";

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql);

async function backfill() {
  console.log("🔧 Backfilling coordinates for existing PGs...\n");

  // Fetch all PGs that have a locationLink but no coordinates yet
  const rows = await db.execute(
    sql`SELECT id, name, location_link FROM pgs WHERE location_link IS NOT NULL AND (latitude IS NULL OR longitude IS NULL)`
  );

  const pgs = rows.rows ?? rows;
  console.log(`Found ${pgs.length} PG(s) to process.\n`);

  let success = 0;
  let failed = 0;

  for (const pg of pgs) {
    const { id, name, location_link } = pg;
    process.stdout.write(`  Processing: ${name} (${id.slice(0, 8)}...)  `);

    // Try direct extraction first, then resolve short link
    let coords = extractCoordsFromUrl(location_link);
    if (!coords) {
      coords = await resolveMapsLink(location_link);
    }

    if (coords) {
      await db.execute(
        sql`UPDATE pgs SET latitude = ${coords.lat}, longitude = ${coords.lng} WHERE id = ${id}`
      );
      console.log(`✅ lat=${coords.lat}, lng=${coords.lng}`);
      success++;
    } else {
      console.log(`⚠️  Could not extract coords (short link or unsupported format)`);
      failed++;
    }
  }

  console.log(`\n✅ Done! ${success} updated, ${failed} skipped (no coordinates found).`);
  if (failed > 0) {
    console.log(`\nℹ️  For skipped PGs, ask owners to re-paste their full Google Maps browser URL.`);
  }
}

backfill().catch((err) => {
  console.error("❌ Backfill failed:", err);
  process.exit(1);
});
