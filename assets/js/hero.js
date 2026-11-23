/* ==========================================================================
   Hero: a live camera feed
   - The frame outline is drawn as an SVG path and used as a clip-path,
     so the chamfers, the step under the logo and the bottom-right notch
     stay exact at any size. A light runs round it like a perimeter patrol.
   - Boot: static, then a blurred, washed-out picture that pulls into
     focus as the headline arrives.
   - Home / Business / Estate tabs switch the feed like changing channels.
   - A motion-detection box follows the pointer across the picture.
   ========================================================================== */
(function () {
  'use strict';

  var FX = window.SentraFX;
  var hero = document.querySelector('[data-hero]');
  if (!hero) return;

  var frame = hero.querySelector('[data-hero-frame]');
  var screen = hero.querySelector('[data-hero-screen]');
  var outline = hero.querySelector('[data-hero-outline]');
  var outlineBase = outline.querySelector('.hero__outline-base');
  var outlinePatrol = outline.querySelector('.hero__outline-patrol');
  var scenesWrap = hero.querySelector('[data-hero-scenes]');
  var scenes = Array.prototype.slice.call(hero.querySelectorAll('.hero__scene'));
  var tabsWrap = hero.querySelector('[data-hero-tabs]');
  var tabs = Array.prototype.slice.call(hero.querySelectorAll('.hero__tab'));
  var lede = hero.querySelector('[data-hero-lede]');
  var hudCam = hero.querySelector('[data-hud-cam]');
  var hudAf = hero.querySelector('[data-hud-af]');
  var staticCanvas = hero.querySelector('.hero__static');
  var tracker = hero.querySelector('[data-tracker]');
  var trackerTag = hero.querySelector('[data-tracker-tag]');
  var reduce = function () { return FX && FX.reducedMotion(); };

  var SCENES = {
    home: { cam: 'CAM 01 · HOME', lede: 'CCTV, access control and alarm installation, planned around your property.' },
    business: { cam: 'CAM 02 · BUSINESS', lede: 'Cameras, door access and alarms planned around your premises, your staff and your opening hours.' },
    estate: { cam: 'CAM 03 · ESTATE', lede: 'From the gatehouse to the last garden wall: one system planned around the whole estate.' }
  };

  /* ---------- frame geometry ---------- */
  var supportsPath = window.CSS && CSS.supports && CSS.supports('clip-path', "path('M0 0H1V1Z')");

  function geometry(W) {
    if (W < 700) return { k: 24, stepX: 0, stepH: 0, notchW: 0, notchH: 0, r: 14 };
    return {
      k: 34,
      stepX: Math.round(Math.min(330, Math.max(210, W * 0.235))),
      stepH: 54,
      notchW: W < 1180 ? 380 : 420,
      notchH: 72,
      r: 18
    };
  }

  function buildPath(W, H, g) {
    var d;
    if (g.stepX > 0) d = 'M0 ' + (g.stepH + g.k) + 'L' + g.k + ' ' + g.stepH + 'L' + g.stepX + ' ' + g.stepH + 'L' + (g.stepX + g.stepH) + ' 0';
    else d = 'M0 ' + g.k + 'L' + g.k + ' 0';
    d += 'L' + (W - g.r) + ' 0Q' + W + ' 0 ' + W + ' ' + g.r;
    if (g.notchW > 0) {
      d += 'L' + W + ' ' + (H - g.notchH - g.r) +
        'Q' + W + ' ' + (H - g.notchH) + ' ' + (W - g.r) + ' ' + (H - g.notchH) +
        'L' + (W - g.notchW + g.notchH) + ' ' + (H - g.notchH) +
        'L' + (W - g.notchW) + ' ' + H;
    } else {
      d += 'L' + W + ' ' + (H - g.r) + 'Q' + W + ' ' + H + ' ' + (W - g.r) + ' ' + H;
    }
    d += 'L' + g.r + ' ' + H + 'Q0 ' + H + ' 0 ' + (H - g.r) + 'Z';
    return d;
  }

  function layout() {
    var W = frame.clientWidth, H = frame.clientHeight;
    if (!W || !H) return;
    var g = geometry(W);
    var d = buildPath(W, H, g);
    if (supportsPath) {
      screen.style.clipPath = "path('" + d + "')";
      screen.classList.add('has-path');
    }
    outline.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    outlineBase.setAttribute('d', d);
    outlinePatrol.setAttribute('d', d);
    frame.style.setProperty('--step-x', g.stepX + 'px');
    frame.style.setProperty('--step-h', g.stepH + 'px');
    frame.style.setProperty('--notch-w', g.notchW + 'px');
    frame.style.setProperty('--notch-h', g.notchH + 'px');
    hero.style.setProperty('--step-h', g.stepH + 'px');
  }
  outlineBase.setAttribute('pathLength', '1000');
  outlinePatrol.setAttribute('pathLength', '1000');
  layout();
  if (window.ResizeObserver) new ResizeObserver(layout).observe(frame);
  else window.addEventListener('resize', layout);

  /* ---------- boot sequence ---------- */
  function boot() {
    if (reduce()) { hero.classList.remove('is-booting'); hudAf.textContent = 'LOCK'; return; }
    FX.noise(staticCanvas, { duration: 1100, from: 0.95 });
    setTimeout(function () { hero.classList.remove('is-booting'); }, 380);
    setTimeout(function () { hudAf.textContent = 'TRACK'; }, 700);
    setTimeout(function () { hudAf.textContent = 'LOCK'; }, 1500);
  }
  var firstImg = scenes[0];
  var booted = false;
  var go = function () { if (!booted) { booted = true; boot(); } };
  if (firstImg.complete && firstImg.naturalWidth) go();
  else {
    firstImg.addEventListener('load', go, { once: true });
    firstImg.addEventListener('error', go, { once: true });
    setTimeout(go, 1600);
  }

  /* ---------- channel tabs ---------- */
  var current = 'home';
  var cycleT = 0, cycling = false, userPicked = false, heroVisible = true;
  var CYCLE_MS = 7000;

  function select(name, opts) {
    opts = opts || {};
    if (name === current || !SCENES[name]) return;
    var prevName = current;
    current = name;

    tabs.forEach(function (t) {
      var on = t.getAttribute('data-scene') === name;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    if (opts.focus) tabs.filter(function (t) { return t.getAttribute('data-scene') === name; })[0].focus();

    var next = scenes.filter(function (s) { return s.getAttribute('data-scene') === name; })[0];
    var prev = scenes.filter(function (s) { return s.getAttribute('data-scene') === prevName; })[0];
    if (next.loading === 'lazy') next.loading = 'eager';

    var swap = function () {
      next.classList.add('is-entering');
      prev.classList.remove('is-active');
      next.classList.add('is-active');
      void next.offsetWidth;
      requestAnimationFrame(function () { next.classList.remove('is-entering'); });
      hudCam.textContent = SCENES[name].cam;
    };

    if (reduce()) { swap(); lede.textContent = SCENES[name].lede; }
    else {
      hero.classList.remove('is-switching');
      void hero.offsetWidth;
      hero.classList.add('is-switching');
      FX.noise(staticCanvas, { duration: 360, from: 0.85 });
      setTimeout(swap, 110);
      setTimeout(function () { hero.classList.remove('is-switching'); }, 360);
      lede.classList.add('is-swapping');
      setTimeout(function () { lede.textContent = SCENES[name].lede; lede.classList.remove('is-swapping'); }, 220);
      hudAf.textContent = 'SEARCH';
      setTimeout(function () { hudAf.textContent = 'LOCK'; }, 900);
    }
    restartCycle();
  }

  function nextScene() {
    var names = tabs.map(function (t) { return t.getAttribute('data-scene'); });
    select(names[(names.indexOf(current) + 1) % names.length]);
  }

  function restartCycle() {
    clearTimeout(cycleT);
    tabsWrap.classList.remove('is-cycling');
    cycling = !userPicked && heroVisible && !reduce();
    if (!cycling) return;
    void tabsWrap.offsetWidth;
    tabsWrap.style.setProperty('--cycle', CYCLE_MS + 'ms');
    tabsWrap.classList.add('is-cycling');
    cycleT = setTimeout(nextScene, CYCLE_MS);
  }

  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { userPicked = true; select(t.getAttribute('data-scene')); restartCycle(); });
    t.addEventListener('keydown', function (e) {
      var n = tabs.length, j = -1;
      if (e.key === 'ArrowRight') j = (i + 1) % n;
      else if (e.key === 'ArrowLeft') j = (i - 1 + n) % n;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = n - 1;
      if (j < 0) return;
      e.preventDefault();
      userPicked = true;
      select(tabs[j].getAttribute('data-scene'), { focus: true });
      tabs[j].focus();
      restartCycle();
    });
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      heroVisible = entries[0].isIntersecting;
      restartCycle();
    }, { threshold: 0.25 }).observe(frame);
  }
  setTimeout(restartCycle, 1800);

  /* ---------- pointer: parallax + motion tracker ---------- */
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var P = { tx: 0, ty: 0, x: 0, y: 0, nx: 0, ny: 0, pnx: 0, pny: 0, vx: 0, vy: 0, inside: false, lastMove: 0, show: false };
  var fr = { left: 0, top: 0, w: 1, h: 1 };
  var loopOn = false, lastT = 0, tagT = 0;
  var TW = 108, TH = 132;

  if (finePointer && !reduce()) {
    frame.addEventListener('pointerenter', function (e) {
      var r = frame.getBoundingClientRect();
      fr = { left: r.left, top: r.top, w: r.width, h: r.height };
      P.inside = true;
      P.x = P.tx = e.clientX - r.left; P.y = P.ty = e.clientY - r.top;
      startLoop();
    });
    frame.addEventListener('pointermove', function (e) {
      var r = frame.getBoundingClientRect();
      fr = { left: r.left, top: r.top, w: r.width, h: r.height };
      P.tx = e.clientX - r.left; P.ty = e.clientY - r.top;
      P.lastMove = performance.now();
      P.show = !(e.target.closest && e.target.closest('.hero__content a, .hero__thumb, .hero__ctas'));
      startLoop();
    });
    frame.addEventListener('pointerleave', function () { P.inside = false; P.show = false; startLoop(); });
  }

  function startLoop() {
    if (loopOn) return;
    loopOn = true; lastT = performance.now();
    requestAnimationFrame(loop);
  }

  function loop(now) {
    var dt = Math.min(0.034, (now - lastT) / 1000); lastT = now;

    // parallax (the camera gently pans against the pointer)
    var nx = P.inside ? (P.tx / fr.w) * 2 - 1 : 0;
    var ny = P.inside ? (P.ty / fr.h) * 2 - 1 : 0;
    P.pnx += (nx - P.pnx) * Math.min(1, dt * 3);
    P.pny += (ny - P.pny) * Math.min(1, dt * 3);
    scenesWrap.style.setProperty('--px', (-P.pnx * 16).toFixed(2) + 'px');
    scenesWrap.style.setProperty('--py', (-P.pny * 10).toFixed(2) + 'px');

    // tracker spring
    var k = 140, c = 2 * Math.sqrt(k) * 0.75;
    var ax = k * (P.tx - P.x) - c * P.vx;
    var ay = k * (P.ty - P.y) - c * P.vy;
    P.vx += ax * dt; P.vy += ay * dt;
    P.x += P.vx * dt; P.y += P.vy * dt;
    var visible = P.inside && P.show && now - P.lastMove < 1400;
    tracker.classList.toggle('is-on', visible);
    tracker.style.transform = 'translate3d(' + (P.x - TW / 2).toFixed(1) + 'px,' + (P.y - TH / 2).toFixed(1) + 'px,0)';
    if (now - tagT > 260 && visible) {
      tagT = now;
      var speed = Math.hypot(P.vx, P.vy);
      var conf = Math.min(0.99, 0.86 + Math.random() * 0.06 + Math.min(speed / 4000, 0.07));
      trackerTag.textContent = (speed > 260 ? 'MOTION' : 'SUBJECT') + ' · ' + conf.toFixed(2) + '  X' + pad4(P.x) + ' Y' + pad4(P.y);
    }

    var settled = Math.abs(P.pnx - nx) < 0.002 && Math.abs(P.pny - ny) < 0.002 && Math.hypot(P.vx, P.vy) < 1;
    if (!P.inside && settled) { loopOn = false; tracker.classList.remove('is-on'); return; }
    if (P.inside && !visible && settled) { loopOn = false; return; }
    requestAnimationFrame(loop);
  }

  // keep the tracker's fade-out honest when the pointer stops moving
  setInterval(function () { if (P.inside && P.show) startLoop(); }, 500);

  function pad4(n) { n = Math.max(0, Math.round(n)); return ('000' + n).slice(-4); }
})();
