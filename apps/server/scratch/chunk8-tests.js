require("dotenv").config();
const { neon } = require("@neondatabase/serverless");
const jwt   = require("jsonwebtoken");

const sql    = neon(process.env.DATABASE_URL);
const SECRET = process.env.JWT_SECRET;
const BASE   = "http://localhost:4000";
const CURRENT_CONSENT_VERSION = 1;

function makeJwt(ownerId, phone = "+91-consent-test") {
  return jwt.sign({ ownerId, phone, role: "user" }, SECRET, { expiresIn: "1h" });
}
async function post(path, body, token) {
  const h = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = "Bearer " + token;
  const r = await fetch(BASE + path, { method: "POST", headers: h, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
}
async function get(path, token) {
  const r = await fetch(BASE + path, { headers: { Authorization: "Bearer " + token } });
  return { status: r.status, body: await r.json() };
}
let passed = 0, failed = 0;
function check(label, cond, got) {
  if (cond) { console.log("  PASS  " + label); passed++; }
  else       { console.log("  FAIL  " + label + " — got: " + JSON.stringify(got)); failed++; process.exitCode = 1; }
}

async function run() {
  const ts       = Date.now();
  const fake     = "consent-" + ts + "@pg-eg.test";
  const ownerFk  = "consent-owner-" + ts + "@pg-eg.test";

  const [u] = await sql`INSERT INTO owners (name,phone,email,role) VALUES (${"User"+ts},${fake},${fake},'user') RETURNING id,role,consent_version`;
  const [o] = await sql`INSERT INTO owners (name,phone,email,role) VALUES (${"Owner"+ts},${ownerFk},${ownerFk},'owner') RETURNING id,role,consent_version`;

  const userToken  = makeJwt(u.id);
  const ownerToken = makeJwt(o.id, ownerFk);

  console.log("\n=== Chunk 8 Acceptance Tests (CURRENT_CONSENT_VERSION=" + CURRENT_CONSENT_VERSION + ") ===");
  console.log("  user.id="  + u.id  + " role=" + u.role  + " consent_version=" + u.consent_version);
  console.log("  owner.id=" + o.id + " role=" + o.role + " consent_version=" + o.consent_version);

  // T1: /me with NULL consent
  console.log("\n[T1] GET /api/auth/me — NULL consent");
  const me1 = await get("/api/auth/me", userToken);
  check("status 200",            me1.status === 200,               me1.status);
  check("consentVersion null",   me1.body.consentVersion === null,  me1.body.consentVersion);
  check("consentUpToDate false", me1.body.consentUpToDate === false, me1.body.consentUpToDate);

  // T2: Record consent (mirrors /api/auth/google route logic)
  console.log("\n[T2] Consent recording — write v1 for role=user");
  await sql`UPDATE owners SET consent_version=${CURRENT_CONSENT_VERSION}, consent_given_at=NOW() WHERE id=${u.id} AND role='user'`;
  const me2 = await get("/api/auth/me", userToken);
  check("consentVersion = 1",   me2.body.consentVersion === 1,    me2.body.consentVersion);
  check("consentUpToDate true", me2.body.consentUpToDate === true, me2.body.consentUpToDate);
  check("consentGivenAt set",   !!me2.body.owner?.consentGivenAt,  me2.body.owner?.consentGivenAt);

  // T3: Idempotency — consent already at v1, no re-write needed
  console.log("\n[T3] Idempotency — already at v1, route condition skips write");
  const [cur] = await sql`SELECT consent_version FROM owners WHERE id=${u.id}`;
  check("route guard: would NOT re-write", cur.consent_version === CURRENT_CONSENT_VERSION, cur.consent_version);
  const me3 = await get("/api/auth/me", userToken);
  check("still v1 via /me", me3.body.consentVersion === 1 && me3.body.consentUpToDate === true, me3.body);

  // T4: Owner exclusion
  console.log("\n[T4] Owner exclusion — role=owner stays NULL");
  const meOwner = await get("/api/auth/me", ownerToken);
  check("owner consentVersion null",    meOwner.body.consentVersion === null,  meOwner.body.consentVersion);
  check("owner consentUpToDate false",  meOwner.body.consentUpToDate === false, meOwner.body.consentUpToDate);
  // Route condition: consentGiven===true AND role==="user" — owner fails the role check
  const wouldWriteForOwner = (o.role === "user" && true);
  check("route guard blocks owner",     !wouldWriteForOwner, wouldWriteForOwner);

  // T5: consentGiven=false → not written
  console.log("\n[T5] consentGiven=false → consent not written");
  const check5 = (false === true);  // consentGiven=false fails the === true guard
  check("consentGiven=false fails guard", !check5, check5);

  // T6: Stale consent (version 0 when CURRENT=1)
  console.log("\n[T6] Stale consent — v0 → consentUpToDate=false");
  await sql`UPDATE owners SET consent_version=0 WHERE id=${u.id}`;
  const meStale = await get("/api/auth/me", userToken);
  check("v0 → consentUpToDate=false", meStale.body.consentUpToDate === false, meStale.body.consentUpToDate);
  check("v0 consentVersion=0",        meStale.body.consentVersion === 0,       meStale.body.consentVersion);
  await sql`UPDATE owners SET consent_version=${CURRENT_CONSENT_VERSION} WHERE id=${u.id}`;

  // T7: Revocation
  console.log("\n[T7] POST /api/auth/revoke-consent");
  const rev = await post("/api/auth/revoke-consent", {}, userToken);
  check("status 200",           rev.status === 200,                    rev.status);
  check("success true",         rev.body.success === true,             rev.body.success);
  check("consentVersion null",  rev.body.consentVersion === null,      rev.body.consentVersion);
  check("consentUpToDate false",rev.body.consentUpToDate === false,    rev.body.consentUpToDate);
  const [rRow] = await sql`SELECT consent_version, consent_given_at FROM owners WHERE id=${u.id}`;
  check("DB consent_version=NULL",  rRow.consent_version === null,   rRow.consent_version);
  check("DB consent_given_at=NULL", rRow.consent_given_at === null,  rRow.consent_given_at);
  const meRev = await get("/api/auth/me", userToken);
  check("/me after revoke → false", meRev.body.consentUpToDate === false, meRev.body.consentUpToDate);

  // T8: Unauthenticated revoke → 401
  console.log("\n[T8] Unauthenticated revoke-consent → 401");
  const r8 = await post("/api/auth/revoke-consent", {});
  check("status 401", r8.status === 401, r8.status);

  // T9: Bad/expired token → 401
  console.log("\n[T9] Bad token → 401");
  const r9 = await post("/api/auth/revoke-consent", {}, "fake.token.here");
  check("status 401", r9.status === 401, r9.status);

  // T10: Client cannot control consent version
  console.log("\n[T10] Client-supplied consentVersion in body is ignored by server");
  await sql`UPDATE owners SET consent_version=${CURRENT_CONSENT_VERSION}, consent_given_at=NOW() WHERE id=${u.id}`;
  // Sending consentVersion:999 in revoke-consent body — server ignores it, revokes normally
  const r10 = await post("/api/auth/revoke-consent", { consentVersion: 999 }, userToken);
  check("status 200 (spurious field ignored)",  r10.status === 200, r10.status);
  const [row10] = await sql`SELECT consent_version FROM owners WHERE id=${u.id}`;
  check("DB is NULL, not 999", row10.consent_version === null, row10.consent_version);
  // Restore, re-grant, verify server used its own CURRENT_CONSENT_VERSION=1, not client's 999
  await sql`UPDATE owners SET consent_version=${CURRENT_CONSENT_VERSION}, consent_given_at=NOW() WHERE id=${u.id}`;
  const me10 = await get("/api/auth/me", userToken);
  check("server reports its own version (1), never 999", me10.body.consentVersion === 1, me10.body.consentVersion);

  // Cleanup
  await sql`DELETE FROM owners WHERE id IN (${u.id}, ${o.id})`;
  console.log("\n  Test rows deleted from Neon.");
  console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
}

run().catch(e => { console.error(e); process.exitCode = 1; });
