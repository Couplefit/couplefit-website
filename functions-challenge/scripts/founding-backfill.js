/**
 * Eenmalig: geeft stellen die al bevestigd op de wachtlijst staan een founding-nummer,
 * op volgorde van aanmaakdatum in Brevo (bij double opt-in = moment van bevestigen).
 * Stuurt GEEN mail: alleen het veld FOUNDING_NUMBER in Brevo wordt gezet.
 *
 * Gebruik (vanuit functions-challenge/):
 *   gcloud auth application-default login            # eenmalig, met admin@couple-fit.com
 *   BREVO_API_KEY=xkeysib-... node scripts/founding-backfill.js            # proefdraai, schrijft niets
 *   BREVO_API_KEY=xkeysib-... node scripts/founding-backfill.js --apply    # echt uitvoeren
 * Optioneel: --list 3 (Brevo-lijst "Founding Couples", standaard 3)
 */
const admin = require('firebase-admin');
const crypto = require('crypto');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const LIST_ID = Number((args[args.indexOf('--list') + 1]) || 3) || 3;
const KEY = process.env.BREVO_API_KEY;
if (!KEY) { console.error('Zet eerst BREVO_API_KEY.'); process.exit(1); }

admin.initializeApp({ projectId: 'couple-fit-vqmblh' });
const db = admin.firestore();
const { FieldValue, Timestamp } = admin.firestore;
const normEmail = (e) => (typeof e === 'string' ? e.trim().toLowerCase() : '');
const hashEmail = (e) => crypto.createHash('sha256').update(e).digest('hex');
const founding = require('../founding')({ db, FieldValue, logger: console, hashEmail, normEmail, brevoKey: () => KEY });

async function allContacts() {
  const out = [];
  for (let offset = 0; ; offset += 500) {
    const res = await fetch(`https://api.brevo.com/v3/contacts/lists/${LIST_ID}/contacts?limit=500&offset=${offset}&sort=asc`, {
      headers: { 'api-key': KEY, accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Brevo list failed: ${res.status} ${await res.text()}`);
    const j = await res.json();
    out.push(...(j.contacts || []));
    if (!j.contacts || j.contacts.length < 500) break;
  }
  return out.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

(async () => {
  const contacts = await allContacts();
  console.log(`${contacts.length} contacten in lijst ${LIST_ID} (${APPLY ? 'UITVOEREN' : 'proefdraai'})`);
  let nextFree = (await db.doc('founding_state/counter').get()).get('issued') || 0;
  for (const c of contacts) {
    const a = c.attributes || {};
    const label = `${c.createdAt}  ${c.email.replace(/(^.).*(@.*$)/, '$1***$2')}  ${a.REFERRAL_TYPE || ''}`;
    if (!APPLY) {
      const exists = (await db.doc(`founding_spots/${hashEmail(normEmail(c.email))}`).get()).exists;
      const partner = String(a.REFERRAL_TYPE || '').toLowerCase() === 'partner';
      console.log(exists ? `  heeft al een nummer   ${label}` : partner ? `  partner (nummer van de ander)   ${label}` : `  #${++nextFree}   ${label}`);
      continue;
    }
    const n = await founding.assignFounding(c.email, { contact: c, confirmedAt: Timestamp.fromDate(new Date(c.createdAt)) });
    console.log(`  #${n || '-'}   ${label}`);
  }
  console.log('Klaar.');
})().catch((e) => { console.error(e); process.exit(1); });
