/* ==========================================================================
   Shutter: a six-blade camera iris drawn in SVG.
   Used for "channel cuts" between sections and for the mobile menu.
   Also exposes a couple of small shared effects (static noise, easing).
   ========================================================================== */
(function () {
  'use strict';

  var reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  var TAU = Math.PI * 2;
  var SIXTH = Math.PI / 3;

  /* ---------- shared helpers ---------- */
  var ease = {
    inCubic: function (t) { return t * t * t; },
    outCubic: function (t) { return 1 - Math.pow(1 - t, 3); },
    inOutCubic: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    outBack: function (t) { var c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
  };

  function tween(duration, fn, easing) {
    return new Promise(function (resolve) {
      var start = performance.now();
      function frame(now) {
        var t = Math.min(1, (now - start) / duration);
        fn(easing ? easing(t) : t, t);
        if (t < 1) requestAnimationFrame(frame); else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  /* Paint TV static into a (small) canvas, fading from `from` to 0 opacity. */
  function noise(canvas, opts) {
    if (!canvas || reduceMQ.matches) return Promise.resolve();
    opts = opts || {};
    var duration = opts.duration || 300;
    var from = opts.from == null ? 1 : opts.from;
    var ctx = canvas.getContext('2d');
    var w = canvas.width, h = canvas.height;
    var img = ctx.createImageData(w, h);
    var data = img.data;
    canvas._noiseId = (canvas._noiseId || 0) + 1;
    var id = canvas._noiseId;
    return tween(duration, function (e) {
      if (id !== canvas._noiseId) return;
      for (var i = 0; i < data.length; i += 4) {
        var v = (Math.random() * 255) | 0;
        // occasional horizontal tear lines
        data[i] = v; data[i + 1] = v; data[i + 2] = Math.min(255, v + 18); data[i + 3] = 255;
      }
      var tear = (Math.random() * h) | 0;
      for (var x = 0; x < w; x++) { var j = (tear * w + x) * 4; data[j] = 220; data[j + 1] = 255; data[j + 2] = 255; }
      ctx.putImageData(img, 0, 0);
      canvas.style.opacity = String(from * (1 - e));
    }, ease.inCubic).then(function () {
      if (id === canvas._noiseId) canvas.style.opacity = '0';
    });
  }

  /* ---------- iris geometry ----------
     The opening is a regular hexagon with inradius r, rotated by `rot`.
     Each blade is the 60-degree wedge outside one hexagon edge, bounded by
     the extensions of that edge and the previous one. Together the six
     wedges tile everything outside the opening, giving the classic
     pinwheel look, and they converge to a point as r -> 0. */
  function irisGeometry(cx, cy, r, rot, L) {
    var R = r / Math.cos(Math.PI / 6);
    var V = [], D = [], k;
    for (k = 0; k < 6; k++) {
      var a = rot + k * SIXTH + Math.PI / 6;
      V.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
      var da = rot + k * SIXTH + (5 * Math.PI) / 6; // direction of edge V[k] -> V[k+1]
      D.push([Math.cos(da), Math.sin(da)]);
    }
    var blades = [];
    for (k = 0; k < 6; k++) {
      var p = V[k], dk = D[k], dp = D[(k + 5) % 6];
      blades.push(
        'M' + f(p[0]) + ' ' + f(p[1]) +
        'L' + f(p[0] + dk[0] * L) + ' ' + f(p[1] + dk[1] * L) +
        'L' + f(p[0] + dp[0] * L) + ' ' + f(p[1] + dp[1] * L) + 'Z'
      );
    }
    var hex = 'M' + V.map(function (v) { return f(v[0]) + ' ' + f(v[1]); }).join('L') + 'Z';
    return { blades: blades, hex: hex };
  }
  function f(n) { return Math.round(n * 10) / 10; }

  function drawIris(paths, edge, cx, cy, r, rot, L) {
    var g = irisGeometry(cx, cy, r, rot, L);
    for (var i = 0; i < paths.length; i++) paths[i].setAttribute('d', g.blades[i]);
    if (edge) edge.setAttribute('d', g.hex);
  }

  /* ---------- full-screen shutter ---------- */
  var root = document.querySelector('.shutter');
  var api = {
    ease: ease,
    tween: tween,
    noise: noise,
    irisGeometry: irisGeometry,
    drawIris: drawIris,
    reducedMotion: function () { return reduceMQ.matches; },
    busy: false,
    cut: function (info, onClosed) {
      if (typeof onClosed === 'function' && (reduceMQ.matches || !root)) { onClosed(); return Promise.resolve(); }
      return run(info || {}, onClosed);
    }
  };
  window.SentraFX = api;
  if (!root) return;

  var svg = root.querySelector('.shutter__svg');
  var paths = Array.prototype.slice.call(root.querySelectorAll('.shutter__blades path'));
  var edge = root.querySelector('.shutter__edge');
  var hudCh = root.querySelector('.shutter__ch');
  var hudName = root.querySelector('.shutter__name');
  var fills = ['#0d151c', '#121c25', '#0a1117', '#15202a', '#0e171f', '#111a22'];
  paths.forEach(function (p, i) { p.setAttribute('fill', fills[i % fills.length]); });

  function run(info, onClosed) {
    if (api.busy) return Promise.resolve();
    api.busy = true;

    var vw = window.innerWidth, vh = window.innerHeight;
    var cx = info.x == null ? vw / 2 : info.x;
    var cy = info.y == null ? vh / 2 : info.y;
    var far = Math.max(
      Math.hypot(cx, cy), Math.hypot(vw - cx, cy),
      Math.hypot(cx, vh - cy), Math.hypot(vw - cx, vh - cy)
    );
    var rMax = far + 24;
    var L = far * 3 + 400;
    svg.setAttribute('viewBox', '0 0 ' + vw + ' ' + vh);
    hudCh.textContent = info.ch ? (/^\d+$/.test(info.ch) ? 'CH ' + info.ch : info.ch) : 'CH';
    hudName.textContent = info.name || '';

    drawIris(paths, edge, cx, cy, rMax, 0, L);
    root.classList.add('is-active');

    var spin = 0.75; // radians of twist over a full close
    return tween(340, function (e) {
      drawIris(paths, edge, cx, cy, rMax * (1 - e), e * spin, L);
    }, ease.inCubic)
      .then(function () {
        root.classList.add('is-closed');
        try { if (onClosed) onClosed(); } catch (err) { console.error(err); }
        return wait(260);
      })
      .then(function () {
        root.classList.remove('is-closed');
        return tween(520, function (e) {
          drawIris(paths, edge, cx, cy, rMax * e, spin + e * spin, L);
        }, ease.outCubic);
      })
      .then(function () {
        root.classList.remove('is-active');
        api.busy = false;
      });
  }

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
})();
