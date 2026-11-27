/**
 * CoupleFit – "Our First 4 Weeks Together" challenge backend.
 *
 * Deze functions staan in een EIGEN codebase ("challenge"). Deploy ALTIJD met:
 *   firebase deploy --only functions:challenge
 * Dan blijven de functions van de app (FlutterFlow + Rachelle) onaangeraakt.
 *
 * Collecties in Firestore (los van de app):
 *   challenge_couples/{key}        -> { data: {...}, createdAt, updatedAt, saves }
 *   challenge_contacts/{emailHash} -> { key, createdAt }   (geen e-mailadres in klare tekst)
 */
const { onRequest, onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const crypto = require('crypto');

admin.initializeApp();
const db = admin.firestore();
const { FieldValue } = admin.firestore;

// Zelfde regio-gebied als de database (eur3). Max 5 instanties = kosten kunnen nooit ontsporen.
setGlobalOptions({ region: 'europe-west1', maxInstances: 5, memory: '256MiB', timeoutSeconds: 30 });

const BREVO_API_KEY = defineSecret('BREVO_API_KEY');
const WEBHOOK_TOKEN = defineSecret('CHALLENGE_WEBHOOK_TOKEN');
const RC_WEBHOOK_TOKEN = defineSecret('REVENUECAT_WEBHOOK_TOKEN');

// ID('s) van de Brevo-wachtlijst. Leeg = elke lijst-toevoeging telt.
const WAITLIST_LIST_IDS = [];

const COUPLES = 'challenge_couples';
const CONTACTS = 'challenge_contacts';
const FEEDBACK = 'challenge_feedback';
const KEY_RE = /^[A-Za-z0-9_-]{32}$/;
const MAX_SAVES_PER_DAY = 2000;

// Toegestane velden (alles wat de pagina kan opslaan) en hun maximale lengte.
const PATH_RE = /^(names\.[ab]|start\.[ab]_q[0-2]|start\.compare|fb\.q[0-2]|w[1-4]\.(i[0-3]_[ab]|plan_(when|where|what)|sync[01])|t\.w[0-3]d[0-6][ab])$/;

const ALLOWED_ORIGINS = [
  'https://couple-fit.com',
  'https://www.couple-fit.com',
  'https://couple-fit-vqmblh.web.app',
  'https://couple-fit-vqmblh.firebaseapp.com',
];
const PREVIEW_ORIGIN_RE = /^https:\/\/couple-fit-vqmblh--[a-z0-9-]+\.web\.app$/; // hosting preview channels

// ---------------------------------------------------------------- helpers
const normEmail = (e) => (typeof e === 'string' ? e.trim().toLowerCase() : '');
const hashEmail = (e) => crypto.createHash('sha256').update(e).digest('hex');
const newKey = () => crypto.randomBytes(24).toString('base64url'); // 32 tekens

function safeEqual(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

function originOk(req) {
  const o = req.get('origin');
  if (!o) return true; // same-origin GET / sendBeacon kan geen Origin sturen
  return ALLOWED_ORIGINS.includes(o) || PREVIEW_ORIGIN_RE.test(o);
}

// Founding-plekken (zie founding.js)
const founding = require('./founding')({ db, FieldValue, logger, hashEmail, normEmail, brevoKey: () => BREVO_API_KEY.value() });

async function brevoSetKey(email, key) {
  const res = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, {
    method: 'PUT',
    headers: { 'api-key': BREVO_API_KEY.value(), 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ attributes: { CHALLENGE_KEY: key } }),
  });
  if (!res.ok) throw new Error(`Brevo update failed: ${res.status} ${await res.text()}`);
}

async function ensureChallenge(email) {
  const contactRef = db.collection(CONTACTS).doc(hashEmail(email));
  const key = await db.runTransaction(async (t) => {
    const snap = await t.get(contactRef);
    if (snap.exists && snap.get('key')) return snap.get('key');
    const k = newKey();
    const now = FieldValue.serverTimestamp();
    t.set(contactRef, { key: k, createdAt: now });
    t.set(db.collection(COUPLES).doc(k), { data: {}, createdAt: now, updatedAt: now, saves: { day: '', count: 0 } });
    return k;
  });
  await brevoSetKey(email, key);
  return key;
}

async function removeChallenge(email) {
  const contactRef = db.collection(CONTACTS).doc(hashEmail(email));
  const snap = await contactRef.get();
  if (!snap.exists) return;
  const key = snap.get('key');
  const batch = db.batch();
  if (key) batch.delete(db.collection(COUPLES).doc(key));
  if (key) batch.delete(db.collection(FEEDBACK).doc(key));
  batch.delete(contactRef);
  await batch.commit();
}

// ---------------------------------------------------------------- Brevo webhook
// In Brevo: Webhooks > Marketing > URL:
//   https://europe-west1-couple-fit-vqmblh.cloudfunctions.net/challengeBrevoWebhook?token=<CHALLENGE_WEBHOOK_TOKEN>
// Events: "Contact added to list" (na bevestiging double opt-in) en "Unsubscribed" (+ evt. "Contact deleted").
exports.challengeBrevoWebhook = onRequest({ secrets: [BREVO_API_KEY, WEBHOOK_TOKEN] }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');
  if (!safeEqual(req.query.token, WEBHOOK_TOKEN.value())) return res.status(401).send('Unauthorized');

  const events = Array.isArray(req.body) ? req.body : [req.body || {}];
  let failed = false;
  for (const ev of events) {
    const email = normEmail(ev.email);
    const type = String(ev.event || '').toLowerCase().replace(/[^a-z]/g, '');
    logger.info('brevo event', { type, hasEmail: !!email });
    if (!email) continue;
    try {
      if (['unsubscribed', 'unsubscribe', 'contactdeleted', 'delete', 'deleted'].includes(type)) {
        await removeChallenge(email);
      } else if (['listaddition', 'contactaddedtolist', 'addedtolist'].includes(type)) {
        const lists = [].concat(ev.list_id || ev.listId || ev.list_ids || []).map(Number);
        if (WAITLIST_LIST_IDS.length && !lists.some((l) => WAITLIST_LIST_IDS.includes(l))) continue;
        await ensureChallenge(email);
        try {
          await founding.assignFounding(email);
        } catch (err) {
          failed = true; // Brevo stuurt het event opnieuw; assignFounding is veilig om te herhalen
          logger.error('founding assign failed', { error: String(err && err.message || err).slice(0, 500) });
        }
      }
    } catch (err) {
      failed = true;
      logger.error('challenge webhook failed', { type, error: String(err && err.message || err).slice(0, 500), code: String(err && err.code || '') });
    }
  }
  return res.status(failed ? 500 : 200).json({ ok: !failed });
});

// ---------------------------------------------------------------- API voor de pagina
// Bereikbaar via couple-fit.com/api/challenge/... (Hosting rewrite in firebase.json)
exports.challengeApi = onRequest(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex');
  const route = req.path.replace(/^\/api\/challenge/, '') || '/';

  try {
    // GET /state?k=...
    if (req.method === 'GET' && route === '/state') {
      const k = String(req.query.k || '');
      if (!KEY_RE.test(k)) return res.status(404).json({ error: 'not_found' });
      const snap = await db.collection(COUPLES).doc(k).get();
      if (!snap.exists) return res.status(404).json({ error: 'not_found' });
      return res.json({ data: snap.get('data') || {} });
    }

    // POST /save  { k, patch: { "w1.i0_a": true, "names.a": "Max", ... } }
    if (req.method === 'POST' && route === '/save') {
      if (!originOk(req)) return res.status(403).json({ error: 'forbidden' });
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
      const k = String((body && body.k) || '');
      const patch = (body && body.patch) || {};
      if (!KEY_RE.test(k)) return res.status(404).json({ error: 'not_found' });
      const entries = Object.entries(patch);
      if (!entries.length || entries.length > 80 || JSON.stringify(patch).length > 30000) {
        return res.status(400).json({ error: 'bad_patch' });
      }
      const update = {};
      for (const [path, value] of entries) {
        if (!PATH_RE.test(path)) return res.status(400).json({ error: 'bad_field' });
        if (typeof value === 'boolean') update[`data.${path}`] = value;
        else if (typeof value === 'string') update[`data.${path}`] = value.slice(0, path.startsWith('names.') ? 40 : 1000);
        else return res.status(400).json({ error: 'bad_value' });
      }

      const ref = db.collection(COUPLES).doc(k);
      const today = new Date().toISOString().slice(0, 10);
      const result = await db.runTransaction(async (t) => {
        const snap = await t.get(ref);
        if (!snap.exists) return 404;
        const saves = snap.get('saves') || {};
        const count = saves.day === today ? (saves.count || 0) : 0;
        if (count >= MAX_SAVES_PER_DAY) return 429;
        t.update(ref, { ...update, updatedAt: FieldValue.serverTimestamp(), saves: { day: today, count: count + 1 } });
        return 200;
      });
      if (result !== 200) return res.status(result).json({ error: result === 404 ? 'not_found' : 'too_many' });
      // Feedback ook apart bewaren, zodat jullie het makkelijk terugvinden in Firestore (collectie challenge_feedback)
      const fb = {};
      for (const [path, value] of entries) if (path.startsWith('fb.') && typeof value === 'string') fb[path.slice(3)] = value.slice(0, 1000);
      if (Object.keys(fb).length) {
        await db.collection(FEEDBACK).doc(k).set({ ...fb, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
      return res.json({ ok: true });
    }

    return res.status(404).json({ error: 'not_found' });
  } catch (err) {
    logger.error('challengeApi error', { route, error: String(err && err.message || err).slice(0, 500), code: String(err && err.code || '') });
    return res.status(500).json({ error: 'server' });
  }
});

// ---------------------------------------------------------------- Founding: publieke stand voor de site
// Bereikbaar via couple-fit.com/api/founding (Hosting rewrite in firebase.json)
exports.foundingApi = onRequest(async (req, res) => {
  res.set('X-Robots-Tag', 'noindex');
  if (req.method !== 'GET') return res.status(405).json({ error: 'method' });
  try {
    res.set('Cache-Control', 'public, max-age=30, s-maxage=30');
    return res.json(await founding.publicStats());
  } catch (err) {
    logger.error('foundingApi error', { error: String(err && err.message || err).slice(0, 500) });
    res.set('Cache-Control', 'no-store');
    return res.status(500).json({ error: 'server' });
  }
});

// ---------------------------------------------------------------- Founding: status voor de app (callable)
// App (na inloggen met Firebase Auth): httpsCallable('foundingStatus') in regio europe-west1.
// Antwoord: { founding: true, number } of { founding: false, number?, ended? }
exports.foundingStatus = onCall(async (request) => {
  const auth = request.auth;
  if (!auth || !auth.token || !auth.token.email) throw new HttpsError('unauthenticated', 'Sign in first.');
  if (auth.token.email_verified === false && auth.token.firebase && auth.token.firebase.sign_in_provider === 'password') {
    return { founding: false, needsVerifiedEmail: true };
  }
  return founding.statusForUser(auth.uid, auth.token.email);
});

// ---------------------------------------------------------------- Founding: RevenueCat-webhook
// In RevenueCat: Project settings > Integrations > Webhooks
//   URL: https://europe-west1-couple-fit-vqmblh.cloudfunctions.net/foundingRevenueCatWebhook
//   Authorization header: Bearer <REVENUECAT_WEBHOOK_TOKEN>
// Een verlopen founding-abonnement = founding-prijs vervalt (voorwaarden, sectie 2).
exports.foundingRevenueCatWebhook = onRequest({ secrets: [RC_WEBHOOK_TOKEN] }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');
  const auth = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!safeEqual(auth, RC_WEBHOOK_TOKEN.value())) return res.status(401).send('Unauthorized');
  const ev = (req.body && req.body.event) || {};
  const productId = String(ev.product_id || '');
  if (String(ev.environment || '').toUpperCase() === 'SANDBOX') return res.json({ ok: true, skipped: 'sandbox' });
  if (!/^cf_premium_founding|^cf_elite_founding/.test(productId)) return res.json({ ok: true, skipped: 'not_founding' });
  try {
    if (ev.type === 'EXPIRATION') {
      await founding.markEnded(String(ev.app_user_id || ''), productId);
    } else if (ev.type === 'INITIAL_PURCHASE') {
      const u = await db.doc(`founding_users/${String(ev.app_user_id || '')}`).get();
      if (!u.exists) logger.warn('founding purchase without founding spot', { productId });
    }
    return res.json({ ok: true });
  } catch (err) {
    logger.error('founding rc webhook failed', { type: ev.type, error: String(err && err.message || err).slice(0, 500) });
    return res.status(500).json({ ok: false });
  }
});

// ---------------------------------------------------------------- Founding: beheer (eenmalige backfill)
// POST /foundingAdmin  Authorization: Bearer <REVENUECAT_WEBHOOK_TOKEN>
// body: { "listId": 3, "skip": ["test@example.com"], "apply": false }
// Geeft bevestigde wachtlijst-contacten een nummer op volgorde van aanmaakdatum. Stuurt geen mail.
exports.foundingAdmin = onRequest({ secrets: [BREVO_API_KEY, RC_WEBHOOK_TOKEN] }, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');
  const auth = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!safeEqual(auth, RC_WEBHOOK_TOKEN.value())) return res.status(401).send('Unauthorized');
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const listId = Number(body.listId) || 3;
  const skip = new Set([].concat(body.skip || []).map(normEmail));
  const apply = body.apply === true;
  try {
    // Veld FOUNDING_NUMBER in Brevo aanmaken als het nog niet bestaat (400 = bestaat al)
    if (apply) {
      const ar = await fetch('https://api.brevo.com/v3/contacts/attributes/normal/FOUNDING_NUMBER', {
        method: 'POST', headers: { 'api-key': BREVO_API_KEY.value(), 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ type: 'float' }),
      });
      if (!ar.ok && ar.status !== 400) throw new Error(`Brevo attribute failed: ${ar.status}`);
    }
    const contacts = [];
    for (let offset = 0; ; offset += 500) {
      const r = await fetch(`https://api.brevo.com/v3/contacts/lists/${listId}/contacts?limit=500&offset=${offset}&sort=asc`,
        { headers: { 'api-key': BREVO_API_KEY.value(), accept: 'application/json' } });
      if (!r.ok) throw new Error(`Brevo list failed: ${r.status}`);
      const j = await r.json();
      contacts.push(...(j.contacts || []));
      if (!j.contacts || j.contacts.length < 500) break;
    }
    contacts.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    const out = [];
    for (const c of contacts) {
      const masked = c.email.replace(/(^.).*(@.*$)/, '$1***$2');
      if (skip.has(normEmail(c.email))) { out.push({ email: masked, result: 'skipped' }); continue; }
      if (!apply) { out.push({ email: masked, createdAt: c.createdAt, result: 'would assign' }); continue; }
      const n = await founding.assignFounding(c.email, { contact: c, confirmedAt: admin.firestore.Timestamp.fromDate(new Date(c.createdAt)) });
      out.push({ email: masked, number: n });
    }
    return res.json({ apply, count: contacts.length, results: out, stats: await founding.publicStats() });
  } catch (err) {
    logger.error('foundingAdmin failed', { error: String(err && err.message || err).slice(0, 500) });
    return res.status(500).json({ error: String(err && err.message || err).slice(0, 200) });
  }
});
