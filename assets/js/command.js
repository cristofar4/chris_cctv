/* ==========================================================================
   Sentra Command: an interactive operations console
   Nine real street cameras on a video wall, a ranked alert list, a map,
   1 / 4 / 9 layouts, plain-language search across every camera, and
   alert actions. Tours the alerts on its own until the visitor takes over.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.querySelector('[data-command]');
  if (!root) return;
  var wall = root.querySelector('[data-wall]');
  var list = root.querySelector('[data-cmd-alerts]');
  var count = root.querySelector('[data-cmd-count]');
  var search = root.querySelector('[data-cmd-search]');
  var map = root.querySelector('[data-cmd-map]');
  var detail = root.querySelector('[data-cmd-detail]');
  var dPrio = root.querySelector('[data-cmd-prio]'), dTitle = root.querySelector('[data-cmd-title]'), dMeta = root.querySelector('[data-cmd-meta]');
  var toast = root.querySelector('[data-cmd-toast]');
  var layoutBtns = Array.prototype.slice.call(root.querySelectorAll('[data-layout]'));
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // box = [left %, top %, width %, height %] of the event in the real photo
  var FEEDS = [
    { img: 'city-trails.jpg', cam: 'CAM 0418', place: 'Expressway, northbound', title: 'Wrong-way vehicle', prio: 'critical', ago: 0, box: [27, 63, 14, 14], tag: 'WRONG WAY', tags: 'wrong way car vehicle expressway highway road driver', map: [52, 18] },
    { img: 'city-interchange.jpg', cam: 'CAM 0731', place: 'Interchange 12', title: 'Stopped vehicle in lane', prio: 'high', ago: 2, box: [57, 51, 5, 5], tag: 'STOPPED 0.94', tags: 'stopped vehicle car interchange traffic breakdown', map: [232, 40] },
    { img: 'city-chinatown.jpg', cam: 'CAM 0588', place: 'Yaowarat Road, Bangkok', title: 'Vehicle of interest · plate read', prio: 'high', ago: 4, box: [40, 61, 16, 34], tag: 'TUK-TUK 0.96', tags: 'tuk-tuk tuk tuk plate vehicle bangkok watchlist', map: [262, 132] },
    { img: 'city-crossing.jpg', cam: 'CAM 0207', place: 'Crossing, district 4', title: 'Crowd density rising', prio: 'medium', ago: 6, box: [38, 50, 40, 36], tag: 'CROWD · HIGH', tags: 'crowd people density crossing neon pedestrians', map: [128, 62] },
    { img: 'city-avenue.jpg', cam: 'CAM 0119', place: 'Midtown avenue', title: 'Congestion building', prio: 'medium', ago: 9, box: [58, 62, 22, 11], tag: 'QUEUE 0.91', tags: 'taxi taxis congestion traffic yellow avenue queue cars', map: [176, 112] },
    { img: 'city-crowd.jpg', cam: 'CAM 0350', place: 'Old town crossing', title: 'Search match · person in red coat', prio: 'medium', ago: 12, box: [41, 20, 8, 32], tag: 'RED COAT 0.89', tags: 'red coat jacket person woman people crossing', map: [84, 140] },
    { img: 'city-times.jpg', cam: 'CAM 0042', place: 'Times Square, New York', title: 'Crowd at crossing', prio: 'low', ago: 15, box: [22, 76, 30, 14], tag: 'CROWD 0.93', tags: 'crowd people times square new york crossing', map: [30, 88] },
    { img: 'city-neon.jpg', cam: 'CAM 0901', place: 'Neon district', title: 'After-hours motion', prio: 'low', ago: 21, box: [60, 50, 7, 12], tag: 'MOTION 0.87', tags: 'motion night neon after hours empty street', map: [214, 162] },
    { img: 'city-shibuya.jpg', cam: 'CAM 0112', place: 'Shibuya Crossing, Tokyo', title: 'Bus at stop · on schedule', prio: 'info', ago: 26, box: [45.4, 72.5, 7.4, 10], tag: 'BUS 0.99', tags: 'bus orange vehicle shibuya tokyo stop', map: [150, 20] }
  ];
  var PRIO = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', info: 'Info' };
  list.setAttribute('data-lenis-prevent', '');

  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function hhmm(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  var t0 = new Date();

  /* ---------- build the wall ---------- */
  var tiles = FEEDS.map(function (f, i) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'tile tile--' + f.prio;
    b.setAttribute('aria-label', f.cam + ', ' + f.place + ': ' + f.title);
    b.style.setProperty('--d', (-i * 2.3) + 's');
    var bx = f.box;
    b.style.setProperty('--ox', (bx[0] + bx[2] / 2) + '%');
    b.style.setProperty('--oy', (bx[1] + bx[3] / 2) + '%');
    b.innerHTML =
      '<span class="tile__media"><img src="assets/img/' + f.img + '" alt="" loading="lazy" draggable="false"></span>' +
      '<span class="tile__scan"></span>' +
      '<span class="tile__box" style="left:' + bx[0] + '%;top:' + bx[1] + '%;width:' + bx[2] + '%;height:' + bx[3] + '%"><b class="mono">' + f.tag + '</b></span>' +
      '<span class="tile__hud mono"><span><span class="rec-dot"></span>' + f.cam + '</span><span class="tile__time" data-tile-time></span></span>' +
      '<span class="tile__place">' + f.place + '</span>';
    b.addEventListener('click', function () { userTook(); select(i, true); });
    wall.appendChild(b);
    return b;
  });

  /* ---------- alerts, ranked ---------- */
  var order = FEEDS.map(function (f, i) { return i; });
  var rank = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  order.sort(function (a, b) { return rank[FEEDS[a].prio] - rank[FEEDS[b].prio] || FEEDS[a].ago - FEEDS[b].ago; });
  var items = [];
  order.forEach(function (i) {
    var f = FEEDS[i];
    var li = document.createElement('li');
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'alert alert--' + f.prio;
    var when = new Date(t0.getTime() - f.ago * 60000);
    b.innerHTML = '<i></i><span class="alert__main"><b></b><small class="mono"></small></span><time class="mono"></time>';
    b.querySelector('b').textContent = f.title;
    b.querySelector('small').textContent = f.cam + ' · ' + f.place;
    b.querySelector('time').textContent = f.ago === 0 ? 'now' : hhmm(when);
    b.addEventListener('click', function () { userTook(); select(i, true); });
    li.appendChild(b);
    list.appendChild(li);
    items[i] = { li: li, btn: b };
  });

  /* ---------- map ---------- */
  var NS = 'http://www.w3.org/2000/svg';
  function el(n, a, p) { var e = document.createElementNS(NS, n); for (var k in a) e.setAttribute(k, a[k]); (p || map).appendChild(e); return e; }
  var nodes = [];
  if (map) {
    el('rect', { width: 300, height: 180, fill: '#07090b' });
    var roads = el('g', { stroke: 'rgba(236,232,225,0.09)', 'stroke-width': 1, fill: 'none' });
    [[0, 40, 300, 30], [0, 100, 300, 120], [0, 150, 300, 160], [60, 0, 40, 180], [140, 0, 150, 180], [220, 0, 250, 180]].forEach(function (l) {
      el('path', { d: 'M' + l[0] + ' ' + l[1] + 'L' + l[2] + ' ' + l[3] }, roads);
    });
    el('path', { d: 'M0 66 C80 60 120 90 300 70', stroke: 'rgba(69,227,240,0.18)', 'stroke-width': 5, fill: 'none', 'stroke-linecap': 'round' });
    FEEDS.forEach(function (f, i) {
      var g = el('g', { 'class': 'cmdmap__node cmdmap__node--' + f.prio, transform: 'translate(' + f.map[0] + ' ' + f.map[1] + ')', tabindex: -1 });
      el('circle', { r: 10, 'class': 'cmdmap__pulse' }, g);
      el('circle', { r: 3.2, 'class': 'cmdmap__dot' }, g);
      g.addEventListener('click', function () { userTook(); select(i, true); });
      nodes.push(g);
    });
  }

  /* ---------- state ---------- */
  var active = -1, layout = 4;
  function setLayout(n) {
    layout = n;
    wall.setAttribute('data-layout', String(n));
    layoutBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(+b.getAttribute('data-layout') === n)); });
    placeTiles();
  }
  function placeTiles() {
    // the four most urgent feeds lead the wall; the active feed always shows
    var lead = order.slice(0, 4);
    if (active >= 0 && lead.indexOf(active) < 0) lead[3] = active;
    tiles.forEach(function (t, i) {
      var pos = lead.indexOf(i);
      t.style.order = pos >= 0 ? pos : 10 + order.indexOf(i);
      var shown = layout === 9 || (layout === 4 && pos >= 0) || (layout === 1 && i === active);
      t.hidden = !shown;
    });
  }
  function select(i, focus) {
    active = i;
    var f = FEEDS[i];
    tiles.forEach(function (t, j) { t.classList.toggle('is-active', j === i); });
    items.forEach(function (it, j) { if (it) it.btn.classList.toggle('is-active', j === i); });
    nodes.forEach(function (n, j) { n.classList.toggle('is-active', j === i); });
    if (focus) setLayout(1); else placeTiles();
    dPrio.textContent = PRIO[f.prio];
    dPrio.className = 'command__prio mono prio--' + f.prio;
    dTitle.textContent = f.title;
    var when = new Date(t0.getTime() - f.ago * 60000);
    dMeta.textContent = f.cam + ' · ' + f.place + ' · ' + (f.ago === 0 ? 'now' : hhmm(when));
    root.classList.add('has-detail');
  }
  layoutBtns.forEach(function (b) {
    b.addEventListener('click', function () { userTook(); setLayout(+b.getAttribute('data-layout')); });
  });

  /* ---------- search across every camera ---------- */
  var matches = [];
  search.addEventListener('input', function () {
    userTook();
    var q = search.value.trim().toLowerCase();
    var words = q.split(/\s+/).filter(Boolean);
    matches = [];
    FEEDS.forEach(function (f, i) {
      var hay = (f.tags + ' ' + f.title + ' ' + f.place).toLowerCase();
      var hit = words.length > 0 && words.every(function (w) { return hay.indexOf(w) >= 0; });
      if (hit) matches.push(i);
      tiles[i].classList.toggle('is-match', hit);
      tiles[i].classList.toggle('is-dim', words.length > 0 && !hit);
      if (items[i]) items[i].li.hidden = words.length > 0 && !hit;
    });
    root.classList.toggle('is-searching', words.length > 0);
    count.textContent = words.length ? matches.length + (matches.length === 1 ? ' match' : ' matches') : FEEDS.length;
    if (matches.length === 1) select(matches[0], true);
    else if (words.length) { setLayout(matches.length > 4 ? 9 : 4); root.classList.remove('has-detail'); }
    else { tiles.forEach(function (t) { t.classList.remove('is-match', 'is-dim'); }); }
  });
  count.textContent = FEEDS.length;

  /* ---------- actions ---------- */
  var toastT = 0;
  function say(msg) {
    toast.textContent = msg;
    toast.classList.add('is-on');
    clearTimeout(toastT);
    toastT = setTimeout(function () { toast.classList.remove('is-on'); }, 2600);
  }
  Array.prototype.forEach.call(root.querySelectorAll('[data-cmd-action]'), function (b) {
    b.addEventListener('click', function () {
      userTook();
      if (active < 0) return;
      var a = b.getAttribute('data-cmd-action'), f = FEEDS[active];
      if (a === 'ack') { items[active].btn.classList.add('is-ack'); say('Acknowledged · ' + f.cam + ' logged to the audit trail (demo)'); }
      if (a === 'clip') say('Clip from ' + f.cam + ' ready to share · 30 s before, 30 s after (demo)');
      if (a === 'dispatch') say('Nearest unit dispatched to ' + f.place + ' (demo)');
    });
  });

  /* ---------- live clocks on the tiles ---------- */
  var timeEls = Array.prototype.slice.call(root.querySelectorAll('[data-tile-time]'));
  function tick() {
    var d = new Date(), s = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    timeEls.forEach(function (e) { e.textContent = s; });
  }
  tick(); setInterval(tick, 1000);

  /* ---------- self-running tour until the visitor takes over ---------- */
  var touring = !reduce, tourT = 0, tourI = 0, visible = false;
  function userTook() { touring = false; clearTimeout(tourT); root.classList.add('is-manual'); }
  function tourStep() {
    if (!touring || !visible) return;
    var i = order[tourI % 4]; tourI++;
    select(i, tourI % 2 === 1);
    if (tourI % 2 === 0) setLayout(4);
    tourT = setTimeout(tourStep, 3800);
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (en) {
      visible = en[0].isIntersecting;
      clearTimeout(tourT);
      if (visible && touring) tourT = setTimeout(tourStep, 1400);
    }, { threshold: 0.35 }).observe(root);
  }
  root.addEventListener('pointerdown', function (e) { if (e.target.closest('button, input')) userTook(); });

  setLayout(4);
  select(order[0], false);
})();
