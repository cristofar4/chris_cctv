/* ==========================================================================
   Railcam navigation

   A PTZ dome camera hangs from a rail along the top edge of the nav.
   - It rides the rail on a spring, so it overshoots and settles like
     real hardware. The head swings like a pendulum when it brakes.
   - The lens follows the pointer wherever it is on the page.
   - The camera casts a light cone. Only the part of the menu inside the
     cone is lit (a masked copy of the links), so labels light up as the
     beam sweeps across them.
   - Hover a link and the camera drives over, focus-locks (corner
     brackets snap in) and drops a live preview monitor for that section.
   - With nothing hovered it runs a slow guard tour across the links.
     Once you scroll into a section it parks over that section's link.
   - When the nav compacts, a DVR scrub bar shows where you are in the
     page as recorded footage. Drag it to scrub.
   - Every nav jump is a camera cut through a full-screen iris shutter.
   ========================================================================== */
(function () {
  'use strict';

  var FX = window.SentraFX;
  var nav = document.querySelector('[data-nav]');
  if (!nav) return;
  var shell = nav.querySelector('.nav__shell');
  var rc = nav.querySelector('[data-railcam]');
  var reduce = function () { return FX && FX.reducedMotion(); };

  /* ======================================================================
     Nav state: top / compact
     ====================================================================== */
  var measureUntil = 0;
  function setNavState() {
    var compact = window.scrollY > 24;
    var next = compact ? 'compact' : 'top';
    if (nav.getAttribute('data-state') !== next) {
      nav.setAttribute('data-state', next);
      measureUntil = performance.now() + 900;
      wake();
    }
  }

  /* ======================================================================
     Railcam
     ====================================================================== */
  var list, lit, links = [], rig, swing, lens, beam, beamCore, pool, lock;
  var CAM_PX = 56 / 44; // rendered camera size / SVG viewBox width
  var sections = [];
  var M = [];          // link metrics relative to the railcam box
  var RC = { left: 0, top: 0, w: 0, h: 0 };
  var camScale = 1;

  var S = {
    x: 0, v: 0,                 // carriage position & velocity (px, px/s)
    ang: 0, av: 0,              // head swing (deg)
    lx: 0, lvx: 0, ly: 0, lvy: 0, // lens offset
    bw: 30, bwv: 0,             // beam footprint width
    bi: 0.5,                    // beam intensity 0..1
    ready: false
  };
  var hoverIdx = -1, focusIdx = -1, activeIdx = -1;
  var pointer = { x: 0, y: 0, has: false };
  var patrol = { idx: -1, until: 0 };
  var lockedIdx = -1;
  var running = false, last = 0, restFrames = 0;

  if (rc) initRailcam();

  function initRailcam() {
    list = rc.querySelector('[data-railcam-list]');
    lit = rc.querySelector('[data-railcam-lit]');
    links = Array.prototype.slice.call(list.querySelectorAll('.railcam__link'));
    rig = rc.querySelector('.railcam__rig');
    swing = rc.querySelector('.railcam__swing');
    lens = rc.querySelector('.railcam__lens');
    beam = rc.querySelector('.railcam__beam');
    beamCore = beam.firstElementChild;
    pool = rc.querySelector('.railcam__pool');
    lock = rc.querySelector('.railcam__lock');

    // Lit copy of the list: same layout, plain spans, never focusable.
    var copy = list.cloneNode(true);
    copy.removeAttribute('data-railcam-list');
    Array.prototype.forEach.call(copy.querySelectorAll('a'), function (a) {
      var s = document.createElement('span');
      s.className = a.className;
      s.textContent = a.textContent;
      a.parentNode.replaceChild(s, a);
    });
    lit.appendChild(copy);

    sections = links.map(function (a) { return document.querySelector(a.getAttribute('href')); });

    links.forEach(function (a, i) {
      a.addEventListener('pointerenter', function (e) {
        if (e.pointerType === 'touch') return;
        hoverIdx = i; wake();
      });
      a.addEventListener('focus', function () { focusIdx = i; wake(); });
      a.addEventListener('blur', function () { if (focusIdx === i) focusIdx = -1; wake(); });
    });
    rc.addEventListener('pointerleave', function () { hoverIdx = -1; wake(); });

    window.addEventListener('pointermove', function (e) {
      pointer.x = e.clientX; pointer.y = e.clientY; pointer.has = true;
      wake();
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', function () { pointer.has = false; wake(); });

    window.addEventListener('resize', function () { measureUntil = performance.now() + 300; wake(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { measureUntil = performance.now() + 300; wake(); });
    shell.addEventListener('transitionrun', function () { measureUntil = performance.now() + 900; wake(); });

    measureUntil = performance.now() + 500;
    wake();
  }

  function measure() {
    var r = rc.getBoundingClientRect();
    RC.left = r.left; RC.top = r.top; RC.w = r.width; RC.h = r.height;
    camScale = (parseFloat(getComputedStyle(shell).getPropertyValue('--cam-scale')) || 1) * CAM_PX;
    M = links.map(function (a) {
      var lr = a.getBoundingClientRect();
      var range = a._range || (a._range = document.createRange());
      range.selectNodeContents(a);
      var tr = range.getBoundingClientRect();
      return {
        cx: tr.left - r.left + tr.width / 2,
        tl: tr.left - r.left, tt: tr.top - r.top, tw: tr.width, th: tr.height,
        ll: lr.left - r.left, lw: lr.width
      };
    });
  }

  function targetIdx() {
    if (hoverIdx >= 0) return hoverIdx;
    if (focusIdx >= 0) return focusIdx;
    return activeIdx;
  }

  function wake() {
    restFrames = 0;
    if (!running) { running = true; last = performance.now(); requestAnimationFrame(tick); }
  }

  function spring(pos, vel, target, k, zeta, dt) {
    var c = 2 * Math.sqrt(k) * zeta;
    var a = k * (target - pos) - c * vel;
    vel += a * dt;
    pos += vel * dt;
    return [pos, vel, a];
  }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function tick(now) {
    var dt = Math.min(0.034, Math.max(0.001, (now - last) / 1000));
    last = now;

    var railcamVisible = rc && rc.offsetParent !== null;
    if (railcamVisible) {
      if (now < measureUntil || !M.length) measure();
      stepRailcam(now, dt);
    }
    stepFeed(now);

    // Sleep once everything is at rest (patrol keeps us awake).
    var moving = railcamVisible && (Math.abs(S.v) > 0.5 || Math.abs(S.av) > 0.05 || Math.abs(S.lvx) > 0.02 || Math.abs(S.bwv) > 0.3 || targetIdx() < 0);
    if (moving || feedOn || now < measureUntil) restFrames = 0; else restFrames++;
    if (restFrames > 20) { running = false; return; }
    requestAnimationFrame(tick);
  }

  function stepRailcam(now, dt) {
    var ti = targetIdx();
    var mode = hoverIdx >= 0 ? 'hover' : focusIdx >= 0 ? 'focus' : ti >= 0 ? 'park' : 'patrol';
    var rm = reduce();

    // Guard tour when nothing is targeted.
    if (mode === 'patrol') {
      if (patrol.idx < 0 || (now > patrol.until && !rm)) {
        patrol.idx = (patrol.idx + 1) % links.length;
        patrol.until = now + 2800;
      }
    } else {
      patrol.idx = ti; patrol.until = now + 1200;
    }
    var idx = mode === 'patrol' ? patrol.idx : ti;
    var m = M[idx];
    if (!m) return;
    var tx = m.cx;

    if (!S.ready) { S.x = tx; S.ready = true; }

    // Carriage: lazy and smooth on patrol, snappy with overshoot on hover.
    var r;
    if (rm) { S.x = tx; S.v = 0; }
    else {
      r = mode === 'patrol' ? spring(S.x, S.v, tx, 26, 1.0, dt) : spring(S.x, S.v, tx, 230, 0.58, dt);
      S.x = r[0]; S.v = r[1];
    }

    // Head swing: leans against the motion, then rocks when it brakes.
    var swingTarget = rm ? 0 : clamp(-S.v * 0.05, -28, 28);
    r = spring(S.ang, S.av, swingTarget, 120, 0.16, dt);
    S.ang = r[0]; S.av = r[1];

    // Lens: watches the pointer, or the target link.
    var lensY0 = 20 * camScale;
    var dx, dy;
    if (pointer.has && mode !== 'focus') {
      dx = pointer.x - (RC.left + S.x);
      dy = pointer.y - (RC.top + lensY0);
    } else {
      dx = tx - S.x; dy = RC.h / 2 - lensY0;
    }
    var lxT = 4.4 * dx / (Math.abs(dx) + 110);
    var lyT = clamp(2.4 * dy / (Math.abs(dy) + 60), -1.6, 2.4);
    r = spring(S.lx, S.lvx, lxT, 340, 0.72, dt); S.lx = r[0]; S.lvx = r[1];
    r = spring(S.ly, S.lvy, lyT, 340, 0.72, dt); S.ly = r[0]; S.lvy = r[1];

    // Beam width: tight while travelling, opens to frame the label once settled.
    var dist = Math.abs(tx - S.x);
    var settled = dist < 2.5 && Math.abs(S.v) < 40;
    var near = dist < 30;
    var bwT;
    if (mode === 'patrol') bwT = near ? m.tw + 8 : 22;
    else bwT = settled ? m.tw + 26 : near ? m.tw : 24 + Math.min(Math.abs(S.v) * 0.02, 24);
    r = rm ? [bwT, 0] : spring(S.bw, S.bwv, bwT, 210, 0.8, dt);
    S.bw = Math.max(10, r[0]); S.bwv = r[1];

    var biT = mode === 'hover' || mode === 'focus' ? 1 : mode === 'park' ? 0.8 : near ? 0.6 : 0.42;
    S.bi += (biT - S.bi) * Math.min(1, dt * 8);

    // Focus lock + live feed
    var wantLock = (mode === 'hover' || mode === 'focus') && settled ? idx : -1;
    if (wantLock !== lockedIdx) setLock(wantLock);
    if (mode === 'hover' && wantLock >= 0) showFeed(idx); else if (mode !== 'hover') hideFeed();

    // ---- write ----
    var s = camScale;
    var rad = S.ang * Math.PI / 180;
    var cos = Math.cos(rad), sin = Math.sin(rad);
    // lens centre after scale (about top-centre) and swing (about the stem pivot)
    var pivotY = 7 * s;
    var ldx = S.lx * s, ldy = (20 + S.ly) * s - pivotY;
    var ox = S.x + ldx * cos - ldy * sin;
    var oy = pivotY + ldx * sin + ldy * cos;
    var footY = RC.h / 2 + 22;
    var bx = ox - Math.tan(rad) * (footY - oy) + S.lx * 1.6;
    var half = S.bw / 2;

    rig.style.transform = 'translate3d(' + (S.x - 28).toFixed(2) + 'px,0,0)';
    swing.setAttribute('transform', 'rotate(' + S.ang.toFixed(2) + ' 22 7)');
    lens.setAttribute('transform', 'translate(' + S.lx.toFixed(2) + ' ' + S.ly.toFixed(2) + ')');
    beamCore.style.clipPath = 'polygon(' +
      (ox - 2.2).toFixed(1) + 'px ' + oy.toFixed(1) + 'px,' +
      (ox + 2.2).toFixed(1) + 'px ' + oy.toFixed(1) + 'px,' +
      (bx + half).toFixed(1) + 'px ' + footY.toFixed(1) + 'px,' +
      (bx - half).toFixed(1) + 'px ' + footY.toFixed(1) + 'px)';
    beam.style.opacity = (0.3 + 0.7 * S.bi).toFixed(3);
    pool.style.transform = 'translate3d(' + (bx - half * 1.25).toFixed(1) + 'px,0,0) scaleX(' + (S.bw * 1.25 / 100).toFixed(3) + ')';
    pool.style.opacity = S.bi.toFixed(3);
    rc.style.setProperty('--bl', (bx - half).toFixed(1) + 'px');
    rc.style.setProperty('--br', (bx + half).toFixed(1) + 'px');
    rc.style.setProperty('--li', (0.35 + 0.65 * S.bi).toFixed(3));
    rc.style.setProperty('--cx', S.x.toFixed(1) + 'px');
  }

  function setLock(idx) {
    lockedIdx = idx;
    if (idx < 0) { lock.classList.remove('is-on'); return; }
    var m = M[idx];
    lock.style.left = (m.tl - 10).toFixed(1) + 'px';
    lock.style.top = (m.tt - 7).toFixed(1) + 'px';
    lock.style.width = (m.tw + 20).toFixed(1) + 'px';
    lock.style.height = (m.th + 14).toFixed(1) + 'px';
    lock.classList.remove('is-on');
    void lock.offsetWidth; // restart the snap animation
    lock.classList.add('is-on');
  }

  /* ======================================================================
     Live feed preview
     ====================================================================== */
  var feed = nav.querySelector('[data-feed]');
  var feedOn = false, feedIdx = -1, feedHideT = 0, feedShowT = 0;
  var feedImg, feedTitle, feedNote, feedTc, feedCh, feedStatic;
  if (feed) {
    feedImg = feed.querySelector('.feed__img');
    feedTitle = feed.querySelector('[data-feed-title]');
    feedNote = feed.querySelector('[data-feed-note]');
    feedTc = feed.querySelector('[data-feed-tc]');
    feedCh = feed.querySelector('.feed__ch');
    feedStatic = feed.querySelector('.feed__static');
    // warm the images so channel switches are instant
    links.forEach(function (a) { var i = new Image(); i.src = a.getAttribute('data-feed-img'); });
  }

  function showFeed(idx) {
    if (!feed) return;
    if (feedHideT) { clearTimeout(feedHideT); feedHideT = 0; }
    if (feedIdx !== idx) {
      var a = links[idx];
      var first = feedIdx < 0 || !feedOn;
      feedIdx = idx;
      var swap = function () {
        feedImg.src = a.getAttribute('data-feed-img');
        feedTitle.textContent = a.getAttribute('data-name') || a.textContent;
        feedNote.textContent = a.getAttribute('data-feed-note') || '';
        feedCh.textContent = 'CH-' + (a.getAttribute('data-ch') || '00');
        scramble(feedTitle);
      };
      if (first) swap();
      else { FX && FX.noise(feedStatic, { duration: 260, from: 1 }); setTimeout(swap, 70); }
    }
    if (!feedOn && !feedShowT) {
      feedShowT = setTimeout(function () {
        feedShowT = 0;
        if (hoverIdx < 0) return;
        feedOn = true;
        feed.classList.add('is-on');
        FX && FX.noise(feedStatic, { duration: 340, from: 0.9 });
        wake();
      }, 140);
    }
  }

  function hideFeed() {
    if (!feed) return;
    if (feedShowT) { clearTimeout(feedShowT); feedShowT = 0; }
    if (!feedOn || feedHideT) return; // already hidden, or a hide is pending
    feedHideT = setTimeout(function () {
      feedHideT = 0;
      if (hoverIdx >= 0) return; // pointer came back in time
      feedOn = false; feedIdx = -1;
      feed.classList.remove('is-on');
    }, 160);
  }

  function stepFeed(now) {
    if (!feed || !feedOn) return;
    var w = feed.offsetWidth;
    var fx = clamp(RC.left + S.x - w / 2, 12, window.innerWidth - w - 12);
    feed.style.setProperty('--fx', fx.toFixed(1) + 'px');
    var d = new Date();
    feedTc.textContent = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + ':' + pad(Math.floor(d.getMilliseconds() / 40));
  }

  var GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789/#%';
  function scramble(el) {
    var finalText = el.textContent;
    if (reduce()) return;
    var start = performance.now(), dur = 380;
    var token = (el._scr = (el._scr || 0) + 1);
    (function frame(now) {
      if (token !== el._scr) return;
      var t = Math.min(1, (now - start) / dur);
      var reveal = Math.floor(finalText.length * t);
      var out = '';
      for (var i = 0; i < finalText.length; i++) {
        var ch = finalText[i];
        out += i < reveal || ch === ' ' ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      el.textContent = out;
      if (t < 1) requestAnimationFrame(frame); else el.textContent = finalText;
    })(start);
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  // instant jump that cooperates with the smooth-scroll engine when present
  function jumpTo(t) {
    var S = window.SentraScroll;
    if (S && S.jump) { S.jump(t); return; }
    var y = typeof t === 'number' ? t : t.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: y, behavior: 'instant' });
  }

  /* ======================================================================
     Scroll spy + DVR scrub bar
     ====================================================================== */
  var dvr = nav.querySelector('[data-dvr]');
  function q(s) { return dvr && dvr.querySelector(s); }
  var dvrMarks = q('[data-dvr-marks]'), dvrTime = q('[data-dvr-time]'), dvrTrack = q('.dvr__track'), dvrGhost = q('[data-dvr-ghost]');
  var scope = q('[data-dvr-scope]'), scopeImg = q('[data-dvr-img]'), scopeStatic = q('[data-dvr-static]'), scopeCh = q('[data-dvr-ch]');
  var scopeName = q('[data-dvr-name]'), scopeMode = q('[data-dvr-mode]'), scopeProg = q('[data-dvr-chprog]');
  var drawer = q('[data-dvr-drawer]'), frameWrap = q('[data-dvr-frames]'), lane = q('[data-dvr-lane]');
  var band = q('[data-dvr-band]'), nowLine = q('[data-dvr-now]'), dTime = q('[data-dvr-dtime]'), dMode = q('[data-dvr-dmode]');
  var markEls = [], markPos = [], frames = [];
  var DURATION = 180; // the page plays as three minutes of footage
  var liveT = 0, mode = '▶ PLAY', curP = 0;

  // every section is a chapter of the footage, with its own thumbnail and a few recorded events
  var CHAPTERS = {
    top: ['Live view', 'city-shibuya.jpg', [[0.25, 'info'], [0.7, 'medium']]],
    platform: ['Platform', 'city-crossing.jpg', [[0.15, 'critical'], [0.4, 'high'], [0.62, 'medium'], [0.85, 'info']]],
    cameras: ['Cameras', 'ptz-pole.jpg', [[0.3, 'info'], [0.55, 'high'], [0.8, 'info']]],
    solutions: ['Solutions', 'city-trails.jpg', [[0.2, 'critical'], [0.6, 'medium']]],
    engineering: ['Engineering', 'cam-bullet.jpg', [[0.45, 'info']]],
    architecture: ['Architecture', 'chip.jpg', [[0.3, 'medium'], [0.7, 'info']]],
    deployment: ['Deployment', 'datacenter.jpg', [[0.25, 'info'], [0.5, 'high'], [0.75, 'info']]],
    contact: ['Contact', 'earth-night.jpg', [[0.4, 'medium']]]
  };
  var chapters = [];
  Object.keys(CHAPTERS).forEach(function (k) { var im = new Image(); im.src = 'assets/img/' + CHAPTERS[k][1]; });

  function buildMarks() {
    if (!dvrMarks) return;
    var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    dvrMarks.textContent = '';
    markEls = []; markPos = []; chapters = [];
    Array.prototype.forEach.call(document.querySelectorAll('main > section[id]'), function (sec) {
      var info = CHAPTERS[sec.id];
      if (!info) return;
      var top = sec.id === 'top' ? 0 : sec.getBoundingClientRect().top + window.scrollY;
      var p = clamp(top / max, 0, 1);
      chapters.push({ id: sec.id, p: p, name: info[0], img: 'assets/img/' + info[1], events: info[2] });
      var s = document.createElement('span');
      s.style.left = (p * 100).toFixed(2) + '%';
      dvrMarks.appendChild(s);
      markEls.push(s); markPos.push(p);
    });
    buildDrawer();
  }

  // the playback drawer: an event lane and a filmstrip of chapters
  function buildDrawer() {
    if (!drawer) return;
    Array.prototype.slice.call(lane.querySelectorAll('.dvr__ev')).forEach(function (e) { e.remove(); });
    frameWrap.textContent = '';
    frames = [];
    chapters.forEach(function (ch, i) {
      var end = i + 1 < chapters.length ? chapters[i + 1].p : 1;
      ch.end = end;
      ch.events.forEach(function (ev) {
        var e = document.createElement('i');
        e.className = 'dvr__ev ev--' + ev[1];
        e.style.left = ((ch.p + (end - ch.p) * ev[0]) * 100).toFixed(2) + '%';
        lane.appendChild(e);
      });
      var a = document.createElement('a');
      a.className = 'dvr__frame';
      a.href = '#' + ch.id;
      a.tabIndex = -1;
      a.setAttribute('data-cut', '');
      a.setAttribute('data-ch', pad(i));
      a.setAttribute('data-name', ch.name);
      a.innerHTML = '<span class="dvr__fimg"><img alt="" decoding="async"></span><span class="dvr__fch mono"></span><span class="dvr__ftc mono"></span><span class="dvr__fname"></span><span class="dvr__fprog"><span></span></span>';
      a.querySelector('img').src = ch.img;
      a.querySelector('.dvr__fch').textContent = 'CH ' + pad(i);
      a.querySelector('.dvr__ftc').textContent = tc(ch.p);
      a.querySelector('.dvr__fname').textContent = ch.name;
      a.addEventListener('pointerenter', function () { highlight(i); ghostAt(ch.p); });
      a.addEventListener('click', function () { closeDrawer(true); });
      frameWrap.appendChild(a);
      frames.push(a);
    });
  }
  function highlight(i) { frames.forEach(function (f, j) { f.classList.toggle('is-hover', j === i); }); markBand(i); }
  function markBand(i) {
    var ch = chapters[i];
    if (!ch || !band) return;
    band.style.left = (ch.p * 100).toFixed(2) + '%';
    band.style.width = ((ch.end - ch.p) * 100).toFixed(2) + '%';
  }
  function ghostAt(p) { dvrGhost.style.transform = 'translateX(' + (p * dvrTrack.clientWidth).toFixed(1) + 'px)'; dvr.classList.add('is-hover'); }
  function updateDrawer(p) {
    if (!drawer || !chapters.length) return;
    var i = chapterAt(p);
    frames.forEach(function (f, j) {
      f.classList.toggle('is-current', j === i);
      f.classList.toggle('is-past', j < i);
      var ch = chapters[j];
      var fp = j < i ? 1 : j > i ? 0 : clamp((p - ch.p) / Math.max(0.0001, ch.end - ch.p), 0, 1);
      f.style.setProperty('--fp', fp.toFixed(3));
    });
    nowLine.style.left = (p * 100).toFixed(2) + '%';
    dTime.textContent = tc(p);
    dMode.textContent = mode;
    if (!frames.some(function (f) { return f.classList.contains('is-hover'); })) markBand(i);
  }
  function chapterAt(p) {
    var i = 0;
    for (var k = 0; k < chapters.length; k++) if (p >= chapters[k].p - 0.0005) i = k;
    return i;
  }
  function tc(p) {
    var secs = Math.round(p * DURATION);
    return '00:' + pad(Math.floor(secs / 60)) + ':' + pad(secs % 60);
  }

  // open on hover (mouse only); a short grace period so it never flickers
  var openT = 0, closeT = 0;
  function openDrawer() {
    if (!drawer || dvr.classList.contains('is-open')) return;
    clearTimeout(closeT);
    openT = setTimeout(function () { updateDrawer(curP); dvr.classList.add('is-open'); }, 140);
  }
  function closeDrawer(now) {
    clearTimeout(openT);
    clearTimeout(closeT);
    var go = function () { dvr.classList.remove('is-open'); frames.forEach(function (f) { f.classList.remove('is-hover'); }); };
    if (now) go(); else closeT = setTimeout(go, 260);
  }

  // the small preview card: chapter thumbnail, name, timecode, progress through the chapter
  var shownChapter = -1, hoverP = -1, lastY = window.scrollY, lastT = performance.now(), speed = 0;
  function showScope(p, m) {
    if (!scope || !chapters.length) return;
    var w = dvrTrack.clientWidth, sw = scope.offsetWidth;
    var i = chapterAt(p), ch = chapters[i];
    if (i !== shownChapter) {
      shownChapter = i;
      scopeImg.src = ch.img;
      scopeName.textContent = ch.name;
      scopeCh.textContent = 'CH ' + pad(i);
      if (FX && FX.noise) FX.noise(scopeStatic, { duration: 220, from: 0.9 });
    }
    scopeProg.style.transform = 'scaleX(' + clamp((p - ch.p) / Math.max(0.0001, (ch.end || 1) - ch.p), 0, 1).toFixed(3) + ')';
    dvrTime.textContent = tc(p);
    scopeMode.textContent = m;
    var x = p * w;
    var left = clamp(x - sw / 2, -8, w - sw + 8);
    scope.style.setProperty('--sx', left.toFixed(1) + 'px');
    scope.style.setProperty('--nx', (x - left).toFixed(1) + 'px');
  }

  function onScroll() {
    setNavState();
    var vh = window.innerHeight;
    var max = Math.max(1, document.documentElement.scrollHeight - vh);
    var p = clamp(window.scrollY / max, 0, 1);
    curP = p;

    // active section
    var next = -1;
    for (var i = 0; i < sections.length; i++) {
      var sec = sections[i];
      if (!sec) continue;
      if (sec.getBoundingClientRect().top <= vh * 0.42) next = i;
    }
    if (p > 0.995 && sections.length) next = sections.length - 1;
    if (next !== activeIdx) {
      activeIdx = next;
      links.forEach(function (a, j) { if (j === activeIdx) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
      wake();
    }

    // DVR
    if (dvr) {
      dvr.style.setProperty('--p', p.toFixed(4));
      q('.dvr__fill').style.setProperty('--p', p.toFixed(4));
      var w = dvrTrack.clientWidth;
      q('.dvr__head').style.setProperty('--hx', (p * w).toFixed(1) + 'px');
      for (var k = 0; k < markEls.length; k++) markEls[k].classList.toggle('is-past', p >= markPos[k] - 0.001);

      // playback readout from scroll speed: PLAY, fast-forward or rewind
      var now = performance.now(), dy = window.scrollY - lastY, dt = Math.max(16, now - lastT);
      speed += ((dy / dt) * 1000 - speed) * 0.35;
      lastY = window.scrollY; lastT = now;
      var a = Math.abs(speed);
      mode = '▶ PLAY';
      if (a > 420) mode = (speed > 0 ? '▶▶ ' : '◀◀ ') + (a > 3200 ? '8×' : a > 1500 ? '4×' : '2×');
      else if (speed < -60) mode = '◀ REW';
      if (hoverP < 0) showScope(p, mode);
      updateDrawer(p);

      dvr.classList.add('is-live');
      clearTimeout(liveT);
      liveT = setTimeout(function () { dvr.classList.remove('is-live'); speed = 0; mode = '▶ PLAY'; if (dMode) dMode.textContent = mode; }, 1100);
    }
  }

  var scrollQueued = false;
  window.addEventListener('scroll', function () {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(function () { scrollQueued = false; onScroll(); });
  }, { passive: true });
  window.addEventListener('resize', function () { buildMarks(); onScroll(); });
  window.addEventListener('load', function () { buildMarks(); onScroll(); });
  buildMarks();
  onScroll();

  // Scrub: drag along the bar to move through the page like footage.
  if (dvr) {
    var scrubbing = false;
    var pAt = function (clientX) { var r = dvrTrack.getBoundingClientRect(); return clamp((clientX - r.left) / r.width, 0, 1); };
    var scrubTo = function (clientX) { jumpTo(pAt(clientX) * (document.documentElement.scrollHeight - window.innerHeight)); };
    var inDrawer = function (e) { return drawer && e.target.closest && e.target.closest('.dvr__drawer'); };
    dvr.addEventListener('pointerdown', function (e) {
      if (inDrawer(e)) return;
      scrubbing = true;
      dvr.classList.add('is-scrubbing');
      dvr.setPointerCapture(e.pointerId);
      scrubTo(e.clientX);
      e.preventDefault();
    });
    // hover previews any point of the footage, and opens the playback drawer
    dvr.addEventListener('pointermove', function (e) {
      if (scrubbing) { scrubTo(e.clientX); hoverP = -1; return; }
      if (e.pointerType !== 'mouse' || inDrawer(e)) return;
      hoverP = pAt(e.clientX);
      ghostAt(hoverP);
      showScope(hoverP, 'PREVIEW');
      highlight(chapterAt(hoverP));
      openDrawer();
    });
    dvr.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') clearTimeout(closeT); });
    dvr.addEventListener('pointerleave', function () { hoverP = -1; dvr.classList.remove('is-hover'); closeDrawer(false); });
    var endScrub = function () { scrubbing = false; dvr.classList.remove('is-scrubbing'); };
    dvr.addEventListener('pointerup', endScrub);
    dvr.addEventListener('pointercancel', endScrub);
  }

  /* ======================================================================
     Camera cuts: every [data-cut] link jumps through the iris shutter
     ====================================================================== */
  var menu = document.querySelector('[data-menu]');
  var iris = nav.querySelector('[data-iris]');

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[data-cut]');
    if (!a) return;
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var hash = a.getAttribute('href');
    if (!hash || hash.charAt(0) !== '#') return;
    var target = hash === '#top' ? document.getElementById('top') : document.querySelector(hash);
    if (!target) return;
    e.preventDefault();

    var menuWasOpen = menu && !menu.hidden;
    hideFeed();
    FX.cut({ ch: a.getAttribute('data-ch'), name: a.getAttribute('data-name') || a.textContent.trim() }, function () {
      if (menuWasOpen) setMenu(false, true);
      jumpTo(hash === '#top' ? 0 : target);
      if (history.replaceState) history.replaceState(null, '', hash);
      var focusEl = hash === '#top' ? null : (target.querySelector('[data-focus]') || target);
      if (focusEl) {
        if (!focusEl.hasAttribute('tabindex')) focusEl.setAttribute('tabindex', '-1');
        focusEl.focus({ preventScroll: true });
      }
      onScroll();
    });
  });

  /* ======================================================================
     Mobile: iris menu button
     ====================================================================== */
  var irisBlades = iris && iris.querySelector('[data-iris-blades]');
  var irisLabel = iris && iris.querySelector('[data-iris-label]');
  var irisPaths = [];
  var irisR = 6.5, irisRot = 0, irisAnim = 0;
  if (irisBlades) {
    var NS = 'http://www.w3.org/2000/svg';
    for (var b = 0; b < 6; b++) {
      var p = document.createElementNS(NS, 'path');
      irisBlades.appendChild(p);
      irisPaths.push(p);
    }
    drawSmallIris();
    iris.addEventListener('pointerenter', function () { if (menu.hidden) animateIris(9.5, 0.5, 380); });
    iris.addEventListener('pointerleave', function () { if (menu.hidden) animateIris(6.5, 0, 420); });
    iris.addEventListener('click', function () { setMenu(menu.hidden); });
  }

  function drawSmallIris() { FX.drawIris(irisPaths, null, 0, 0, irisR, irisRot, 60); }

  function animateIris(r, rot, dur) {
    var r0 = irisR, rot0 = irisRot, id = ++irisAnim;
    if (reduce()) { irisR = r; irisRot = rot; drawSmallIris(); return; }
    FX.tween(dur, function (e) {
      if (id !== irisAnim) return;
      irisR = r0 + (r - r0) * e; irisRot = rot0 + (rot - rot0) * e;
      drawSmallIris();
    }, FX.ease.outCubic);
  }

  var lastFocus = null;
  function setMenu(open, instant) {
    if (!menu || !iris) return;
    var apply = function () {
      menu.hidden = !open;
      menu.classList.toggle('is-open', open);
      iris.setAttribute('aria-expanded', String(open));
      if (irisLabel) irisLabel.textContent = open ? 'Close menu' : 'Open menu';
      document.documentElement.style.overflow = open ? 'hidden' : '';
      var L = window.SentraScroll && window.SentraScroll.lenis;
      if (L) { if (open) L.stop(); else L.start(); }
      animateIris(open ? 22 : 6.5, open ? 1.2 : 0, open ? 600 : 450);
      if (open) {
        lastFocus = document.activeElement;
        var first = menu.querySelector('a');
        if (first) first.focus({ preventScroll: true });
      } else if (lastFocus && !instant) {
        lastFocus.focus({ preventScroll: true });
      }
    };
    if (instant) { apply(); return; }
    var r = iris.getBoundingClientRect();
    FX.cut({ ch: open ? 'MULTI-VIEW' : 'LIVE', name: open ? 'All channels' : 'Back to feed', x: r.left + r.width / 2, y: r.top + r.height / 2 }, apply);
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && menu && !menu.hidden) setMenu(false);
    // keep focus inside the open menu
    if (e.key === 'Tab' && menu && !menu.hidden) {
      var items = [iris].concat(Array.prototype.slice.call(menu.querySelectorAll('a')));
      var i = items.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { items[items.length - 1].focus(); e.preventDefault(); }
      else if (!e.shiftKey && i === items.length - 1) { items[0].focus(); e.preventDefault(); }
    }
  });
  window.addEventListener('resize', function () {
    if (menu && !menu.hidden && window.innerWidth > 960) setMenu(false, true);
  });

  setNavState();
})();
