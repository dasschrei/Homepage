// web-reservierung – öffentliche Reservierung von der Homepage (das-schrei.at) über die Zenchef-API.
// Ablauf: Monat → Verfügbarkeit (pro Raum) → Anlegen OHNE Mail → Kreditkarten-Link → Status prüfen → Bestätigung senden.
//
// Supabase: Edge Function "web-reservierung", Einstellung "Verify JWT" AUS (öffentlich, eigener Spam-Schutz).
// Secrets (schon vorhanden): ZENCHEF_PREPROD_TOKEN (Test 353058), ZENCHEF_API_TOKEN (Echtbetrieb 368147).
// Optional: WEB_RES_UMGEBUNG = 'live' schaltet auf Echtbetrieb. Ohne Eintrag läuft IMMER die Testumgebung.

import nodemailer from 'npm:nodemailer@6';

const ADMIN = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || 'schrei';
const MAIL_USER = Deno.env.get('IONOS_USER') || 'restaurant@das-schrei.at';
const MAIL_PASS = Deno.env.get('IONOS_PASS') || '';
// Aufräumen: Web-Reservierungen ohne Kreditkarte nach X Minuten stornieren.
// WEB_RES_AUFRAEUMEN = 'an' storniert wirklich. Ohne Eintrag nur Probelauf (zeigt, was storniert würde).
const AUFRAEUMEN_AN = Deno.env.get('WEB_RES_AUFRAEUMEN') === 'an';
const AUFRAEUMEN_MIN = Number(Deno.env.get('WEB_RES_FRIST_MIN') || '60');
const CRON_KEY = Deno.env.get('WEB_RES_CRON_KEY') || '';
const UMG = {
  live: { host: 'https://api.zenchef.com/api/v1', token: Deno.env.get('ZENCHEF_API_TOKEN') || '', rid: Deno.env.get('ZENCHEF_RID') || '368147' },
  test: { host: 'https://api.preproduction.zenchef.io/api/v1', token: Deno.env.get('ZENCHEF_PREPROD_TOKEN') || '', rid: Deno.env.get('ZENCHEF_PREPROD_RID') || '353058' }
};
type Umg = keyof typeof UMG;
const U: Umg = Deno.env.get('WEB_RES_UMGEBUNG') === 'live' ? 'live' : 'test';
const TEST = U === 'test';
// WEB_RES_DEBUG = '1' → Testpanel-Infos auch im Echtbetrieb (für einen kontrollierten Echttest). Danach wieder löschen.
const DEBUG = TEST || Deno.env.get('WEB_RES_DEBUG') === '1';
const VERSION = 'web-v23';
// Versuch (13.11.2026): Reservierung als "waiting_customer" statt "confirmed" anlegen, um die zusätzliche Zenchef-Mail
// „Antrag auf Kreditkartengarantie“ zu vermeiden. Greift nur mit Secret WEB_RES_ANLEGE_STATUS = waiting_customer
// UND im Testmodus (Demo 353058 oder WEB_RES_DEBUG = 1 für einen kontrollierten Echttest). Ohne Debug wird immer "confirmed" angelegt.
// Nach der Karte setzt die Funktion die Reservierung selbst auf "confirmed" und löst dabei die Zenchef-Bestätigungsmail aus
// (beim Status-Abruf der Seite und beim Aufräumen).
const ANLEGE_STATUS = DEBUG && Deno.env.get('WEB_RES_ANLEGE_STATUS') === 'waiting_customer' ? 'waiting_customer' : 'confirmed';
// Warteliste vorerst AUS: Ein Test hat statt eines Wartelisten-Eintrags eine bestätigte Reservierung ohne Tisch erzeugt (Überbuchung).
// Erst wieder einschalten, wenn Zenchef den richtigen Aufruf für die Warteliste genannt hat.
// Wieder AN (27.10.): ohne Kreditkarte, ohne force, mit Sicherheitsprüfung – siehe anlegen().
const WARTELISTE_AKTIV = true;

// Räume und erlaubte Startzeiten
const RAEUME = {
  chefs: { name: "Chef's Table", zeiten: ['19:00'] },
  gastraum: { name: 'Gastraum', zeiten: ['18:00', '18:30', '19:30'] }
} as const;
type Raum = keyof typeof RAEUME;
const MAX_PAX = { chefs: 10, gastraum: 8 };

const ERLAUBT = [/^https:\/\/(www\.)?das-schrei\.at$/, /^https:\/\/[a-z0-9-]+\.netlify\.app$/, /^http:\/\/localhost(:\d+)?$/];
function cors(origin: string) {
  const ok = ERLAUBT.some((r) => r.test(origin));
  return { 'Access-Control-Allow-Origin': ok ? origin : 'https://www.das-schrei.at', 'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'apikey, content-type, authorization, x-client-info, x-cron-key', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
}

// ---------------------------------------------------------------- Zenchef
async function zc(path: string, init: RequestInit = {}, v2 = false) {
  const c = UMG[U]; if (!c.token) throw new Fehler('Zenchef-Zugang fehlt (' + (TEST ? 'ZENCHEF_PREPROD_TOKEN' : 'ZENCHEF_API_TOKEN') + ')', 500);
  const host = v2 ? c.host.replace('/api/v1', '/api/v2') : c.host;
  const r = await fetch(host + path, { ...init, signal: AbortSignal.timeout(20000),
    headers: { 'Content-Type': 'application/json', 'auth-token': c.token, restaurantId: c.rid, ...(init.headers || {}) } });
  const t = await r.text(); let j: any = null; try { j = t ? JSON.parse(t) : null; } catch { j = null; }
  if (!r.ok) throw new Fehler('Zenchef ' + r.status + ': ' + (j && (j.message || j.error || j.errors) ? txt(j.errors || j.message || j.error) : t.slice(0, 300)), r.status === 422 ? 409 : 502);
  return j;
}
const txt = (x: any) => typeof x === 'string' ? x : JSON.stringify(x).slice(0, 300);
class Fehler extends Error { constructor(m: string, public status = 400) { super(m); } }

const hhmm = (s: string) => String(s || '').slice(0, 5);
const istDatum = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

// Rohdaten der Verfügbarkeit (v2) für einen Zeitraum, max. 40 Tage
async function verfuegbarkeit(von: string, bis: string) {
  const j = await zc('/restaurants/' + UMG[U].rid + '/availabilities?date-begin=' + von + '&date-end=' + bis + '&with=possible_guests', {}, true);
  return (j && j.data) || [];
}

// Raumnamen (für Chef's-Table-Erkennung). Zwischengespeichert pro Instanz.
let raumCache: { t: number; map: Record<string, string> } | null = null;
async function raumNamen(): Promise<Record<string, string>> {
  if (raumCache && Date.now() - raumCache.t < 10 * 60e3) return raumCache.map;
  const map: Record<string, string> = {};
  const sammle = (x: any) => { for (const r of (Array.isArray(x) ? x : [])) if (r && r.id != null) map[String(r.id)] = String(r.name || r.label || r.id); };
  // Laut Doku: GET /restaurants/{id}/bookingrooms
  try { const j = await zc('/restaurants/' + UMG[U].rid + '/bookingrooms'); sammle((j && j.data) || j); } catch { /* weiter */ }
  if (!Object.keys(map).length) { try { const j = await zc('/restaurants/' + UMG[U].rid); const d = (j && j.data) || j || {}; sammle(d.rooms); } catch { /* weiter */ } }
  raumCache = { t: Date.now(), map };
  return map;
}
const istChefs = (name: string) => /chef/i.test(name || '');

// Experiences (Offers) mit Name, Text und Bild – die Verfügbarkeit liefert diese Angaben nicht immer mit.
let offerCache: { t: number; liste: any[] } | null = null;
async function experiences(): Promise<any[]> {
  if (offerCache && Date.now() - offerCache.t < 10 * 60e3) return offerCache.liste;
  let liste: any[] = [];
  try { const j = await zc('/offers', {}, true); liste = (j && j.data) || (Array.isArray(j) ? j : []); } catch { liste = []; }
  offerCache = { t: Date.now(), liste };
  return liste;
}
const uebersetzt = (x: any, lang = 'de'): string => {
  if (!x) return '';
  if (typeof x === 'string') return x;
  if (Array.isArray(x)) { const f = x.find((e: any) => e && (e.lang === lang || e.locale === lang)) || x[0]; return f ? uebersetzt(f.value ?? f.text ?? f.description ?? f.content ?? f, lang) : ''; }
  if (typeof x === 'object') return String(x[lang] ?? x.de ?? x.en ?? Object.values(x)[0] ?? '');
  return String(x);
};
const bildVon = (o: any): string => {
  const p = o && o.picture;
  if (typeof p === 'string' && p) return p;
  if (p && typeof p === 'object') return p.url || p.original || p.large || p.medium || '';
  const f = o && Array.isArray(o.files) ? o.files.find((x: any) => x && (x.url || x.path)) : null;
  return (o && o.picture_url) || (f ? f.url || f.path : '') || '';
};
// Angaben aus /offers zu einem Offer aus der Verfügbarkeit dazumischen
function anreichern(o: any, liste: any[]) {
  const voll = liste.find((x: any) => String(x.id) === String(o.id)) || {};
  return {
    ...voll, ...o,
    name: uebersetzt(o.name_translations || voll.name_translations) || o.name || voll.name || 'Event',
    description: uebersetzt(o.description) || uebersetzt(voll.description),
    picture_url: bildVon(o) || bildVon(voll),
    has_prepayment: o.has_prepayment ?? voll.has_prepayment
  };
}
// Offers, die an einer Schicht hängen (falls die Verfügbarkeit keine mitschickt)
function offersFuerSchicht(sh: any, datum: string, liste: any[]) {
  const wt = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(datum + 'T12:00:00Z').getUTCDay()];
  return liste.filter((o: any) => o.is_active !== false
    && (!o.date_from || String(o.date_from).slice(0, 10) <= datum) && (!o.date_to || String(o.date_to).slice(0, 10) >= datum)
    && (!o.weekdays || o.weekdays[wt] !== false)
    && (o.stocks || []).some((st: any) => String((st.shift_config || {}).shift_id) === String(sh.id)));
}
// Zenchef-Raum-ID zu unserem Raum (Chef's Table über den Namen, Gastraum = Raum mit „gast“/„restaurant“/„salle“ im Namen)
async function raumId(raum: Raum): Promise<string> {
  const namen = await raumNamen();
  const e = Object.entries(namen);
  const f = raum === 'chefs' ? e.find(([, n]) => istChefs(n)) : e.find(([, n]) => !istChefs(n) && /gast|restaurant|salle|main|innen/i.test(n)) || (e.filter(([, n]) => !istChefs(n)).length === 1 ? e.find(([, n]) => !istChefs(n)) : undefined);
  return f ? f[0] : '';
}

// Freie Zeiten pro Raum für ein Datum und eine Personenzahl
async function frei(datum: string, pax: number) {
  const tage = await verfuegbarkeit(datum, datum);
  const offerListe = await experiences();
  const namen = await raumNamen();
  const chefIds = Object.entries(namen).filter(([, n]) => istChefs(n)).map(([id]) => id);
  const ergebnis: Record<Raum, string[]> = { chefs: [], gastraum: [] };
  const warte: Record<Raum, string[]> = { chefs: [], gastraum: [] };
  const roh: string[] = [];
  const events = new Map<string, any>();
  for (const tag of tage) for (const sh of (tag.shifts || [])) {
    if (sh.closed) continue;
    // Event-Abend: Schicht verlangt eine Experience (z. B. Winzerdinner) → keine normalen Räume, nur das Event
    const pflicht = !!sh.is_offer_required && (sh.offer_required_from_pax == null || pax >= Number(sh.offer_required_from_pax));
    for (const sl of (sh.shift_slots || [])) {
      if (sl.closed) continue;
      const zeit = hhmm(sl.name || sl.slot_name);
      if (pflicht) {
        if (sh.marked_as_full || sl.marked_as_full || !(sl.possible_guests || []).map(Number).includes(pax)) continue;
        const roh0 = (sl.offers && sl.offers.length ? sl.offers : sh.offers) || [];
        const angebote = (roh0.length ? roh0 : offersFuerSchicht(sh, datum, offerListe)).map((o: any) => anreichern(o, offerListe));
        const freiIds: string[] = ((sl.available_rooms || {})[String(pax)] || []).map(String);
        for (const o of angebote) {
          const c = o.config || {}, cap = o.capacity || {};
          const min = Number(c.min_pax_available ?? cap.min ?? 1) || 1, max = Number(c.max_pax_available ?? cap.max ?? 99) || 99;
          if (pax < min || pax > max) continue;
          if (!o.is_unlimited && o.stock != null && Number(o.stock) <= 0) continue;
          const id = String(o.id);
          const e = events.get(id) || { id, name: o.name || 'Event', beschreibung: String(o.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600), bild: o.picture_url || '', vorauszahlung: !!o.has_prepayment, zeiten: [] as string[], raeume: { chefs: [] as string[], gastraum: [] as string[] } };
          if (!e.zeiten.includes(zeit)) e.zeiten.push(zeit);
          // Welche Räume gehen für dieses Event zu dieser Zeit? Freie Räume laut Zenchef, ggf. eingeschränkt auf die Räume der Experience.
          const erlaubt = o.has_specific_rooms && Array.isArray(o.rooms) && o.rooms.length ? o.rooms.map((r: any) => String(r && r.id != null ? r.id : r)) : null;
          const ids = freiIds.filter((id) => !erlaubt || erlaubt.includes(id));
          const ohneInfo = !chefIds.length || (!freiIds.length && !erlaubt);       // keine Raumdaten → beide Räume anbieten, Zenchef prüft die Kapazität
          const chef = ohneInfo || ids.some((id) => chefIds.includes(id));
          const gast = ohneInfo || ids.some((id) => !chefIds.includes(id));
          if (chef && pax <= MAX_PAX.chefs && !e.raeume.chefs.includes(zeit)) e.raeume.chefs.push(zeit);
          if (gast && pax <= MAX_PAX.gastraum && !e.raeume.gastraum.includes(zeit)) e.raeume.gastraum.push(zeit);
          events.set(id, e);
        }
        continue;
      }
      const voll = sh.marked_as_full || sl.marked_as_full || !(sl.possible_guests || []).map(Number).includes(pax);
      if (voll) {
        // Warteliste: Zenchef nennt pro Uhrzeit, für wie viele Personen noch ein Wartelistenplatz frei ist
        if ((sl.waitlist_possible_guests || []).map(Number).includes(pax)) for (const r of ['chefs', 'gastraum'] as Raum[])
          if (pax <= MAX_PAX[r] && ((RAEUME[r].zeiten as readonly string[]).includes(zeit) || (r === 'gastraum' && zeit < '15:00'))) warte[r].push(zeit);
        continue;
      }
      roh.push(zeit);
      const ar = sl.available_rooms || {};
      const ids: string[] = (ar[String(pax)] || []).map(String);
      const hatChef = chefIds.length ? ids.some((id) => chefIds.includes(id)) : zeit === '19:00';          // ohne Raumnamen: 19:00 = Chef's Table
      const hatGast = chefIds.length ? (ids.length ? ids.some((id) => !chefIds.includes(id)) : true) : zeit !== '19:00';
      if (hatChef && pax <= MAX_PAX.chefs && RAEUME.chefs.zeiten.includes(zeit as any)) ergebnis.chefs.push(zeit);
      if (hatGast && pax <= MAX_PAX.gastraum && (RAEUME.gastraum.zeiten.includes(zeit as any) || zeit < '15:00')) ergebnis.gastraum.push(zeit);
    }
  }
  const dedup = (a: string[]) => [...new Set(a)].sort();
  const out: any = { datum, pax, raeume: { chefs: dedup(ergebnis.chefs), gastraum: dedup(ergebnis.gastraum) } };
  out.events = [...events.values()].map((e) => ({ ...e, zeiten: dedup(e.zeiten), raeume: { chefs: dedup(e.raeume.chefs), gastraum: dedup(e.raeume.gastraum) } }));
  if (!WARTELISTE_AKTIV) out.warteliste = { chefs: [], gastraum: [] }; else out.warteliste = { chefs: dedup(warte.chefs).filter((z) => !out.raeume.chefs.includes(z)), gastraum: dedup(warte.gastraum).filter((z) => !out.raeume.gastraum.includes(z)) };
  // Testumgebung: Das Demo-Restaurant hat andere Zeiten als das Schrei. Damit man trotzdem testen kann,
  // werden dort alle freien Zeiten im Gastraum angeboten, wenn unsere festen Zeiten nicht vorkommen.
  if (TEST && !out.raeume.chefs.length && !out.raeume.gastraum.length && roh.length) { out.raeume.gastraum = dedup(roh); out.testAlleZeiten = true; }
  return out;
}

// Offene Tage in einem Zeitraum (für den Kalender)
async function monat(von: string, bis: string) {
  const tage = await verfuegbarkeit(von, bis);
  const offen: string[] = [];
  const events: Record<string, string> = {};
  const offerListe = await experiences();
  for (const tag of tage) {
    for (const sh of (tag.shifts || [])) if (!sh.closed && sh.is_offer_required && tag.date) {
      const o = ((sh.offers && sh.offers[0]) || ((sh.shift_slots || []).find((sl: any) => sl.offers && sl.offers.length) || {}).offers?.[0]) || offersFuerSchicht(sh, tag.date, offerListe)[0];
      events[tag.date] = o ? anreichern(o, offerListe).name : 'Event';
    }
    const ok = (tag.shifts || []).some((sh: any) => !sh.closed && (sh.shift_slots || []).some((sl: any) => !sl.closed && ((sl.possible_guests || []).length || (sl.waitlist_possible_guests || []).length)));
    if (ok && tag.date) offen.push(tag.date);
  }
  return { von, bis, offen, events };
}

// ---------------------------------------------------------------- Signatur (nur wer gebucht hat, darf den Status abfragen)
async function sig(id: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(ADMIN), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const s = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(U + ':' + id)));
  return Array.from(s.slice(0, 12)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function pruefeSig(id: string, s: string) { if (!id || !s || (await sig(id)) !== s) throw new Fehler('Ungültiger Link', 403); }

// ---------------------------------------------------------------- Spam-Schutz (pro Instanz, einfach)
const zugriffe = new Map<string, number[]>();
function limit(key: string, max: number, fensterMin: number) {
  const jetzt = Date.now(), f = fensterMin * 60e3;
  const a = (zugriffe.get(key) || []).filter((t) => jetzt - t < f);
  if (a.length >= max) throw new Fehler('Zu viele Anfragen. Bitte versuch es später noch einmal oder ruf uns an.', 429);
  a.push(jetzt); zugriffe.set(key, a);
}

// ---------------------------------------------------------------- Anlegen
const MARKE = '[WEB]';
async function anlegen(b: any, origin: string) {
  const T = (de: string, en: string) => (b.lang === 'en' ? en : de);
  if (b.firma) throw new Fehler('Abgelehnt', 400);                                 // Honigtopf-Feld
  if (Number(b.dauer) > 0 && Number(b.dauer) < 3000) throw new Fehler(T('Bitte nimm dir einen Moment Zeit für das Formular.', 'Please take a moment to fill in the form.'), 400);
  const datum = String(b.datum || ''), zeit = hhmm(b.zeit), pax = Number(b.pax), raum = String(b.raum) as Raum;
  const eventId = b.event ? String(b.event) : '';
  if (!istDatum(datum) || !/^\d{2}:\d{2}$/.test(zeit) || !(pax >= 1 && pax <= 10) || !RAEUME[raum]) throw new Fehler(T('Datum, Uhrzeit, Personen oder Raum fehlen.', 'Date, time, guests or room are missing.'));
  const vorname = String(b.vorname || '').trim().slice(0, 60), nachname = String(b.nachname || '').trim().slice(0, 60);
  const email = String(b.email || '').trim().slice(0, 120), telefon = String(b.telefon || '').trim().slice(0, 40);
  if (!nachname || !vorname) throw new Fehler(T('Bitte gib Vor- und Nachname an.', 'Please enter your first and last name.'));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Fehler(T('Bitte gib eine gültige E-Mail-Adresse an.', 'Please enter a valid email address.'));
  if (telefon.replace(/\D/g, '').length < 6) throw new Fehler(T('Bitte gib eine Telefonnummer an.', 'Please enter a phone number.'));

  // Noch frei? (die Homepage bucht nie „trotzdem“)
  const f = await frei(datum, pax);
  const ev = eventId ? (f.events || []).find((e: any) => e.id === eventId) : null;
  if (eventId && !(ev && (ev.raeume[raum] || []).includes(zeit))) throw new Fehler(T('Für dieses Event ist um diese Uhrzeit leider kein Platz mehr frei.', 'Unfortunately there are no more seats for this event at this time.'), 409);
  if (ev && ev.vorauszahlung) throw new Fehler(T('Dieses Event kann nur telefonisch gebucht werden. Ruf uns gerne an unter +43 664 1541102.', 'This event can only be booked by phone. Please call us at +43 664 1541102.'), 409);
  const aufWarteliste = ev ? false : !f.raeume[raum].includes(zeit);
  if (aufWarteliste && !WARTELISTE_AKTIV) throw new Fehler(T('Diese Uhrzeit ist ausgebucht. Für die Warteliste ruf uns bitte an oder schreib uns.', 'This time is fully booked. For the waiting list, please call or write to us.'), 409);
  if (aufWarteliste && !(b.warteliste && f.warteliste[raum].includes(zeit))) throw new Fehler(T('Diese Uhrzeit ist gerade vergeben worden. Bitte wähle eine andere.', 'This time has just been taken. Please choose another one.'), 409);

  let raumFehler = '';
  const allergien = String(b.allergien || '').trim().slice(0, 500);
  if (!allergien) throw new Fehler(T('Bitte gib Allergien und Ernährungsformen an (oder „keine“).', 'Please state allergies and dietary requirements (or none).'));
  if (!b.allergienBestaetigt) throw new Fehler(T('Bitte bestätige, dass du alle Allergien deiner Gruppe angegeben hast.', 'Please confirm that you have stated all allergies of your group.'));
  const notiz = String(b.notiz || '').trim().slice(0, 500);
  const kommentar = ['Allergien/Ernährung: ' + allergien, notiz, MARKE + (aufWarteliste ? ' WARTELISTE' : '') + ' ' + (ev ? 'Event: ' + ev.name + ' · ' : '') + RAEUME[raum].name + (b.newsletter ? ' · Newsletter: ja' : '') + ' · Allergie-Hinweis bestätigt'].filter(Boolean).join('\n\n');
  const body = { day: datum, time: zeit, nb_guests: pax, firstname: vorname, lastname: nachname, phone_number: telefon, email,
    comment: kommentar, country: /^[a-z]{2}$/.test(String(b.land || '')) ? String(b.land) : 'at', lang: b.lang === 'en' ? 'en' : 'de', status: aufWarteliste ? 'waiting' : ANLEGE_STATUS, reservation_type: 'reservation',
    ...(ev ? { offers: [{ offer_id: Number(ev.id), count: pax }] } : {}) };
  // Ohne with-confirmation → Zenchef schickt jetzt noch KEINE Mail. Die Bestätigung kommt erst nach der Karte.
  let j: any = null;
  const wlVersuche: any[] = [];
  // Raum mitgeben: Beim Anlegen dokumentiert ist nur "tables". Reservierungen tragen aber das Feld booking_room_id – das versuchen wir.
  // Lehnt Zenchef das Feld ab, wird ohne Raum angelegt – wie bisher.
  const rid = ev ? '' : await raumId(raum);
  if (!aufWarteliste) {
    // Raum-Feld wird von Zenchef beim Anlegen nicht übernommen (Test 28.10.) → weggelassen; ein Fehlversuch könnte sonst doppelt anlegen.
    if (!j) j = await zc('/bookings', { method: 'POST', body: JSON.stringify(body) });
  }
  else {
    // Den Wartelisten-Status nennt die Doku nicht → Varianten durchprobieren (nie als „confirmed“).
    // Ohne force: Zenchef soll die volle Zeit nicht einfach „trotzdem“ buchen.
    // Die API kennt keinen Wartelisten-Status. Laut Doku heißt "waiting": Anfrage, die das Restaurant noch bestätigen muss.
    // Genau das ist ein Wartelisten-Eintrag. force=1 nur hier, weil die Zeit ja voll ist – der Eintrag ist trotzdem KEINE Reservierung.
    const varianten: any[] = [{ status: 'waiting', _q: '?force=1' }];
    for (const extra of varianten) {
      const { _q, ...felder } = extra;
      try { j = await zc('/bookings' + (_q || ''), { method: 'POST', body: JSON.stringify({ ...body, ...felder }) }); wlVersuche.push({ ...extra, ok: true }); }
      catch (e) { wlVersuche.push({ ...extra, fehler: String((e as any)?.message || e).slice(0, 300) }); continue; }
      // Sicherheitsprüfung: Steht der Eintrag wirklich auf der Warteliste? Sonst sofort stornieren (ohne Mail an den Gast) und abbrechen.
      const neu = (j && j.data) || j || {}; const nid = String(neu.id || '');
      let st = String(neu.status || '');
      try { const g = await zc('/bookings/' + nid); st = String(((g && g.data) || g || {}).status || st); } catch { /* Status aus der Anlegen-Antwort */ }
      wlVersuche[wlVersuche.length - 1].status = st;
      if (st === 'waiting') break;
      try { await zc('/bookings/' + nid + '/changeStatus?force=1', { method: 'PATCH', body: JSON.stringify({ status: 'canceled' }) }); wlVersuche[wlVersuche.length - 1].storniert = true; }
      catch (e) { wlVersuche[wlVersuche.length - 1].stornoFehler = String((e as any)?.message || e).slice(0, 200); }
      j = null; break;                                                                  // nicht weiter probieren, damit keine weiteren Einträge entstehen
    }
    if (!j) { const err = new Fehler(T('Die Warteliste ist gerade nicht verfügbar. Bitte ruf uns an, wir tragen dich gerne ein.', 'The waiting list is not available right now. Please call us and we will add you.'), 502); (err as any).versuche = wlVersuche; throw err; }
  }
  const bk = (j && j.data) || j || {}; const id = String(bk.id || '');
  if (!id) throw new Fehler('Zenchef hat keine Reservierungsnummer zurückgegeben.', 502);

  // Kartenlink holen. Rücksprung-Adresse mitgeben (falls Zenchef sie kennt), sonst ohne.
  const zurueck = (ERLAUBT.some((r) => r.test(origin)) ? origin : 'https://www.das-schrei.at') + '/' + (String(b.seite || 'reservieren.html').replace(/[^a-z0-9._-]/gi, '')) + '#karte';
  // Der genaue Weg zum Kartenlink steht nicht in der öffentlichen Doku → mehrere Varianten probieren und protokollieren.
  const versuche: any[] = [];
  if (aufWarteliste) {                                                              // Warteliste: keine Kreditkarte
    const o: any = { ok: true, id, sig: await sig(id), kartenLink: '', warteliste: true, zcStatus: bk.status || '' };
    if (DEBUG) o.wartelisteVersuche = wlVersuche;
    return o;
  }
  let url = linkIn(bk);                                                            // manchmal hängt der Link schon an der Reservierung
  if (url) versuche.push({ weg: 'in Anlegen-Antwort', ok: true });
  // Hat Zenchef die Karte schon beim Anlegen selbst angefordert (eigene Mail), steht der Link an der Reservierung.
  // Dann NICHT nochmal ask-charge aufrufen – das wäre die zweite Mail.
  if (!url) {
    try {
      const g = await zc('/bookings/' + id); const gb = (g && g.data) || g || {};
      url = linkIn(gb.charge) || linkIn(gb);
      versuche.push({ weg: 'Reservierung nachgeladen', ok: !!url, charge: gb.charge ?? null, charge_askable: gb.charge_askable ?? null, status: gb.status });
    } catch (e) { versuche.push({ weg: 'Reservierung nachgeladen', fehler: String((e as any)?.message || e).slice(0, 160) }); }
  }
  const varianten: [string, string, boolean, any][] = [
    // Genau EIN Aufruf: Jedes ask-charge verschickt bei Zenchef auch eine Mail an den Gast.
    ['PATCH', '/ask-charge', false, {}]
  ];
  for (const [m, p, v2, kb] of varianten) {
    if (url) break;
    try { const k = await zc('/bookings/' + id + p, { method: m, body: JSON.stringify(kb) }, v2); url = linkIn(k); versuche.push({ weg: m + ' ' + (v2 ? 'v2' : 'v1') + ' ' + p, ok: true, antwort: k }); }
    catch (e) { versuche.push({ weg: m + ' ' + (v2 ? 'v2' : 'v1') + ' ' + p, fehler: String((e as any)?.message || e).slice(0, 160) }); }
  }
  if (!url) { try { const j2 = await zc('/bookings/' + id); url = linkIn((j2 && j2.data) || j2); if (url) versuche.push({ weg: 'Reservierung neu geladen', ok: true }); } catch { /* weiter */ } }
  const out: any = { ok: true, id, sig: await sig(id), kartenLink: url, warteliste: aufWarteliste, zcStatus: bk.status || '', anlegeStatus: ANLEGE_STATUS };
  if (!url) out.kartenFehler = 'Kein Kartenlink erhalten';
  if (DEBUG && aufWarteliste) out.wartelisteVersuche = wlVersuche;
  if (DEBUG) out.raum = { gesendet: rid || null, fehler: raumFehler || null, antwort: Object.fromEntries(Object.entries(bk).filter(([k]) => /room|table/i.test(k))) };
  if (DEBUG) out.test = { anlegenAntwort: knapp(bk), versuche };
  return out;
}

// Kartenlink in einer Zenchef-Antwort finden (url, data.url oder ein Link-Feld mit pay/imprint/charge/card/stripe)
function linkIn(x: any, tiefe = 0): string {
  if (!x || typeof x !== 'object' || tiefe > 3) return '';
  if (typeof x.url === 'string' && /^https?:\/\//.test(x.url)) return x.url;
  for (const [k, v] of Object.entries(x)) {
    if (typeof v === 'string' && /^https?:\/\//.test(v) && /pay|imprint|charge|card|stripe|guarantee/i.test(k + ' ' + v)) return v;
    if (v && typeof v === 'object') { const f = linkIn(v, tiefe + 1); if (f) return f; }
  }
  return '';
}

// Felder, die mit Karte/Zahlung/Status zu tun haben (zum Lernen in der Testphase)
function knapp(bk: any) {
  const o: any = {};
  for (const [k, v] of Object.entries(bk || {})) if (/status|charge|imprint|pay|card|stripe|prepay|guarantee|confirm/i.test(k)) o[k] = v;
  return o;
}
function karteFertig(bk: any) {
  const f = knapp(bk); const s = JSON.stringify(f).toLowerCase();
  // waiting_customer zählt hier nicht als „offen“: beim Versuch mit ANLEGE_STATUS steht die Reservierung bis zur Bestätigung so da – entscheidend ist dann die Karte.
  if (/waiting_imprint|pending/.test(String(bk.status || '').toLowerCase())) return false;
  if (/(succeeded|success|captured|authori[sz]ed|imprinted|paid|completed|"done")/.test(s) || f.has_imprint === true || f.is_charged === true) return true;
  // Vor der Karte ist "charge" null. Danach ein Objekt – gilt als hinterlegt, solange sein Status nicht offen/fehlgeschlagen ist.
  const c = bk.charge;
  if (c && typeof c === 'object') { const st = String(c.status || c.state || '').toLowerCase(); return !/(pending|waiting|fail|cancel|refus|expired|requires)/.test(st); }
  return false;
}

async function statusAbfrage(b: any) {
  const id = String(b.id || ''); await pruefeSig(id, String(b.sig || ''));
  const j = await zc('/bookings/' + id); const bk = (j && j.data) || j || {};
  const out: any = { id, zcStatus: bk.status || '', karte: karteFertig(bk), bestaetigt: String(bk.comment || '').includes('[WEB-BESTÄTIGT]') };
  // Versuch waiting_customer: Karte da, aber noch nicht bestätigt → jetzt bestätigen (löst die Zenchef-Bestätigungsmail aus).
  if (bk.status === 'waiting_customer' && out.karte && istWebReservierung(bk)) {
    try { const r = await bestaetigen({ id, sig: b.sig }); out.bestaetigt = true; out.zcStatus = 'confirmed'; if (DEBUG) out.bestaetigung = r; }
    catch (e) { if (DEBUG) out.bestaetigungFehler = String((e as any)?.message || e).slice(0, 200); }
  }
  if (DEBUG) out.test = knapp(bk);
  return out;
}

const istWebReservierung = (bk: any) => { const k = String(bk.comment || ''); return k.includes(MARKE) && !k.includes('WARTELISTE'); };

// Bestätigungsmail von Zenchef auslösen (einmalig). Läuft nur, wenn die Karte hinterlegt ist – in der Testumgebung auch erzwingbar.
async function bestaetigen(b: any) {
  const id = String(b.id || ''); await pruefeSig(id, String(b.sig || ''));
  const j = await zc('/bookings/' + id); const bk = (j && j.data) || j || {};
  const kommentar = String(bk.comment || '');
  if (kommentar.includes('[WEB-BESTÄTIGT]')) return { ok: true, schonGesendet: true };
  if (!karteFertig(bk) && !(TEST && b.erzwingen)) throw new Fehler('Die Kreditkarte ist noch nicht hinterlegt.', 409);
  let weg = '';
  try { await zc('/bookings/' + id + '/changeStatus?force=1&with-confirmation=1', { method: 'PATCH', body: JSON.stringify({ status: 'confirmed' }) }); weg = 'status'; }
  catch (e1) {
    await zc('/bookings/' + id + '?with-confirmation=1&force=1', { method: 'PUT', body: JSON.stringify({ status: 'confirmed', day: bk.day, time: bk.time, nb_guests: bk.nb_guests }) }); weg = 'update';
  }
  // Merken, dass bestätigt wurde (verhindert doppelte Mails). Ohne with-confirmation → keine weitere Mail.
  try { await zc('/bookings/' + id + '?force=1', { method: 'PUT', body: JSON.stringify({ comment: kommentar + ' · [WEB-BESTÄTIGT]', day: bk.day, time: bk.time, nb_guests: bk.nb_guests }) }); } catch { /* nicht kritisch */ }
  return { ok: true, weg };
}

// Nur Testumgebung: Rohdaten anzeigen, um Räume und Zeiten des Demo-Restaurants kennenzulernen
async function diagnose(b: any) {
  if (!DEBUG) throw new Fehler('Nur im Testmodus', 403);
  const datum = istDatum(b.datum) ? b.datum : new Date().toISOString().slice(0, 10);
  const tage = await verfuegbarkeit(datum, datum);
  return { version: VERSION, umgebung: U, datum, raeume: await raumNamen(),
    offers: (await experiences()).map((o: any) => ({ id: o.id, name: o.name, aktiv: o.is_active, von: o.date_from, bis: o.date_to, bild: bildVon(o), vorauszahlung: o.has_prepayment, schichten: (o.stocks || []).map((st: any) => (st.shift_config || {}).shift_id) })),
    schichten: tage.flatMap((t: any) => (t.shifts || []).map((sh: any) => ({ id: sh.id, name: sh.name, closed: sh.closed, offerPflicht: sh.is_offer_required, offerAb: sh.offer_required_from_pax, offers: (sh.offers || []).map((o: any) => ({ id: o.id, name: o.name, bild: o.picture_url })), full: sh.marked_as_full, bookable_rooms: sh.bookable_rooms, prepayment: sh.prepayment_param, charge: sh.charge_param, confirmation: sh.confirmation,
      slots: (sh.shift_slots || []).map((sl: any) => ({ zeit: hhmm(sl.name), closed: sl.closed, pax: sl.possible_guests, raeume: sl.available_rooms, offers: (sl.offers || []).map((o: any) => ({ id: o.id, name: o.name, bild: o.picture_url })) })) }))) };
}

// ---------------------------------------------------------------- Aufräumen (läuft alle 5 Minuten per Zeitplan)
const zcZeit = (x: any) => { const t = Date.parse(String(x || '').replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(x || '')) ? '' : 'Z')); return isNaN(t) ? 0 : t; };
async function aufraeumen(probe: boolean) {
  const heute = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const q = '/bookings?filters[0][field]=comment&filters[0][operator]=LIKE&filters[0][value]=' + encodeURIComponent('%[WEB]%')
    + '&filters[1][field]=day&filters[1][operator]=>=&filters[1][value]=' + heute + '&limit=100&page=1&sort[field]=created_at&sort[order]=desc';
  const j = await zc(q); const liste: any[] = ((j && j.data) || []).filter((x: any) => x.status === 'confirmed' || x.status === 'waiting_customer');
  const jetzt = Date.now(), ergebnis: any[] = [];
  for (const bk0 of liste) {
    const kommentar = String(bk0.comment || '');
    if (!kommentar.includes('[WEB]') || kommentar.includes('WARTELISTE')) continue;
    if (/ohne\s*karte/i.test(kommentar)) continue;                                  // vom Team freigegeben (z. B. Stammgast)
    const alter = (jetzt - zcZeit(bk0.created_at)) / 60e3;
    // Versuch waiting_customer: Karte schon da → sofort bestätigen (nicht erst nach Ablauf der Frist)
    if (bk0.status === 'waiting_customer' && alter < 48 * 60) {
      let bkw = bk0; try { const g = await zc('/bookings/' + bk0.id); bkw = (g && g.data) || g || bk0; } catch { /* Liste reicht */ }
      if (bkw.status === 'waiting_customer' && karteFertig(bkw)) {
        const e: any = { id: bkw.id, name: [bkw.firstname, bkw.lastname].join(' ').trim(), tag: bkw.day, zeit: hhmm(bkw.time), pax: bkw.nb_guests, alterMin: Math.round(alter), status: bkw.status };
        if (probe) e.aktion = 'Karte da – würde bestätigt';
        else { try { await bestaetigen({ id: String(bkw.id), sig: await sig(String(bkw.id)) }); e.aktion = 'Karte da – bestätigt'; } catch (x) { e.aktion = 'Bestätigen fehlgeschlagen: ' + String((x as any)?.message || x).slice(0, 120); } }
        ergebnis.push(e); continue;
      }
    }
    if (!(alter >= AUFRAEUMEN_MIN && alter < 48 * 60)) continue;                     // nur frische Web-Buchungen nach Ablauf der Frist
    // Detail frisch laden – Karte könnte gerade eben hinterlegt worden sein
    let bk = bk0; try { const g = await zc('/bookings/' + bk0.id); bk = (g && g.data) || g || bk0; } catch { /* Liste reicht */ }
    const eintrag: any = { id: bk.id, name: [bk.firstname, bk.lastname].join(' ').trim(), tag: bk.day, zeit: hhmm(bk.time), pax: bk.nb_guests, alterMin: Math.round(alter), status: bk.status, charge: bk.charge ?? null };
    if ((bk.status !== 'confirmed' && bk.status !== 'waiting_customer') || karteFertig(bk)) { eintrag.aktion = 'Karte da – bleibt'; ergebnis.push(eintrag); continue; }
    if (probe || !AUFRAEUMEN_AN) { eintrag.aktion = 'würde storniert'; ergebnis.push(eintrag); continue; }
    // Stornieren. Eigene Mail mit Begründung, wenn das Schrei-Postfach eingerichtet ist – sonst die Zenchef-Stornomail.
    const eigeneMail = !!(MAIL_PASS && bk.email);
    await zc('/bookings/' + bk.id + '/changeStatus?force=1' + (eigeneMail ? '' : '&with-confirmation=1'), { method: 'PATCH', body: JSON.stringify({ status: 'canceled' }) });
    eintrag.aktion = 'storniert';
    if (eigeneMail) { try { await stornoMail(bk); eintrag.mail = 'gesendet'; } catch (e) { eintrag.mail = 'Fehler: ' + String((e as any)?.message || e).slice(0, 120); } }
    else eintrag.mail = 'Zenchef-Stornomail';
    ergebnis.push(eintrag);
  }
  return { modus: probe || !AUFRAEUMEN_AN ? 'Probelauf' : 'aktiv', fristMin: AUFRAEUMEN_MIN, geprueft: liste.length, ergebnis };
}

const MONATE = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
async function stornoMail(bk: any) {
  const [y, m, d] = String(bk.day).split('-').map(Number);
  const en = String(bk.lang || '').startsWith('en');
  const name = String(bk.firstname || '').trim();
  const zeit = hhmm(bk.time), pax = Number(bk.nb_guests) || 0;
  const text = en
    ? `Hello${name ? ' ' + name : ''},\n\nunfortunately your reservation at Das Schrei on ${MONTHS[m - 1]} ${d}, ${y} at ${zeit} for ${pax} ${pax === 1 ? 'guest' : 'guests'} has been cancelled, because no credit card guarantee was provided.\n\nWould you still like to join us? Feel free to call us at +43 664 1541102 and we will take care of your reservation by phone.\n\nYou can also book again online at any time:\nhttps://www.das-schrei.at/reservieren.html\n\nWarm regards\nDas Schrei`
    : `Hallo${name ? ' ' + name : ''},\n\nleider mussten wir deine Reservierung im Schrei am ${d}. ${MONATE[m - 1]} ${y} um ${zeit} Uhr für ${pax} ${pax === 1 ? 'Person' : 'Personen'} stornieren, da keine Kreditkartengarantie hinterlegt wurde.\n\nDu möchtest den Termin trotzdem wahrnehmen? Ruf uns gerne an unter +43 664 1541102, wir kümmern uns telefonisch um deine Reservierung.\n\nOnline kannst du jederzeit neu reservieren:\nhttps://www.das-schrei.at/reservieren.html\n\nHerzliche Grüße\nDas Schrei`;
  const tr = nodemailer.createTransport({ host: 'smtp.ionos.de', port: 465, secure: true, auth: { user: MAIL_USER, pass: MAIL_PASS } });
  await tr.sendMail({ from: { name: 'Das Schrei', address: MAIL_USER }, to: bk.email, subject: en ? 'Your reservation at Das Schrei has been cancelled' : 'Deine Reservierung im Schrei wurde storniert', text });
}

// ---------------------------------------------------------------- Server
Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') || '';
  const h = cors(origin);
  const json = (x: unknown, s = 200) => new Response(JSON.stringify(x), { status: s, headers: { ...h, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });
  if (req.method !== 'POST') return json({ error: 'Nur POST' }, 405);
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unbekannt';
  try {
    const b = await req.json().catch(() => ({}));
    const a = String(b.action || '');
    if (a === 'info') return json({ version: VERSION, umgebung: U, debug: DEBUG, anlegeStatus: ANLEGE_STATUS });
    if (a === 'monat') { limit('m:' + ip, 120, 60); if (!istDatum(b.von) || !istDatum(b.bis)) throw new Fehler('Zeitraum fehlt'); return json({ umgebung: U, debug: DEBUG, ...(await monat(b.von, b.bis)) }); }
    if (a === 'frei') { limit('f:' + ip, 240, 60); const pax = Number(b.pax); if (!istDatum(b.datum) || !(pax >= 1 && pax <= 10)) throw new Fehler('Datum oder Personen fehlen'); return json({ umgebung: U, debug: DEBUG, ...(await frei(b.datum, pax)) }); }
    if (a === 'anlegen') { limit('a:' + ip, TEST ? 30 : 5, 60); return json({ umgebung: U, debug: DEBUG, ...(await anlegen(b, origin)) }); }
    if (a === 'status') { limit('s:' + ip, 600, 60); return json({ umgebung: U, debug: DEBUG, ...(await statusAbfrage(b)) }); }
    if (a === 'bestaetigen') { limit('b:' + ip, 30, 60); return json({ umgebung: U, debug: DEBUG, ...(await bestaetigen(b)) }); }
    if (a === 'diagnose') return json(await diagnose(b));
    if (a === 'aufraeumen') {
      const vomZeitplan = !!CRON_KEY && req.headers.get('x-cron-key') === CRON_KEY;
      if (!vomZeitplan && !DEBUG) throw new Fehler('Nicht erlaubt', 403);
      return json(await aufraeumen(!vomZeitplan));                                   // aus dem Testpanel immer nur Probelauf
    }
    throw new Fehler('Unbekannte Aktion');
  } catch (e) {
    const st = e instanceof Fehler ? e.status : 500;
    return json({ error: String((e as any)?.message || e), ...(DEBUG && (e as any)?.versuche ? { versuche: (e as any).versuche } : {}) }, st);
  }
});
