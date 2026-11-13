# Versuch: Reservierung ohne zusätzliche Antrags-Mail (web-v23)

**Ziel:** Der Gast soll nach der Online-Reservierung keine zusätzliche Zenchef-Mail „Antrag auf Kreditkartengarantie“ bekommen.

**Idee:** Die Funktion legt die Reservierung als `waiting_customer` statt `confirmed` an. Hinterlegt der Gast die Karte, setzt die Funktion sie selbst auf `confirmed`, und Zenchef verschickt dabei die normale Bestätigungsmail.

**Sicherheit:** Der Versuch greift nur, wenn **beide** Bedingungen gelten:
- Secret `WEB_RES_ANLEGE_STATUS = waiting_customer`
- Testmodus: entweder Demo-Restaurant (kein `WEB_RES_UMGEBUNG`) oder `WEB_RES_DEBUG = 1`

Ohne Testmodus legt die Funktion immer `confirmed` an, also genau wie web-v22.

---

## 1. Deployen

1. Supabase öffnen → Edge Functions → `web-reservierung` → Code durch `supabase/functions/web-reservierung/index.ts` aus dem Pull Request ersetzen → Deploy.
2. Unter Edge Functions → Secrets `WEB_RES_ANLEGE_STATUS` mit dem Wert `waiting_customer` anlegen.
3. Die Umgebung wählen:
   - **A. Demo-Restaurant 353058 (zuerst):** `WEB_RES_UMGEBUNG` vorübergehend löschen. Die Live-Homepage ist davon nicht betroffen, weil sie noch direkt auf Zenchef verlinkt. Funktioniert aber nur, wenn im Demo-Restaurant ein Zahlungsanbieter für Testkarten aktiv ist (das war noch offen).
   - **B. Kontrollierter Echttest:** `WEB_RES_UMGEBUNG = live` lassen und `WEB_RES_DEBUG = 1` setzen. Mit deiner eigenen Karte und E-Mail-Adresse buchen und die Buchung danach stornieren.
4. Die Reservierungsseite der Vorschau öffnen: https://deploy-preview-1--dasschrei.netlify.app/reservieren.html
   Im Testpanel ganz unten auf „Verbindung prüfen“ klicken: Dort muss `web-v23` und `anlegeStatus: waiting_customer` stehen.

## 2. Testen und worauf du achten musst

Buche einen Abend mit deiner eigenen E-Mail-Adresse und klicke auf „Weiter zur Kreditkarte“. Im Testmodus zeigt die Seite den Kartenlink an, statt direkt weiterzuleiten.

| # | Prüfen | Gut | Schlecht |
|---|---|---|---|
| 1 | **Antrags-Mail** „Kreditkartengarantie“ im Postfach (5 Min. warten) | keine Mail | Mail kommt trotzdem → Versuch gescheitert |
| 2 | **Kartenlink** auf der Seite | Buttons „Zur Kartenseite“ sind da | „Kein Kartenlink von Zenchef“ → Zenchef fordert die Karte bei diesem Status nicht an → Versuch gescheitert |
| 3 | **Tisch geblockt:** in einem zweiten Browser den gleichen Tag und die gleiche Zeit aufrufen (am besten Chef's Table mit 10 Personen, dann muss er voll sein) und im Zenchef-Dashboard nachsehen | Platz ist weg, Reservierung im Plan sichtbar | Zeit weiter frei → Überbuchungsgefahr, nicht verwenden |
| 4 | **Karte hinterlegen** über „Zur Kartenseite“, danach „Status prüfen“ | Seite zeigt „bestätigt“, in Zenchef Status *Bestätigt* | bleibt auf „wird geprüft“ → Testpanel-Ausgabe kopieren und mir schicken |
| 5 | **Bestätigungsmail** von Zenchef | kommt genau einmal | keine oder zwei Mails |
| 6 | Zenchef-Kommentar der Reservierung | enthält `[WEB]` … `[WEB-BESTÄTIGT]` | – |

Bitte zusätzlich einmal **ohne** Karte buchen und die Seite schließen. In Zenchef sollte die Reservierung dann auf *Warten auf Kunde* stehen. Wichtig ist, ob Zenchef sie von selbst irgendwann storniert oder ob sie stehen bleibt (dann übernimmt das unser automatisches Storno nach 60 Minuten).

## 3. Danach

- Alle Testreservierungen in Zenchef stornieren.
- Secrets zurücksetzen: `WEB_RES_UMGEBUNG = live` wieder anlegen (bei Variante A), `WEB_RES_ANLEGE_STATUS` löschen, wenn der Versuch scheitert, `WEB_RES_DEBUG` vor dem Livegang löschen.
- Ergebnis (Punkte 1–6) kurz an Claude im Projekt schicken. Klappt alles, schalte ich den Versuch auch für den Echtbetrieb frei.

---

## Ergebnis (13.11.2026, Echttest)

**Gescheitert.** Mit `waiting_customer` öffnet sich keine Kreditkartenseite, nur die Warteseite. Zenchef erzeugt bei diesem Status keinen Kartenlink. Secret `WEB_RES_ANLEGE_STATUS` in Supabase löschen, damit wieder `confirmed` angelegt wird. Die Testbuchung (Status „Warten auf Kunde“) in Zenchef stornieren.
Stattdessen steht jetzt auf der Reservierungsseite (DE + EN) vor „Weiter zur Kreditkarte“ ein Hinweis, dass Zenchef zusätzlich eine Mail mit demselben Link schickt. Die Anfrage an den Zenchef-Support bleibt offen.
