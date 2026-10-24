import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";
dotenv.config();

const sql = neon(process.env.DATABASE_URL);

async function test() {
  console.log("=== Testing Leads Metrics Funnel ===");
  // Pick an existing PG
  const [pg] = await sql`SELECT id, owner_id FROM pgs LIMIT 1`;
  if (!pg) {
    console.log("No PG found in database");
    return;
  }
  const pgId = pg.id;
  const testVisitor = "test-visitor-" + Date.now();
  console.log("Using pgId:", pgId, "testVisitor:", testVisitor);

  // 1. Owner shares PG -> pg_shared
  await sql`INSERT INTO pg_events (pg_id, event_type, visitor_id) VALUES (${pgId}, 'pg_shared', ${testVisitor})`;

  // Check metrics for testVisitor
  let res = await sql`
    WITH filtered AS (
      SELECT pg_id, visitor_id, event_type
      FROM   pg_events
      WHERE  pg_id = ${pgId}::uuid AND visitor_id = ${testVisitor}
    ),
    visitors AS (SELECT DISTINCT pg_id, visitor_id FROM filtered),
    gallery AS (SELECT DISTINCT pg_id, visitor_id FROM filtered WHERE event_type = 'pg_gallery_open'),
    interest AS (SELECT DISTINCT pg_id, visitor_id FROM filtered WHERE event_type = 'pg_saved'),
    enquire AS (SELECT DISTINCT pg_id, visitor_id FROM filtered WHERE event_type = 'pg_enquire_clicked'),
    directions AS (SELECT DISTINCT pg_id, visitor_id FROM filtered WHERE event_type = 'pg_directions_clicked')
    SELECT
      COUNT(DISTINCT g.visitor_id) AS views,
      COUNT(DISTINCT i.visitor_id) AS interested_leads,
      COUNT(DISTINCT CASE WHEN g.visitor_id IS NOT NULL AND (e.visitor_id IS NOT NULL OR d.visitor_id IS NOT NULL) THEN v.visitor_id END) AS qualified_leads
    FROM visitors v
    LEFT JOIN gallery g ON v.pg_id = g.pg_id AND v.visitor_id = g.visitor_id
    LEFT JOIN interest i ON v.pg_id = i.pg_id AND v.visitor_id = i.visitor_id
    LEFT JOIN enquire e ON v.pg_id = e.pg_id AND v.visitor_id = e.visitor_id
    LEFT JOIN directions d ON v.pg_id = d.pg_id AND v.visitor_id = d.visitor_id
  `;
  console.log("After pg_shared only:", res[0]);

  // 2. Visitor opens & views images -> pg_gallery_open
  await sql`INSERT INTO pg_events (pg_id, event_type, visitor_id) VALUES (${pgId}, 'pg_gallery_open', ${testVisitor})`;
  res = await sql`
    WITH filtered AS (
      SELECT pg_id, visitor_id, event_type
      FROM   pg_events
      WHERE  pg_id = ${pgId}::uuid AND visitor_id = ${testVisitor}
    ),
    visitors AS (SELECT DISTINCT pg_id, visitor_id FROM filtered),
    gallery AS (SELECT DISTINCT pg_id, visitor_id FROM filtered WHERE event_type = 'pg_gallery_open'),
    interest AS (SELECT DISTINCT pg_id, visitor_id FROM filtered WHERE event_type = 'pg_saved'),
    enquire AS (SELECT DISTINCT pg_id, visitor_id FROM filtered WHERE event_type = 'pg_enquire_clicked'),
    directions AS (SELECT DISTINCT pg_id, visitor_id FROM filtered WHERE event_type = 'pg_directions_clicked')
    SELECT
      COUNT(DISTINCT g.visitor_id) AS views,
      COUNT(DISTINCT i.visitor_id) AS interested_leads,
      COUNT(DISTINCT CASE WHEN g.visitor_id IS NOT NULL AND (e.visitor_id IS NOT NULL OR d.visitor_id IS NOT NULL) THEN v.visitor_id END) AS qualified_leads
    FROM visitors v
    LEFT JOIN gallery g ON v.pg_id = g.pg_id AND v.visitor_id = g.visitor_id
    LEFT JOIN interest i ON v.pg_id = i.pg_id AND v.visitor_id = i.visitor_id
    LEFT JOIN enquire e ON v.pg_id = e.pg_id AND v.visitor_id = e.visitor_id
    LEFT JOIN directions d ON v.pg_id = d.pg_id AND v.visitor_id = d.visitor_id
  `;
  console.log("After viewing images:", res[0]);

  // 3. Visitor saves PG -> pg_saved
  await sql`INSERT INTO pg_events (pg_id, event_type, visitor_id) VALUES (${pgId}, 'pg_saved', ${testVisitor})`;
  res = await sql`
    WITH filtered AS (
      SELECT pg_id, visitor_id, event_type
      FROM   pg_events
      WHERE  pg_id = ${pgId}::uuid AND visitor_id = ${testVisitor}
    ),
    visitors AS (SELECT DISTINCT pg_id, visitor_id FROM filtered),
    gallery AS (SELECT DISTINCT pg_id, visitor_id FROM filtered WHERE event_type = 'pg_gallery_open'),
    interest AS (SELECT DISTINCT pg_id, visitor_id FROM filtered WHERE event_type = 'pg_saved'),
    enquire AS (SELECT DISTINCT pg_id, visitor_id FROM filtered WHERE event_type = 'pg_enquire_clicked'),
    directions AS (SELECT DISTINCT pg_id, visitor_id FROM filtered WHERE event_type = 'pg_directions_clicked')
    SELECT
      COUNT(DISTINCT g.visitor_id) AS views,
      COUNT(DISTINCT i.visitor_id) AS interested_leads,
      COUNT(DISTINCT CASE WHEN g.visitor_id IS NOT NULL AND (e.visitor_id IS NOT NULL OR d.visitor_id IS NOT NULL) THEN v.visitor_id END) AS qualified_leads
    FROM visitors v
    LEFT JOIN gallery g ON v.pg_id = g.pg_id AND v.visitor_id = g.visitor_id
    LEFT JOIN interest i ON v.pg_id = i.pg_id AND v.visitor_id = i.visitor_id
    LEFT JOIN enquire e ON v.pg_id = e.pg_id AND v.visitor_id = e.visitor_id
    LEFT JOIN directions d ON v.pg_id = d.pg_id AND v.visitor_id = d.visitor_id
  `;
  console.log("After saving PG:", res[0]);

  // 4. Visitor clicks Enquire -> pg_enquire_clicked
  await sql`INSERT INTO pg_events (pg_id, event_type, visitor_id) VALUES (${pgId}, 'pg_enquire_clicked', ${testVisitor})`;
  res = await sql`
    WITH filtered AS (
      SELECT pg_id, visitor_id, event_type
      FROM   pg_events
      WHERE  pg_id = ${pgId}::uuid AND visitor_id = ${testVisitor}
    ),
    visitors AS (SELECT DISTINCT pg_id, visitor_id FROM filtered),
    gallery AS (SELECT DISTINCT pg_id, visitor_id FROM filtered WHERE event_type = 'pg_gallery_open'),
    interest AS (SELECT DISTINCT pg_id, visitor_id FROM filtered WHERE event_type = 'pg_saved'),
    enquire AS (SELECT DISTINCT pg_id, visitor_id FROM filtered WHERE event_type = 'pg_enquire_clicked'),
    directions AS (SELECT DISTINCT pg_id, visitor_id FROM filtered WHERE event_type = 'pg_directions_clicked')
    SELECT
      COUNT(DISTINCT g.visitor_id) AS views,
      COUNT(DISTINCT i.visitor_id) AS interested_leads,
      COUNT(DISTINCT CASE WHEN g.visitor_id IS NOT NULL AND (e.visitor_id IS NOT NULL OR d.visitor_id IS NOT NULL) THEN v.visitor_id END) AS qualified_leads
    FROM visitors v
    LEFT JOIN gallery g ON v.pg_id = g.pg_id AND v.visitor_id = g.visitor_id
    LEFT JOIN interest i ON v.pg_id = i.pg_id AND v.visitor_id = i.visitor_id
    LEFT JOIN enquire e ON v.pg_id = e.pg_id AND v.visitor_id = e.visitor_id
    LEFT JOIN directions d ON v.pg_id = d.pg_id AND v.visitor_id = d.visitor_id
  `;
  console.log("After clicking Enquire:", res[0]);

  // 5. Test another visitor who clicks Directions only
  const testVisitor2 = "test-visitor-directions-" + Date.now();
  await sql`INSERT INTO pg_events (pg_id, event_type, visitor_id) VALUES (${pgId}, 'pg_gallery_open', ${testVisitor2})`;
  await sql`INSERT INTO pg_events (pg_id, event_type, visitor_id) VALUES (${pgId}, 'pg_directions_clicked', ${testVisitor2})`;
  res = await sql`
    WITH filtered AS (
      SELECT pg_id, visitor_id, event_type
      FROM   pg_events
      WHERE  pg_id = ${pgId}::uuid AND visitor_id = ${testVisitor2}
    ),
    visitors AS (SELECT DISTINCT pg_id, visitor_id FROM filtered),
    gallery AS (SELECT DISTINCT pg_id, visitor_id FROM filtered WHERE event_type = 'pg_gallery_open'),
    interest AS (SELECT DISTINCT pg_id, visitor_id FROM filtered WHERE event_type = 'pg_saved'),
    enquire AS (SELECT DISTINCT pg_id, visitor_id FROM filtered WHERE event_type = 'pg_enquire_clicked'),
    directions AS (SELECT DISTINCT pg_id, visitor_id FROM filtered WHERE event_type = 'pg_directions_clicked')
    SELECT
      COUNT(DISTINCT g.visitor_id) AS views,
      COUNT(DISTINCT i.visitor_id) AS interested_leads,
      COUNT(DISTINCT CASE WHEN g.visitor_id IS NOT NULL AND (e.visitor_id IS NOT NULL OR d.visitor_id IS NOT NULL) THEN v.visitor_id END) AS qualified_leads
    FROM visitors v
    LEFT JOIN gallery g ON v.pg_id = g.pg_id AND v.visitor_id = g.visitor_id
    LEFT JOIN interest i ON v.pg_id = i.pg_id AND v.visitor_id = i.visitor_id
    LEFT JOIN enquire e ON v.pg_id = e.pg_id AND v.visitor_id = e.visitor_id
    LEFT JOIN directions d ON v.pg_id = d.pg_id AND v.visitor_id = d.visitor_id
  `;
  console.log("Visitor 2 with Directions only:", res[0]);
  await sql`DELETE FROM pg_events WHERE visitor_id = ${testVisitor2}`;

  // Cleanup test rows
  await sql`DELETE FROM pg_events WHERE visitor_id = ${testVisitor}`;
  console.log("Cleanup done!");
}

test().catch(console.error);
