/**
 * Backfill: Expand existing locationLinks and store lat/lng for all PGs.
 * Run: npx tsx migrate-backfill-coordinates.ts
 */
import dotenv from "dotenv";
dotenv.config();

import { neon } from "@neondatabase/serverless";
import { resolveMapsLink, extractCoordsFromUrl } from "./src/utils/maps";

const sql = neon(process.env.DATABASE_URL!);

async function backfill() {
  console.log("🔧 Backfilling coordinates for existing PGs...\n");

  // Raw query to get PGs with locationLink but no coordinates yet
  const result = await sql`
    SELECT id, name, location_link
    FROM pgs
    WHERE location_link IS NOT NULL
      AND (latitude IS NULL OR longitude IS NULL)
  `;

  console.log(`Found ${result.length} PG(s) to process.\n`);

  let success = 0;
  let failed = 0;

  for (const pg of result) {
    const id: string = pg.id;
    const name: string = pg.name;
    const locationLink: string = pg.location_link;

    process.stdout.write(`  Processing: ${name} (${id.slice(0, 8)}...)  `);

    // Try direct extraction first (full URL), then resolve short link
    let coords = extractCoordsFromUrl(locationLink);
    if (!coords) {
      coords = await resolveMapsLink(locationLink);
    }

    if (coords) {
      await sql`
        UPDATE pgs
        SET latitude = ${coords.lat}, longitude = ${coords.lng}
        WHERE id = ${id}
      `;
      console.log(`✅ lat=${coords.lat.toFixed(6)}, lng=${coords.lng.toFixed(6)}`);
      success++;
    } else {
      console.log(`⚠️  Could not extract coords`);
      failed++;
    }
  }

  console.log(`\n✅ Done! ${success} updated, ${failed} skipped.`);
  if (failed > 0) {
    console.log(`ℹ️  For skipped PGs, ask owners to re-paste the full Google Maps browser URL.`);
  }
}

backfill().catch((err) => {
  console.error("❌ Backfill failed:", err);
  process.exit(1);
});
