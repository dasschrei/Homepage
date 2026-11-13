(() => {
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const html = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(pointer:fine)').matches;
  let toggleMenu = () => {};
  let visitorScrolled = false;
  ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(t => window.addEventListener(t, () => { visitorScrolled = true; }, { once: true, passive: true }));

  // Anzahl der Weine auf der Weinkarte, live aus der Lager-App (dieselbe Quelle und dieselbe Regel wie weinkarte.html).
  // Zähler mit data-count-karte zeigen diese Zahl; klappt das Laden nicht, bleibt die Zahl im HTML stehen.
  const KARTE_QUELLE = 'https://bkzcvyvztjpmlbwnvnct.supabase.co/functions/v1/karte-oeffentlich';
  const SCRIPT_URL = document.currentScript && document.currentScript.src;
  const aufKarte = weine => (weine || []).filter(w => w.auf_weinkarte !== false && w.vk != null).length || null;
  const karteAnzahl = !document.querySelector('[data-count-karte]') ? Promise.resolve(null)
    : fetch(KARTE_QUELLE).then(r => { if (!r.ok) throw 0; return r.json(); }).then(d => aufKarte(d.weine))
      .catch(() => /claude/.test(location.hostname) && SCRIPT_URL
        // In der claude.ai-Vorschau ist die Datenbank gesperrt: dort mit den Beispieldaten zählen
        ? fetch(new URL('../weinkarte-beispiel.json', SCRIPT_URL)).then(r => r.json()).then(aufKarte).catch(() => null)
        : null);
  karteAnzahl.then(n => {
    if (!n) return;
    document.querySelectorAll('[data-count-karte]').forEach(el => {
      el.dataset.count = n;
      el.setAttribute('aria-label', n);
      if (!el.dataset.counting) el.textContent = n;
    });
  });
window.addEventListener('load', () => setTimeout(settleScroll, 60), { once: true });
// Once the page itself is ready, fetch every remaining image in the background
// (top to bottom), so photos are already there when the visitor scrolls to them.
window.addEventListener('load', () => {
  const lazy = [...document.querySelectorAll('img[loading="lazy"]')];
  const next = () => { const img = lazy.shift(); if (!img) return; img.loading = 'eager'; if (img.complete) next(); else { img.addEventListener('load', next, { once: true }); img.addEventListener('error', next, { once: true }); } };
  for (let i = 0; i < 3; i++) next();
}, { once: true });
  // Any scroll in the first seconds that the visitor did not cause is a restored old position: undo it.
  const guardUntil = performance.now() + 3000;
  const scrollGuard = () => {
    if (visitorScrolled || performance.now() > guardUntil) { window.removeEventListener('scroll', scrollGuard); return; }
    if (window.scrollY > 0 && location.hash.length < 2) settleScroll();
  };
  window.addEventListener('scroll', scrollGuard, { passive: true });
  let lenis = null;

  // ===== Betriebsurlaub =====
  // Jeder Urlaub eine Zeile: { von: 'JJJJ-MM-TT', bis: 'JJJJ-MM-TT' } ('bis' = letzter Urlaubstag).
  // Vergangene Urlaube blenden sich von selbst aus. Kein Urlaub: leere Liste [].
  const URLAUB = [
    { von: '2026-12-23', bis: '2026-12-27' },
    { von: '2027-01-01', bis: '2027-01-11' },
  ];

  // ===== Sonderöffnungen =====
  // Zusätzliche Öffnungstage außerhalb der normalen Zeiten (z. B. Samstage im Advent).
  // Sie erscheinen als dezente Zeile unter den Öffnungszeiten, zählen für „Jetzt geöffnet“ und blenden sich danach selbst aus.
  // hinweis: kurzer Zusatz (de/en), z. B. welches Menü es gibt. Keine Sonderöffnung: leere Liste [].
  const SONDEROEFFNUNG = [
    { daten: ['2026-12-05', '2026-12-12', '2026-12-19'], von: '18:00', bis: '22:00',
      name: { de: 'Advent-Samstage', en: 'Advent Saturdays' },
      hinweis: { de: 'zusätzlich geöffnet, ausschließlich 7-Gang-Adventmenü', en: 'additionally open, 7-course Advent menu only' },
      menue: { de: 'An den Advent-Samstagen ({daten}) servieren wir ausschließlich unser 7-Gang-Adventmenü mit Kaviar um 165 € pro Person.',
               en: 'On the Advent Saturdays ({daten}) we serve only our 7-course Advent menu with caviar, € 165 per person.' } },
  ];

  // ===== Events =====
  // Jedes Event ein Eintrag. Die Seite events.html zeigt alle kommenden Events, der Menüpunkt „Events“ erscheint nur, solange eines ansteht;
  // am Tag nach dem (letzten) Termin verschwindet die Karte von selbst. Kein Event: leere Liste [].
  // datum: ein Tag 'JJJJ-MM-TT' oder mehrere als Liste ['…', '…'] (dann eine Karte mit allen Terminen).
  // preisinfo (optional): kleiner Zusatz unter dem Preis, z. B. { de: 'inkl. …', en: 'incl. …' }.
  // link: wird nicht mehr gebraucht – der Button führt auf die eigene Reservierungsseite mit vorgewähltem Datum.
  const EVENTS = [
    { datum: ['2026-12-05', '2026-12-12', '2026-12-19'],
      titel: { de: 'Advent-Samstage', en: 'Advent Saturdays' },
      text:  { de: 'An drei Samstagen im Advent öffnen wir zusätzlich unsere Türen – mit einem eigenen 7-Gang-Adventmenü, in dem auch Kaviar seinen Auftritt hat. Ein festlicher Abend zum Ausklang des Jahres – an diesen Samstagen servieren wir ausschließlich dieses Menü.',
               en: 'On three Saturdays in Advent we open our doors in addition – with a dedicated 7-course Advent menu in which caviar makes its appearance too. A festive evening to close out the year – on these Saturdays, this is the only menu we serve.' },
      preis: '€ 165', bild: 'assets/img/event-advent.jpg', link: 'https://bookings.zenchef.com/results?rid=368147&pid=1001&shxpid=139507' },
    { datum: '2027-02-01', zeit: '18:30',
      titel: { de: 'Winzerdinner mit dem Weingut Tement', en: 'Winemaker dinner with Weingut Tement' },
      text:  { de: 'An diesem Abend ist das Weingut Tement aus der Südsteiermark bei uns zu Gast – und bringt Weine mit, die ihr Terroir und die unverwechselbare Stilistik des Hauses spürbar machen. Nach einem Aperitif servieren wir dazu ein 6-Gang-Menü, abgestimmt auf genau diese Weine. Ein besonderer Abend, an dem Küche und Weingut gemeinsam erzählen – und du die Menschen hinter den Weinen aus nächster Nähe erlebst.',
               en: 'On this evening, Weingut Tement from southern Styria joins us as our guest – bringing wines that express their terroir and the unmistakable style of the estate. After an aperitif, we serve a 6-course menu composed around exactly these wines. A special evening where kitchen and winery tell the story together – and where you get to meet the people behind the wines up close.' },
      preis: '€ 250', preisinfo: { de: 'inkl. Aperitif, Weinbegleitung und Menü', en: 'incl. aperitif, wine pairing and menu' },
      bild: 'assets/img/event-tement.jpg', link: 'https://bookings.zenchef.com/results?rid=368147&pid=1001&shxpid=139490' },
  ];
  const RESERVIEREN = '/reservieren.html';   // eigene Reservierungsseite (EN: /en/reserve.html)
  const GUTSCHEINE = 'https://shop.zenchef.com/?active-collection=vouchers&collections=vouchers&shop-id=sh_fa45842d-b087-4dc6-b5e8-7543da231ad8&language=de&primary-color=cccccc';
  // Dieselben Daten für die Link-Seite (links.html) – so ist sie immer automatisch aktuell.
  window.SCHREI_DATEN = { EVENTS, RESERVIEREN, GUTSCHEINE, termine: (tage, en) => termine(tage, en) };
  if (html.hasAttribute('data-nur-daten')) return;

  html.classList.remove('no-js');
  // Every page opens at the top (only links with a #section jump further down).
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  if (!location.hash) window.scrollTo(0, 0);
  markCurrentPage();
  initEvents();

  // Fallback: if the libraries failed to load, just show the page.
  if (!window.gsap || !window.ScrollTrigger) {
        initStatic();
    return;
  }
  gsap.registerPlugin(ScrollTrigger);

  /* ---------- smooth scroll ---------- */
  if (!reduce && window.Lenis) {
    lenis = new Lenis({ lerp: 0.085 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    if (!location.hash) lenis.scrollTo(0, { immediate: true });
  }
  const scrollToTarget = (el, immediate) => lenis
    ? lenis.scrollTo(el, { duration: 1.6, immediate: !!immediate, easing: t => 1 - Math.pow(1 - t, 4) })
    : (el === 0 ? window.scrollTo(0, 0) : el.scrollIntoView({ behavior: reduce || immediate ? 'auto' : 'smooth' }));

  initLinks();

  if (reduce) {
    html.classList.add('reduced');
        initStatic();
    return;
  }

  /* ---------- helpers ---------- */
  const split = (el, types) => {
    if (!window.SplitType) return null;
    const s = new SplitType(el, { types });
    if (types.includes('lines')) s.lines.forEach(l => { const m = document.createElement('span'); m.className = 'mask'; l.parentNode.insertBefore(m, l); m.appendChild(l); });
    return s;
  };
  const onEnter = (el, fn, start = 'top 85%') => ScrollTrigger.create({ trigger: el, start, once: true, onEnter: fn });

  start();
  // Line breaks can move once the web fonts arrive; re-measure then.
  document.fonts.ready.then(() => ScrollTrigger.refresh());

function start() {
  // Whatever is already on screen when this runs stays as it is (the page intro is CSS);
  // only content further down gets its scroll-in animation.
  const below = el => el.getBoundingClientRect().top > innerHeight * 0.92;

  /* ---- headline line reveals ---- */
  $$('[data-split]').filter(below).forEach(el => {
    const s = split(el, 'lines');
    if (!s) return;
    gsap.set(s.lines, { yPercent: 110 });
    onEnter(el, () => gsap.to(s.lines, { yPercent: 0, duration: 1.3, ease: 'expo.out', stagger: 0.09, onComplete: () => s.revert() }));
  });

  /* ---- fades ---- */
  $$('[data-fade]').filter(below).forEach(el => {
    gsap.from(el, { autoAlpha: 0, y: 40, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 90%', once: true } });
  });
  $$('[data-stagger]').filter(below).forEach(el => {
    gsap.from(el.children, { autoAlpha: 0, y: 30, duration: 1, ease: 'expo.out', stagger: 0.07, scrollTrigger: { trigger: el, start: 'top 88%', once: true } });
  });

  /* ---- word-by-word reading effect ---- */
  $$('[data-words]').filter(below).forEach(el => {
    const s = split(el, 'words');
    if (!s) return;
    s.words.forEach(w => w.classList.add('w'));
    gsap.fromTo(s.words, { opacity: 0.14 }, { opacity: 1, stagger: 0.1, ease: 'none', scrollTrigger: { trigger: el, start: 'top 80%', end: 'bottom 45%', scrub: true } });
  });

  /* ---- image reveals + parallax ---- */
  $$('[data-reveal]').forEach(el => {
    const img = $('img', el);
    if (el.dataset.reveal !== 'hero' && below(el)) {
      gsap.set(el, { clipPath: 'inset(18% 12% 18% 12%)' });
      onEnter(el, () => {
        gsap.fromTo(el, { clipPath: 'inset(18% 12% 18% 12%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.8, ease: 'expo.inOut' });
        gsap.fromTo(img, { scale: 1.1 }, { scale: 1, duration: 1.6, ease: 'expo.out' });
      });
    }
    if (!el.matches('.person__media')) gsap.fromTo(img, { yPercent: -8 }, { yPercent: 6, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true } });
  });

  /* ---- home hero ---- */
  if ($('.hero')) {
    gsap.to('.hero__media img', { yPercent: 14, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
    gsap.to('.hero__content', { y: -120, autoAlpha: 0, ease: 'none', scrollTrigger: { trigger: '.hero', start: '30% top', end: 'bottom top', scrub: true } });
  }

  settleScroll();

    // The header (and with it the menu button) stays visible at every scroll position.

    initMarquees();
    initRooms();
    initTimeline();
    initStack();
    initCounters();
    initChars();
    if ($('.footer__mark')) gsap.from('.footer__mark span', { yPercent: 100, duration: 1.4, ease: 'expo.out', stagger: 0.06, scrollTrigger: { trigger: '.footer', start: 'top 85%', once: true } });


    initMagnetic();
    initStatic();
    ScrollTrigger.refresh();
  }

  /* everything that also works without motion */
  function initStatic() {
    initHeader();
    initPairs();
    initPicker();
    initStatus();
    initMenu();
    initFaq();
    initUrlaub();
    initSonder();
  }

  /* ---------- Events: own page, menu item only while events are coming ---------- */
  function initEvents() {
    const en = html.lang === 'en';
    const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const pick = v => v && typeof v === 'object' ? (en ? v.en || v.de : v.de || v.en) : v;
    const d = s => { const [y, m, t] = s.split('-').map(Number); return new Date(y, m - 1, t); };
    const today = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date()) + 'T00:00:00');
    const list = (EVENTS || []).filter(e => e && e.datum && pick(e.titel))
      .map(e => {
        const tage = [].concat(e.datum).map(d).filter(t => t >= today).sort((a, b) => a - b);
        // Button führt auf die eigene Reservierungsseite, das Datum ist vorgewählt (Experience erkennt die Seite selbst aus Zenchef)
        const t0 = tage[0];
        const l = t0 ? (en ? '/en/reserve.html' : '/reservieren.html') + '#' + t0.getFullYear() + '-' + String(t0.getMonth() + 1).padStart(2, '0') + '-' + String(t0.getDate()).padStart(2, '0') : RESERVIEREN;
        return { ...e, tage, tag: tage[0], link: l };
      }).filter(e => e.tag).sort((a, b) => a.tag - b.tag);
    const sec = $('#events');
    if (!list.length) {
      $$('[data-nav-events]').forEach(a => a.remove());
      if (sec) { const e = $('.events__empty', sec); if (e) e.hidden = false; }
      return;
    }
    if (!sec) return;
    const css = $('link[href*="assets/site.css"]');
    const base = css ? css.getAttribute('href').replace(/assets\/site\.css.*$/, '') : '';
    const src = b => /^(https?:)?\/\//.test(b) || b.startsWith('/') ? b : base + b;
    const loc = en ? 'en-GB' : 'de-AT';
    const when = e => {
      const t = e.tage.length > 1 ? termine(e.tage, en) : e.tag.toLocaleDateString(loc, { weekday: 'short', day: 'numeric', month: 'long' });
      return e.zeit ? `${t} · ${en ? e.zeit : e.zeit + ' Uhr'}` : t;
    };
    const cards = list.map(e => `
      <article class="event">
        ${e.bild ? `<div class="event__media reveal" data-reveal><img src="${esc(src(e.bild))}" alt="${esc(pick(e.titel))}" loading="lazy" decoding="async"></div>` : ''}
        <div class="event__body">
          <p class="event__when">${esc(when(e))}</p>
          <h3 class="h-m">${esc(pick(e.titel))}</h3>
          ${pick(e.text) ? `<p class="event__text">${esc(pick(e.text))}</p>` : ''}
          <div class="event__foot">
            ${e.preis ? `<span class="event__price">${esc(e.preis)}${en ? ' per person' : ' pro Person'}${pick(e.preisinfo) ? `<small style="display:block;font-size:13px;opacity:.8;margin-top:2px">${esc(pick(e.preisinfo))}</small>` : ''}</span>` : ''}
            ${e.link ? `<a class="btn btn--dark" data-magnetic href="${esc(e.link)}"><span>${en ? 'Reserve a seat' : 'Platz sichern'}</span><i class="arrow"></i></a>` : ''}
          </div>
        </div>
      </article>`).join('');
    const grid = $('.events__grid', sec);
    grid.innerHTML = cards;
    grid.classList.toggle('is-single', list.length === 1);

    // Structured data so Google can show the events as such.
    const SITE = 'https://www.das-schrei.at/';
    const offset = (iso, t) => {
      const u = new Date(`${iso}T${t || '00:00'}:00Z`);
      const h = Math.round((new Date(u.toLocaleString('en-US', { timeZone: 'Europe/Vienna' })) - new Date(u.toLocaleString('en-US', { timeZone: 'UTC' }))) / 36e5);
      return `+${String(h).padStart(2, '0')}:00`;
    };
    const ld = document.createElement('script');
    ld.type = 'application/ld+json';
    const iso = t => `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    ld.textContent = JSON.stringify(list.flatMap(e => e.tage.map(t => ({ ...e, datum: iso(t) }))).map(e => ({
      '@context': 'https://schema.org', '@type': 'Event',
      name: pick(e.titel), description: pick(e.text) || undefined,
      startDate: e.zeit ? `${e.datum}T${e.zeit}:00${offset(e.datum, e.zeit)}` : e.datum,
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      image: e.bild ? [/^https?:/.test(e.bild) ? e.bild : SITE + e.bild.replace(/^\//, '')] : undefined,
      location: { '@type': 'Place', name: 'Das Schrei', address: { '@type': 'PostalAddress', streetAddress: 'Josef-von-Eichendorff-Straße 5', postalCode: '5020', addressLocality: 'Salzburg', addressCountry: 'AT' } },
      organizer: { '@type': 'Restaurant', name: 'Das Schrei', url: SITE },
      offers: e.link ? { '@type': 'Offer', url: 'https://www.das-schrei.at' + e.link, availability: 'https://schema.org/InStock', ...(parseFloat(String(e.preis || '').replace(/[^\d,.]/g, '').replace(',', '.')) ? { price: parseFloat(String(e.preis).replace(/[^\d,.]/g, '').replace(',', '.')), priceCurrency: 'EUR' } : {}) } : undefined,
    })));
    document.head.appendChild(ld);
  }

  /* ---------- Termine lesbar: „Sa., 5., 12. & 19. Dezember“ ---------- */
  function termine(tage, en) {
    const loc = en ? 'en-GB' : 'de-AT';
    const wd = tage[0].toLocaleDateString(loc, { weekday: 'short' });
    const sameMonth = tage.every(t => t.getMonth() === tage[0].getMonth());
    if (sameMonth) {
      const nums = tage.map(t => en ? String(t.getDate()) : t.getDate() + '.');
      const joined = nums.length > 1 ? nums.slice(0, -1).join(', ') + (en ? ' & ' : ' & ') + nums[nums.length - 1] : nums[0];
      const month = tage[0].toLocaleDateString(loc, { month: 'long' });
      return `${wd} ${joined} ${month}`;
    }
    return tage.map(t => t.toLocaleDateString(loc, { day: 'numeric', month: 'long' })).join(' · ');
  }

  /* ---------- Sonderöffnungen: kommende Tage ---------- */
  function sonderTage() {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date());
    return (Array.isArray(SONDEROEFFNUNG) ? SONDEROEFFNUNG : []).filter(x => x && x.daten && x.von)
      .map(x => ({ ...x, kommend: [].concat(x.daten).filter(iso => iso >= today).sort() }))
      .filter(x => x.kommend.length);
  }
  function hm(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }

  /* ---------- Sonderöffnungen: Zeile unter den Öffnungszeiten + Hinweis beim Menü ---------- */
  function initSonder() {
    const liste = sonderTage();
    if (!liste.length) return;
    const en = html.lang === 'en';
    const pick = v => v && typeof v === 'object' ? (en ? v.en || v.de : v.de || v.en) : v;
    const d = s => { const [y, m, t] = s.split('-').map(Number); return new Date(y, m - 1, t); };
    const hours = $('.hours');
    let anker = hours;
    liste.forEach(x => {
      const daten = termine(x.kommend.map(d), en);
      if (anker) {
        const p = document.createElement('p');
        p.className = 'urlaub-note sonder-note';
        p.textContent = `${pick(x.name)}: ${daten} · ${pick(x.hinweis)}`;
        anker.after(p); anker = p;
      }
      if (x.menue) {
        const note = $('.picker .note') || $('.price-list ~ .note');
        if (note) {
          const n = document.createElement('p');
          n.className = 'note';
          n.textContent = pick(x.menue).replace('{daten}', daten);
          note.after(n);
        }
      }
    });
  }

  /* ---------- Betriebsurlaub: quiet line under the opening hours ---------- */
  function initUrlaub() {
    const liste = (Array.isArray(URLAUB) ? URLAUB : (URLAUB ? [URLAUB] : [])).filter(u => u && u.von && u.bis);
    if (!liste.length) return;
    const en = html.lang === 'en';
    const d = s => { const [y, m, t] = s.split('-').map(Number); return new Date(y, m - 1, t); };
    const today = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date()) + 'T00:00:00');
    const loc = en ? 'en-GB' : 'de-AT';
    const full = x => x.toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric' });
    const dayMonth = x => x.toLocaleDateString(loc, { day: 'numeric', month: 'long' });
    const range = (von, bis) => {
      if (von.getMonth() === bis.getMonth() && von.getFullYear() === bis.getFullYear())
        return en ? `${von.getDate()}–${full(bis)}` : `${von.getDate()}.–${full(bis)}`;
      return `${von.getFullYear() === bis.getFullYear() ? dayMonth(von) : full(von)} – ${full(bis)}`;
    };
    const offen = liste.map(u => ({ von: d(u.von), bis: d(u.bis) }))
      .filter(u => today <= u.bis)          // vergangene Urlaube ausblenden
      .sort((a, b) => a.von - b.von);
    if (!offen.length) return;
    const hours = $('.hours');
    if (hours) {
      const p = document.createElement('p');
      p.className = 'urlaub-note';
      p.textContent = `${en ? 'Holiday closure' : 'Betriebsurlaub'}: ${offen.map(u => range(u.von, u.bis)).join(' · ')}`;
      hours.after(p);
    }
    const jetzt = offen.find(u => today >= u.von);
    const st = $('.status');
    if (st && jetzt) {
      const wieder = new Date(jetzt.bis); wieder.setDate(wieder.getDate() + 1);
      st.classList.remove('open');
      $('.status__text', st).textContent = en ? `Holiday closure · open again from ${dayMonth(wieder)}` : `Betriebsurlaub · wieder geöffnet ab ${dayMonth(wieder)}`;
    }
  }

  /* ---------- marquees driven by scroll velocity ---------- */
  function initMarquees() {
    const loops = $$('.marquee__track').map((t, i) => {
      const tw = gsap.to(t, { xPercent: -50, duration: +(t.dataset.speed || 28), ease: 'none', repeat: -1 });
      tw.totalTime(tw.duration() * 100);
      return tw;
    });
    if (!loops.length) return;
    ScrollTrigger.create({ onUpdate: self => {
      const dir = self.direction;
      const boost = 1 + Math.min(Math.abs(self.getVelocity()) / 250, 6);
      loops.forEach(loop => gsap.timeline({ overwrite: true }).to(loop, { timeScale: dir * boost, duration: 0.2 }).to(loop, { timeScale: dir, duration: 1.2 }, '+=0.15'));
    } });
  }

  /* ---------- pairing prices: hover opens on desktop, tap toggles on phones ---------- */
  function initPairs() {
    const pairs = $$('.pair');
    if (!pairs.length) return;
    let refresh;
    const set = (p, open) => {
      if (p.classList.contains('is-open') === open) return;
      p.classList.toggle('is-open', open);
      $('.pair__head', p).setAttribute('aria-expanded', open);
      clearTimeout(refresh);
      refresh = setTimeout(() => window.ScrollTrigger && ScrollTrigger.refresh(), 700);
    };
    pairs.forEach(p => {
      $('.pair__head', p).addEventListener('click', () => set(p, fine ? true : !p.classList.contains('is-open')));
      if (fine) {
        p.addEventListener('pointerenter', () => set(p, true));
        p.addEventListener('pointerleave', () => set(p, false));
      }
    });
  }

  /* ---------- horizontal rooms (home) ---------- */
  function initRooms() {
    if (!$('.rooms')) return;
    gsap.matchMedia().add('(min-width: 900px)', () => {
      const track = $('.rooms__track');
      const dist = () => track.scrollWidth - window.innerWidth;
      const tween = gsap.to(track, { x: () => -dist(), ease: 'none', scrollTrigger: { trigger: '.rooms', pin: true, scrub: 1, end: () => '+=' + dist(), invalidateOnRefresh: true } });
      // While the rooms scroll sideways, an index link scrolls to the point where that room slides in.
      const jump = e => {
        const room = document.querySelector(e.currentTarget.getAttribute('href'));
        if (!room) return;
        e.preventDefault();
        const st = tween.scrollTrigger;
        const y = Math.min(st.start + room.offsetLeft, st.end);
        if (lenis) scrollToTarget(y); else window.scrollTo({ top: y, behavior: 'smooth' });
      };
      const links = $$('.rooms__index a');
      links.forEach(a => a.addEventListener('click', jump));
      gsap.to('.rooms__progress i', { scaleX: 1, ease: 'none', scrollTrigger: { trigger: '.rooms', start: 'top top', end: () => '+=' + dist(), scrub: true } });
      $$('.room').forEach(room => {
        gsap.fromTo($('.room__media img', room), { xPercent: -4 }, { xPercent: 4, ease: 'none', scrollTrigger: { trigger: room, containerAnimation: tween, start: 'left right', end: 'right left', scrub: true } });
        gsap.from($$('.room__num, h3, .body, .room__tag', room), { autoAlpha: 0, x: 60, stagger: 0.08, duration: 1.1, ease: 'expo.out', scrollTrigger: { trigger: room, containerAnimation: tween, start: 'left 70%', once: true } });
      });
      return () => links.forEach(a => a.removeEventListener('click', jump));
    });
  }

  /* ---------- timeline with sticky counter (Über uns) ---------- */
  function initTimeline() {
    const tl = $('.timeline');
    if (!tl) return;
    const items = $$('.tl-item', tl);
    const num = $('.tl-count__num', tl);
    const label = $('.tl-label', tl);
    gsap.to($('.tl-line i', tl), { scaleY: 1, ease: 'none', scrollTrigger: { trigger: $('.tl-items', tl), start: 'top 60%', end: 'bottom 60%', scrub: true } });
    let current = -1;
    const set = (i) => {
      if (i === current) return;
      const dir = i > current ? 1 : -1;
      current = i;
      items.forEach((it, j) => it.classList.toggle('is-active', j === i));
      gsap.timeline()
        .to(num, { yPercent: -100 * dir, autoAlpha: 0, duration: 0.25, ease: 'power2.in' })
        .add(() => { num.textContent = String(i + 1).padStart(2, '0'); label.textContent = items[i].dataset.label || ''; })
        .fromTo(num, { yPercent: 100 * dir, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.6, ease: 'expo.out' });
    };
    items.forEach((it, i) => ScrollTrigger.create({ trigger: it, start: 'top 60%', end: 'bottom 60%', onToggle: self => self.isActive && set(i) }));
    set(0);
  }

  /* ---------- pinned image sequence (Über uns) ---------- */
  function initStack() {
    const stack = $('.stack');
    if (!stack) return;
    const figs = $$('.stack__frame figure', stack);
    const mm = gsap.matchMedia();
    const build = (trigger, start, end) => {
      const tl = gsap.timeline({ scrollTrigger: { trigger, start, end, scrub: 1 } });
      figs.slice(1).forEach(f => tl.fromTo(f, { clipPath: 'inset(100% 0 0 0)' }, { clipPath: 'inset(0% 0 0 0)', ease: 'none' }).fromTo($('img', f), { scale: 1.25 }, { scale: 1, ease: 'none' }, '<'));
      return tl;
    };
    mm.add('(min-width: 1001px)', () => { build(stack, 'top 20%', 'bottom bottom'); });
    mm.add('(max-width: 1000px)', () => { build($('.stack__frame', stack), 'top 80%', 'bottom 20%'); });
  }

  /* ---------- number counters ---------- */
  function initCounters() {
    $$('[data-count]').forEach(el => {
      const o = { v: 0 };
      el.dataset.counting = '1';
      el.textContent = '0';
      // Live-Zahl abwarten (höchstens 2 s), dann hochzählen; kommt sie später, steht sie am Ende trotzdem da
      const bereit = el.hasAttribute('data-count-karte') ? Promise.race([karteAnzahl, new Promise(r => setTimeout(r, 2000))]) : Promise.resolve();
      onEnter(el, () => bereit.then(() => gsap.to(o, { v: +el.dataset.count, duration: 2.4, ease: 'expo.out', onUpdate: () => el.textContent = Math.round(o.v), onComplete: () => el.textContent = el.dataset.count })), 'top 80%');
    });
  }

  /* ---------- scattered characters (quotes) ---------- */
  function initChars() {
    $$('[data-chars]').forEach(el => {
      const s = split(el, 'words,chars');
      if (!s) return;
      s.chars.forEach(c => c.classList.add('ch'));
      gsap.from(s.chars, { yPercent: () => gsap.utils.random(-120, 120), rotate: () => gsap.utils.random(-25, 25), autoAlpha: 0, ease: 'none', stagger: { each: 0.03, from: 'random' }, scrollTrigger: { trigger: el, start: 'top 90%', end: 'center 55%', scrub: 1 } });
    });
  }

  /* ---------- course picker ---------- */
  function initPicker() {
    const opts = $$('.opt');
    const num = $('.price__num');
    if (!opts.length || !num) return;
    const dots = $$('.courses i');
    const rows = $$('.price-list li[data-n]');
    const anim = window.gsap && !reduce;
    const current = { v: +num.textContent || 0 };
    const select = (n, animate) => {
      const btn = opts.find(o => o.dataset.n == n);
      if (!btn) return;
      const p = +btn.dataset.p;
      opts.forEach(o => o.setAttribute('aria-pressed', o === btn));
      rows.forEach(r => r.classList.toggle('is-on', r.dataset.n == n));
      dots.forEach((d, i) => { d.classList.toggle('on', i < n); if (anim && animate && i < n) gsap.fromTo(d, { scale: 0.4 }, { scale: 1.15, duration: 0.6, ease: 'back.out(3)', delay: i * 0.05 }); });
      if (anim && animate) gsap.to(current, { v: p, duration: 0.9, ease: 'expo.out', onUpdate: () => num.textContent = Math.round(current.v) });
      else { current.v = p; num.textContent = p; }
      document.dispatchEvent(new CustomEvent('schrei:courses', { detail: n }));
    };
    opts.forEach(o => o.addEventListener('click', () => select(+o.dataset.n, true)));
    rows.forEach(r => r.addEventListener('click', () => select(+r.dataset.n, true)));
    select(+($('.opt[aria-pressed="true"]') || opts[opts.length - 1]).dataset.n, false);
  }

  /* ---------- live open/closed status (Vienna time) ---------- */
  function initStatus() {
    const el = $('.status');
    if (!el) return;
    const txt = $('.status__text', el);
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Vienna', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
    const get = t => (parts.find(p => p.type === t) || {}).value;
    const day = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[get('weekday')];
    const m = (+get('hour') % 24) * 60 + (+get('minute'));
    const eve = [1080, 1320];
    const heute = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date());
    const sonder = iso => sonderTage().filter(x => x.kommend.includes(iso)).map(x => [hm(x.von), hm(x.bis || '22:00')]);
    const slots = [...(({ 1: [eve], 2: [eve], 3: [eve], 4: [eve], 5: [[720, 840], eve] })[day] || []), ...sonder(heute)];
    const fmt = v => String(Math.floor(v / 60)).padStart(2, '0') + ':' + String(v % 60).padStart(2, '0');
    const open = slots.find(([a, b]) => m >= a && m < b);
    const next = slots.find(([a]) => m < a);
    const en = html.lang === 'en';
    if (open) { el.classList.add('open'); txt.textContent = (en ? 'Open now · until ' : 'Jetzt geöffnet · bis ') + fmt(open[1]); }
    else if (next) txt.textContent = (en ? 'Open today from ' : 'Heute geöffnet ab ') + fmt(next[0]);
    else {
      // Next opening day, skipping days off and Betriebsurlaub.
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date());
      const holiday = iso => (Array.isArray(URLAUB) ? URLAUB : []).some(u => u && iso >= u.von && iso <= u.bis);
      for (let i = 1; i <= 31; i++) {
        const d = new Date(today + 'T12:00:00Z');
        d.setUTCDate(d.getUTCDate() + i);
        const iso = d.toISOString().slice(0, 10);
        const first = ((({ 1: [eve], 2: [eve], 3: [eve], 4: [eve], 5: [[720, 840], eve] })[d.getUTCDay()] || []).concat(sonder(iso)))[0];
        if (!first || holiday(iso)) continue;
        const name = i === 1 ? (en ? 'tomorrow' : 'morgen') : d.toLocaleDateString(en ? 'en-GB' : 'de-AT', { weekday: 'long', timeZone: 'UTC' });
        txt.textContent = en ? `Currently closed · open ${name} from ${fmt(first[0])}` : `Zurzeit geschlossen · geöffnet ${name} ab ${fmt(first[0])}`;
        return;
      }
      txt.textContent = en ? 'Closed today' : 'Heute geschlossen';
    }
  }

  /* ---------- FAQ accordion ---------- */
  function initFaq() {
    $$('.faq__q').forEach(q => q.addEventListener('click', () => {
      const open = q.getAttribute('aria-expanded') === 'true';
      q.setAttribute('aria-expanded', !open);
      setTimeout(() => window.ScrollTrigger && ScrollTrigger.refresh(), 750);
    }));
  }

  /* ---------- cursor ---------- */
  function initCursor() {
    if (!fine) return;
    const c = $('.cursor');
    if (!c) return;
    const x = gsap.quickTo(c, 'x', { duration: 0.35, ease: 'power3' });
    const y = gsap.quickTo(c, 'y', { duration: 0.35, ease: 'power3' });
    window.addEventListener('pointermove', e => { x(e.clientX); y(e.clientY); });
    document.addEventListener('pointerover', e => c.classList.toggle('is-hover', !!e.target.closest('a, button, .price-list li')));
  }

  /* ---------- magnetic buttons ---------- */
  function initMagnetic() {
    if (!fine) return;
    $$('[data-magnetic]').forEach(el => {
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        gsap.to(el, { x: (e.clientX - r.left - r.width / 2) * 0.3, y: (e.clientY - r.top - r.height / 2) * 0.4, duration: 0.6, ease: 'power3.out' });
      });
      el.addEventListener('pointerleave', () => gsap.to(el, { x: 0, y: 0, duration: 1, ease: 'elastic.out(1, .35)' }));
    });
  }

/* ---------- header: compact on phones once the page is scrolled ---------- */
function initHeader() {
  const header = $('.header');
  if (!header) return;
  const update = () => header.classList.toggle('is-compact', window.scrollY > 80 || document.body.classList.contains('menu-open'));
  window.addEventListener('scroll', update, { passive: true });
  update();
}

  /* ---------- mobile menu ---------- */
  function initMenu() {
    const btn = $('.burger');
    const ov = $('.overlay');
    if (!btn || !ov) return;
    const anim = window.gsap && !reduce;
    toggleMenu = (open) => {
      document.body.classList.toggle('menu-open', open);
      btn.setAttribute('aria-expanded', open);
      btn.setAttribute('aria-label', html.lang === 'en' ? (open ? 'Close menu' : 'Open menu') : (open ? 'Menü schließen' : 'Menü öffnen'));
      ov.setAttribute('aria-hidden', !open);
      if (lenis) open ? lenis.stop() : lenis.start();
      if (!anim) { ov.style.visibility = open ? 'visible' : 'hidden'; ov.style.clipPath = open ? 'none' : ''; return; }
      if (open) {
        gsap.set(ov, { visibility: 'visible' });
        gsap.to(ov, { clipPath: 'inset(0 0 0% 0)', duration: 0.9, ease: 'expo.inOut' });
        gsap.fromTo($$('nav a span', ov), { yPercent: 110 }, { yPercent: 0, duration: 1, ease: 'expo.out', stagger: 0.06, delay: 0.35 });
        gsap.fromTo($$('.btn, .overlay__meta', ov), { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.8, delay: 0.6, stagger: 0.1 });
      } else {
        gsap.to(ov, { clipPath: 'inset(0 0 100% 0)', duration: 0.8, ease: 'expo.inOut', onComplete: () => gsap.set(ov, { visibility: 'hidden' }) });
      }
    };
    btn.addEventListener('click', () => toggleMenu(!document.body.classList.contains('menu-open')));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('menu-open')) toggleMenu(false); });
  }

  /* ---------- links: in-page anchors + page transitions ---------- */
  function initLinks() {
    document.addEventListener('click', e => {
      const a = e.target.closest('a[href]');
      if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target === '_blank') return;
      const url = new URL(a.getAttribute('href'), location.href);
      if (url.origin !== location.origin) return;
      const dirOf = p => p.replace(/\/index\.html$/, '/');
      const samePage = dirOf(url.pathname) === dirOf(location.pathname);
      if (samePage && url.hash) {
        const el = url.hash === '#top' ? 0 : document.querySelector(url.hash);
        if (el === null) return;
        e.preventDefault();
        if (document.body.classList.contains('menu-open')) toggleMenu(false);
        history.replaceState(null, '', url.hash === '#top' ? location.pathname : url.hash);
        scrollToTarget(el);
        return;
      }
      if (samePage && !url.hash) {
        e.preventDefault();
        if (document.body.classList.contains('menu-open')) toggleMenu(false);
        scrollToTarget(0);
        return;
      }
    });
  }

// Pages always open at the top (or at #section). Some viewers restore an old scroll
// position after load, so this also runs on load and guards the first seconds,
// but never once the visitor has started scrolling.
function settleScroll() {
  if (visitorScrolled) return;
  if (location.hash.length > 1 && document.querySelector(location.hash)) { jumpToHash(); return; }
  window.scrollTo(0, 0);
  if (lenis) lenis.scrollTo(0, { immediate: true, force: true });
}

function jumpToHash() {
    if (!location.hash || location.hash.length < 2) return;
    const el = document.querySelector(location.hash);
    if (el) { if (window.ScrollTrigger) ScrollTrigger.refresh(); scrollToTarget(el, true); }
  }

  function markCurrentPage() {
    const here = location.pathname.split('/').pop() || 'index.html';
    $$('.nav a, .overlay nav a').forEach(a => {
      const p = (a.getAttribute('href') || '').split('#')[0];
      if (p && p === here) a.setAttribute('aria-current', 'page');
    });
  }
})();
