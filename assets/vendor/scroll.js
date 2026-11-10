/* Schlanke, lokal gehostete Helfer für Das Schrei:
   - Lenis: weiches Scrollen mit dem Mausrad (gleiche Schnittstelle wie die Lenis-Bibliothek)
   - SplitType: zerlegt Text in Zeilen, Wörter und Buchstaben für die Einblend-Animationen
   Ersetzt die früher von unpkg.com und cdn.jsdelivr.net geladenen Bibliotheken. */
(function () {
  'use strict';

  /* ---------------- Lenis ---------------- */
  class Lenis {
    constructor(o) {
      o = o || {};
      this.lerp = o.lerp != null ? o.lerp : 0.1;
      this.cbs = [];
      this.animated = this.target = window.scrollY;
      this.running = false;
      this.anim = null;
      this.isStopped = false;
      this.last = 0;
      document.documentElement.classList.add('lenis', 'lenis-smooth');
      this._wheel = e => {
        if (e.ctrlKey) return;
        const t = e.target;
        if (t && t.closest && t.closest('[data-lenis-prevent]')) return;
        if (this.isStopped) { e.preventDefault(); return; }
        e.preventDefault();
        let d = e.deltaY;
        if (e.deltaMode === 1) d *= 40; else if (e.deltaMode === 2) d *= window.innerHeight;
        if (!this.running && !this.anim) this.animated = this.target = window.scrollY;
        this.anim = null;
        this.target = Math.max(0, Math.min(this.limit, this.target + d));
        this.running = true;
      };
      this._scroll = () => {
        if (this.running || this.anim || this._setting) return;
        this.animated = this.target = window.scrollY;
        this.emit();
      };
      window.addEventListener('wheel', this._wheel, { passive: false });
      window.addEventListener('scroll', this._scroll, { passive: true });
    }
    get limit() { return document.documentElement.scrollHeight - window.innerHeight; }
    get scroll() { return this.animated; }
    get isScrolling() { return this.running || !!this.anim; }
    on(ev, cb) {
      if (ev === 'scroll') this.cbs.push(cb);
      return () => { this.cbs = this.cbs.filter(c => c !== cb); };
    }
    emit() { this.cbs.forEach(c => c(this)); }
    set(v) {
      this.animated = v;
      this._setting = true;
      window.scrollTo(0, v);
      this._setting = false;
      this.emit();
    }
    raf(t) {
      const dt = this.last ? Math.min(0.1, (t - this.last) / 1000) : 1 / 60;
      this.last = t;
      const a = this.anim;
      if (a) {
        if (!a.t0) a.t0 = t;
        const p = a.d > 0 ? Math.min(1, (t - a.t0) / (a.d * 1000)) : 1;
        this.set(a.from + (a.to - a.from) * a.e(p));
        if (p >= 1) { this.anim = null; this.animated = this.target = a.to; if (a.done) a.done(this); }
        return;
      }
      if (!this.running) return;
      const k = 1 - Math.pow(1 - this.lerp, dt * 60);
      let v = this.animated + (this.target - this.animated) * k;
      if (Math.abs(this.target - v) < 0.5) { v = this.target; this.running = false; }
      this.set(v);
    }
    scrollTo(target, o) {
      o = o || {};
      if (this.isStopped && !o.force) return;
      let y;
      if (typeof target === 'number') y = target;
      else if (typeof target === 'string') {
        if (target === 'top' || target === '#') y = 0;
        else {
          let el = null;
          try { el = document.querySelector(target); } catch (e) { el = null; }
          if (!el) return;
          y = el.getBoundingClientRect().top + window.scrollY;
        }
      } else if (target && target.getBoundingClientRect) {
        y = target.getBoundingClientRect().top + window.scrollY;
      } else return;
      y = Math.max(0, Math.min(this.limit, y + (o.offset || 0)));
      this.running = false;
      this.target = y;
      if (o.immediate) { this.anim = null; this.set(y); if (o.onComplete) o.onComplete(this); return; }
      this.anim = {
        from: window.scrollY, to: y, t0: 0,
        d: o.duration != null ? o.duration : 1.2,
        e: o.easing || (p => Math.min(1, 1.001 - Math.pow(2, -10 * p))),
        done: o.onComplete
      };
    }
    stop() {
      this.isStopped = true; this.anim = null; this.running = false;
      document.documentElement.classList.add('lenis-stopped');
    }
    start() {
      this.isStopped = false;
      this.animated = this.target = window.scrollY;
      document.documentElement.classList.remove('lenis-stopped');
    }
    destroy() {
      window.removeEventListener('wheel', this._wheel);
      window.removeEventListener('scroll', this._scroll);
      document.documentElement.classList.remove('lenis', 'lenis-smooth', 'lenis-stopped');
      this.cbs = [];
    }
  }

  /* ---------------- SplitType ---------------- */
  const box = (cls) => {
    const d = document.createElement('div');
    d.className = cls;
    d.style.position = 'relative';
    d.style.display = 'inline-block';
    return d;
  };

  class SplitType {
    constructor(el, o) {
      o = o || {};
      if (typeof el === 'string') el = document.querySelector(el);
      this.el = el;
      this.lines = []; this.words = []; this.chars = [];
      if (!el) return;
      this.html = el.innerHTML;
      const types = String(o.types || 'lines,words').split(',').map(s => s.trim());
      const wantLines = types.indexOf('lines') > -1;
      const wantChars = types.indexOf('chars') > -1;
      if (!el.hasAttribute('aria-label')) { el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim()); this._aria = true; }

      const walk = node => {
        Array.prototype.slice.call(node.childNodes).forEach(n => {
          if (n.nodeType === 3) {
            const parts = n.textContent.split(/(\s+)/);
            const frag = document.createDocumentFragment();
            parts.forEach(p => {
              if (!p) return;
              if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(' ')); return; }
              const w = box('word');
              w.setAttribute('aria-hidden', 'true');
              if (wantChars) {
                Array.from(p).forEach(c => {
                  const ch = box('char');
                  ch.textContent = c;
                  w.appendChild(ch);
                  this.chars.push(ch);
                });
              } else w.textContent = p;
              frag.appendChild(w);
              this.words.push(w);
            });
            n.parentNode.replaceChild(frag, n);
          } else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);
        });
      };
      walk(el);

      if (wantLines && this.words.length) {
        // Wörter nach ihrer Zeile gruppieren (Zeilenumbrüche durch <br> bleiben erhalten)
        const groups = [];
        let cur = null, lastTop = null;
        const items = [];
        const collect = node => {
          Array.prototype.slice.call(node.childNodes).forEach(n => {
            if (n.nodeType === 1 && n.classList.contains('word')) items.push(n);
            else if (n.nodeType === 1 && n.tagName === 'BR') items.push('br');
            else if (n.nodeType === 1) collect(n);
          });
        };
        collect(el);
        items.forEach(it => {
          if (it === 'br') { lastTop = null; cur = null; return; }
          const top = Math.round(it.getBoundingClientRect().top);
          if (!cur || lastTop === null || Math.abs(top - lastTop) > 4) { cur = []; groups.push(cur); }
          cur.push(it);
          lastTop = top;
        });
        const frag = document.createDocumentFragment();
        groups.forEach(g => {
          const line = document.createElement('div');
          line.className = 'line';
          line.style.position = 'relative';
          line.style.display = 'block';
          line.style.textAlign = 'inherit';
          g.forEach((w, i) => {
            if (i) line.appendChild(document.createTextNode(' '));
            // inline-Auszeichnungen (z. B. <em>) um das Wort erhalten
            let node = w, p = w.parentNode;
            while (p && p !== el) {
              const c = p.cloneNode(false);
              c.appendChild(node === w ? w : node);
              node = c;
              p = p.parentNode;
            }
            line.appendChild(node);
          });
          frag.appendChild(line);
          this.lines.push(line);
        });
        el.innerHTML = '';
        el.appendChild(frag);
      }
    }
    revert() {
      if (!this.el || this.html == null) return;
      this.el.innerHTML = this.html;
      if (this._aria) this.el.removeAttribute('aria-label');
      this.lines = []; this.words = []; this.chars = [];
    }
  }

  window.Lenis = window.Lenis || Lenis;
  window.SplitType = window.SplitType || SplitType;
})();
