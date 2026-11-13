# Übergabe: Eigene Reservierungsseite das-schrei.at (Zenchef-API)

Stand: 28.10.2026 (letzte Arbeitssitzung), zusammengefasst am 13.11.2026.
Code-Stand: Supabase-Funktion **web-v22**, Homepage-Paket `homepage-mit-reservierung.zip`.

---

## 1. Ziel und Ablauf für den Gast

Eigene Reservierungsseite statt Zenchef-Widget, im Homepage-Design, DE und EN:
`das-schrei.at/reservieren.html` und `das-schrei.at/en/reserve.html`.

1. **Datum:** Kalender, offene Tage live aus Zenchef. Event-Tage sind markiert („EVENT“), der Name steht unter dem Kalender.
2. **Personen:** 1–8 (mehr nur per Telefon/Mail).
3. **Raum:** Gastraum oder Chef's Table, mit Fotos von der Homepage.
   - Normaler Tag: Gastraum 18:00 / 18:30 / 19:30, Chef's Table nur 19:00 (wird automatisch gesetzt).
   - Mittag (Fr 12–14 Uhr laut Homepage): alle Zenchef-Zeiten vor 15 Uhr im Gastraum. **Noch zu bestätigen.**
   - Ausgebuchter Raum mit Wartelistenplatz: Foto grau, „Warteliste“ auf dem Foto.
   - Event-Tag: Event-Karte mit Bild, Name und Text aus der Zenchef-Experience, darunter trotzdem Raumwahl (Gastraum / Chef's Table). Gänge-Texte der Räume werden am Event-Tag ausgeblendet.
4. **Uhrzeit:** freie Zeiten, volle Zeiten mit Warteliste markiert.
5. **Daten:** Vorname, Nachname, E-Mail, Telefon mit Ländervorwahl (103 Länder, Flagge, Standard 🇦🇹 +43, man tippt nur „660 1944925“), Pflichtfeld Allergien/Unverträglichkeiten/vegetarisch/pescetarisch **oder** Button „Keine Allergien, Unverträglichkeiten oder Präferenzen“, Feld „Anlass und Wünsche“.
   - Häkchen Newsletter (optional).
   - **Pflicht-Häkchen Allergien:** „Ich habe alle Allergien, Unverträglichkeiten und Ernährungsformen angegeben, auch für die anderen Gäste meiner Gruppe. Mir ist bewusst, dass das Schrei bei einer Bekanntgabe erst im Restaurant keine Alternative garantieren kann.“
   - **Pflicht-Häkchen Datenschutz** (verlinkt auf impressum.html).
6. **„Weiter zur Kreditkarte“** → Reservierung wird in Zenchef angelegt → Gast wird direkt (gleicher Tab) auf die Zenchef-Kartenseite weitergeleitet → nach Hinterlegung zeigt Zenchef „Reservierung bestätigt“, Zenchef schickt die Bestätigungsmail selbst.
   - Entscheidung: Gast bleibt am Ende auf der Zenchef-Seite (Rücksprung zur Homepage geht nicht, Einbetten blockiert Zenchef, Tab-Schließen blockiert Safari).

**Warteliste:** ohne Kreditkarte. Button „Auf die Warteliste setzen“. Text: „Der Eintrag auf der Warteliste ist keine Reservierung. Wird ein Platz frei, melden wir uns telefonisch oder per E-Mail.“

---

## 2. Technik

| Teil | Wo |
|---|---|
| Seite DE/EN | im Homepage-Paket (Netlify), `reservieren.html`, `en/reserve.html` |
| Server | Supabase Edge Function **`web-reservierung`** (Verify JWT **aus**), gleiches Projekt wie Weinlager/Workflow (`bkzcvyvztjpmlbwnvnct`) |
| Zenchef | API v1/v2, Echtbetrieb restaurantId **368147**, Testumgebung (preproduction) **353058** |
| Doku | Postman: documenter.getpostman.com/view/27200831/2s9YsFEEVX (vollständige JSON-Datei liegt vor: „2s9YsFEEVX.json“) |

**Secrets in Supabase (Edge Functions → Secrets):**
- `ZENCHEF_API_TOKEN` (live), `ZENCHEF_PREPROD_TOKEN` (Test) – vorhanden
- `IONOS_USER`, `IONOS_PASS` – vorhanden (für Storno-Mails)
- `WEB_RES_UMGEBUNG = live` → Echtbetrieb (ohne Eintrag: Demo-Restaurant)
- `WEB_RES_DEBUG = 1` → Testpanel sichtbar. **Vor Livegang löschen.**
- Für automatisches Storno (noch nicht aktiv): `WEB_RES_AUFRAEUMEN = an`, `WEB_RES_CRON_KEY = <Geheimwort>`, optional `WEB_RES_FRIST_MIN` (Standard 60)

**Was die Funktion kann (Aktionen):** `info`, `monat` (offene Tage + Event-Tage), `frei` (Zeiten pro Raum, Warteliste, Events), `anlegen`, `status`, `bestaetigen`, `diagnose` (nur Debug), `aufraeumen`.

**Wichtige Erkenntnisse aus Doku und Tests:**
- Kartenlink: Zenchef fordert die Karte beim Anlegen selbst an (Kartenpflicht im Service). Die Funktion übernimmt diesen Link und ruft `ask-charge` **nicht** zusätzlich auf → nur **eine** Mail „Antrag auf Kreditkartengarantie“ (getestet).
- Diese Antrags-Mail lässt sich per API nicht abschalten; der Link ist derselbe wie auf der Weiterleitung.
- Bestätigungsmail kommt von Zenchef nach der Karte („…mit der Hinterlegung Ihrer Kreditkartengarantie bestätigt“), getestet.
- Raum wird beim Anlegen von Zenchef **nicht** übernommen (nur `tables` dokumentiert). Reservierung sitzt trotzdem richtig. Raum aus der Mailvorlage hat Jakob entfernt („keine Präferenz“ stand drin).
- Statusänderung: `PATCH /bookings/{id}/changeStatus?force=1` (nicht `/status`). **Gleicher Fehler steckt in der Workflow-App (Storno-Button) → dort anpassen.**
- Erlaubte Status: waiting, waiting_customer, confirmed, canceled, refused, arrived, seated, over, no_shown. **Keinen Wartelisten-Status** → Warteliste wird als `waiting` angelegt, mit Sicherheitsprüfung (steht der Eintrag nicht auf waiting, wird er sofort ohne Mail storniert).
- Events: Verfügbarkeit liefert `is_offer_required`; Name/Bild/Text kommen aus `GET /offers` (v2). Reservierung wird mit `offers: [{offer_id, count}]` angelegt. Getestet mit Tement-Dinner 01.02.2027: Bild, Name, Buchung mit Experience funktionieren.
- Experiences mit Vorauszahlung werden nur als „Nur telefonisch buchbar“ gezeigt (Schrei braucht keine Vorauszahlungen).
- Web-Buchungen tragen im Zenchef-Kommentar **„[WEB]“**, Allergien vorne („Allergien/Ernährung: …“), Event/Raum, Newsletter, „Allergie-Hinweis bestätigt“, Warteliste als „[WEB] WARTELISTE“.
- Spam-Schutz: verstecktes Feld, Mindest-Ausfülldauer, Limit pro IP. Homepage bucht nie „trotzdem“ (kein force bei normalen Reservierungen).

---

## 3. Automatisches Storno ohne Karte (gebaut, noch NICHT aktiv)

- Alle 5 Minuten (Zeitplan per `web_res_aufraeumen.sql`, pg_cron) werden Web-Reservierungen ([WEB], confirmed) ohne Karte nach **60 Minuten** storniert.
- Ausnahmen: Wartelisten-Einträge, Reservierungen mit Karte, und alles mit **„ohne Karte“** im Zenchef-Kommentar (für Stammgäste).
- Telefonische/selbst eingetragene Reservierungen sind nie betroffen (kein [WEB]).
- Gast bekommt Mail über restaurant@das-schrei.at (DE oder EN je nach Buchungssprache):
  > Leider mussten wir deine Reservierung im Schrei am … um … Uhr für … Personen stornieren, da keine Kreditkartengarantie hinterlegt wurde. Du möchtest den Termin trotzdem wahrnehmen? Ruf uns gerne an unter +43 664 1541102, wir kümmern uns telefonisch um deine Reservierung. Online kannst du jederzeit neu reservieren: …
- **Freischalten:** 1) Probelauf: Buchung mit Karte + Buchung ohne Karte, nach 60 Min. im Testpanel „Aufräumen (Probelauf)“ → mit Karte „bleibt“, ohne „würde storniert“. 2) Dann Secrets `WEB_RES_AUFRAEUMEN = an` + `WEB_RES_CRON_KEY`, SQL mit gleichem Geheimwort ausführen.

---

## 4. Homepage-Paket (homepage-mit-reservierung.zip)

Basiert auf dem Homepage-Artefakt (claude.ai/code/artifact/d581b9a6-3667-40ee-a7e6-561ebca539f5), Stand 28.10.:
- Alle 45 „Reservieren“-Buttons (alle Seiten DE/EN) → eigene Seite, gleicher Tab.
- `links.html` (Instagram-Bio): Reservieren → eigene Seite, Events → Reservierungsseite mit vorgewähltem Datum.
- `assets/site.js`: `RESERVIEREN = '/reservieren.html'`; Event-Button „Platz sichern“ → `/reservieren.html#JJJJ-MM-TT` (Datum vorgewählt). Feld `link` bei Events wird nicht mehr gebraucht.
- Google-Daten (`acceptsReservations`), `llms.txt`, `sitemap.xml` angepasst. Cache-Version `site.js?v=20261028`.
- **Achtung:** Das Homepage-Artefakt selbst ist noch **nicht** aktualisiert, nur die ZIP. Beim nächsten Homepage-Umbau die Änderungen übernehmen, sonst gehen sie verloren.

---

## 5. Status und nächste Schritte

**Erledigt/getestet (live, echtes Zenchef):** Kalender, Räume, Zeiten, Anlegen, Kartenweiterleitung, Garantie, eine Antrags-Mail + Bestätigung, Chef's Table, Event mit Experience/Bild/Raumwahl.

**Offen:**
1. `web-reservierung` auf **web-v22** bringen, ZIP zuerst auf Testseite (sparkling-toffee-4c7391.netlify.app) und dort DE, EN und Event einmal durchklicken.
2. Mittagszeiten Freitag klären (feste Zeiten oder alle vor 15 Uhr?).
3. Probelauf Aufräumen → dann automatisches Storno scharf schalten.
4. Warteliste im Demo-Restaurant testen (Abend ausbuchen, Warteliste dort aktiv).
5. `WEB_RES_DEBUG` löschen, `WEB_RES_UMGEBUNG = live` lassen, ZIP auf die echte Homepage.
6. Datenschutzerklärung ergänzen (Reservierungsdaten über Supabase an Zenchef, Storno-Mails über IONOS).
7. Antrags-Mail-Text: in Zenchef nicht selbst editierbar gefunden → Zenchef-Support fragen, ob Text änderbar oder bei API-Buchungen abschaltbar (Vorschlag Zusatzsatz: „Hast du deine Karte bereits bei der Online-Reservierung hinterlegt, kannst du diese Mail ignorieren.“).
8. Workflow-App: Storno-Aufruf auf `changeStatus` umstellen.
9. Alle Testreservierungen in Zenchef stornieren (u. a. 18.11., 26.11., Tement-Test).

**Mail an Zenchef (api-tech-help@zenchef.com), offene Fragen:**
- Antrags-Mail „Kreditkartengarantie“ bei API-Buchungen unterdrückbar?
- Rücksprung-URL nach Kartenhinterlegung möglich?
- Wartelisten-Buchung per API: richtiger Status/Weg, Kartengarantie dafür?
- Raum beim Anlegen setzen (booking_room_id)?
- Test-Zahlungsanbieter im Demo-Restaurant 353058.

---

## 6. Dateien zum Mitnehmen
- `web-reservierung_index.ts` (web-v22) – Code der Supabase-Funktion
- `homepage-mit-reservierung.zip` – komplette Homepage inkl. Reservierungsseite DE/EN
- `reservierung-test-seite.zip` – nur Reservierungsseite für die Netlify-Testseite (Stand vor web-v22-Paket)
- `web_res_aufraeumen.sql` – Zeitplan für automatisches Storno
- `2s9YsFEEVX.json` – vollständige Zenchef-API-Doku
