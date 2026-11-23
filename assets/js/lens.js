/* ==========================================================================
   Hero: the Analysis Lens
   A real night photograph of Shibuya Crossing. Wherever you move, a lens
   magnifies the street and shows what the AI sees: vehicles, people and
   plates lock on with detection boxes. The lens can switch to thermal or
   night-IR, both computed from the photo itself. With no pointer, the
   lens tours the street on its own.
   ========================================================================== */
(function () {
  'use strict';

  var hero = document.querySelector('[data-hero]');
  if (!hero) return;
  var stage = hero.querySelector('[data-lens-stage]');
  var photo = hero.querySelector('[data-lens-photo]');
  var canvas = hero.querySelector('[data-lens-canvas]');
  var ctx = canvas.getContext('2d');
  var hint = hero.querySelector('[data-lens-hint]');
  var outVeh = hero.querySelector('[data-lens-veh]');
  var outPpl = hero.querySelector('[data-lens-ppl]');
  var outPlates = hero.querySelector('[data-lens-plates]');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var touch = window.matchMedia('(hover: none), (pointer: coarse)').matches;

  var api = window.SentraLens = { ready: false, mode: 0 };
  function emit(name, d) { document.dispatchEvent(new CustomEvent(name, { detail: d })); }

  /* ---------- what is in the photo (annotated on a 1200 × 801 grid) ---------- */
  var REF_W = 1200, REF_H = 801;
  var OBJECTS = [
    [0, 588, 58, 765, 'veh', 'VEHICLE', 0.88],
    [42, 594, 220, 712, 'veh', 'SUV', 0.97],
    [350, 618, 447, 700, 'veh', 'TAXI', 0.98],
    [440, 612, 497, 682, 'veh', 'TAXI', 0.94],
    [494, 624, 526, 652, 'veh', 'CAR', 0.86],
    [545, 582, 632, 660, 'veh', 'BUS', 0.99],
    [548, 622, 646, 694, 'veh', 'TAXI', 0.97],
    [645, 624, 716, 676, 'veh', 'TAXI', 0.93],
    [710, 606, 926, 716, 'veh', 'CAR', 0.99],
    [245, 622, 352, 686, 'ppl', 'PEDESTRIANS ×8', 0.92, 8],
    [898, 612, 942, 705, 'ppl', 'PERSON', 0.95, 1],
    [960, 604, 994, 712, 'ppl', 'PERSON', 0.97, 1],
    [998, 604, 1046, 712, 'ppl', 'PERSON', 0.91, 1],
    [1050, 603, 1090, 712, 'ppl', 'PERSON', 0.96, 1],
    [1098, 608, 1132, 712, 'ppl', 'PERSON', 0.94, 1],
    [1152, 602, 1196, 720, 'ppl', 'PERSON', 0.93, 1],
    [366, 674, 396, 687, 'plate', 'PLATE', 0.91],
    [873, 679, 899, 696, 'plate', 'PLATE', 0.93],
    [540, 100, 658, 180, 'tag', 'LANDMARK · 109', 0.99],
    [497, 197, 541, 250, 'tag', 'SIGNAGE', 0.9],
    [668, 220, 738, 290, 'tag', 'SIGNAGE', 0.9]
  ].map(function (o) {
    return { x0: o[0] / REF_W, y0: o[1] / REF_H, x1: o[2] / REF_W, y1: o[3] / REF_H, type: o[4], label: o[5], conf: o[6], n: o[7] || 1, lock: 0, seen: false };
  });
  var COLORS = { veh: '#45e3f0', ppl: '#ffb547', plate: '#ece8e1', tag: '#b9a6ff' };

  // a tour of the interesting parts of the street, in image coordinates
  var TOUR = [[0.34, 0.8], [0.5, 0.76], [0.67, 0.8], [0.86, 0.79], [0.22, 0.79], [0.5, 0.22]];

  /* ---------- sensor versions of the photo ---------- */
  var edges = null, thermal = null, ir = null, scan = null;
  var PW = 1600, PH = 1068; // processing resolution for the sensor views
  function buildSensors() {
    var w = PW, h = PH;
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(photo, 0, 0, w, h);
    var src = g.getImageData(0, 0, w, h).data;
    var lum = new Float32Array(w * h);
    for (var i = 0, p = 0; i < lum.length; i++, p += 4) lum[i] = (src[p] * 0.299 + src[p + 1] * 0.587 + src[p + 2] * 0.114) / 255;

    // heat: cool base from luminance, people and vehicles run hot
    var heat = new Float32Array(w * h);
    for (i = 0; i < heat.length; i++) heat[i] = Math.pow(lum[i], 1.35) * 0.55;
    OBJECTS.forEach(function (o) {
      if (o.type !== 'ppl' && o.type !== 'veh') return;
      var X0 = Math.floor(o.x0 * w), X1 = Math.ceil(o.x1 * w), Y0 = Math.floor(o.y0 * h), Y1 = Math.ceil(o.y1 * h);
      var cx = (X0 + X1) / 2, cy = (Y0 + Y1) / 2, rx = (X1 - X0) / 2, ry = (Y1 - Y0) / 2;
      for (var y = Math.max(0, Y0); y < Math.min(h, Y1); y++) {
        for (var x = Math.max(0, X0); x < Math.min(w, X1); x++) {
          var k = y * w + x, t;
          if (o.type === 'ppl') {
            // body heat that keeps the texture of the figure
            var dx = (x - cx) / (rx * 0.85), dy = (y - cy) / (ry * 1.02), d = dx * dx + dy * dy;
            if (d > 1) continue;
            t = 0.4 + 0.2 * (1 - d) + Math.pow(lum[k], 0.7) * 0.45;
          } else {
            // engines and tyres warm, bodywork cooler, lights hottest
            var fy = (y - Y0) / (Y1 - Y0);
            t = 0.3 + 0.28 * Math.max(0, fy - 0.4) + Math.pow(lum[k], 0.8) * 0.42;
          }
          if (t > heat[k]) heat[k] = t;
        }
      }
    });

    var ironbow = [[2, 0, 16], [72, 6, 115], [199, 18, 89], [250, 107, 10], [255, 219, 64], [255, 255, 235]];
    function iron(t, out, p) {
      t = Math.max(0, Math.min(0.999, t)) * (ironbow.length - 1);
      var i0 = Math.floor(t), f = t - i0, a = ironbow[i0], b = ironbow[i0 + 1];
      out[p] = a[0] + (b[0] - a[0]) * f; out[p + 1] = a[1] + (b[1] - a[1]) * f; out[p + 2] = a[2] + (b[2] - a[2]) * f; out[p + 3] = 255;
    }

    var eImg = g.createImageData(w, h), tImg = g.createImageData(w, h), rImg = g.createImageData(w, h);
    var E = eImg.data, Tt = tImg.data, R = rImg.data;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var k = y * w + x, q = k * 4;
        // Sobel edges
        if (x > 0 && y > 0 && x < w - 1 && y < h - 1) {
          var a00 = lum[k - w - 1], a01 = lum[k - w], a02 = lum[k - w + 1];
          var a10 = lum[k - 1], a12 = lum[k + 1];
          var a20 = lum[k + w - 1], a21 = lum[k + w], a22 = lum[k + w + 1];
          var gx = -a00 - 2 * a10 - a20 + a02 + 2 * a12 + a22;
          var gy = -a00 - 2 * a01 - a02 + a20 + 2 * a21 + a22;
          var m = Math.min(1, Math.pow(Math.sqrt(gx * gx + gy * gy) * 2.0, 1.4));
          E[q] = 69; E[q + 1] = 227; E[q + 2] = 240; E[q + 3] = m * 255;
        }
        iron(heat[k], Tt, q);
        var v = Math.min(1, Math.pow(lum[k], 0.75) * 1.18);
        R[q] = v * 228; R[q + 1] = v * 255; R[q + 2] = v * 236; R[q + 3] = 255;
      }
    }
    edges = toCanvas(eImg); thermal = toCanvas(tImg, 'blur(0.8px)'); ir = toCanvas(rImg);

    scan = document.createElement('canvas'); scan.width = 4; scan.height = 4;
    var sg = scan.getContext('2d'); sg.fillStyle = 'rgba(0,0,0,0.28)'; sg.fillRect(0, 0, 4, 1);
  }
  function toCanvas(img, filter) {
    var c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    var g = c.getContext('2d');
    if (filter) {
      var tmp = document.createElement('canvas'); tmp.width = img.width; tmp.height = img.height;
      tmp.getContext('2d').putImageData(img, 0, 0);
      g.filter = filter; g.drawImage(tmp, 0, 0);
    } else g.putImageData(img, 0, 0);
    return c;
  }

  /* ---------- layout: object-fit cover, with a gentle parallax ---------- */
  var W = 1, H = 1, dpr = 1;
  var rect = { x: 0, y: 0, w: 1, h: 1 };
  var POS_X = 0.5, POS_Y = 0.82, PARA = 1.05;
  var para = { x: 0, y: 0, tx: 0, ty: 0 };
  function layout() {
    var r = stage.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    // mirror CSS exactly: object-fit cover + object-position, then scale(PARA) about the centre
    var op = (getComputedStyle(photo).objectPosition || '50% 82%').split(' ');
    if (op.length === 2 && /%$/.test(op[0]) && /%$/.test(op[1])) { POS_X = parseFloat(op[0]) / 100; POS_Y = parseFloat(op[1]) / 100; }
    var iw = photo.naturalWidth || 2400, ih = photo.naturalHeight || 1601;
    var s = Math.max(W / iw, H / ih);
    var cw = iw * s, ch = ih * s, cx0 = (W - cw) * POS_X, cy0 = (H - ch) * POS_Y;
    rect.w = cw * PARA; rect.h = ch * PARA;
    rect.x = W / 2 + (cx0 - W / 2) * PARA; rect.y = H / 2 + (cy0 - H / 2) * PARA;
    R = Math.max(96, Math.min(210, Math.min(W, H) * 0.17));
  }
  function u2x(u) { return rect.x + para.x + u * rect.w; }
  function v2y(v) { return rect.y + para.y + v * rect.h; }

  /* ---------- lens state ---------- */
  var R = 160, Z = 1.9;
  var lens = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 };
  var pointer = { on: false, last: 0 };
  var tour = { i: 0, t: 0 };
  var mode = 0, modeFade = 1, ringRot = 0;
  var hinted = false;

  /* ---------- keep the lens's own tour clear of the headline block ---------- */
  var block = null, blockAt = 0;
  function textBlock() {
    var now = performance.now();
    if (block && now - blockAt < 1000) return block;
    blockAt = now;
    var sr = stage.getBoundingClientRect(), b = null;
    Array.prototype.forEach.call(hero.querySelectorAll('.hero__title .line, .hero__lede, .hero__ctas > *'), function (el) {
      var r = el.getBoundingClientRect();
      if (!r.width) return;
      if (el.classList.contains('line')) { var span = el.firstElementChild; if (span) { var rs = span.getBoundingClientRect(); r = { left: rs.left, right: rs.right, top: r.top, bottom: r.bottom }; } }
      b = b ? { x0: Math.min(b.x0, r.left), y0: Math.min(b.y0, r.top), x1: Math.max(b.x1, r.right), y1: Math.max(b.y1, r.bottom) } : { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom };
    });
    block = b ? { x0: b.x0 - sr.left, y0: b.y0 - sr.top, x1: b.x1 - sr.left, y1: b.y1 - sr.top } : null;
    return block;
  }
  function hitsBlock(x, y, r) {
    var b = textBlock();
    if (!b) return false;
    var nx = Math.max(b.x0, Math.min(x, b.x1)), ny = Math.max(b.y0, Math.min(y, b.y1));
    return Math.hypot(x - nx, y - ny) < r;
  }
  function rectHitsBlock(x0, y0, x1, y1) {
    var b = textBlock();
    return !!b && x0 < b.x1 && x1 > b.x0 && y0 < b.y1 && y1 > b.y0;
  }
  function clearStop(from) {
    for (var k = 0; k < TOUR.length; k++) {
      var i = (from + k) % TOUR.length, p = TOUR[i];
      if (!hitsBlock(u2x(p[0]), v2y(p[1]), R * 0.95)) return i;
    }
    return from;
  }
  function tourTarget(dt) {
    tour.t += dt;
    var seg = 2.8; // move + hold
    if (tour.t > seg) { tour.t = 0; tour.i = clearStop((tour.i + 1) % TOUR.length); }
    var p = TOUR[tour.i];
    lens.tx = u2x(p[0]); lens.ty = v2y(p[1]);
  }

  stage.parentNode.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') return;
    var r = stage.getBoundingClientRect();
    lens.tx = e.clientX - r.left; lens.ty = e.clientY - r.top;
    pointer.on = true; pointer.last = performance.now();
    para.tx = -((lens.tx / W) - 0.5) * 18; para.ty = -((lens.ty / H) - 0.5) * 10;
    dismissHint();
  });
  stage.parentNode.addEventListener('pointerleave', function () { pointer.on = false; para.tx = 0; para.ty = 0; });
  stage.addEventListener('pointerdown', function (e) {
    var r = stage.getBoundingClientRect();
    lens.tx = e.clientX - r.left; lens.ty = e.clientY - r.top;
    pointer.on = true; pointer.last = performance.now();
    dismissHint();
  });
  function dismissHint() { hinted = true; }


  /* ---------- modes ---------- */
  var modesEl = hero.querySelector('[data-modes]');
  if (modesEl) {
    var pill = modesEl.querySelector('.modes__pill');
    var btns = Array.prototype.slice.call(modesEl.querySelectorAll('[data-mode]'));
    var place = function () {
      var on = btns.filter(function (b) { return b.getAttribute('aria-pressed') === 'true'; })[0] || btns[0];
      pill.style.width = on.offsetWidth + 'px';
      pill.style.transform = 'translateX(' + on.offsetLeft + 'px)';
    };
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        btns.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        place();
        mode = +b.getAttribute('data-mode'); api.mode = mode; modeFade = 0;
      });
    });
    place();
    window.addEventListener('resize', place);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(place);
  }

  /* ---------- drawing ---------- */
  var MODE_NAMES = ['AI VISION', 'THERMAL', 'NIGHT IR'];
  function draw(t) {
    var c = ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);

    // markers for everything the AI has found, outside the lens
    OBJECTS.forEach(function (o) {
      var cx = u2x((o.x0 + o.x1) / 2), cy = v2y((o.y0 + o.y1) / 2);
      var d = Math.hypot(cx - lens.x, cy - lens.y);
      if (d < R) return;
      c.globalAlpha = o.seen ? 0.85 : 0.4;
      c.fillStyle = COLORS[o.type];
      c.beginPath(); c.arc(cx, cy, o.seen ? 2.6 : 1.8, 0, 6.2832); c.fill();
    });
    c.globalAlpha = 1;

    // the lens: magnified sensor view of the street
    var u0 = (lens.x - rect.x - para.x) / rect.w, v0 = (lens.y - rect.y - para.y) / rect.h;
    var su = R / (rect.w * Z), sv = R / (rect.h * Z);
    c.save();
    c.beginPath(); c.arc(lens.x, lens.y, R, 0, 6.2832); c.clip();
    c.fillStyle = '#000'; c.fillRect(lens.x - R, lens.y - R, R * 2, R * 2);
    var srcs = [photo, thermal, ir];
    var src = srcs[mode] || photo;
    var sw = src === photo ? (photo.naturalWidth || 2400) : src.width, sh = src === photo ? (photo.naturalHeight || 1601) : src.height;
    if (mode === 0) c.filter = 'brightness(1.06) contrast(1.12) saturate(0.9)';
    c.drawImage(src, (u0 - su) * sw, (v0 - sv) * sh, su * 2 * sw, sv * 2 * sh, lens.x - R, lens.y - R, R * 2, R * 2);
    c.filter = 'none';
    if (mode === 0 && edges) {
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.4;
      c.drawImage(edges, (u0 - su) * PW, (v0 - sv) * PH, su * 2 * PW, sv * 2 * PH, lens.x - R, lens.y - R, R * 2, R * 2);
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
    }
    if (modeFade < 1) { c.fillStyle = 'rgba(255,255,255,' + (0.35 * (1 - modeFade)) + ')'; c.fillRect(lens.x - R, lens.y - R, R * 2, R * 2); }
    if (scan) { c.fillStyle = c.createPattern(scan, 'repeat'); c.fillRect(lens.x - R, lens.y - R, R * 2, R * 2); }

    // detection boxes, magnified with the view
    var inside = 0;
    c.font = '500 10px "JetBrains Mono", ui-monospace, monospace';
    c.textBaseline = 'middle';
    OBJECTS.forEach(function (o) {
      var bx0 = lens.x + (o.x0 - u0) * rect.w * Z, by0 = lens.y + (o.y0 - v0) * rect.h * Z;
      var bx1 = lens.x + (o.x1 - u0) * rect.w * Z, by1 = lens.y + (o.y1 - v0) * rect.h * Z;
      var cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2;
      var inLens = Math.hypot(cx - lens.x, cy - lens.y) < R * 0.86;
      o.lock += ((inLens ? 1 : 0) - o.lock) * 0.16;
      if (inLens) { inside++; if (!o.seen) { o.seen = true; tally(); } }
      if (o.lock < 0.02) return;
      var col = mode === 1 ? '#ffffff' : COLORS[o.type];
      var grow = (1 - o.lock) * 14;
      var x0 = bx0 - grow, y0 = by0 - grow, x1 = bx1 + grow, y1 = by1 + grow;
      var L = Math.max(5, Math.min(14, (x1 - x0) * 0.25, (y1 - y0) * 0.3));
      c.globalAlpha = o.lock;
      c.strokeStyle = col; c.lineWidth = 1.6;
      c.shadowColor = col; c.shadowBlur = 6;
      c.beginPath();
      c.moveTo(x0, y0 + L); c.lineTo(x0, y0); c.lineTo(x0 + L, y0);
      c.moveTo(x1 - L, y0); c.lineTo(x1, y0); c.lineTo(x1, y0 + L);
      c.moveTo(x1, y1 - L); c.lineTo(x1, y1); c.lineTo(x1 - L, y1);
      c.moveTo(x0 + L, y1); c.lineTo(x0, y1); c.lineTo(x0, y1 - L);
      c.stroke();
      c.shadowBlur = 0;
      c.globalAlpha = o.lock * 0.12; c.fillStyle = col; c.fillRect(x0, y0, x1 - x0, y1 - y0);
      c.globalAlpha = o.lock;
      var txt = o.label + (o.type === 'ppl' && o.n > 1 ? '' : ' ' + o.conf.toFixed(2));
      var tw = c.measureText(txt).width + 10;
      c.fillStyle = col; c.fillRect(x0, y0 - 16, tw, 15);
      c.fillStyle = '#04090c'; c.fillText(txt, x0 + 5, y0 - 8.5);
      c.globalAlpha = 1;
    });
    c.restore();

    // lens ring, ticks and readout
    c.strokeStyle = 'rgba(236,232,225,0.85)'; c.lineWidth = 1.5;
    c.beginPath(); c.arc(lens.x, lens.y, R, 0, 6.2832); c.stroke();
    c.save();
    c.translate(lens.x, lens.y); c.rotate(ringRot);
    c.strokeStyle = 'rgba(69,227,240,0.7)'; c.lineWidth = 1;
    for (var i = 0; i < 72; i++) {
      var a = i / 72 * 6.2832, long = i % 6 === 0;
      c.beginPath();
      c.moveTo(Math.cos(a) * (R + 6), Math.sin(a) * (R + 6));
      c.lineTo(Math.cos(a) * (R + (long ? 15 : 10)), Math.sin(a) * (R + (long ? 15 : 10)));
      c.stroke();
    }
    c.restore();
    // centre reticle
    c.strokeStyle = 'rgba(236,232,225,0.6)'; c.lineWidth = 1;
    c.beginPath();
    c.moveTo(lens.x - 9, lens.y); c.lineTo(lens.x - 3, lens.y); c.moveTo(lens.x + 3, lens.y); c.lineTo(lens.x + 9, lens.y);
    c.moveTo(lens.x, lens.y - 9); c.lineTo(lens.x, lens.y - 3); c.moveTo(lens.x, lens.y + 3); c.lineTo(lens.x, lens.y + 9);
    c.stroke();
    // readout chip on the ring
    var label = Z.toFixed(1) + '× · ' + MODE_NAMES[mode] + ' · ' + inside + (inside === 1 ? ' OBJECT' : ' OBJECTS');
    c.font = '500 10px "JetBrains Mono", ui-monospace, monospace';
    var lw = c.measureText(label).width + 16;
    var ang = -0.78, rx = lens.x + Math.cos(ang) * (R + 22), ry = lens.y + Math.sin(ang) * (R + 22);
    if (rx + lw > W - 10) { ang = -2.36; rx = lens.x + Math.cos(ang) * (R + 22) - lw; ry = lens.y + Math.sin(ang) * (R + 22); }
    rx = Math.max(10, rx);
    c.fillStyle = 'rgba(6,7,8,0.82)';
    roundRect(c, rx, ry - 11, lw, 22, 11); c.fill();
    c.strokeStyle = 'rgba(69,227,240,0.45)'; c.stroke();
    c.fillStyle = '#ece8e1'; c.fillText(label, rx + 8, ry + 0.5);
    if (!hinted) {
      var hintTxt = touch ? 'TAP THE STREET TO SCAN' : 'MOVE TO SCAN THE STREET';
      var hw = c.measureText(hintTxt).width + 30, hy = lens.y - R - 34;
      var hx = Math.max(10, Math.min(W - hw - 10, lens.x - hw / 2));
      // never sit on the headline: drop below the lens, or skip if there is no room
      if (rectHitsBlock(hx, hy - 13, hx + hw, hy + 13)) hy = lens.y + R + 34;
      if (hy + 13 > H - 96 && rectHitsBlock(hx, lens.y - R - 47, hx + hw, lens.y - R - 21)) hy = -999;
      c.globalAlpha = 0.82 + 0.18 * Math.sin(t / 380);
      c.fillStyle = 'rgba(236,232,225,0.95)';
      roundRect(c, hx, hy - 13, hw, 26, 13); c.fill();
      c.fillStyle = '#050607'; c.fillText(hintTxt, hx + 15, hy + 0.5);
      c.globalAlpha = 1;
    }
  }
  function roundRect(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  function tally() {
    var v = 0, p = 0, pl = 0;
    OBJECTS.forEach(function (o) { if (!o.seen) return; if (o.type === 'veh') v++; else if (o.type === 'ppl') p += o.n; else if (o.type === 'plate') pl++; });
    set(outVeh, v, 'vehicle', 'vehicles'); set(outPpl, p, 'person', 'people'); set(outPlates, pl, 'plate', 'plates');
  }
  function set(b, n, one, many) {
    b.textContent = n;
    if (b.nextSibling) b.nextSibling.textContent = ' ' + (n === 1 ? one : many);
  }

  /* ---------- loop ---------- */
  var running = false, visible = true, last = 0;
  function frame(now) {
    if (!visible || document.hidden) { running = false; return; }
    running = true;
    var dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
    if (!pointer.on || now - pointer.last > 3200) { pointer.on = false; if (!reduce) tourTarget(dt); }
    var k = reduce ? 1 : 1 - Math.exp(-dt * 7.5);
    lens.x += (lens.tx - lens.x) * k; lens.y += (lens.ty - lens.y) * k;
    para.x += (para.tx - para.x) * 0.06; para.y += (para.ty - para.y) * 0.06;
    photo.style.transform = 'translate3d(' + para.x.toFixed(2) + 'px,' + para.y.toFixed(2) + 'px,0) scale(' + PARA + ')';
    ringRot += dt * 0.12;
    modeFade = Math.min(1, modeFade + dt * 3);
    draw(now);
    requestAnimationFrame(frame);
  }
  function start() { if (!running && visible && !document.hidden && api.ready) { last = performance.now(); requestAnimationFrame(frame); } }
  if ('IntersectionObserver' in window) new IntersectionObserver(function (en) { visible = en[0].isIntersecting; start(); }, { threshold: 0.01 }).observe(hero);
  document.addEventListener('visibilitychange', start);
  window.addEventListener('resize', function () { layout(); block = null; });

  function init() {
    try { buildSensors(); } catch (e) { console.error(e); }
    layout();
    tour.i = clearStop(0);
    var p0 = TOUR[tour.i];
    lens.x = lens.tx = u2x(p0[0]); lens.y = lens.ty = v2y(p0[1]);
    if (reduce) { lens.x = lens.tx = u2x(0.86); lens.y = lens.ty = v2y(0.82); }
    api.ready = true;
    hero.classList.add('has-lens');
    emit('sentra:ready', { lens: true });
    start();
  }
  if (photo.complete && photo.naturalWidth) init();
  else { photo.addEventListener('load', init, { once: true }); photo.addEventListener('error', function () { api.ready = true; emit('sentra:ready', { lens: false }); }, { once: true }); }
})();
