/**
 * CoupleFit – founding-plekken (onderdeel van de "challenge"-codebase).
 *
 * Regels (voorwaarden, sectie 8): de eerste 500 stellen die hun aanmelding op de
 * wachtlijst bevestigen krijgen een founding-plek, op volgorde van bevestiging.
 * Een partner die via de link van de ander binnenkomt (REFERRAL_TYPE = partner)
 * krijgt hetzelfde nummer. Nummers worden nooit opnieuw uitgegeven.
 *
 * Collecties (geen e-mailadres in klare tekst):
 *   founding_state/counter        -> { issued, limit, closed }
 *   founding_spots/{emailHash}    -> { number, code, partnerOf?, confirmedAt, status, ended? }
 *   founding_codes/{referralCode} -> { number, emailHash }
 *   founding_users/{uid}          -> { emailHash, number }   (koppeling app-account -> plek)
 *   public_founding/stats         -> { issued, left, closed, updatedAt }  (voor de site)
 */
const LIMIT = 500;
const CODE_RE = /^[A-Za-z0-9]{4,12}$/;

module.exports = function founding({ db, FieldValue, logger, hashEmail, normEmail, brevoKey }) {

  async function brevoGetContact(email) {
    const res = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, {
      headers: { 'api-key': brevoKey(), accept: 'application/json' },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Brevo get failed: ${res.status} ${await res.text()}`);
    return res.json();
  }

  async function brevoSetNumber(email, number) {
    const res = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, {
      method: 'PUT',
      headers: { 'api-key': brevoKey(), 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ attributes: { FOUNDING_NUMBER: number || 0 } }),
    });
    if (!res.ok) throw new Error(`Brevo update failed: ${res.status} ${await res.text()}`);
  }

  /**
   * Geeft dit e-mailadres een founding-nummer (of het nummer van de partner).
   * Veilig om vaker aan te roepen: een bestaande plek wordt nooit veranderd.
   * opts.setBrevo = false slaat het bijwerken van Brevo over (testen).
   * Geeft het nummer terug, of 0 als founding vol is.
   */
  async function assignFounding(rawEmail, opts = {}) {
    const email = normEmail(rawEmail);
    if (!email) return 0;
    const contact = opts.contact !== undefined ? opts.contact : await brevoGetContact(email);
    const a = (contact && contact.attributes) || {};
    const hash = hashEmail(email);
    const ownCode = CODE_RE.test(String(a.REFERRAL_CODE || '')) ? String(a.REFERRAL_CODE) : null;
    const partnerOf = String(a.REFERRAL_TYPE || '').toLowerCase() === 'partner' && CODE_RE.test(String(a.REFERRED_BY || ''))
      ? String(a.REFERRED_BY) : null;
    const confirmedAt = opts.confirmedAt || FieldValue.serverTimestamp();

    const number = await db.runTransaction(async (tx) => {
      const spotRef = db.doc(`founding_spots/${hash}`);
      const stateRef = db.doc('founding_state/counter');
      const spot = await tx.get(spotRef);
      if (spot.exists) return spot.get('number') || 0;               // dubbel event: niets veranderen

      if (partnerOf) {                                                 // partner: zelfde nummer
        const p = await tx.get(db.doc(`founding_codes/${partnerOf}`));
        if (p.exists && p.get('number')) {
          tx.set(spotRef, { number: p.get('number'), code: ownCode, partnerOf, confirmedAt, status: 'active' });
          if (ownCode) tx.set(db.doc(`founding_codes/${ownCode}`), { number: p.get('number'), emailHash: hash });
          return p.get('number');
        }
      }

      const state = await tx.get(stateRef);
      const issued = (state.exists && state.get('issued')) || 0;
      const limit = (state.exists && state.get('limit')) || LIMIT;
      if (issued >= limit) {                                           // vol: wachtlijst zonder nummer
        tx.set(spotRef, { number: 0, code: ownCode, confirmedAt, status: 'waitlist' });
        return 0;
      }
      const n = issued + 1;
      const closed = n >= limit;
      tx.set(spotRef, { number: n, code: ownCode, confirmedAt, status: 'active' });
      if (ownCode) tx.set(db.doc(`founding_codes/${ownCode}`), { number: n, emailHash: hash });
      tx.set(stateRef, { issued: n, limit, closed }, { merge: true });
      tx.set(db.doc('public_founding/stats'), { issued: n, left: Math.max(limit - n, 0), closed, updatedAt: FieldValue.serverTimestamp() });
      return n;
    });

    if (opts.setBrevo !== false) await brevoSetNumber(email, number);
    logger.info('founding assigned', { number, partner: !!partnerOf });
    return number;
  }

  /** Publieke stand voor de site: { issued, left, closed }. */
  async function publicStats() {
    const snap = await db.doc('public_founding/stats').get();
    if (!snap.exists) return { issued: 0, left: LIMIT, closed: false };
    return { issued: snap.get('issued') || 0, left: snap.get('left') ?? LIMIT, closed: !!snap.get('closed') };
  }

  /** Voor de app: heeft dit account (e-mailadres uit Firebase Auth) een founding-plek? */
  async function statusForUser(uid, rawEmail) {
    const email = normEmail(rawEmail);
    if (!uid || !email) return { founding: false };
    const hash = hashEmail(email);
    const spot = await db.doc(`founding_spots/${hash}`).get();
    const number = spot.exists ? (spot.get('number') || 0) : 0;
    const active = number > 0 && spot.get('status') === 'active' && !spot.get('ended');
    if (number > 0) await db.doc(`founding_users/${uid}`).set({ emailHash: hash, number, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return active ? { founding: true, number } : { founding: false, number: number || null, ended: !!(spot.exists && spot.get('ended')) };
  }

  /** RevenueCat: een founding-abonnement is verlopen -> founding-prijs vervalt (voorwaarden, sectie 2). */
  async function markEnded(uid, productId) {
    const u = await db.doc(`founding_users/${uid}`).get();
    if (!u.exists) { logger.warn('founding ended for unknown user', { productId }); return false; }
    await db.doc(`founding_spots/${u.get('emailHash')}`).set({ ended: true, endedAt: FieldValue.serverTimestamp() }, { merge: true });
    return true;
  }

  return { assignFounding, publicStats, statusForUser, markEnded, brevoGetContact, LIMIT };
};
