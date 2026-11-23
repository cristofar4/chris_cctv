/* ==========================================================================
   Camera line demos: virtual PTZ, 180° panorama, plate read, thermal.
   Each runs a short self-demo when it first comes into view, then hands
   control to the visitor.
   ========================================================================== */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function onVisible(el, fn, th) {
    if (!('IntersectionObserver' in window)) { fn(); return; }
    var io = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { io.disconnect(); fn(); } }, { threshold: th || 0.45 });
    io.observe(el);
  }
  function tween(ms, step, done) {
    var t0 = performance.now();
    (function f(now) {
      var t = Math.min(1, (now - t0) / ms), e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      step(e);
      if (t < 1) requestAnimationFrame(f); else if (done) done();
    })(t0);
  }

  /* ======================================================================
     Virtual PTZ over a real aerial photograph
     ====================================================================== */
  var ptz = document.querySelector('[data-ptz]');
  if (ptz) {
    var img = ptz.querySelector('.ptz__img');
    var zoomIn = ptz.querySelector('[data-ptz-zoom]');
    var read = ptz.querySelector('[data-ptz-read]');
    var S = { u: 0.5, v: 0.5, z: 1 }, T = { u: 0.5, v: 0.5, z: 1 };
    var drag = null, raf = 0, touched = false;
    var PRESETS = [[0.5, 0.5, 1], [0.68, 0.545, 16], [0.43, 0.74, 24]];
    var mag = function (z) { return 1 + (z - 1) * (5 / 39); };
    var bounds = function (z) {
      var W = ptz.clientWidth, H = ptz.clientHeight, iw = img.naturalWidth || 2200, ih = img.naturalHeight || 1649;
      var s = Math.max(W / iw, H / ih) * mag(z);
      return { W: W, H: H, dw: iw * s, dh: ih * s };
    };
    var render = function () {
      raf = 0;
      var k = reduce ? 1 : 0.16;
      S.u += (T.u - S.u) * k; S.v += (T.v - S.v) * k; S.z += (T.z - S.z) * k;
      var b = bounds(S.z);
      var hu = b.W / (2 * b.dw), hv = b.H / (2 * b.dh);
      S.u = clamp(S.u, hu, 1 - hu); S.v = clamp(S.v, hv, 1 - hv);
      T.u = clamp(T.u, hu, 1 - hu); T.v = clamp(T.v, hv, 1 - hv);
      img.style.width = b.dw + 'px'; img.style.height = b.dh + 'px';
      img.style.transform = 'translate3d(' + (b.W / 2 - S.u * b.dw).toFixed(1) + 'px,' + (b.H / 2 - S.v * b.dh).toFixed(1) + 'px,0)';
      var pan = (S.u - 0.5) * 140, tilt = -45 - (S.v - 0.5) * 50;
      read.textContent = 'PAN ' + (pan >= 0 ? '+' : '−') + ('00' + Math.abs(pan).toFixed(1)).slice(-5) + '° · TILT ' + (tilt < 0 ? '−' : '+') + Math.abs(tilt).toFixed(1) + '° · ' + S.z.toFixed(1) + '×';
      if (document.activeElement !== zoomIn) zoomIn.value = S.z.toFixed(1);
      if (Math.abs(T.u - S.u) + Math.abs(T.v - S.v) + Math.abs(T.z - S.z) > 0.0005) kick();
    };
    var kick = function () { if (!raf) raf = requestAnimationFrame(render); };
    var take = function () { touched = true; ptz.classList.add('is-manual'); };

    ptz.addEventListener('pointerdown', function (e) {
      if (e.target.closest('button, input')) return;
      take();
      drag = { x: e.clientX, y: e.clientY, u: T.u, v: T.v };
      ptz.setPointerCapture(e.pointerId);
      ptz.classList.add('is-drag');
    });
    ptz.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var b = bounds(T.z);
      T.u = drag.u - (e.clientX - drag.x) / b.dw;
      T.v = drag.v - (e.clientY - drag.y) / b.dh;
      kick();
    });
    var end = function () { drag = null; ptz.classList.remove('is-drag'); };
    ptz.addEventListener('pointerup', end); ptz.addEventListener('pointercancel', end);
    ptz.addEventListener('wheel', function (e) {
      e.preventDefault(); take();
      T.z = clamp(T.z * (e.deltaY < 0 ? 1.12 : 0.89), 1, 40); kick();
    }, { passive: false });
    zoomIn.addEventListener('input', function () { take(); T.z = +zoomIn.value; kick(); });
    Array.prototype.forEach.call(ptz.querySelectorAll('[data-ptz-preset]'), function (b) {
      b.addEventListener('click', function () { take(); var p = PRESETS[+b.getAttribute('data-ptz-preset')]; T.u = p[0]; T.v = p[1]; T.z = p[2]; kick(); });
    });
    img.addEventListener('load', kick);
    window.addEventListener('resize', kick);
    kick();
    // a guided tour of the presets until the visitor takes over
    onVisible(ptz, function () {
      if (reduce) return;
      var i = 1;
      (function next() {
        if (touched) return;
        var p = PRESETS[i % PRESETS.length]; i++;
        T.u = p[0]; T.v = p[1]; T.z = p[2]; kick();
        setTimeout(next, 3200);
      })();
    });
  }

  /* ======================================================================
     180° panorama
     ====================================================================== */
  var pano = document.querySelector('[data-pano]');
  if (pano) {
    var strip = pano.querySelector('[data-pano-strip]');
    var pimg = strip.querySelector('img');
    var pread = pano.querySelector('[data-pano-read]');
    var win = pano.querySelector('[data-pano-window]');
    var x = 0, vx = 0, pdrag = null, ptouched = false, pRaf = 0, drift = 0;
    var size = function () { return { W: pano.clientWidth, SW: strip.offsetWidth }; };
    var step = function () {
      pRaf = 0;
      var s = size(), min = Math.min(0, s.W - s.SW);
      if (!pdrag) {
        if (!ptouched && !reduce) { drift += 0.004; x = min / 2 + Math.sin(drift) * (-min / 2); }
        else { x += vx; vx *= 0.92; }
      }
      x = clamp(x, min, 0);
      strip.style.transform = 'translate3d(' + x.toFixed(1) + 'px,0,0)';
      var p = min < 0 ? x / min : 0;
      var bearing = Math.round(-90 + p * 180 + (s.W / s.SW) * 90);
      pread.textContent = 'Bearing ' + (bearing >= 0 ? '+' : '−') + ('00' + Math.abs(bearing)).slice(-3) + '°';
      win.style.left = (-x / s.SW * 100).toFixed(2) + '%';
      win.style.width = (s.W / s.SW * 100).toFixed(2) + '%';
      if (pdrag || Math.abs(vx) > 0.05 || !ptouched) pRaf = requestAnimationFrame(step);
    };
    var pKick = function () { if (!pRaf) pRaf = requestAnimationFrame(step); };
    pano.addEventListener('pointerdown', function (e) {
      ptouched = true; pano.classList.add('is-drag');
      pdrag = { x: e.clientX, base: x, lastX: e.clientX, t: performance.now() };
      pano.setPointerCapture(e.pointerId); pKick();
    });
    pano.addEventListener('pointermove', function (e) {
      if (!pdrag) return;
      x = pdrag.base + (e.clientX - pdrag.x);
      var now = performance.now(); vx = (e.clientX - pdrag.lastX) / Math.max(1, now - pdrag.t) * 16; pdrag.lastX = e.clientX; pdrag.t = now;
      pKick();
    });
    var pEnd = function () { pdrag = null; pano.classList.remove('is-drag'); pKick(); };
    pano.addEventListener('pointerup', pEnd); pano.addEventListener('pointercancel', pEnd);
    pimg.addEventListener('load', pKick);
    window.addEventListener('resize', pKick);
    onVisible(pano, pKick, 0.2);
  }

  /* ======================================================================
     Plate read (illustrative)
     ====================================================================== */
  var anpr = document.querySelector('[data-anpr]');
  if (anpr) {
    var plate = anpr.querySelector('[data-anpr-plate]');
    var conf = anpr.querySelector('[data-anpr-conf]');
    var runBtn = document.querySelector('[data-anpr-run]');
    var FINAL = 'SNT·4821', GL = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
    var running = false;
    var run = function () {
      if (running) return;
      running = true;
      anpr.classList.remove('is-read');
      void anpr.offsetWidth;
      anpr.classList.add('is-scanning');
      var t0 = performance.now(), dur = reduce ? 1 : 1500;
      (function scramble(now) {
        var t = Math.min(1, (now - t0) / dur), n = Math.floor(FINAL.length * t), out = '';
        for (var i = 0; i < FINAL.length; i++) out += i < n || FINAL[i] === '·' ? FINAL[i] : GL[(Math.random() * GL.length) | 0];
        plate.textContent = out;
        conf.textContent = (0.6 + 0.38 * t).toFixed(2);
        if (t < 1) requestAnimationFrame(scramble);
        else { plate.textContent = FINAL; conf.textContent = '0.98'; anpr.classList.remove('is-scanning'); anpr.classList.add('is-read'); running = false; }
      })(t0);
    };
    if (runBtn) runBtn.addEventListener('click', run);
    onVisible(anpr, run);
  }

  /* ======================================================================
     Visible / thermal compare, thermal computed from the real photo
     ====================================================================== */
  var th = document.querySelector('[data-thermal]');
  if (th) {
    var timg = th.querySelector('.thermal__img');
    var tc = th.querySelector('[data-thermal-canvas]');
    var range = th.querySelector('[data-thermal-range]');
    var built = false, tdrag = false, ttouched = false;
    var build = function () {
      if (built || !timg.naturalWidth) return;
      built = true;
      var w = 700, h = Math.round(timg.naturalHeight * w / timg.naturalWidth);
      tc.width = w; tc.height = h;
      var g = tc.getContext('2d', { willReadFrequently: true });
      g.drawImage(timg, 0, 0, w, h);
      var id = g.getImageData(0, 0, w, h), d = id.data;
      var stops = [[2, 0, 16], [72, 6, 115], [199, 18, 89], [250, 107, 10], [255, 219, 64], [255, 255, 235]];
      for (var p = 0; p < d.length; p += 4) {
        var l = (d[p] * 0.299 + d[p + 1] * 0.587 + d[p + 2] * 0.114) / 255;
        var warm = Math.max(0, (d[p] - d[p + 2]) / 255) * 0.25; // warm light sources read hotter
        var t = clamp(Math.pow(l, 0.8) * 0.9 + warm, 0, 0.999) * (stops.length - 1);
        var i0 = Math.floor(t), f = t - i0, a = stops[i0], b = stops[i0 + 1];
        d[p] = a[0] + (b[0] - a[0]) * f; d[p + 1] = a[1] + (b[1] - a[1]) * f; d[p + 2] = a[2] + (b[2] - a[2]) * f;
      }
      g.putImageData(id, 0, 0);
      g.filter = 'blur(1.4px)';
      g.drawImage(tc, 0, 0);
    };
    var setPos = function (p) { p = clamp(p, 0.03, 0.97); th.style.setProperty('--pos', (p * 100).toFixed(2) + '%'); range.value = Math.round(p * 100); };
    var fromE = function (e) { var r = th.getBoundingClientRect(); setPos((e.clientX - r.left) / r.width); };
    th.addEventListener('pointerdown', function (e) { ttouched = tdrag = true; th.classList.add('is-drag'); th.setPointerCapture(e.pointerId); fromE(e); });
    th.addEventListener('pointermove', function (e) { if (tdrag) fromE(e); });
    var tEnd = function () { tdrag = false; th.classList.remove('is-drag'); };
    th.addEventListener('pointerup', tEnd); th.addEventListener('pointercancel', tEnd);
    range.addEventListener('input', function () { ttouched = true; setPos(range.value / 100); });
    if (timg.complete) build(); else timg.addEventListener('load', build);
    onVisible(th, function () {
      build();
      if (reduce) return;
      var keys = [0.5, 0.15, 0.85, 0.5], k = 0;
      (function next() {
        if (ttouched || k >= keys.length - 1) return;
        var a = keys[k], b = keys[k + 1]; k++;
        tween(1200, function (e) { if (!ttouched) setPos(a + (b - a) * e); }, next);
      })();
    });
  }
})();
