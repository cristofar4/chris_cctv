/* ==========================================================================
   Sentra: page engine
   Preloader, smooth scrolling, reveals, the philosophy viewfinder,
   counters, the pinned horizontal systems showcase and its live demos,
   the night-vision compare slider, gallery parallax, the process reel,
   the app mock, marquees, cursor, magnetic buttons, the survey form, FAQ.
   ========================================================================== */
(function () {
  'use strict';

  var FX = window.SentraFX;
  var root = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var CFG = window.SENTRA_CONFIG || {};
  var WHATSAPP_NUMBER = String(CFG.whatsapp || '').replace(/\D/g, '');
  if (!WHATSAPP_NUMBER && window.console) console.info('Sentra: set your WhatsApp number in assets/js/config.js');

  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function pad(n) { return n < 10 ? '0' + n : String(n); }

  /* ======================================================================
     Smooth scroll (Lenis) + jump API used by the nav camera cuts
     ====================================================================== */
  var lenis = null;
  if (window.Lenis && !reduce) {
    try {
      lenis = new window.Lenis({ lerp: 0.085, smoothWheel: true, wheelMultiplier: 1 });
      var lenisRaf = function (t) { lenis.raf(t); requestAnimationFrame(lenisRaf); };
      requestAnimationFrame(lenisRaf);
    } catch (e) { lenis = null; }
  }
  function yOf(t) { return typeof t === 'number' ? t : t.getBoundingClientRect().top + window.scrollY; }
  window.SentraScroll = {
    lenis: lenis,
    jump: function (t) {
      var y = yOf(t);
      if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
      else window.scrollTo({ top: y, behavior: 'instant' });
    },
    to: function (t) {
      var y = yOf(t);
      if (lenis) lenis.scrollTo(y, { duration: 1.6, easing: function (x) { return 1 - Math.pow(1 - x, 4); } });
      else window.scrollTo({ top: y, behavior: reduce ? 'instant' : 'smooth' });
    }
  };
  // plain in-page links glide; [data-cut] links are handled by the railcam
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
     Preloader: an iris that opens on the live feed
     ====================================================================== */
  var loader = $('[data-loader]');
  (function preload() {
    var finish = function () {
      root.classList.remove('is-loading');
      root.classList.add('is-ready');
      if (lenis) lenis.start();
    };
    if (!loader) { finish(); return; }
    if (lenis) lenis.stop();
    var count = $('[data-loader-count]', loader);
    var line = $('[data-loader-line]', loader);
    var ring = $('[data-loader-ring]', loader);
    var bladesG = $('[data-loader-blades]', loader);
    var paths = [];
    for (var i = 0; i < 6; i++) { var p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); bladesG.appendChild(p); paths.push(p); }
    var lines = ['Initialising cameras', 'Calibrating sensors', 'Securing the link', 'Live'];
    var sceneReady = !!(window.SentraScene && window.SentraScene.ready);
    document.addEventListener('sentra:ready', function () { sceneReady = true; });

    var start = performance.now();
    var MIN = reduce ? 200 : 1700, MAX = 4500;
    var shown = 0, done = false;
    function frame(now) {
      var t = now - start;
      // time-based, so a slow device can never stall the loader
      var lin = Math.min(1, t / MIN);
      if (!sceneReady && t < MAX) lin = Math.min(lin, 0.92);
      shown = Math.max(shown, 1 - Math.pow(1 - lin, 3));
      if (lin >= 1) shown = 1;
      var pct = Math.round(shown * 100);
      count.textContent = ('00' + pct).slice(-3);
      line.textContent = lines[Math.min(lines.length - 1, Math.floor(shown * (lines.length - 0.01)))];
      ring.style.strokeDashoffset = String(100 - pct);
      var breathe = 7 + Math.sin(t / 260) * 2.5 + shown * 5;
      FX.drawIris(paths, null, 0, 0, breathe, t / 1800, 160);
      if (shown >= 1 && !done) {
        done = true;
        FX.tween(reduce ? 1 : 700, function (e) { FX.drawIris(paths, null, 0, 0, breathe + e * 60, t / 1800 + e * 1.2, 160); }, FX.ease.inOutCubic).then(function () {
          loader.classList.add('is-done');
          finish();
        });
        return;
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  })();

  /* ======================================================================
     Clocks + year
     ====================================================================== */
  var clocks = $$('[data-clock]'), fullClocks = $$('[data-clock-full]'), shortClocks = $$('[data-clock-short]');
  function tickClock() {
    var d = new Date();
    var t = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    var full = pad(d.getDate()) + '-' + pad(d.getMonth() + 1) + '-' + d.getFullYear() + '  ' + t;
    clocks.forEach(function (c) { c.textContent = 'LIVE ' + t; });
    fullClocks.forEach(function (c) { c.textContent = full; });
    shortClocks.forEach(function (c) { c.textContent = pad(d.getHours()) + ':' + pad(d.getMinutes()); });
  }
  tickClock();
  setInterval(tickClock, 1000);
  $$('[data-year]').forEach(function (y) { y.textContent = String(new Date().getFullYear()); });
  if (CFG.city) $$('[data-city]').forEach(function (c) { c.textContent = CFG.city; });
  if (CFG.country) $$('[data-country]').forEach(function (c) { c.textContent = CFG.country; });

  /* ======================================================================
     Reveal + counters
     ====================================================================== */
  function countUp(el) {
    var target = parseFloat(el.getAttribute('data-count'));
    var dec = parseInt(el.getAttribute('data-decimals') || '0', 10);
    if (reduce) { el.textContent = target.toFixed(dec); return; }
    var start = performance.now(), dur = 1800;
    (function step(now) {
      var t = Math.min(1, (now - start) / dur);
      var e = 1 - Math.pow(2, -10 * t);
      el.textContent = (target * (t >= 1 ? 1 : e)).toFixed(dec);
      if (t < 1) requestAnimationFrame(step);
    })(start);
  }
  var revealTargets = $$('[data-reveal], [data-focus], [data-count], .health');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        if (el.hasAttribute('data-count')) countUp(el);
        el.classList.add('is-in');
        io.unobserve(el);
      });
    }, { threshold: 0.2, rootMargin: '0px 0px -8% 0px' });
    revealTargets.forEach(function (el) { io.observe(el); });
  } else revealTargets.forEach(function (el) { el.classList.add('is-in'); });

  /* ======================================================================
     Scroll-driven effects (one rAF-batched handler)
     ====================================================================== */
  var scrollers = [];
  var queued = false;
  function onScroll() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () {
      queued = false;
      var vh = window.innerHeight;
      for (var i = 0; i < scrollers.length; i++) scrollers[i](vh);
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);

  /* ---------- philosophy: the viewfinder pulls focus onto each rule ---------- */
  var ethos = $('[data-ethos]');
  if (ethos) {
    var rules = $$('[data-rule]', ethos);
    var vf = $('[data-viewfinder]', ethos);
    var vfImgs = $$('.viewfinder__img', vf);
    var vfPreset = $('[data-vf-preset]', vf), vfName = $('[data-vf-name]', vf);
    var vfAf = $('[data-vf-af]', vf), vfDist = $('[data-vf-dist]', vf), vfMark = $('[data-vf-mark]', vf);
    var curRule = 0, afT = 0, distNow = parseFloat(rules[0].getAttribute('data-dist'));
    var fmtDist = function (d) { var t = d.toFixed(1); return 'Focus ' + (d < 10 ? '0' + t : t) + ' m'; };
    var markPos = function (d) { return clamp(Math.log(d / 0.3) / Math.log(20 / 0.3), 0, 1); };
    vfMark.style.setProperty('--f', markPos(distNow).toFixed(3));
    var hunt = function () {
      vf.classList.add('is-hunting');
      vfAf.textContent = 'Search';
      clearTimeout(afT);
      afT = setTimeout(function () { vf.classList.remove('is-hunting'); vfAf.textContent = 'Lock'; }, reduce ? 0 : 850);
    };
    var setRule = function (i) {
      if (i === curRule) return;
      curRule = i;
      rules.forEach(function (r, j) { r.classList.toggle('is-active', j === i); });
      vfImgs.forEach(function (im, j) { im.classList.toggle('is-active', j === i); });
      vfPreset.textContent = pad(i + 1);
      vfName.textContent = rules[i].getAttribute('data-preset');
      hunt();
      var from = distNow, to = parseFloat(rules[i].getAttribute('data-dist'));
      FX.tween(reduce ? 1 : 900, function (e) {
        distNow = from + (to - from) * e;
        vfDist.textContent = fmtDist(distNow);
        vfMark.style.setProperty('--f', markPos(distNow).toFixed(3));
      }, FX.ease.outCubic);
    };
    var huntedOnce = false;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en, obs) { if (en[0].isIntersecting && !huntedOnce) { huntedOnce = true; hunt(); obs.disconnect(); } }, { threshold: 0.4 }).observe(vf);
    }
    scrollers.push(function (vh) {
      var best = 0;
      rules.forEach(function (r, i) { if (r.getBoundingClientRect().top < vh * 0.5) best = i; });
      setRule(best);
    });
  }

  /* ---------- pinned horizontal systems ---------- */
  var hs = $('[data-hscroll]');
  if (hs) {
    var track = $('[data-hs-track]', hs);
    var cards = $$('.sys-card', hs);
    var current = $('[data-hs-current]', hs);
    var bar = $('[data-hs-bar]', hs);
    var maxX = 0, mobile = false;
    var sizeHs = function () {
      mobile = window.innerWidth <= 760;
      if (mobile) { hs.style.height = ''; track.style.transform = ''; cards.forEach(function (c) { c.style.transform = ''; }); return; }
      maxX = Math.max(0, track.scrollWidth - track.parentElement.clientWidth);
      hs.style.height = (window.innerHeight + maxX) + 'px';
    };
    sizeHs();
    window.addEventListener('resize', sizeHs);
    // keyboard users: bring the focused card into view by scrolling the page, not the clipped track
    track.addEventListener('focusin', function (e) {
      if (mobile) return;
      var card = e.target.closest('.sys-card');
      var idx = cards.indexOf(card);
      if (idx < 0) return;
      var sticky = track.closest('.systems__sticky');
      sticky.scrollLeft = 0; track.parentElement.scrollLeft = 0;
      var top = hs.getBoundingClientRect().top + window.scrollY;
      var total = hs.offsetHeight - window.innerHeight;
      window.SentraScroll.jump(top + total * (idx / Math.max(1, cards.length - 1)));
    });
    window.addEventListener('load', sizeHs);
    scrollers.push(function (vh) {
      if (mobile) return;
      var r = hs.getBoundingClientRect();
      if (r.bottom < -50 || r.top > vh + 50) return;
      var total = hs.offsetHeight - vh;
      var p = total > 0 ? clamp(-r.top / total, 0, 1) : 0;
      track.style.transform = 'translate3d(' + (-p * maxX).toFixed(1) + 'px,0,0)';
      var n = cards.length;
      var idx = Math.min(n - 1, Math.round(p * (n - 1)));
      current.textContent = pad(idx + 1);
      bar.style.transform = 'scaleX(' + ((p * (n - 1) + 1) / n).toFixed(3) + ')';
      var vw = window.innerWidth;
      cards.forEach(function (c) {
        var cr = c.getBoundingClientRect();
        var d = Math.abs(cr.left + cr.width / 2 - vw / 2) / vw;
        c.style.transform = 'scale(' + (1 - Math.min(d, 1) * 0.07).toFixed(4) + ')';
      });
    });
  }

  /* ---------- gallery parallax ---------- */
  var para = $$('[data-parallax]');
  if (para.length && !reduce) {
    scrollers.push(function (vh) {
      para.forEach(function (img) {
        var r = img.parentElement.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh) return;
        var p = (r.top + r.height / 2 - vh / 2) / vh;
        img.style.setProperty('--py', (-p * 70).toFixed(1) + 'px');
      });
    });
  }

  /* ---------- process reel ---------- */
  var proc = $('[data-process]');
  if (proc) {
    var steps = $$('[data-step]', proc);
    var reel = $('[data-proc-reel]', proc);
    var meter = $('[data-proc-meter]', proc);
    var active = -1;
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

  /* ---------- footer wordmark rises in ---------- */
  var mark = $('.footer__mark span');
  if (mark && !reduce) {
    scrollers.push(function (vh) {
      var r = mark.parentElement.getBoundingClientRect();
      if (r.top > vh) return;
      var p = clamp((vh - r.top) / r.height, 0, 1);
      mark.style.setProperty('--mark-y', ((1 - p) * 40).toFixed(1) + '%');
    });
  }
  onScroll();

  /* ======================================================================
     Visibility-gated loops
     ====================================================================== */
  function whenVisible(el, onShow, onHide) {
    if (!el) return;
    if (!('IntersectionObserver' in window)) { onShow(); return; }
    new IntersectionObserver(function (en) { if (en[0].isIntersecting) onShow(); else if (onHide) onHide(); }, { threshold: 0.15 }).observe(el);
  }

  /* ---------- access-control demo ---------- */
  var access = $('[data-access]');
  if (access) {
    var aState = $('[data-access-state]', access), aWho = $('[data-access-who]', access);
    var seq = [
      ['', 'Place finger', 'Front door', 1300],
      ['is-scanning', 'Scanning', 'Hold still', 1400],
      ['is-granted', 'Access granted', 'Resident 02 · Front door', 2200],
      ['', 'Present card', 'Staff entrance', 1200],
      ['is-scanning', 'Reading', 'Card · 4F2A', 1100],
      ['is-granted', 'Access granted', 'Cleaner · until 18:00', 2000],
      ['', 'Place finger', 'Server room', 1200],
      ['is-scanning', 'Scanning', 'Hold still', 1300],
      ['is-denied', 'Not recognised', 'Owner alerted · clip saved', 2400]
    ];
    var ai = 0, aT = 0, aOn = false;
    var stepAccess = function () {
      if (!aOn) return;
      var s = seq[ai++ % seq.length];
      access.className = 'access ' + s[0];
      aState.textContent = s[1];
      aWho.textContent = s[2];
      aT = setTimeout(stepAccess, s[3]);
    };
    whenVisible(access, function () { if (!aOn) { aOn = true; stepAccess(); } }, function () { aOn = false; clearTimeout(aT); });
  }

  /* ---------- alarm floor-plan demo ---------- */
  var plan = $('[data-plan]');
  if (plan) {
    var rooms = $$('[data-room]', plan), sensors = $$('[data-sensor]', plan);
    var ripple = $('[data-ripple]', plan), badge = $('[data-plan-badge]', plan), msg = $('[data-plan-msg]', plan);
    var NAMES = ['Bedroom', 'Hall', 'Living room', 'Kitchen', 'Garage'];
    var order = [2, 4, 1, 3, 0], pi = 0, pT = 0, pOn = false;
    var resetPlan = function () {
      rooms.forEach(function (r) { r.classList.remove('is-hot', 'is-safe'); });
      sensors.forEach(function (s) { s.classList.remove('is-hot'); });
      ripple.classList.remove('is-on');
      badge.className = 'plan__badge mono';
      badge.textContent = 'Armed · away';
      msg.textContent = 'All sensors healthy';
    };
    var runPlan = function () {
      if (!pOn) return;
      var k = order[pi % order.length];
      var pet = pi % 2 === 0;
      pi++;
      var sn = sensors[k];
      sn.classList.add('is-hot');
      rooms[k].classList.add('is-hot');
      ripple.setAttribute('cx', sn.getAttribute('cx'));
      ripple.setAttribute('cy', sn.getAttribute('cy'));
      ripple.classList.add('is-on');
      badge.className = 'plan__badge mono is-hot';
      badge.textContent = 'Motion detected';
      msg.textContent = 'Motion · ' + NAMES[k] + ' · checking camera';
      pT = setTimeout(function () {
        ripple.classList.remove('is-on');
        if (pet) {
          rooms[k].classList.remove('is-hot'); rooms[k].classList.add('is-safe');
          badge.className = 'plan__badge mono is-safe';
          badge.textContent = 'Verified · pet';
          msg.textContent = 'Camera check: it’s the cat. Alarm held.';
        } else {
          badge.textContent = 'Owner alerted';
          msg.textContent = 'Person verified · siren ready · clip sent';
        }
        pT = setTimeout(function () { resetPlan(); pT = setTimeout(runPlan, 1400); }, 2600);
      }, 1800);
    };
    whenVisible(plan, function () { if (!pOn) { pOn = true; resetPlan(); pT = setTimeout(runPlan, 700); } }, function () { pOn = false; clearTimeout(pT); });
  }

  /* ---------- phone alerts ---------- */
  var phoneList = $('[data-phone-alerts]');
  if (phoneList) {
    var ALERTS = [
      ['warn', '◎', 'Person at front door', 'Courier · package left', '21:43'],
      ['ok', '✓', 'Front door unlocked', 'Resident 02', '21:44'],
      ['', '▣', 'Vehicle arrived', 'Known plate · driveway', '21:47'],
      ['ok', '✓', 'Alarm armed', 'Night mode · all sensors', '22:30'],
      ['warn', '◎', 'Motion · garden', 'Verified: cat. Alarm held.', '01:12']
    ];
    var ph = 0, phT = 0, phOn = false;
    var pushAlert = function () {
      if (!phOn) return;
      var a = ALERTS[ph++ % ALERTS.length];
      var li = document.createElement('li');
      var ic = document.createElement('span'); ic.className = 'ic ' + a[0]; ic.textContent = a[1];
      var body = document.createElement('span');
      var b = document.createElement('b'); b.textContent = a[2];
      var sm = document.createElement('small'); sm.textContent = a[3];
      body.appendChild(b); body.appendChild(sm);
      var tm = document.createElement('time'); tm.textContent = a[4];
      li.appendChild(ic); li.appendChild(body); li.appendChild(tm);
      phoneList.insertBefore(li, phoneList.firstChild);
      while (phoneList.children.length > 3) phoneList.removeChild(phoneList.lastChild);
      phT = setTimeout(pushAlert, 2600);
    };
    for (var pre = 0; pre < 2; pre++) { phOn = true; pushAlert(); clearTimeout(phT); }
    phOn = false;
    whenVisible(phoneList, function () { if (!phOn) { phOn = true; phT = setTimeout(pushAlert, 1200); } }, function () { phOn = false; clearTimeout(phT); });
  }
  var device = $('[data-device]');
  if (device && finePointer && !reduce) {
    device.addEventListener('pointermove', function (e) {
      var r = device.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      device.style.setProperty('--ry', (x * 18).toFixed(2) + 'deg');
      device.style.setProperty('--rx', (-y * 12).toFixed(2) + 'deg');
    });
    device.addEventListener('pointerleave', function () { device.style.setProperty('--ry', '0deg'); device.style.setProperty('--rx', '0deg'); });
  }

  /* ---------- night-vision compare ---------- */
  var cmp = $('[data-compare]');
  if (cmp) {
    var range = $('.compare__range', cmp);
    var noiseC = $('.compare__noise', cmp);
    var touched = false, dragging = false;
    var setPos = function (p) {
      p = clamp(p, 0.02, 0.98);
      cmp.style.setProperty('--pos', (p * 100).toFixed(2) + '%');
      range.value = String(Math.round(p * 100));
    };
    var fromEvent = function (e) { var r = cmp.getBoundingClientRect(); setPos((e.clientX - r.left) / r.width); };
    cmp.addEventListener('pointerdown', function (e) {
      touched = dragging = true;
      cmp.classList.add('is-drag');
      cmp.setPointerCapture(e.pointerId);
      fromEvent(e);
    });
    cmp.addEventListener('pointermove', function (e) { if (dragging) fromEvent(e); });
    var endDrag = function () { dragging = false; cmp.classList.remove('is-drag'); };
    cmp.addEventListener('pointerup', endDrag);
    cmp.addEventListener('pointercancel', endDrag);
    range.addEventListener('input', function () { touched = true; setPos(range.value / 100); });

    var nOn = false, nCtx = noiseC.getContext('2d'), nImg = nCtx.createImageData(noiseC.width, noiseC.height), nLast = 0;
    var noiseLoop = function (now) {
      if (!nOn) return;
      if (now - nLast > 70) {
        nLast = now;
        var d = nImg.data;
        for (var i = 0; i < d.length; i += 4) { var v = (Math.random() * 200) | 0; d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255; }
        nCtx.putImageData(nImg, 0, 0);
      }
      requestAnimationFrame(noiseLoop);
    };
    var swept = false;
    whenVisible(cmp, function () {
      if (!nOn && !reduce) { nOn = true; requestAnimationFrame(noiseLoop); }
      if (!swept && !reduce) {
        swept = true;
        // a slow demo sweep, until the visitor takes over
        var keys = [0.5, 0.18, 0.82, 0.5], k = 0;
        var next = function () {
          if (touched || k >= keys.length - 1) return;
          var a = keys[k], b = keys[k + 1]; k++;
          FX.tween(1100, function (e) { if (!touched) setPos(a + (b - a) * e); }, FX.ease.inOutCubic).then(next);
        };
        setTimeout(next, 500);
      }
    }, function () { nOn = false; });
  }

  /* ---------- marquees, nudged by scroll velocity ---------- */
  var marquees = $$('[data-marquee]').map(function (m) {
    var t = $('.marquee__track', m);
    m.appendChild(t.cloneNode(true)).setAttribute('aria-hidden', 'true');
    return { el: m, track: t, x: 0, speed: parseFloat(m.getAttribute('data-speed') || '1'), w: 0, on: false };
  });
  if (marquees.length && !reduce) {
    var lastY = window.scrollY, vel = 0, mLast = performance.now(), mOn = false;
    var mLoop = function (now) {
      var dt = Math.min(0.05, (now - mLast) / 1000); mLast = now;
      var y = window.scrollY;
      vel += ((y - lastY) / Math.max(dt, 0.001) - vel) * 0.1;
      lastY = y;
      var any = false;
      marquees.forEach(function (m) {
        if (!m.on) return;
        any = true;
        if (!m.w) m.w = m.track.offsetWidth;
        var boost = 1 + Math.min(Math.abs(vel) / 400, 5);
        m.x -= 60 * m.speed * boost * dt;
        if (m.x <= -m.w) m.x += m.w;
        if (m.x > 0) m.x -= m.w;
        m.el.style.transform = 'translate3d(' + m.x.toFixed(1) + 'px,0,0)';
      });
      if (any) requestAnimationFrame(mLoop); else mOn = false;
    };
    marquees.forEach(function (m) {
      whenVisible(m.el, function () { m.on = true; if (!mOn) { mOn = true; mLast = performance.now(); requestAnimationFrame(mLoop); } }, function () { m.on = false; });
    });
    window.addEventListener('resize', function () { marquees.forEach(function (m) { m.w = 0; }); });
  }

  /* ---------- cursor follower + magnetic buttons ---------- */
  var cursor = $('[data-cursor-el]');
  if (cursor && finePointer && !reduce) {
    var label = $('[data-cursor-label]', cursor);
    var cx = -100, cy = -100, tx = -100, ty = -100, cOn = false;
    window.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      tx = e.clientX; ty = e.clientY;
      if (!cOn) { cOn = true; cx = tx; cy = ty; cursor.classList.add('is-on'); requestAnimationFrame(cLoop); }
      var host = e.target.closest && e.target.closest('[data-cursor]');
      if (host) { label.textContent = host.getAttribute('data-cursor'); cursor.classList.add('is-label'); }
      else cursor.classList.remove('is-label');
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', function () { cursor.classList.remove('is-on'); cOn = false; });
    var cLoop = function () {
      if (!cOn) return;
      cx += (tx - cx) * 0.2; cy += (ty - cy) * 0.2;
      cursor.style.transform = 'translate3d(' + cx.toFixed(1) + 'px,' + cy.toFixed(1) + 'px,0)';
      requestAnimationFrame(cLoop);
    };
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
     Real map (Leaflet + OpenStreetMap), centred on the service area
     ====================================================================== */
  var mapWrap = $('[data-map]');
  var mapCanvas = $('[data-map-canvas]');
  var mapLabel = $('[data-map-label]');
  var map = null, pin = null;
  var CENTER = CFG.mapCenter || [9.0765, 7.4986];
  if (mapCanvas && window.L) {
    try {
      map = window.L.map(mapCanvas, { center: CENTER, zoom: CFG.mapZoom || 12, scrollWheelZoom: false, zoomControl: false, attributionControl: true });
      window.L.control.zoom({ position: 'topright' }).addTo(map);
      window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
      }).addTo(map);
      var pinIcon = window.L.divIcon({
        className: 'mpin', iconSize: [0, 0],
        html: '<span class="mpin__radar"></span><span class="mpin__ring"></span><span class="mpin__ring mpin__ring--2"></span><span class="mpin__dot"></span>'
      });
      pin = window.L.marker(CENTER, { icon: pinIcon, keyboard: false, interactive: false }).addTo(map);
      whenVisible(mapCanvas, function () { map.invalidateSize(); });
      window.addEventListener('resize', function () { map.invalidateSize(); });
    } catch (err) { map = null; }
  }

  // Look the visitor's area up when they finish typing it (on change / Enter), never per keystroke,
  // as OpenStreetMap's Nominatim usage policy asks.
  var geoCtrl = null, lastQuery = '';
  function findArea(q) {
    if (!map || !window.fetch) return;
    q = q.trim();
    if (q.length < 3 || q === lastQuery) return;
    lastQuery = q;
    if (geoCtrl && geoCtrl.abort) geoCtrl.abort();
    geoCtrl = window.AbortController ? new AbortController() : null;
    var lat = CENTER[0], lon = CENTER[1];
    var url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=en' +
      (CFG.countryCode ? '&countrycodes=' + encodeURIComponent(CFG.countryCode) : '') +
      '&viewbox=' + [lon - 0.6, lat + 0.6, lon + 0.6, lat - 0.6].map(function (n) { return n.toFixed(4); }).join(',') + '&bounded=0' +
      '&q=' + encodeURIComponent(q);
    mapLabel.textContent = 'Searching ' + q + '…';
    fetch(url, { signal: geoCtrl ? geoCtrl.signal : undefined, headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res || !res.length) { mapLabel.textContent = q + ' · not found'; return; }
        var hit = res[0], ll = [parseFloat(hit.lat), parseFloat(hit.lon)];
        pin.setLatLng(ll);
        map.flyTo(ll, 14, { duration: reduce ? 0 : 1.6 });
        mapLabel.textContent = 'Your property · ' + String(hit.display_name || q).split(',').slice(0, 2).join(',');
        mapWrap.classList.add('is-searched');
        mapLabel.classList.add('is-bump');
        setTimeout(function () { mapLabel.classList.remove('is-bump'); }, 200);
      })
      .catch(function () { /* offline or aborted: keep the current view */ });
  }

  /* ======================================================================
     Survey form: validates, then hands the request to WhatsApp
     ====================================================================== */
  var form = $('[data-form]');
  var waLinks = $$('[data-whatsapp]');
  function waUrl(text) { return 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(text); }
  function requestText(final) {
    var data = new FormData(form);
    var lines = [final ? 'Hello Sentra, I would like to book a site survey.' : 'Hello Sentra, I would like to ask about a security system.'];
    if (data.get('name')) lines.push('Name: ' + data.get('name'));
    if (data.get('contact')) lines.push('Phone / email: ' + data.get('contact'));
    if (data.get('property')) lines.push('Property: ' + data.get('property'));
    var svc = data.getAll('service');
    if (svc.length) lines.push('Interested in: ' + svc.join(', '));
    if (data.get('area')) lines.push('Area: ' + data.get('area'));
    if (data.get('notes')) lines.push('Notes: ' + data.get('notes'));
    return lines.join('\n');
  }
  if (form) {
    var fmsg = $('[data-form-msg]', form);
    var area = $('[data-area]', form);
    var updateWhatsApp = function () { var href = waUrl(requestText(false)); waLinks.forEach(function (a) { a.href = href; }); };
    if (area) {
      area.addEventListener('change', function () { findArea(area.value); });
      area.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); findArea(area.value); } });
    }
    form.addEventListener('input', function (e) {
      updateWhatsApp();
      if (e.target.classList.contains('is-invalid') && e.target.value.trim()) e.target.classList.remove('is-invalid');
    });
    form.addEventListener('change', updateWhatsApp);
    updateWhatsApp();

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var bad = [];
      [form.elements.name, form.elements.contact].forEach(function (f) {
        var ok = f.value.trim().length > 1;
        f.classList.toggle('is-invalid', !ok);
        f.setAttribute('aria-invalid', String(!ok));
        if (!ok) bad.push(f);
      });
      if (bad.length) {
        fmsg.className = 'form__msg is-err';
        fmsg.textContent = 'Please add your name and a phone number or email.';
        bad[0].focus();
        return;
      }
      var url = waUrl(requestText(true));
      var win = window.open(url, '_blank');
      if (win) { try { win.opener = null; } catch (err) { /* ignore */ } }
      else window.location.href = url;
      fmsg.className = 'form__msg is-ok';
      fmsg.textContent = '';
      fmsg.appendChild(document.createTextNode('WhatsApp opened with your request. Press send there and we will reply. Nothing opened? '));
      var again = document.createElement('a');
      again.href = url; again.target = '_blank'; again.rel = 'noopener'; again.textContent = 'Open WhatsApp';
      again.style.textDecoration = 'underline';
      fmsg.appendChild(again);
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
