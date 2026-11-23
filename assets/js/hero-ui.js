/* ==========================================================================
   Hero UI: listens to the 3D scene and drives the control-room chrome:
   the live event log, the site minimap, phone notifications, the sensor
   mode switch and the PTZ readouts.
   ========================================================================== */
(function () {
  'use strict';

  var hero = document.querySelector('[data-hero]');
  if (!hero) return;

  var log = hero.querySelector('[data-log]');
  var status = hero.querySelector('[data-console-status]');
  var notify = hero.querySelector('[data-notify]');
  var notifyText = hero.querySelector('[data-notify-text]');
  var ptz = hero.querySelector('[data-hud-ptz]');
  var hudMode = hero.querySelector('[data-hud-mode]');
  var hudTrack = hero.querySelector('[data-hud-track]');
  var modes = hero.querySelector('[data-modes]');
  var mm = hero.querySelector('[data-minimap]');

  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function clock() { var d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); }

  /* ---------- event log ---------- */
  var statusT = 0, notifyT = 0;
  document.addEventListener('sentra:event', function (e) {
    var d = e.detail || {};
    if (log) {
      var li = document.createElement('li');
      li.className = d.level || 'info';
      var dot = document.createElement('i');
      var time = document.createElement('time');
      time.textContent = clock();
      var txt = document.createElement('span');
      txt.textContent = d.text;
      li.appendChild(dot); li.appendChild(time); li.appendChild(txt);
      log.insertBefore(li, log.firstChild);
      while (log.children.length > 4) log.removeChild(log.lastChild);
    }
    if (status && (d.level === 'warn' || d.level === 'ok')) {
      status.textContent = d.level === 'warn' ? 'Attention' : 'Verified';
      status.classList.toggle('is-warn', d.level === 'warn');
      clearTimeout(statusT);
      statusT = setTimeout(function () { status.textContent = 'All clear'; status.classList.remove('is-warn'); }, 6500);
    }
    if (d.notify && notify) {
      notifyText.textContent = 'Courier detected. A package was left on the porch. Tap to talk.';
      notify.classList.add('is-on');
      clearTimeout(notifyT);
      notifyT = setTimeout(function () { notify.classList.remove('is-on'); }, 5200);
    }
  });

  /* ---------- sensor modes ---------- */
  var MODE_NAMES = ['NIGHT COLOUR', 'INFRARED · 850nm', 'THERMAL · IRONBOW'];
  if (modes) {
    var pill = modes.querySelector('.modes__pill');
    var btns = Array.prototype.slice.call(modes.querySelectorAll('[data-mode]'));
    var placePill = function () {
      var on = btns.filter(function (b) { return b.getAttribute('aria-pressed') === 'true'; })[0] || btns[0];
      pill.style.width = on.offsetWidth + 'px';
      pill.style.transform = 'translateX(' + on.offsetLeft + 'px)';
    };
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        var i = +b.getAttribute('data-mode');
        btns.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        placePill();
        if (window.SentraScene && window.SentraScene.setMode) window.SentraScene.setMode(i);
        if (hudMode) hudMode.textContent = MODE_NAMES[i];
      });
    });
    placePill();
    window.addEventListener('resize', placePill);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(placePill);
  }

  /* ---------- pause / play (motion that runs longer than 5s must be pausable) ---------- */
  var pauseBtn = hero.querySelector('[data-pause]');
  if (pauseBtn) {
    var pauseLabel = pauseBtn.querySelector('[data-pause-label]');
    var setPaused = function (p) {
      pauseBtn.setAttribute('aria-pressed', String(p));
      pauseLabel.textContent = p ? 'Play feed' : 'Pause feed';
      pauseBtn.setAttribute('aria-label', p ? 'Play the live demo' : 'Pause the live demo');
      if (window.SentraScene && window.SentraScene.setPaused) window.SentraScene.setPaused(p);
    };
    pauseBtn.addEventListener('click', function () { setPaused(pauseBtn.getAttribute('aria-pressed') !== 'true'); });
    // visitors who ask for less motion get a still frame until they press play
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.addEventListener('sentra:ready', function () { setTimeout(function () { setPaused(true); }, 600); });
    }
  }

  /* ---------- minimap ---------- */
  var NS = 'http://www.w3.org/2000/svg';
  var S = 6.9;
  function mx(x) { return 44 + (x + 15) * S; }
  function mz(z) { return (z + 14.8) * S; }
  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    (parent || mm).appendChild(e);
    return e;
  }
  function rect(x0, x1, z0, z1, cls) {
    return el('rect', { x: mx(x0).toFixed(1), y: mz(z0).toFixed(1), width: ((x1 - x0) * S).toFixed(1), height: ((z1 - z0) * S).toFixed(1), 'class': cls, rx: 1.5 });
  }
  var cone, camDot, person, trailLine, parcel, zone, trail = [];
  if (mm) {
    el('rect', { x: 0, y: 0, width: 280, height: 200, fill: '#07090b' });
    var grid = el('g', { opacity: 0.5 });
    for (var gx = 0; gx <= 280; gx += 20) el('path', { d: 'M' + gx + ' 0V200', stroke: 'rgba(236,232,225,.04)' }, grid);
    for (var gz = 0; gz <= 200; gz += 20) el('path', { d: 'M0 ' + gz + 'H280', stroke: 'rgba(236,232,225,.04)' }, grid);
    rect(-14, 14, -14.6, 14, 'mm-bound');
    var path = [[15.6, 7.0], [12.6, 7.0], [9.6, 6.6], [6.0, 5.6], [4.6, 2.6], [3.9, -0.8], [3.5, -3.0], [3.5, -4.55]];
    el('polyline', { points: path.map(function (p) { return mx(p[0]).toFixed(1) + ',' + mz(p[1]).toFixed(1); }).join(' '), 'class': 'mm-path' });
    rect(-7.6, 9.8, -12.6, -4.4, 'mm-house');
    rect(-11.8, -6.6, -4.2, -0.6, 'mm-pool');
    zone = rect(1.4, 5.4, -6.1, -2.4, 'mm-zone');
    rect(6.6, 8.6, 0.05, 4.75, 'mm-car');
    var lbl = el('text', { x: mx(-6.8), y: mz(-11.2), 'class': 'mm-label' }); lbl.textContent = 'RESIDENCE';
    var lbl2 = el('text', { x: mx(10.2), y: mz(10.4), 'class': 'mm-label' }); lbl2.textContent = 'EAST GATE';
    cone = el('polygon', { 'class': 'mm-cone' });
    trailLine = el('polyline', { 'class': 'mm-trail' });
    parcel = el('rect', { width: 4, height: 4, 'class': 'mm-parcel', opacity: 0 });
    person = el('circle', { r: 3.4, 'class': 'mm-person', opacity: 0 });
    camDot = el('circle', { cx: mx(-13.2), cy: mz(12.4), r: 3.2, 'class': 'mm-cam' });
  }

  document.addEventListener('sentra:tick', function (e) {
    var d = e.detail;
    if (ptz) ptz.textContent = 'PAN ' + (d.pan >= 0 ? '+' : '') + d.pan.toFixed(1) + '° · TILT ' + d.tilt.toFixed(1) + '° · ' + d.zoom.toFixed(1) + '×';
    if (hudTrack) hudTrack.textContent = d.tracking ? 'AUTO-TRACK · LOCKED' : 'PATROL';
    if (!mm) return;

    // field-of-view cone from the camera toward the look point
    var cx = mx(d.cam.x), cz = mz(d.cam.z);
    var ang = Math.atan2(mz(d.look.z) - cz, mx(d.look.x) - cx);
    var half = Math.min(1.0, (d.fov * Math.PI / 180) / 2);
    var L = 260;
    cone.setAttribute('points', [cx, cz, cx + Math.cos(ang - half) * L, cz + Math.sin(ang - half) * L, cx + Math.cos(ang + half) * L, cz + Math.sin(ang + half) * L].map(function (n) { return n.toFixed(1); }).join(' '));

    if (d.person) {
      var px = mx(d.person.x), pz = mz(d.person.z);
      person.setAttribute('cx', px.toFixed(1)); person.setAttribute('cy', pz.toFixed(1));
      person.setAttribute('opacity', 1);
      var inZone = d.person.x > 1.4 && d.person.x < 5.4 && d.person.z < -2.4 && d.person.z > -6.1;
      var cls = d.person.kind === 'resident' ? ' is-ok' : inZone ? ' is-warn' : '';
      person.setAttribute('class', 'mm-person' + cls);
      zone.setAttribute('class', 'mm-zone' + (inZone ? cls : ''));
      var last = trail[trail.length - 1];
      if (!last || Math.hypot(last[0] - px, last[1] - pz) > 2) { trail.push([px, pz]); if (trail.length > 40) trail.shift(); }
      trailLine.setAttribute('points', trail.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '));
    } else {
      person.setAttribute('opacity', 0);
      zone.setAttribute('class', 'mm-zone');
      if (trail.length) { trail = []; trailLine.setAttribute('points', ''); }
    }
    if (d.parcel) {
      parcel.setAttribute('x', (mx(d.parcel.x) - 2).toFixed(1)); parcel.setAttribute('y', (mz(d.parcel.z) - 2).toFixed(1));
      parcel.setAttribute('opacity', 1);
    } else parcel.setAttribute('opacity', 0);
  });
})();
