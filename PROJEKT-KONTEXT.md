# Das Schrei – Homepage (das-schrei.at) · Projektkontext

Stand: 10.11.2026 · Quelle: Claude-Artefakt „Homepage-Entwurf“
(claude.ai/code/artifact/d581b9a6-3667-40ee-a7e6-561ebca539f5, Version 1794316010-41e4)

Diese Datei fasst alles zusammen, was beim Weiterarbeiten an der Homepage wichtig ist.
Sie liegt im Projektordner; beim Netlify-Deploy kann sie mitgehen oder weggelassen werden.

---

## 1. Technik & Hosting

- Eigene statische Seite (HTML/CSS/JS), live seit Oktober 2026 unter **das-schrei.at** auf **Netlify**.
- Domain bei **IONOS** registriert, DNS auf Netlify umgestellt.
- Vorher Wix Studio; Wix-Abo gekündigt (Verlängerung aus), alte Seite bleibt bis Ablauf als Archiv.
- Deploy: Ordnerinhalt als ZIP bei Netlify hochladen (Drag & Drop).
- **Nichts wird ohne ausdrückliche Freigabe von Jakob veröffentlicht.**

## 2. Dateistruktur

| Pfad | Inhalt |
|---|---|
| `index.html` | Startseite (DE) – Restaurantauftritt im Vordergrund |
| `menue.html`, `wein.html`, `weinkarte.html`, `ueber-uns.html`, `partnerbetriebe.html`, `events.html`, `impressum.html` | Unterseiten DE |
| `en/…` | Englische Version (index, menu, wine, wine-list, about, partners, events) |
| `links.html` | Link-Seite für die Instagram-Bio (das-schrei.at/links) |
| `assets/site.js` | Zentrale Logik inkl. Listen **URLAUB** und **EVENTS** |
| `assets/site.css` | Gesamtes Styling |
| `assets/fonts/` | Selbst gehostete Schriften (DM Sans, Italiana, Roboto) |
| `assets/img/` | Fotos in mehreren Größen (JPG + WebP) |
| `assets/vendor/` | GSAP, ScrollTrigger, Scroll-Helfer |
| `weinkarte-beispiel.json` | Beispieldaten der Weinkarte |
| `sitemap.xml`, `robots.txt`, `llms.txt` | SEO / Crawler |

## 3. Feste Regeln (immer gleich vorgehen)

### Betriebsurlaub
- Nennt Jakob einen Betriebsurlaub mit Zeitraum → in `assets/site.js` der Liste `URLAUB` einen Eintrag `{ von, bis }` hinzufügen (mehrere Zeiträume möglich).
- „Betriebsurlaub weg“ → Eintrag entfernen.
- Hinweis erscheint **dezent als Zeile unter den Öffnungszeiten** (keine schwebende Leiste – war zu präsent) und blendet sich nach dem letzten Tag selbst aus.
- Aktuell eingetragen: **23.–27.12.2026** und **01.–11.01.2027**.

### Sonderöffnungen
- Als Zeile unter den Öffnungszeiten, **ohne Uhrzeit**.

### Events
- Event bewerben → in `assets/site.js` in die Liste `EVENTS` eintragen: datum, zeit, titel/text **DE + EN**, preis, bild, link (am besten eigene Zenchef-Experience pro Event).
- Events stehen auf eigener Seite (`events.html` / `en/events.html`), **nicht auf der Startseite**.
- Menüpunkt „Events“ erscheint nur, solange ein Event ansteht; vergangene Events blenden sich selbst aus.
- Aktuell eingetragen:
  - **Advent-Samstage 5./12./19.12.2026** – zusätzlich geöffnet, nur 7-Gang-Adventmenü inkl. Kaviar, 165 € (Zenchef shxpid=139507)
  - **Winzerdinner Weingut Tement, 01.02.2027, 18:30** – 250 € inkl. 6-Gang-Menü, Aperitif, Weinbegleitung (Zenchef shxpid=139490)

### Stil der Event-Texte (Vorbild: Tement-Winzerdinner)
- Warm und atmosphärisch, aber nicht überladen; **du-Form**.
- Wer zu Gast ist und was er mitbringt (z. B. Weine, die Terroir und Stilistik des Hauses zeigen).
- Was serviert wird (Gänge, Aperitif, Begleitung).
- Abschluss mit dem Gefühl eines besonderen Abends („Küche und Weingut erzählen gemeinsam“).
- Immer **DE + EN**.

### Link-Seite (das-schrei.at/links)
- Als Instagram-Bio-Link eingetragen.
- Reihenfolge: Homepage → allgemeine Reservierung → Gutscheinshop → aktuelle Events mit direktem Buchungslink (mit Bildern).
- Liest die `EVENTS`-Liste aus `site.js` → automatisch aktuell.
- **Bei jedem Website-Umbau mitprüfen** (Reservierungs-/Gutscheinlinks, Events, Design) und in die Netlify-ZIP aufnehmen.

### Instagram-Events („hey neues Event für Instagram“)
- Immer Story (1080×1920) **und** Beitrag (1080×1350) im Design-Canvas „Das Schrei – Instagram Events“ (claude.ai/artifact/CGtMnvCSGDCAYkiya5Y2AT) als neue Artboards, im Website-Look.
- Dazu Bildunterschrift im Event-Textstil: Datum, Preis inkl. Leistungen, Hinweis „Link in unserer Bio“, wenige Hashtags, **keine Emojis**.
- Buchungslink setzt Jakob selbst als Link-Sticker.

### Weinseite
- Die Positionszahl auf der Wein-Seite soll **live an die Weinkarte der Lager-App gekoppelt** sein und immer die exakte aktuelle Anzahl zeigen (nicht gerundet).

## 4. Design

- Vorbild: sergiohermangroup.com.
- Mobile Ansicht (Breakpoint 390 px) wird separat angepasst; **Desktop bleibt dabei unverändert**.
- Designidee soll mobil erhalten bleiben, aber gut lesbar sein.
- Überschrift „Du bestimmst die Länge. Wir den Verlauf.“ mobil **auf dem Bild und rechtsbündig**.
- Fotos: Helge Kirchberger und Stefan Langeder (Nutzungsrechte vorhanden).

## 5. Reservierung (Zenchef, rid 368147)

**Umsetzung (Stand web-v22, ins Repo übernommen am 13.11.2026):** eigene Seiten `reservieren.html` / `en/reserve.html`, alle „Reservieren“-Buttons zeigen darauf. Server ist die Supabase Edge Function `web-reservierung` (Code in `supabase/functions/web-reservierung/index.ts`, Deploy in Supabase, nicht über Netlify). Details, Secrets und offene Punkte: `supabase/UEBERGABE-RESERVIERUNG.md`. `/supabase/*` ist auf der Live-Seite gesperrt.

Eigene Reservierungsseite über die Zenchef-API (Konzept Okt 2026 – erst Testumgebung, dann live):
- Komplett raumbasiert: **Datum → Personen → Raum → Uhrzeit**.
- **Chef's Table** (L-Theke, 10 Plätze): nur **19:00**. **Restaurant** (10 Tische): **18:00, 18:30, 19:30**.
- Nach „Reservieren“ direkt zur **Kreditkarten-Hinterlegung**, danach automatisch Bestätigung.
- Web-Reservierungen ohne hinterlegte Kreditkarte werden nach **60 Minuten storniert**; Gast bekommt Mail (Storno wegen fehlender Kreditkarte, gerne telefonisch melden).
- Stammgäste reservieren oft telefonisch ohne Kreditkarte.
- **Warteliste** für beide Räume, ohne Kreditkartengarantie; ist **keine** Reservierung – Restaurant meldet sich telefonisch oder per E-Mail.
- Events/Experiences (in Zenchef als Experience mit Schicht verknüpft, z. B. Tement nur 18:30) mit Kreditkartengarantie; **keine Vorauszahlungen**.
- Bei Events trotzdem Raumauswahl zeigen, Event-Tage im Kalender markieren, Bild aus der Zenchef-Experience anzeigen.

## 6. Offene Punkte

- **Newsletter-Eintrag**, der die Werbe-Einwilligung direkt in Zenchef schreibt – Weg offen: Zenchef-Marketing-Suite-Popup oder eigenes Feld über die Zenchef-API.

## 7. Betrieb (für Texte relevant)

- das schrei OG (Schreibweise im Firmenbuch: „das schrei OG“), Salzburg · Inhaber Jakob Schmid & Daniel Reifecker.
- Ruhetage Samstag und Sonntag.
- Gault&Millau 2027: 15,5 Punkte, 3 Hauben.
