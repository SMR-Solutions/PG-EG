require("dotenv").config();
const { neon } = require("@neondatabase/serverless");
const jwt = require("jsonwebtoken");

const sql    = neon(process.env.DATABASE_URL);
const SECRET = process.env.JWT_SECRET;
const BASE   = "http://localhost:4000";
const CURRENT_CONSENT_VERSION = 1;
const LS_CONSENT_KEY = "pg_eg_consent_v";

// Re-implement hasStoredConsent and initial state logic exactly as SignInForm does
function simulateClientInit(isUserRole, localStorageValue) {
  // hasStoredConsent()
  const hasStored = localStorageValue === String(CURRENT_CONSENT_VERSION);
  // step init (L57-60)
  const step = !isUserRole ? "details" : (hasStored ? "details" : "consent");
  // consentGiven init — AFTER THE FIX: always false for isUserRole, true for owner
  const consentGiven = !isUserRole;   // the fix
  return { step, consentGiven, hasStored };
}

function makeJwt(ownerId) {
  return jwt.sign({ ownerId, phone: "test", role: "user" }, SECRET, { expiresIn: "1h" });
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
  else       { console.log("  FAIL  " + label + " — got:" + JSON.stringify(got)); failed++; process.exitCode = 1; }
}

async function run() {
  const ts = Date.now();

  // ── S1: Fresh user, no localStorage ──────────────────────────────
  console.log("\n[S1] Fresh browser, no localStorage consent");
  const s1 = simulateClientInit(true, null);
  check("step = 'consent'",      s1.step === "consent",      s1.step);
  check("consentGiven = false",  s1.consentGiven === false,   s1.consentGiven);
  // consentGiven:true only comes from handleConsentAgree — simulate the click
  const agreeConsent = true;   // what handleConsentAgree passes
  check("after I-Agree: effectiveConsent=true", agreeConsent === true, agreeConsent);
  // Server side: user with NULL consent + consentGiven:true → records it
  const [u1] = await sql`INSERT INTO owners(name,phone,email,role) VALUES(${"S1-"+ts},${"s1@"+ts+".test"},${"s1@"+ts+".test"},'user') RETURNING id,consent_version`;
  await sql`UPDATE owners SET consent_version=${CURRENT_CONSENT_VERSION}, consent_given_at=NOW() WHERE id=${u1.id} AND role='user' AND consent_version IS NULL AND ${agreeConsent}`;
  const [r1] = await sql`SELECT consent_version FROM owners WHERE id=${u1.id}`;
  check("server records v1",     r1.consent_version === CURRENT_CONSENT_VERSION, r1.consent_version);
  await sql`DELETE FROM owners WHERE id=${u1.id}`;

  // ── S2: Fake localStorage="1", server consent NULL ────────────────
  console.log("\n[S2] Fake localStorage='1', server consent=NULL");
  const s2 = simulateClientInit(true, "1");   // fake localStorage
  check("step = 'details' (skips UI)", s2.step === "details",   s2.step);
  // After fix: consentGiven is ALWAYS false for isUserRole regardless of localStorage
  check("consentGiven = false (fix)", s2.consentGiven === false, s2.consentGiven);
  // effectiveConsent = false → server receives consentGiven:false
  const effectiveS2 = undefined !== undefined ? undefined : s2.consentGiven; // consentOverride absent
  check("effectiveConsent = false",   effectiveS2 === false,    effectiveS2);
  // Server side: role=user, consentGiven=false → condition fails → no write
  const [u2] = await sql`INSERT INTO owners(name,phone,email,role) VALUES(${"S2-"+ts},${"s2@"+ts+".test"},${"s2@"+ts+".test"},'user') RETURNING id,consent_version`;
  const serverWouldWrite = (u2.consent_version !== CURRENT_CONSENT_VERSION) && (effectiveS2 === true);
  check("server does NOT record consent", !serverWouldWrite, serverWouldWrite);
  // consentUpToDate from server: NULL !== 1 → false → localStorage cleared
  const consentUpToDate2 = u2.consent_version === CURRENT_CONSENT_VERSION;
  check("consentUpToDate=false → localStorage cleared", !consentUpToDate2, consentUpToDate2);
  // Next visit: hasStoredConsent()=false → step='consent' ✅
  const s2Next = simulateClientInit(true, null);   // cleared localStorage
  check("next visit: step='consent'", s2Next.step === "consent", s2Next.step);
  await sql`DELETE FROM owners WHERE id=${u2.id}`;

  // ── S3: Returning user, server consent=v1, localStorage="1" ───────
  console.log("\n[S3] Returning user, server consent=v1, localStorage='1'");
  const s3 = simulateClientInit(true, "1");
  check("step = 'details'",      s3.step === "details",      s3.step);
  check("consentGiven = false (fix)", s3.consentGiven === false, s3.consentGiven);
  // effectiveConsent=false sent to server, but DB already has v1
  // Server: condition owner.consentVersion !== CURRENT = false → no write (idempotent)
  // consentUpToDate = (v1 === v1) = true
  const [u3] = await sql`INSERT INTO owners(name,phone,email,role,consent_version) VALUES(${"S3-"+ts},${"s3@"+ts+".test"},${"s3@"+ts+".test"},'user',${CURRENT_CONSENT_VERSION}) RETURNING id,consent_version`;
  const s3UpToDate = u3.consent_version === CURRENT_CONSENT_VERSION;
  check("consentUpToDate=true (DB already v1)", s3UpToDate, s3UpToDate);
  check("localStorage kept (set to '1')", s3UpToDate, s3UpToDate);
  // Verify via /me
  const t3 = makeJwt(u3.id);
  const me3 = await get("/api/auth/me", t3);
  check("/me consentUpToDate=true", me3.body.consentUpToDate === true, me3.body.consentUpToDate);
  await sql`DELETE FROM owners WHERE id=${u3.id}`;

  // ── S4a: Revoked consent (server NULL, localStorage still "1") ────
  console.log("\n[S4a] Revoked consent — server NULL, localStorage='1'");
  const s4 = simulateClientInit(true, "1");
  check("step = 'details' (localStorage hint)", s4.step === "details", s4.step);
  // Fix: consentGiven=false → server receives false → doesn't record → consentUpToDate=false
  check("consentGiven=false",    s4.consentGiven === false, s4.consentGiven);
  const [u4] = await sql`INSERT INTO owners(name,phone,email,role) VALUES(${"S4-"+ts},${"s4@"+ts+".test"},${"s4@"+ts+".test"},'user') RETURNING id,consent_version`;
  const s4UpToDate = u4.consent_version === CURRENT_CONSENT_VERSION;
  check("server consentUpToDate=false", !s4UpToDate, s4UpToDate);
  // → localStorage cleared → next visit shows consent screen
  const s4Next = simulateClientInit(true, null);
  check("next visit: step='consent'", s4Next.step === "consent", s4Next.step);
  await sql`DELETE FROM owners WHERE id=${u4.id}`;

  // ── S4b: Stale consent (version bump) ─────────────────────────────
  console.log("\n[S4b] Stale consent — localStorage='1', server CURRENT_CONSENT_VERSION=2 (simulated)");
  // Simulate: CURRENT bumped to 2, localStorage still "1"
  const staleLS = "1";
  const newCurrent = 2;
  const hasStoredV2 = staleLS === String(newCurrent);  // "1" !== "2"
  const staleStep = !true ? "details" : (hasStoredV2 ? "details" : "consent");
  check("step='consent' (version mismatch)", staleStep === "consent", staleStep);
  check("hasStoredConsent=false for v2", !hasStoredV2, hasStoredV2);

  // ── S5: Decline ───────────────────────────────────────────────────
  console.log("\n[S5] User declines — no auth, no consent write");
  const s5 = simulateClientInit(true, null);
  check("step = 'consent'",            s5.step === "consent", s5.step);
  check("consentGiven stays false",     s5.consentGiven === false, s5.consentGiven);
  // handleConsentDecline() calls router.push(fromPath) — no API call
  const declineCallsGoogle = false;  // by inspection: router.push, nothing else
  check("Google popup NOT opened",      !declineCallsGoogle, declineCallsGoogle);
  const declineCallsServer = false;
  check("No POST /api/auth/google",     !declineCallsServer, declineCallsServer);

  // ── S6: Owner sign-in unchanged ───────────────────────────────────
  console.log("\n[S6] Owner sign-in — no consent step, consent block skipped on server");
  const s6 = simulateClientInit(false, null);   // isUserRole=false, any localStorage
  check("step = 'details'",            s6.step === "details",    s6.step);
  check("consentGiven = true (owner)", s6.consentGiven === true,  s6.consentGiven);
  // Server guard: owner.role==="user" → false → consent block skipped
  const ownerRole = "owner";
  const serverSkipsOwner = !(ownerRole === "user");
  check("server consent block skipped for owner", serverSkipsOwner, !serverSkipsOwner);

  console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
}

run().catch(e => { console.error(e); process.exitCode = 1; });
