/* ==========================================================================
   Sentra: page engine
   Preloader, smooth scrolling, reveals and counters, the pinned camera
   showcase, solution panels, engineering hotspots, the architecture
   pipeline, the deployment reel, marquee, cursor, magnetic buttons,
   the contact hand-off and the FAQ.
   ========================================================================== */
(function () {
  'use strict';

  var FX = window.SentraFX;
  var root = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var CFG = window.SENTRA_CONFIG || {};
  var WHATSAPP = String(CFG.whatsapp || '').replace(/\D/g, '');
  var EMAIL = String(CFG.email || '').trim();

  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function pad(n) { return n < 10 ? '0' + n : String(n); }

  /* ======================================================================
     Smooth scroll + jump API (used by the railcam camera cuts)
     ====================================================================== */
  var lenis = null;
  if (window.Lenis && !reduce) {
    try {
      lenis = new window.Lenis({ lerp: 0.085, smoothWheel: true });
      var lr = function (t) { lenis.raf(t); requestAnimationFrame(lr); };
      requestAnimationFrame(lr);
    } catch (e) { lenis = null; }
  }
  function yOf(t) { return typeof t === 'number' ? t : t.getBoundingClientRect().top + window.scrollY; }
  window.SentraScroll = {
    lenis: lenis,
    jump: function (t) { var y = yOf(t); if (lenis) lenis.scrollTo(y, { immediate: true, force: true }); else window.scrollTo({ top: y, behavior: 'instant' }); },
    to: function (t) { var y = yOf(t); if (lenis) lenis.scrollTo(y, { duration: 1.6, easing: function (x) { return 1 - Math.pow(1 - x, 4); } }); else window.scrollTo({ top: y, behavior: reduce ? 'instant' : 'smooth' }); }
  };
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]:not([data-cut])');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey) return;
    var id = a.getAttribute('href');
    if (id.length < 2) return;
    var t = document.querySelector(id);
    if (!t) return;
    e.preventDefault();
    window.SentraScroll.to(t);
  });

  /* ======================================================================
     Preloader: an iris that opens onto the street
     ====================================================================== */
  (function preload() {
    var loader = $('[data-loader]');
    var finish = function () { root.classList.remove('is-loading'); root.classList.add('is-ready'); if (lenis) lenis.start(); };
    if (!loader || !FX) { if (loader) loader.classList.add('is-done'); finish(); return; }
    if (lenis) lenis.stop();
    var count = $('[data-loader-count]', loader), line = $('[data-loader-line]', loader), ring = $('[data-loader-ring]', loader), bladesG = $('[data-loader-blades]', loader);
    var paths = [];
    for (var i = 0; i < 6; i++) { var p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); bladesG.appendChild(p); paths.push(p); }
    var lines = ['Connecting cameras', 'Calibrating optics', 'Loading the street', 'Live'];
    var ready = !!(window.SentraLens && window.SentraLens.ready);
    document.addEventListener('sentra:ready', function () { ready = true; });
    var start = performance.now(), MIN = reduce ? 200 : 1600, MAX = 5000, shown = 0, done = false;
    (function frame(now) {
      var t = now - start;
      var lin = Math.min(1, t / MIN);
      if (!ready && t < MAX) lin = Math.min(lin, 0.92);
      shown = Math.max(shown, 1 - Math.pow(1 - lin, 3));
      if (lin >= 1) shown = 1;
      var pct = Math.round(shown * 100);
      count.textContent = ('00' + pct).slice(-3);
      line.textContent = lines[Math.min(lines.length - 1, Math.floor(shown * (lines.length - 0.01)))];
      ring.style.strokeDashoffset = String(100 - pct);
      var br = 7 + Math.sin(t / 260) * 2.5 + shown * 5;
      FX.drawIris(paths, null, 0, 0, br, t / 1800, 160);
      if (shown >= 1 && !done) {
        done = true;
        FX.tween(reduce ? 1 : 700, function (e) { FX.drawIris(paths, null, 0, 0, br + e * 60, t / 1800 + e * 1.2, 160); }, FX.ease.inOutCubic).then(function () { loader.classList.add('is-done'); finish(); });
        return;
      }
      requestAnimationFrame(frame);
    })(start);
  })();

  /* ======================================================================
     Clocks
     ====================================================================== */
  var clocks = $$('[data-clock]'), tokyo = $$('[data-tokyo-time]');
  var tokyoFmt = null;
  try { tokyoFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); } catch (e) { tokyoFmt = null; }
  function tick() {
    var d = new Date();
    clocks.forEach(function (c) { c.textContent = 'LIVE ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); });
    if (tokyoFmt) tokyo.forEach(function (c) { c.textContent = tokyoFmt.format(d) + ' JST'; });
  }
  tick(); setInterval(tick, 1000);
  $$('[data-year]').forEach(function (y) { y.textContent = String(new Date().getFullYear()); });

  /* ======================================================================
     Reveals
     ====================================================================== */
  var revealTargets = $$('[data-reveal], [data-focus]');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
    }, { threshold: 0.2, rootMargin: '0px 0px -8% 0px' });
    revealTargets.forEach(function (el) { io.observe(el); });
  } else revealTargets.forEach(function (el) { el.classList.add('is-in'); });

  function whenVisible(el, onShow, onHide, th) {
    if (!el) return;
    if (!('IntersectionObserver' in window)) { onShow(); return; }
    new IntersectionObserver(function (en) { if (en[0].isIntersecting) onShow(); else if (onHide) onHide(); }, { threshold: th || 0.15 }).observe(el);
  }

  /* ======================================================================
     Scroll-driven effects, batched in one rAF
     ====================================================================== */
  var scrollers = [], queued = false;
  function onScroll() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; var vh = window.innerHeight; for (var i = 0; i < scrollers.length; i++) scrollers[i](vh); });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);

  /* ---------- pinned horizontal camera showcase ---------- */
  var hs = $('[data-hscroll]');
  if (hs) {
    var track = $('[data-hs-track]', hs), cards = $$('.sys-card', hs), current = $('[data-hs-current]', hs), bar = $('[data-hs-bar]', hs);
    var maxX = 0, mobile = false;
    var sizeHs = function () {
      mobile = window.innerWidth <= 760;
      if (mobile) { hs.style.height = ''; track.style.transform = ''; cards.forEach(function (c) { c.style.transform = ''; }); return; }
      maxX = Math.max(0, track.scrollWidth - track.parentElement.clientWidth);
      hs.style.height = (window.innerHeight + maxX) + 'px';
    };
    sizeHs();
    window.addEventListener('resize', sizeHs);
    window.addEventListener('load', sizeHs);
    track.addEventListener('focusin', function (e) {
      if (mobile) return;
      var idx = cards.indexOf(e.target.closest('.sys-card'));
      if (idx < 0) return;
      track.closest('.systems__sticky').scrollLeft = 0;
      var top = hs.getBoundingClientRect().top + window.scrollY, total = hs.offsetHeight - window.innerHeight;
      window.SentraScroll.jump(top + total * (idx / Math.max(1, cards.length - 1)));
    });
    scrollers.push(function (vh) {
      if (mobile) return;
      var r = hs.getBoundingClientRect();
      if (r.bottom < -50 || r.top > vh + 50) return;
      var total = hs.offsetHeight - vh, p = total > 0 ? clamp(-r.top / total, 0, 1) : 0;
      track.style.transform = 'translate3d(' + (-p * maxX).toFixed(1) + 'px,0,0)';
      var n = cards.length, idx = Math.min(n - 1, Math.round(p * (n - 1)));
      current.textContent = pad(idx + 1);
      bar.style.transform = 'scaleX(' + ((p * (n - 1) + 1) / n).toFixed(3) + ')';
      var vw = window.innerWidth;
      cards.forEach(function (c) {
        var cr = c.getBoundingClientRect(), d = Math.abs(cr.left + cr.width / 2 - vw / 2) / vw;
        c.style.transform = 'scale(' + (1 - Math.min(d, 1) * 0.06).toFixed(4) + ')';
        c.classList.toggle('is-current', d < 0.25);
      });
    });
  }

  /* ---------- parallax images ---------- */
  var para = $$('[data-parallax]');
  if (para.length && !reduce) {
    scrollers.push(function (vh) {
      para.forEach(function (img) {
        var r = img.parentElement.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh) return;
        var p = (r.top + r.height / 2 - vh / 2) / vh;
        img.style.setProperty('--py', (-p * 90).toFixed(1) + 'px');
      });
    });
  }

  /* ---------- deployment reel ---------- */
  var proc = $('[data-process]');
  if (proc) {
    var steps = $$('[data-step]', proc), reel = $('[data-proc-reel]', proc), meter = $('[data-proc-meter]', proc), active = -1;
    scrollers.push(function (vh) {
      var best = 0;
      steps.forEach(function (s, i) { if (s.getBoundingClientRect().top < vh * 0.55) best = i; });
      if (best !== active) {
        active = best;
        steps.forEach(function (s, i) { s.classList.toggle('is-active', i === active); });
        reel.style.setProperty('--step', active);
        meter.style.setProperty('--pm', ((active + 1) / steps.length).toFixed(3));
      }
    });
  }

  /* ---------- footer wordmark ---------- */
  var mark = $('.footer__mark span');
  if (mark && !reduce) {
    scrollers.push(function (vh) {
      var r = mark.parentElement.getBoundingClientRect();
      if (r.top > vh) return;
      mark.style.setProperty('--mark-y', ((1 - clamp((vh - r.top) / r.height, 0, 1)) * 40).toFixed(1) + '%');
    });
  }
  onScroll();

  /* ======================================================================
     Solutions: expanding panels
     ====================================================================== */
  var panels = $$('[data-panel]');
  function openPanel(p) { panels.forEach(function (x) { x.classList.toggle('is-open', x === p); x.setAttribute('aria-expanded', String(x === p)); }); }
  panels.forEach(function (p) {
    p.setAttribute('aria-expanded', String(p.classList.contains('is-open')));
    if (finePointer) p.addEventListener('pointerenter', function () { openPanel(p); });
    p.addEventListener('click', function () { openPanel(p); });
    p.addEventListener('focus', function () { openPanel(p); });
    p.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPanel(p); } });
  });

  /* ======================================================================
     Engineering hotspots
     ====================================================================== */
  var anatomy = $('[data-anatomy]');
  if (anatomy) {
    var HOT = [
      ['Optics', 'A 40× optical zoom behind a hardened dome, with a large low-light sensor that keeps colour after dark.'],
      ['Housing', 'Die-cast aluminium sealed to IP67 against dust and water and rated IK10 against impact, with a heater and fan for desert heat and freezing nights.'],
      ['Pan & tilt', 'Brushless motors pan the full circle without stopping and return to saved presets with tenth-of-a-degree accuracy.'],
      ['Power & network', 'Runs on PoE++ or 24 V AC, with 6 kV surge protection and an optional fibre uplink for long runs to the cabinet.'],
      ['Mounting', 'Pole, wall and corner mounts with internal cable routing, so nothing is left exposed to weather or tampering.']
    ];
    var spots = $$('[data-hotspot]', anatomy), hIdx = $('[data-hs-idx]', anatomy), hTitle = $('[data-hs-title]', anatomy), hText = $('[data-hs-text]', anatomy);
    var cur = -1, autoT = 0, manual = false;
    var show = function (i) {
      i = (i + HOT.length) % HOT.length;
      if (i === cur) return;
      cur = i;
      spots.forEach(function (s, j) { s.classList.toggle('is-active', j === i); s.setAttribute('aria-pressed', String(j === i)); });
      anatomy.classList.remove('is-swap'); void anatomy.offsetWidth; anatomy.classList.add('is-swap');
      hIdx.textContent = pad(i + 1) + ' / ' + pad(HOT.length);
      hTitle.textContent = HOT[i][0];
      hText.textContent = HOT[i][1];
    };
    var take = function () { manual = true; clearTimeout(autoT); };
    spots.forEach(function (s, i) { s.addEventListener('click', function () { take(); show(i); }); });
    $('[data-hs-prev]', anatomy).addEventListener('click', function () { take(); show(cur - 1); });
    $('[data-hs-next]', anatomy).addEventListener('click', function () { take(); show(cur + 1); });
    show(0);
    var cycle = function () { if (manual || reduce) return; show(cur + 1); autoT = setTimeout(cycle, 3400); };
    whenVisible(anatomy, function () { clearTimeout(autoT); autoT = setTimeout(cycle, 3000); }, function () { clearTimeout(autoT); }, 0.4);
  }

  /* ======================================================================
     Architecture pipeline
     ====================================================================== */
  var arch = $('[data-arch]');
  if (arch) {
    var nodes = $$('[data-pipe]', arch), ai = 0, aT = 0, hovering = false;
    var setStage = function (i) { nodes.forEach(function (n, j) { n.classList.toggle('is-active', j === i); n.classList.toggle('is-past', j < i); }); arch.style.setProperty('--stage', i); };
    nodes.forEach(function (n, i) {
      n.addEventListener('pointerenter', function () { hovering = true; setStage(i); });
      n.addEventListener('pointerleave', function () { hovering = false; });
    });
    var run = function () { if (!hovering) { setStage(ai % nodes.length); ai++; } aT = setTimeout(run, 2200); };
    setStage(0);
    whenVisible(arch, function () { clearTimeout(aT); if (!reduce) run(); }, function () { clearTimeout(aT); }, 0.3);
  }

  /* ======================================================================
     Marquee, nudged by scroll speed
     ====================================================================== */
  var marquees = $$('[data-marquee]').map(function (m) {
    var t = $('.marquee__track', m);
    m.appendChild(t.cloneNode(true)).setAttribute('aria-hidden', 'true');
    return { el: m, track: t, x: 0, speed: parseFloat(m.getAttribute('data-speed') || '1'), w: 0, on: false };
  });
  if (marquees.length && !reduce) {
    var lastY = window.scrollY, vel = 0, mLast = performance.now(), mOn = false;
    var mLoop = function (now) {
      var dt = Math.min(0.05, (now - mLast) / 1000); mLast = now;
      var y = window.scrollY; vel += ((y - lastY) / Math.max(dt, 0.001) - vel) * 0.1; lastY = y;
      var any = false;
      marquees.forEach(function (m) {
        if (!m.on) return;
        any = true;
        if (!m.w) m.w = m.track.offsetWidth;
        m.x -= 60 * m.speed * (1 + Math.min(Math.abs(vel) / 400, 5)) * dt;
        if (m.x <= -m.w) m.x += m.w;
        m.el.style.transform = 'translate3d(' + m.x.toFixed(1) + 'px,0,0)';
      });
      if (any) requestAnimationFrame(mLoop); else mOn = false;
    };
    marquees.forEach(function (m) { whenVisible(m.el, function () { m.on = true; if (!mOn) { mOn = true; mLast = performance.now(); requestAnimationFrame(mLoop); } }, function () { m.on = false; }); });
    window.addEventListener('resize', function () { marquees.forEach(function (m) { m.w = 0; }); });
  }

  /* ======================================================================
     Cursor follower + magnetic buttons
     ====================================================================== */
  var cursor = $('[data-cursor-el]');
  if (cursor && finePointer && !reduce) {
    var label = $('[data-cursor-label]', cursor), cx = -100, cy = -100, tx = -100, ty = -100, cOn = false;
    var cLoop = function () {
      if (!cOn) return;
      cx += (tx - cx) * 0.2; cy += (ty - cy) * 0.2;
      cursor.style.transform = 'translate3d(' + cx.toFixed(1) + 'px,' + cy.toFixed(1) + 'px,0)';
      requestAnimationFrame(cLoop);
    };
    window.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      tx = e.clientX; ty = e.clientY;
      if (!cOn) { cOn = true; cx = tx; cy = ty; cursor.classList.add('is-on'); requestAnimationFrame(cLoop); }
      // over the hero the lens itself is the cursor
      cursor.classList.toggle('is-hidden', !!(e.target.closest && e.target.closest('[data-lens-stage], .hero__bar')));
      var host = e.target.closest && e.target.closest('[data-cursor]');
      var overUi = e.target.closest && e.target.closest('a, button, input, textarea, label');
      if (host && !overUi) { label.textContent = host.getAttribute('data-cursor'); cursor.classList.add('is-label'); }
      else cursor.classList.remove('is-label');
    }, { passive: true });
    root.addEventListener('pointerleave', function () { cursor.classList.remove('is-on'); cOn = false; });
  }
  if (finePointer && !reduce) {
    $$('[data-magnetic]').forEach(function (b) {
      b.addEventListener('pointermove', function (e) {
        var r = b.getBoundingClientRect();
        b.style.setProperty('--mx', ((e.clientX - r.left - r.width / 2) * 0.22).toFixed(1) + 'px');
        b.style.setProperty('--my', ((e.clientY - r.top - r.height / 2) * 0.32).toFixed(1) + 'px');
      });
      b.addEventListener('pointerleave', function () { b.style.setProperty('--mx', '0px'); b.style.setProperty('--my', '0px'); });
    });
  }

  /* ======================================================================
     Contact: validates, then opens email (or WhatsApp) with the request
     ====================================================================== */
  var form = $('[data-form]');
  var waLinks = $$('[data-whatsapp]');
  function waUrl(text) { return 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(text); }
  waLinks.forEach(function (a) { a.href = waUrl('Hello Sentra, I would like to talk about cameras for our city.'); });
  if (!WHATSAPP && !EMAIL && window.console) console.info('Sentra: add an email or WhatsApp number in assets/js/config.js');
  if (form) {
    var msg = $('[data-form-msg]', form);
    var label = $('[data-submit-label]', form);
    label.textContent = EMAIL ? 'Send by email' : 'Send on WhatsApp';
    form.addEventListener('input', function (e) { if (e.target.classList.contains('is-invalid') && e.target.value.trim()) e.target.classList.remove('is-invalid'); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var bad = [];
      var checks = [[form.elements.name, function (v) { return v.length > 1; }], [form.elements.org, function (v) { return v.length > 1; }], [form.elements.email, function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }]];
      checks.forEach(function (c) { var ok = c[1](c[0].value.trim()); c[0].classList.toggle('is-invalid', !ok); c[0].setAttribute('aria-invalid', String(!ok)); if (!ok) bad.push(c[0]); });
      if (bad.length) { msg.className = 'form__msg is-err'; msg.textContent = 'Please add your name, organisation and a valid work email.'; bad[0].focus(); return; }
      var d = new FormData(form);
      var lines = ['Hello Sentra, I would like to talk about cameras for our city.', '', 'Name: ' + d.get('name'), 'Organisation: ' + d.get('org'), 'Email: ' + d.get('email')];
      if (d.get('city')) lines.push('City / country: ' + d.get('city'));
      var interests = d.getAll('interest');
      if (interests.length) lines.push('Interested in: ' + interests.join(', '));
      if (d.get('notes')) lines.push('', d.get('notes'));
      var text = lines.join('\n');
      var url = EMAIL ? 'mailto:' + EMAIL + '?subject=' + encodeURIComponent('City briefing request · ' + d.get('org')) + '&body=' + encodeURIComponent(text) : waUrl(text);
      if (EMAIL) window.location.href = url;
      else { var w = window.open(url, '_blank'); if (w) { try { w.opener = null; } catch (err) { /* ignore */ } } else window.location.href = url; }
      msg.className = 'form__msg is-ok';
      msg.textContent = (EMAIL ? 'Your email is ready to send.' : 'WhatsApp opened with your request.') + ' Press send and our city team will reply.';
    });
  }

  /* ---------- FAQ ---------- */
  $$('.faq__item').forEach(function (item) {
    var summary = $('summary', item), body = $('.faq__body', item), anim = null;
    summary.addEventListener('click', function (e) {
      if (reduce || !body.animate) return;
      e.preventDefault();
      if (anim) anim.cancel();
      if (item.open) {
        anim = body.animate({ height: [body.offsetHeight + 'px', '0px'], opacity: [1, 0] }, { duration: 360, easing: 'cubic-bezier(.65,0,.35,1)' });
        anim.onfinish = function () { item.open = false; anim = null; };
      } else {
        item.open = true;
        var h = body.offsetHeight;
        anim = body.animate({ height: ['0px', h + 'px'], opacity: [0, 1] }, { duration: 480, easing: 'cubic-bezier(.16,1,.3,1)' });
        anim.onfinish = function () { anim = null; };
      }
    });
  });
})();
