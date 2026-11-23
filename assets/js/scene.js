/* ==========================================================================
   Sentra Live: the hero is a real-time 3D security feed.

   A modern villa at night, watched by a PTZ camera on the boundary wall.
   People walk in through the side gate and the camera works:
   - auto-tracking pan/tilt/zoom that follows the subject
   - AI detection boxes, ID and confidence, a movement trail, an
     entrance zone that changes state, a known vehicle and parcels
   - scripted stories: a courier drops a parcel and rings, the owner is
     notified; a resident is face-matched, picks the parcel up and is
     let in by the access-control door
   - three sensor modes: night colour, infrared and thermal
   - a camera-feed post stack: bloom, lens distortion, chromatic
     aberration, grain, scanlines, vignette

   Events are broadcast as `sentra:event`, telemetry as `sentra:tick`,
   so the hero UI (event log, minimap, notifications) stays decoupled.
   ========================================================================== */
(function () {
  'use strict';

  var hero = document.querySelector('[data-hero]');
  if (!hero) return;
  var canvas = hero.querySelector('[data-scene]');
  var overlay = hero.querySelector('[data-overlay]');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var forceGL = /[?&]webgl=force/.test(location.search); // testing: never fall back to the still image

  var api = window.SentraScene = { mode: 0, ready: false, setMode: function () {} };

  function emit(name, detail) { document.dispatchEvent(new CustomEvent(name, { detail: detail })); }

  var failed = false;
  function fail() {
    if (failed) return;
    failed = true;
    hero.classList.add('no-webgl');
    hero.classList.remove('has-webgl');
    // keep the event log alive over the still image
    var script = [
      ['PERSON DETECTED · EAST GATE', 'info'], ['UNKNOWN VISITOR · ZONE A', 'warn'],
      ['PACKAGE DETECTED · PORCH', 'info'], ['DOORBELL · OWNER NOTIFIED', 'warn', true],
      ['PERSON EXITED · EAST GATE', 'info'], ['FACE MATCH · RESIDENT 99.2%', 'ok'],
      ['ACCESS GRANTED · FRONT DOOR', 'ok'], ['DOOR SECURED', 'info']
    ];
    var i = 0;
    setInterval(function () {
      var s = script[i++ % script.length];
      emit('sentra:event', { text: s[0], level: s[1], notify: !!s[2] });
    }, 3200);
    api.ready = true;
    emit('sentra:ready', { webgl: false });
  }

  if (!window.THREE || !canvas) return fail();
  var T = window.THREE;

  var renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas: canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' });
  } catch (e) { return fail(); }
  if (!renderer.getContext()) return fail();

  T.ColorManagement.legacyMode = false;
  var isMobile = window.matchMedia('(max-width: 760px)').matches;
  var webgl2 = renderer.capabilities.isWebGL2;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.setClearColor(0x04070a, 1);

  /* ======================================================================
     Scene + camera
     ====================================================================== */
  var scene = new T.Scene();
  var BG = new T.Color(0x05080c);
  scene.background = BG;
  scene.fog = new T.FogExp2(0x070b10, 0.018);

  var camera = new T.PerspectiveCamera(46, 1, 0.1, 140);
  var CAM_POS = new T.Vector3(-13.2, 7.6, 12.4);
  camera.position.copy(CAM_POS);
  var BASE_LOOK = new T.Vector3(0.8, 1.2, -3.4);
  var look = BASE_LOOK.clone();
  var lookVel = new T.Vector3();
  var fov = 46, fovVel = 0;
  camera.lookAt(look);

  var world = new T.Group();
  scene.add(world);

  /* ---------- per-mode material registry ---------- */
  var registry = [];
  var thermalCache = {};
  function thermalMat(h) {
    var key = h.toFixed(2);
    if (!thermalCache[key]) {
      thermalCache[key] = new T.MeshLambertMaterial({
        color: new T.Color().setRGB(h * 0.35, h * 0.35, h * 0.35),
        emissive: new T.Color().setRGB(h * 0.95, h * 0.95, h * 0.95)
      });
    }
    return thermalCache[key];
  }
  function reg(mesh, heat, ir) {
    var base = mesh.material;
    var irMat = base;
    if (ir != null) {
      irMat = base.clone();
      irMat.color = new T.Color(ir);
      irMat.map = null;
    }
    registry.push({ mesh: mesh, mats: [base, irMat, thermalMat(heat)] });
  }

  function add(geo, mat, x, y, z, o) {
    o = o || {};
    var m = new T.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = o.cast !== false;
    m.receiveShadow = o.receive !== false;
    (o.parent || world).add(m);
    reg(m, o.heat == null ? 0.28 : o.heat, o.ir);
    return m;
  }
  // box from min/max bounds
  function slab(x0, x1, y0, y1, z0, z1, mat, o) {
    return add(new T.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, o);
  }

  /* ---------- procedural textures ---------- */
  function canvasTex(size, draw, rx, ry) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d'), size);
    var t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(rx || 1, ry || rx || 1);
    t.encoding = T.sRGBEncoding;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return t;
  }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  var grassTex = canvasTex(256, function (g, s) {
    g.fillStyle = '#1d2a18'; g.fillRect(0, 0, s, s);
    for (var i = 0; i < 9000; i++) {
      var l = rnd(10, 26), h = rnd(80, 110);
      g.fillStyle = 'hsl(' + h + ',' + rnd(25, 40) + '%,' + l + '%)';
      g.fillRect(Math.random() * s, Math.random() * s, 1.4, rnd(1, 3));
    }
  }, 22);
  var concreteTex = canvasTex(256, function (g, s) {
    g.fillStyle = '#a7a39b'; g.fillRect(0, 0, s, s);
    for (var i = 0; i < 6000; i++) {
      var v = rnd(130, 190) | 0;
      g.fillStyle = 'rgba(' + v + ',' + v + ',' + (v - 4) + ',' + rnd(0.15, 0.5) + ')';
      g.fillRect(Math.random() * s, Math.random() * s, rnd(1, 2.5), rnd(1, 2.5));
    }
  }, 2);
  var driveTex = canvasTex(256, function (g, s) {
    g.fillStyle = '#5c5a56'; g.fillRect(0, 0, s, s);
    for (var i = 0; i < 5000; i++) {
      var v = rnd(60, 120) | 0;
      g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',.4)';
      g.fillRect(Math.random() * s, Math.random() * s, 1.5, 1.5);
    }
    g.strokeStyle = 'rgba(20,20,20,.55)'; g.lineWidth = 2;
    for (var y = 0; y <= s; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); }
  }, 2, 8);
  var woodTex = canvasTex(256, function (g, s) {
    for (var x = 0; x < s; x += 16) {
      g.fillStyle = 'hsl(' + rnd(22, 30) + ',' + rnd(38, 50) + '%,' + rnd(24, 34) + '%)';
      g.fillRect(x, 0, 16, s);
      g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(x + 14, 0, 2, s);
      for (var k = 0; k < 30; k++) { g.fillStyle = 'rgba(0,0,0,' + rnd(0.04, 0.12) + ')'; g.fillRect(x + rnd(0, 13), rnd(0, s), 1, rnd(10, 60)); }
    }
  }, 6, 2);
  var waterTex = canvasTex(256, function (g, s) {
    g.fillStyle = '#0aa7b8'; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(190,255,255,.35)';
    for (var i = 0; i < 60; i++) {
      g.lineWidth = rnd(0.6, 1.8);
      g.beginPath();
      var x = Math.random() * s, y = Math.random() * s;
      g.moveTo(x, y);
      g.bezierCurveTo(x + rnd(-40, 40), y + rnd(-20, 20), x + rnd(-40, 40), y + rnd(-20, 20), x + rnd(-60, 60), y + rnd(-30, 30));
      g.stroke();
    }
  }, 3, 2);

  /* ---------- materials ---------- */
  function std(color, rough, metal, extra) {
    var o = { color: new T.Color(color), roughness: rough == null ? 0.8 : rough, metalness: metal || 0 };
    for (var k in extra) o[k] = extra[k];
    return new T.MeshStandardMaterial(o);
  }
  var MAT = {
    render: std('#d8d3ca', 0.9),
    charcoal: std('#26292c', 0.75),
    wood: new T.MeshStandardMaterial({ map: woodTex, roughness: 0.75 }),
    slab: std('#b5afa5', 0.92),
    frame: std('#121417', 0.45, 0.6),
    glass: new T.MeshStandardMaterial({ color: new T.Color('#0d151b'), roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.28, depthWrite: false }),
    lawn: new T.MeshStandardMaterial({ map: grassTex, roughness: 1 }),
    paver: new T.MeshStandardMaterial({ map: concreteTex, roughness: 0.9 }),
    drive: new T.MeshStandardMaterial({ map: driveTex, roughness: 0.85 }),
    intWall: std('#d9c6a8', 0.9, 0, { emissive: new T.Color('#3a2412'), emissiveIntensity: 0.55 }),
    intFloor: std('#7a5c43', 0.55),
    warm: new T.MeshStandardMaterial({ color: new T.Color('#ffd6a3'), emissive: new T.Color('#ffb15c'), emissiveIntensity: 2.4 }),
    warmSoft: new T.MeshStandardMaterial({ color: new T.Color('#f5d9b5'), emissive: new T.Color('#e8a560'), emissiveIntensity: 1.1 }),
    lamp: new T.MeshStandardMaterial({ color: new T.Color('#fff2dc'), emissive: new T.Color('#ffe0b0'), emissiveIntensity: 4 }),
    fabric: std('#3b3a38', 1),
    leaf: std('#1f3a1d', 0.9),
    leafDark: std('#15291a', 0.95),
    trunk: std('#4a3a2c', 0.95),
    hedge: std('#1a2f19', 1),
    water: new T.MeshStandardMaterial({ map: waterTex, color: new T.Color('#5fe6f0'), emissive: new T.Color('#0fb7c9'), emissiveIntensity: 0.9, emissiveMap: waterTex, roughness: 0.15, metalness: 0.1 }),
    panel: new T.MeshStandardMaterial({ color: new T.Color('#0b2a30'), emissive: new T.Color('#2bdcea'), emissiveIntensity: 1.6 }),
    carBody: std('#16191c', 0.32, 0.75),
    carGlass: std('#05080b', 0.08, 0.9),
    tail: new T.MeshStandardMaterial({ color: new T.Color('#5a0b0f'), emissive: new T.Color('#ff2a36'), emissiveIntensity: 2.2 }),
    tyre: std('#0b0b0b', 0.9)
  };

  /* ======================================================================
     Property
     ====================================================================== */
  // ground
  var lawn = add(new T.PlaneGeometry(90, 90), MAT.lawn, 0, 0, 0, { cast: false, heat: 0.16, ir: '#bdbdb6' });
  lawn.rotation.x = -Math.PI / 2;
  var drive = add(new T.PlaneGeometry(4.4, 19), MAT.drive, 7.6, 0.012, 3.4, { cast: false, heat: 0.24 });
  drive.rotation.x = -Math.PI / 2;

  // plinth + terrace
  slab(-7.6, 9.8, 0, 0.16, -12.6, -5.6, MAT.slab, { heat: 0.26 });
  slab(-7.2, 2.3, 0, 0.18, -5.6, -4.4, MAT.slab, { heat: 0.26 });

  // ground floor: interior shell (open front, glazed)
  slab(-7.2, 5.0, 0.16, 0.2, -12.2, -6.0, MAT.intFloor, { heat: 0.32 });
  slab(-7.2, 5.0, 3.1, 3.3, -12.2, -6.0, MAT.render, { heat: 0.3 });              // ceiling slab
  slab(-7.2, 5.0, 0.2, 3.1, -12.2, -11.9, MAT.intWall, { heat: 0.42 });            // back wall
  slab(-7.3, -7.0, 0.2, 3.1, -12.2, -6.0, MAT.render, { heat: 0.3 });              // left wall
  slab(4.8, 5.0, 0.2, 3.1, -12.2, -6.0, MAT.intWall, { heat: 0.4 });               // right inner wall
  // ceiling light strips
  for (var ls = 0; ls < 3; ls++) slab(-6 + ls * 3.6, -4 + ls * 3.6, 3.06, 3.1, -9.4, -9.2, MAT.lamp, { cast: false, heat: 0.7 });
  // interior furniture
  slab(-5.4, -2.6, 0.2, 0.62, -10.6, -9.6, MAT.fabric, { heat: 0.34 });            // sofa
  slab(-5.4, -2.6, 0.62, 1.05, -10.9, -10.6, MAT.fabric, { heat: 0.34 });
  slab(-4.6, -3.2, 0.2, 0.45, -8.8, -8.0, MAT.charcoal, { heat: 0.3 });             // coffee table
  slab(0.2, 3.4, 0.2, 1.0, -9.9, -9.0, MAT.render, { heat: 0.33 });                 // kitchen island
  slab(0.1, 3.5, 1.0, 1.06, -10.0, -8.9, MAT.charcoal, { heat: 0.33 });
  for (var pd = 0; pd < 3; pd++) {                                                 // pendants
    add(new T.CylinderGeometry(0.01, 0.01, 1.3, 4), MAT.frame, 0.8 + pd * 0.9, 2.45, -9.45, { cast: false });
    add(new T.SphereGeometry(0.17, 16, 12), MAT.lamp, 0.8 + pd * 0.9, 1.75, -9.45, { cast: false, heat: 0.75 });
  }
  slab(-6.4, -4.2, 1.2, 2.5, -11.88, -11.84, MAT.warmSoft, { cast: false, heat: 0.4 }); // artwork glow
  add(new T.CylinderGeometry(0.22, 0.18, 0.5, 12), MAT.charcoal, -6.3, 0.45, -7.0);  // plant pot
  add(new T.IcosahedronGeometry(0.55, 1), MAT.leaf, -6.3, 1.2, -7.0, { heat: 0.25 });

  // glass facade with mullions
  var glassW = slab(-7.0, 1.7, 0.2, 3.1, -6.04, -5.98, MAT.glass, { cast: false, receive: false, heat: 0.14 });
  glassW.renderOrder = 2;
  for (var mx = -7.0; mx <= 1.75; mx += 1.75) slab(mx - 0.04, mx + 0.04, 0.2, 3.1, -6.08, -5.95, MAT.frame, { heat: 0.2 });
  slab(-7.0, 1.7, 3.0, 3.1, -6.08, -5.95, MAT.frame, { heat: 0.2 });

  // solid wall + recessed entrance
  slab(1.7, 2.45, 0.16, 3.1, -6.15, -5.95, MAT.render, { heat: 0.3 });
  slab(2.45, 2.95, 0.16, 3.1, -6.5, -6.0, MAT.charcoal, { heat: 0.28 });          // reveal left
  slab(4.05, 4.8, 0.16, 3.1, -6.5, -5.95, MAT.charcoal, { heat: 0.28 });          // reveal right
  slab(2.45, 4.8, 2.9, 3.1, -6.5, -5.95, MAT.charcoal, { heat: 0.28 });           // lintel
  slab(4.8, 5.0, 0.16, 3.1, -6.15, -5.95, MAT.render, { heat: 0.3 });
  // access-control panel
  var panelMesh = slab(2.62, 2.84, 1.15, 1.5, -5.98, -5.94, MAT.panel, { cast: false, heat: 0.6 });

  // pivot front door
  var doorPivot = new T.Group();
  doorPivot.position.set(2.96, 0.17, -6.32);
  world.add(doorPivot);
  var doorMat = std('#3d2a1d', 0.6);
  add(new T.BoxGeometry(1.08, 2.72, 0.08), doorMat, 0.54, 1.36, 0, { parent: doorPivot, heat: 0.3 });
  add(new T.BoxGeometry(0.03, 1.4, 0.05), std('#c9b48f', 0.3, 0.9), 0.92, 1.25, 0.07, { parent: doorPivot, cast: false, heat: 0.3 });
  var doorAngle = 0, doorTarget = 0; // positive angle swings the door inward

  // canopy + downlights
  slab(2.2, 5.2, 2.98, 3.14, -6.2, -4.2, MAT.render, { heat: 0.3 });
  add(new T.CylinderGeometry(0.09, 0.09, 0.02, 16), MAT.lamp, 3.0, 2.97, -5.0, { cast: false, heat: 0.8 });
  add(new T.CylinderGeometry(0.09, 0.09, 0.02, 16), MAT.lamp, 4.2, 2.97, -5.0, { cast: false, heat: 0.8 });

  // garage volume
  slab(5.0, 9.6, 0.16, 3.25, -11.2, -6.0, MAT.charcoal, { heat: 0.27 });
  slab(5.5, 9.1, 0.16, 2.7, -6.03, -5.98, std('#3a3d40', 0.6, 0.3), { heat: 0.26 });
  for (var gd = 0; gd < 6; gd++) slab(5.5, 9.1, 0.55 + gd * 0.36, 0.58 + gd * 0.36, -5.99, -5.96, MAT.frame, { cast: false });
  slab(6.2, 8.4, 2.9, 2.94, -5.98, -5.9, MAT.lamp, { cast: false, heat: 0.7 });

  // upper floor: cantilevered timber box
  slab(-4.6, 8.4, 3.3, 6.35, -11.6, -4.9, MAT.wood, { heat: 0.3 });
  // window band
  slab(-3.6, 2.4, 4.05, 5.75, -4.89, -4.86, MAT.warmSoft, { cast: false, heat: 0.45 });
  slab(-3.6, 2.4, 4.05, 5.75, -4.86, -4.83, MAT.glass, { cast: false, receive: false, heat: 0.14 });
  for (var wx = -3.6; wx <= 2.45; wx += 1.5) slab(wx - 0.03, wx + 0.03, 4.05, 5.75, -4.86, -4.8, MAT.frame, { cast: false });
  for (var lv = 0; lv < 8; lv++) slab(-3.7, 2.5, 4.15 + lv * 0.2, 4.2 + lv * 0.2, -4.8, -4.62, MAT.charcoal, { heat: 0.25 }); // louvres
  slab(4.0, 7.6, 4.3, 5.5, -4.89, -4.86, MAT.warmSoft, { cast: false, heat: 0.42 });
  slab(4.0, 7.6, 4.3, 5.5, -4.86, -4.83, MAT.glass, { cast: false, receive: false, heat: 0.14 });
  // roof slab
  slab(-5.2, 9.0, 6.35, 6.62, -12.2, -4.4, MAT.render, { heat: 0.26 });
  slab(-5.2, 9.0, 6.3, 6.34, -4.5, -4.4, MAT.lamp, { cast: false, heat: 0.6 });     // fascia light line

  // planters along facade
  slab(-6.9, -2.2, 0.18, 0.62, -4.3, -3.6, MAT.charcoal, { heat: 0.27 });
  slab(-6.8, -2.3, 0.62, 0.95, -4.2, -3.7, MAT.hedge, { heat: 0.24, ir: '#d6d6d0' });

  // pool
  slab(-12.2, -6.2, 0.0, 0.14, -4.6, -0.2, MAT.slab, { heat: 0.26 });
  var water = slab(-11.8, -6.6, 0.05, 0.15, -4.2, -0.6, MAT.water, { cast: false, heat: 0.38 });
  var poolLight = new T.PointLight(0x37d8e8, 1.6, 7, 2);
  poolLight.position.set(-9.2, 0.6, -2.4);
  world.add(poolLight);

  // boundary walls; the pedestrian gate is on the east wall (gap z 5.6..8.4)
  slab(-14.2, -13.8, 0, 2.2, -14, 16, MAT.render, { heat: 0.27 });
  slab(-14.3, -13.7, 2.2, 2.32, -14, 16, MAT.charcoal);
  slab(13.8, 14.2, 0, 2.2, -14, 5.6, MAT.render, { heat: 0.27 });
  slab(13.8, 14.2, 0, 2.2, 8.4, 16, MAT.render, { heat: 0.27 });
  slab(13.7, 14.3, 2.2, 2.32, -14, 5.6, MAT.charcoal);
  slab(13.7, 14.3, 2.2, 2.32, 8.4, 16, MAT.charcoal);
  slab(13.6, 14.5, 0, 2.6, 5.2, 5.6, MAT.charcoal, { heat: 0.28 });                 // gate posts
  slab(13.6, 14.5, 0, 2.6, 8.4, 8.8, MAT.charcoal, { heat: 0.28 });
  add(new T.BoxGeometry(0.22, 0.3, 0.22), MAT.lamp, 13.5, 2.35, 5.4, { cast: false, heat: 0.75 });
  add(new T.BoxGeometry(0.22, 0.3, 0.22), MAT.lamp, 13.5, 2.35, 8.6, { cast: false, heat: 0.75 });
  // gate leaf, swung open inward
  var gate = new T.Group();
  gate.position.set(13.95, 0, 5.6);
  gate.rotation.y = Math.PI - 1.25;
  world.add(gate);
  for (var gb = 0; gb < 11; gb++) add(new T.BoxGeometry(0.04, 1.9, 0.04), MAT.frame, 0.06, 1.05, -0.12 - gb * 0.26, { parent: gate, heat: 0.22 });
  add(new T.BoxGeometry(0.06, 0.06, 2.8), MAT.frame, 0.06, 1.95, -1.4, { parent: gate });
  add(new T.BoxGeometry(0.06, 0.06, 2.8), MAT.frame, 0.06, 0.15, -1.4, { parent: gate });
  // hedges
  slab(-13.8, 13.5, 0, 1.8, -14.6, -13.4, MAT.hedge, { heat: 0.22, ir: '#cfcfc8' });
  slab(11.4, 12.4, 0, 1.4, -12, 3.2, MAT.hedge, { heat: 0.22, ir: '#cfcfc8' });
  // wall washers along the front of the house
  [-5.5, -1.2, 6.4, 8.6].forEach(function (x) { add(new T.BoxGeometry(0.14, 0.08, 0.14), MAT.lamp, x, 0.2, -4.2, { cast: false, heat: 0.7 }); });

  /* ---------- path from the gate to the door ---------- */
  var PATH = [[15.6, 7.0], [12.6, 7.0], [9.6, 6.6], [6.0, 5.6], [4.6, 2.6], [3.9, -0.8], [3.5, -3.0], [3.5, -4.55]];
  var pathCurve = new T.CatmullRomCurve3(PATH.map(function (p) { return new T.Vector3(p[0], 0, p[1]); }), false, 'centripetal');
  var pathLen = pathCurve.getLength();
  (function buildPavers() {
    var step = 0.78, n = Math.floor(pathLen / step);
    var geo = new T.BoxGeometry(1.25, 0.06, 0.52);
    for (var i = 1; i < n; i++) {
      var u = i / n;
      var p = pathCurve.getPointAt(u), t = pathCurve.getTangentAt(u);
      if (p.x > 13.6 || (p.x > 5.2 && p.x < 10.0)) continue; // no pavers outside the wall or on the driveway
      var m = add(geo, MAT.paver, p.x, 0.03, p.z, { cast: false, heat: 0.27 });
      m.rotation.y = Math.atan2(t.x, t.z);
    }
  })();
  // bollard lights along the path
  [0.52, 0.68, 0.84].forEach(function (u, i) {
    var p = pathCurve.getPointAt(u), t = pathCurve.getTangentAt(u);
    var side = i % 2 ? 1 : -1;
    var x = p.x + t.z * 1.0 * side, z = p.z - t.x * 1.0 * side;
    add(new T.CylinderGeometry(0.07, 0.08, 0.7, 12), MAT.frame, x, 0.35, z, { heat: 0.3 });
    add(new T.CylinderGeometry(0.075, 0.075, 0.12, 12), MAT.lamp, x, 0.62, z, { cast: false, heat: 0.8 });
    var l = new T.PointLight(0xffd29a, 1.1, 4.2, 2);
    l.position.set(x, 0.55, z);
    world.add(l);
  });

  /* ---------- vegetation ---------- */
  function palm(x, z, h, lean) {
    var g = new T.Group();
    g.position.set(x, 0, z);
    world.add(g);
    var segs = 7, py = 0, px = 0;
    for (var i = 0; i < segs; i++) {
      var sh = h / segs;
      var r0 = 0.2 - i * 0.012, r1 = 0.2 - (i + 1) * 0.012;
      var s = add(new T.CylinderGeometry(r1, r0, sh, 8), MAT.trunk, px, py + sh / 2, 0, { parent: g, heat: 0.24 });
      s.rotation.z = -lean * (i / segs) * 0.5;
      py += sh; px += lean * sh * (i / segs) * 0.5;
    }
    var crown = new T.Group();
    crown.position.set(px, py, 0);
    g.add(crown);
    for (var f = 0; f < 11; f++) {
      var leaf = add(new T.ConeGeometry(0.34, 2.6, 4, 1), f % 2 ? MAT.leaf : MAT.leafDark, 0, 0, 0, { parent: crown, heat: 0.2, ir: '#e2e2dc' });
      leaf.geometry.translate(0, 1.3, 0);
      leaf.scale.set(1, 1, 0.12);
      leaf.rotation.set(0, (f / 11) * Math.PI * 2, 0);
      leaf.rotateX(1.05 + Math.random() * 0.45);
    }
    return g;
  }
  function tree(x, z, s) {
    add(new T.CylinderGeometry(0.12 * s, 0.18 * s, 2.2 * s, 8), MAT.trunk, x, 1.1 * s, z, { heat: 0.24 });
    for (var i = 0; i < 4; i++) {
      add(new T.IcosahedronGeometry(rnd(0.9, 1.3) * s, 1), i % 2 ? MAT.leaf : MAT.leafDark,
        x + rnd(-0.7, 0.7) * s, (2.6 + rnd(-0.2, 0.7)) * s, z + rnd(-0.7, 0.7) * s, { heat: 0.2, ir: '#dadad4' });
    }
  }
  palm(-10.2, 1.0, 6.4, 0.25);
  palm(-5.8, -4.9, 7.6, -0.1);
  palm(10.2, -3.6, 7.0, -0.2);
  palm(-12.6, -7.5, 5.8, 0.15);
  tree(12.4, 4.4, 1.2);
  tree(-11.5, -11.5, 1.4);
  tree(-1.0, 4.6, 0.9);
  // up-light on the feature palm
  var palmSpot = new T.SpotLight(0xffd7a6, 2.2, 10, 0.5, 0.7, 2);
  palmSpot.position.set(-9.6, 0.2, 1.6);
  palmSpot.target.position.set(-10.1, 6, 1.0);
  world.add(palmSpot, palmSpot.target);

  /* ---------- parked car (known vehicle) ---------- */
  var car = new T.Group();
  car.position.set(7.6, 0, 2.4);
  world.add(car);
  add(new T.BoxGeometry(1.95, 0.62, 4.7), MAT.carBody, 0, 0.62, 0, { parent: car, heat: 0.3 });
  add(new T.BoxGeometry(1.8, 0.2, 4.5), MAT.carBody, 0, 0.98, 0.05, { parent: car, heat: 0.3 });
  var cabin = add(new T.BoxGeometry(1.7, 0.52, 2.5), MAT.carGlass, 0, 1.32, 0.35, { parent: car, heat: 0.2 });
  cabin.scale.set(1, 1, 1);
  add(new T.BoxGeometry(1.74, 0.07, 2.2), MAT.carBody, 0, 1.6, 0.35, { parent: car, heat: 0.3 });
  add(new T.BoxGeometry(1.7, 0.06, 0.04), MAT.tail, 0, 0.88, 2.36, { parent: car, cast: false, heat: 0.4 });
  [[-0.92, 1.5], [0.92, 1.5], [-0.92, -1.55], [0.92, -1.55]].forEach(function (w) {
    var tyre = add(new T.CylinderGeometry(0.36, 0.36, 0.26, 18), MAT.tyre, w[0], 0.36, w[1], { parent: car, heat: 0.25 });
    tyre.rotation.z = Math.PI / 2;
  });

  /* ======================================================================
     Lighting
     ====================================================================== */
  var hemi = new T.HemisphereLight(0x4d6f9a, 0x0b0f0b, 0.42);
  scene.add(hemi);

  var moon = new T.DirectionalLight(0x9db6ff, 0.5);
  moon.position.set(-16, 24, 14);
  moon.castShadow = true;
  moon.shadow.mapSize.set(isMobile ? 1024 : 2048, isMobile ? 1024 : 2048);
  var sc = moon.shadow.camera;
  sc.left = -20; sc.right = 20; sc.top = 20; sc.bottom = -20; sc.near = 1; sc.far = 70;
  moon.shadow.bias = -0.0006;
  moon.shadow.normalBias = 0.03;
  scene.add(moon);

  var porch = new T.SpotLight(0xffc68a, 3.2, 11, 0.95, 0.65, 2);
  porch.position.set(3.6, 2.92, -5.0);
  porch.target.position.set(3.4, 0, -3.6);
  porch.castShadow = true;
  porch.shadow.mapSize.set(1024, 1024);
  porch.shadow.bias = -0.0008;
  world.add(porch, porch.target);

  var interiorA = new T.PointLight(0xffb066, 2.6, 11, 2);
  interiorA.position.set(-3.5, 2.4, -9.0);
  var interiorB = new T.PointLight(0xffb066, 2.4, 10, 2);
  interiorB.position.set(1.8, 2.4, -9.0);
  var upstairs = new T.PointLight(0xffb87a, 1.4, 8, 2);
  upstairs.position.set(-0.5, 4.9, -4.0);
  var gateA = new T.PointLight(0xffd5a0, 1.2, 5, 2);
  gateA.position.set(13.2, 2.2, 5.4);
  var gateB = new T.PointLight(0xffd5a0, 1.2, 5, 2);
  gateB.position.set(13.2, 2.2, 8.6);
  world.add(interiorA, interiorB, upstairs, gateA, gateB);

  // camera-mounted IR illuminator (only lit in infrared mode)
  var irLamp = new T.SpotLight(0xffffff, 0, 48, 0.62, 0.55, 1.2);
  irLamp.position.copy(CAM_POS);
  scene.add(irLamp, irLamp.target);

  /* ======================================================================
     People
     ====================================================================== */
  var SKIN = std('#5b3b2a', 0.7);
  function capsule(r, len) { return new T.CapsuleGeometry(r, len, 6, 12); }

  function makePerson(kind) {
    var courier = kind === 'courier';
    var top = courier ? std('#c9e33a', 0.6, 0, { emissive: new T.Color('#2a3304'), emissiveIntensity: 0.4 }) : std('#b9b2a6', 0.85);
    var under = std('#1d2128', 0.9);
    var legs = courier ? std('#23262b', 0.9) : std('#2c3a52', 0.9);
    var shoe = std('#0d0d0e', 0.6);
    var stripe = new T.MeshStandardMaterial({ color: new T.Color('#dcdcdc'), emissive: new T.Color('#9a9a9a'), emissiveIntensity: 0.6, roughness: 0.3 });

    var P = { root: new T.Group(), sh: [], el: [], hip: [], knee: [], foot: [], hand: [] };
    var heatSkin = 0.98, heatCloth = 0.82;
    function part(geo, mat, parent, x, y, z, heat) { return add(geo, mat, x, y, z, { parent: parent, heat: heat == null ? heatCloth : heat }); }

    P.hips = new T.Group(); P.hips.position.y = 0.95; P.root.add(P.hips);
    P.spine = new T.Group(); P.hips.add(P.spine);
    var pelvis = part(capsule(0.14, 0.06), legs, P.hips, 0, 0.02, 0);
    pelvis.scale.set(1.15, 1, 0.78);
    var torso = part(capsule(0.155, 0.34), top, P.spine, 0, 0.31, 0);
    torso.scale.set(1.2, 1, 0.74);
    if (courier) {
      var band1 = part(new T.CylinderGeometry(0.192, 0.192, 0.04, 20), stripe, P.spine, 0, 0.2, 0, 0.82);
      band1.scale.set(1.0, 1, 0.66);
      var band2 = part(new T.CylinderGeometry(0.196, 0.196, 0.04, 20), stripe, P.spine, 0, 0.36, 0, 0.82);
      band2.scale.set(1.0, 1, 0.66);
    }
    P.neck = new T.Group(); P.neck.position.y = 0.6; P.spine.add(P.neck);
    part(new T.CylinderGeometry(0.045, 0.05, 0.08, 10), SKIN, P.neck, 0, 0.03, 0, heatSkin);
    P.head = part(new T.SphereGeometry(0.104, 22, 16), SKIN, P.neck, 0, 0.15, 0.005, heatSkin);
    P.head.scale.set(0.9, 1.1, 1.0);
    var cap = part(new T.SphereGeometry(0.11, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), courier ? std('#1a1d22', 0.8) : std('#111214', 0.9), P.neck, 0, 0.17, 0, 0.7);
    cap.scale.set(0.95, 0.9, 1.05);
    if (courier) part(new T.BoxGeometry(0.16, 0.012, 0.12), std('#1a1d22', 0.8), P.neck, 0, 0.18, 0.13, 0.6);

    for (var s = 0; s < 2; s++) {
      var side = s === 0 ? 1 : -1;
      var sh = new T.Group(); sh.position.set(0.205 * side, 0.52, 0); P.spine.add(sh);
      part(capsule(0.052, 0.21), top, sh, 0, -0.15, 0);
      var el = new T.Group(); el.position.y = -0.3; sh.add(el);
      part(capsule(0.044, 0.19), courier ? SKIN : top, el, 0, -0.13, 0, courier ? heatSkin : heatCloth);
      var hand = part(new T.SphereGeometry(0.048, 12, 10), SKIN, el, 0, -0.29, 0.01, heatSkin);
      var hip = new T.Group(); hip.position.set(0.095 * side, -0.02, 0); P.hips.add(hip);
      part(capsule(0.07, 0.31), legs, hip, 0, -0.22, 0);
      var knee = new T.Group(); knee.position.y = -0.45; hip.add(knee);
      part(capsule(0.056, 0.32), legs, knee, 0, -0.22, 0);
      var foot = new T.Group(); foot.position.y = -0.44; knee.add(foot);
      part(new T.BoxGeometry(0.1, 0.07, 0.26), shoe, foot, 0, -0.01, 0.05, 0.5);
      P.sh.push(sh); P.el.push(el); P.hip.push(hip); P.knee.push(knee); P.foot.push(foot); P.hand.push(hand);
    }
    // carry anchor in front of the chest
    P.carry = new T.Group(); P.carry.position.set(0, 0.12, 0.32); P.spine.add(P.carry);
    P.root.visible = false;
    world.add(P.root);
    P.pose = blankPose();
    P.phase = 0;
    P.kind = kind;
    return P;
  }

  function blankPose() {
    return { hipY: 0.95, sp: 0.04, sy: 0, hp: 0, hy: 0, shp: [0, 0], shr: [0.06, 0.06], el: [0.2, 0.2], lp: [0, 0], kn: [0.04, 0.04] };
  }
  function lerpPose(cur, tgt, k) {
    cur.hipY += (tgt.hipY - cur.hipY) * k;
    cur.sp += (tgt.sp - cur.sp) * k; cur.sy += (tgt.sy - cur.sy) * k;
    cur.hp += (tgt.hp - cur.hp) * k; cur.hy += (tgt.hy - cur.hy) * k;
    for (var i = 0; i < 2; i++) {
      cur.shp[i] += (tgt.shp[i] - cur.shp[i]) * k; cur.shr[i] += (tgt.shr[i] - cur.shr[i]) * k;
      cur.el[i] += (tgt.el[i] - cur.el[i]) * k; cur.lp[i] += (tgt.lp[i] - cur.lp[i]) * k; cur.kn[i] += (tgt.kn[i] - cur.kn[i]) * k;
    }
  }
  function applyPose(P) {
    var p = P.pose;
    P.hips.position.y = p.hipY;
    P.spine.rotation.set(p.sp, p.sy, 0);
    P.neck.rotation.set(p.hp, p.hy, 0);
    for (var i = 0; i < 2; i++) {
      var side = i === 0 ? 1 : -1;
      P.sh[i].rotation.set(-p.shp[i], 0, p.shr[i] * side);
      P.el[i].rotation.set(-p.el[i], 0, 0);
      P.hip[i].rotation.set(-p.lp[i], 0, 0);
      P.knee[i].rotation.set(p.kn[i], 0, 0);
      P.foot[i].rotation.set(-(p.kn[i] - p.lp[i]) * 0.55, 0, 0);
    }
  }

  function walkPose(phase, carrying) {
    var s = Math.sin(phase), s2 = Math.sin(phase + Math.PI);
    var p = blankPose();
    p.hipY = 0.935 + 0.022 * Math.cos(phase * 2);
    p.sp = 0.07; p.sy = 0.07 * s;
    p.lp = [0.44 * s, 0.44 * s2];
    p.kn = [0.06 + 1.0 * Math.pow(Math.max(0, Math.cos(phase + 0.55)), 2), 0.06 + 1.0 * Math.pow(Math.max(0, Math.cos(phase + Math.PI + 0.55)), 2)];
    if (carrying) { p.shp = [0.6, 0.6]; p.shr = [0.18, 0.18]; p.el = [1.05, 1.05]; }
    else { p.shp = [0.36 * s2, 0.36 * s]; p.el = [0.28 + 0.18 * Math.max(0, s2), 0.28 + 0.18 * Math.max(0, s)]; }
    return p;
  }
  function idlePose(t, carrying) {
    var p = blankPose();
    p.sp = 0.03 + 0.012 * Math.sin(t * 1.7);
    p.hipY = 0.95 + 0.004 * Math.sin(t * 1.7);
    if (carrying) { p.shp = [0.6, 0.6]; p.shr = [0.18, 0.18]; p.el = [1.05, 1.05]; }
    return p;
  }
  function bendPose(carrying) {
    var p = blankPose();
    p.hipY = 0.7; p.sp = 0.95; p.hp = -0.35;
    p.lp = [1.0, 0.75]; p.kn = [1.45, 1.2];
    p.shp = [0.95, 0.95]; p.shr = [0.12, 0.12]; p.el = [0.25, 0.25];
    return p;
  }
  function reachPose() {
    var p = blankPose();
    p.shp = [0.1, 1.25]; p.shr = [0.06, 0.02]; p.el = [0.2, 0.55]; p.hp = 0.05; p.sy = -0.12;
    return p;
  }

  var courier = makePerson('courier');
  var resident = makePerson('resident');
  var parcel = add(new T.BoxGeometry(0.42, 0.3, 0.32), std('#a77b4f', 0.9), 0, 0, 0, { heat: 0.3 });
  add(new T.BoxGeometry(0.43, 0.04, 0.06), std('#d8c9a8', 0.8), 0, 0.13, 0, { parent: parcel, cast: false, heat: 0.3 });
  parcel.visible = false;
  var parcelState = 'none'; // none | carried | ground

  /* ======================================================================
     Story engine
     ====================================================================== */
  var actor = null;         // active person
  var identity = 'unknown'; // unknown | resident
  var inZone = false;
  var trail = [];
  var ZONE = [new T.Vector3(1.4, 0.02, -2.4), new T.Vector3(5.4, 0.02, -2.4), new T.Vector3(5.4, 0.02, -6.1), new T.Vector3(1.4, 0.02, -6.1)];
  var queue = [], current = null, storyTime = 0, pass = 0;

  function ev(text, level, extra) {
    var d = { text: text, level: level || 'info' };
    if (extra) for (var k in extra) d[k] = extra[k];
    emit('sentra:event', d);
  }

  function setActor(P, u) {
    if (actor && actor !== P) actor.root.visible = false;
    actor = P;
    var p = pathCurve.getPointAt(u);
    P.root.position.copy(p);
    var t = pathCurve.getTangentAt(u);
    P.root.rotation.y = Math.atan2(t.x, t.z);
    P.yaw = P.root.rotation.y;
    P.root.visible = true;
    P.pose = blankPose();
    trail = [];
    inZone = false;
  }

  // actions: each returns true when finished
  function aDo(fn) { return { update: function () { fn(); return true; } }; }
  function aWait(sec, mode) { var t = 0; return { mode: mode || 'idle', update: function (dt) { t += dt; return t >= sec; } }; }
  function aPose(name, sec) { var t = 0; return { mode: name, update: function (dt) { t += dt; return t >= sec; } }; }
  function aWalkPath(u0, u1, speed) {
    var u = u0, dir = u1 > u0 ? 1 : -1;
    return {
      mode: 'walk',
      update: function (dt) {
        u += dir * (speed * dt) / pathLen;
        var done = dir > 0 ? u >= u1 : u <= u1;
        if (done) u = u1;
        var p = pathCurve.getPointAt(Math.min(1, Math.max(0, u)));
        var t = pathCurve.getTangentAt(Math.min(1, Math.max(0, u)));
        actor.root.position.x = p.x; actor.root.position.z = p.z;
        actor.targetYaw = Math.atan2(t.x * dir, t.z * dir);
        actor.speed = speed;
        return done;
      }
    };
  }
  function aWalkTo(points, speed) {
    var i = 0;
    return {
      mode: 'walk',
      update: function (dt) {
        var target = points[i];
        var pos = actor.root.position;
        var dx = target.x - pos.x, dz = target.z - pos.z, d = Math.hypot(dx, dz);
        var stepLen = speed * dt;
        if (d <= stepLen) { pos.x = target.x; pos.z = target.z; i++; return i >= points.length; }
        pos.x += dx / d * stepLen; pos.z += dz / d * stepLen;
        actor.targetYaw = Math.atan2(dx, dz);
        actor.speed = speed;
        return false;
      }
    };
  }
  function aFace(yaw, sec) { var t = 0; return { mode: 'idle', update: function (dt) { actor.targetYaw = yaw; t += dt; return t >= sec; } }; }

  var notified = false;
  function storyCourier(startU) {
    return [
      aDo(function () { setActor(courier, startU); identity = 'unknown'; parcelState = 'carried'; parcel.visible = true; ev('PERSON DETECTED · EAST GATE', 'info'); }),
      aWalkPath(startU, 1, 1.35),
      aFace(Math.PI, 0.5),
      aPose('bend', 0.9),
      aDo(function () {
        parcelState = 'ground';
        var p = actor.root.position;
        parcel.position.set(p.x - 0.45, 0.15, p.z - 0.35);
        parcel.rotation.set(0, 0.3, 0);
        ev('PACKAGE DETECTED · PORCH', 'info');
      }),
      aPose('idle', 0.5),
      aPose('reach', 0.9),
      aDo(function () { flashPanel('#2bdcea'); ev('DOORBELL · OWNER NOTIFIED', 'warn', { notify: true }); }),
      aWait(1.4),
      aDo(function () { ev('TWO-WAY AUDIO · OWNER REPLIED', 'info'); }),
      aWait(1.6),
      aWalkPath(1, 0, 1.45),
      aDo(function () { ev('PERSON EXITED · EAST GATE', 'info'); actor.root.visible = false; actor = null; }),
      aWait(2.2)
    ];
  }
  function storyResident() {
    return [
      aDo(function () { setActor(resident, 0); identity = 'unknown'; ev('PERSON DETECTED · EAST GATE', 'info'); }),
      aWalkPath(0, 1, 1.4),
      aFace(Math.PI, 0.3),
      aPose('look', 1.3),
      aDo(function () { identity = 'resident'; ev('FACE MATCH · RESIDENT · 99.2%', 'ok'); }),
      aDo(function () { if (parcelState === 'ground') queue.unshift(aPose('bend', 0.9), aDo(function () { parcelState = 'carried'; ev('PACKAGE COLLECTED', 'ok'); }), aPose('idle', 0.4)); }),
      aDo(function () { flashPanel('#3be38a'); doorTarget = 1.45; ev('ACCESS GRANTED · FRONT DOOR', 'ok'); }),
      aWait(0.9),
      aWalkTo([new T.Vector3(3.5, 0, -6.9)], 1.2),
      aDo(function () { setTimeout(function () { doorTarget = 0; ev('DOOR SECURED · ALARM DISARMED', 'info'); }, 900); }),
      aWalkTo([new T.Vector3(1.6, 0, -8.3), new T.Vector3(-1.8, 0, -8.6), new T.Vector3(-3.6, 0, -9.0)], 1.1),
      aWait(0.6),
      aDo(function () { ev('TRACK ENDED · INDOORS', 'info'); actor.root.visible = false; actor = null; parcel.visible = false; parcelState = 'none'; }),
      aWait(2.4)
    ];
  }

  function nextStory() {
    pass++;
    queue = pass % 2 === 1 ? storyCourier(pass === 1 ? 0.18 : 0) : storyResident();
  }

  var panelReset = 0;
  function flashPanel(hex) {
    MAT.panel.emissive.set(hex);
    MAT.panel.emissiveIntensity = 3.2;
    clearTimeout(panelReset);
    panelReset = setTimeout(function () { MAT.panel.emissive.set('#2bdcea'); MAT.panel.emissiveIntensity = 1.6; }, 3500);
  }

  function updateStory(dt, t) {
    if (!current) {
      if (!queue.length) nextStory();
      current = queue.shift();
    }
    if (current.update(dt)) current = null;
    var mode = current ? current.mode : 'idle';

    if (actor && actor.root.visible) {
      var P = actor;
      // step up onto the plinth / interior floor
      var floorY = P.root.position.z < -5.55 ? 0.19 : 0;
      P.root.position.y += (floorY - P.root.position.y) * Math.min(1, dt * 10);
      // yaw smoothing
      if (P.targetYaw != null) {
        var dy = P.targetYaw - P.root.rotation.y;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        P.root.rotation.y += dy * Math.min(1, dt * 7);
      }
      var carrying = parcelState === 'carried';
      var target;
      if (mode === 'walk') {
        P.phase += dt * (P.speed || 1.3) / 1.42 * Math.PI * 2;
        target = walkPose(P.phase, carrying);
      } else if (mode === 'bend') target = bendPose();
      else if (mode === 'reach') target = reachPose();
      else if (mode === 'look') {
        target = idlePose(t, carrying);
        // turn the head up toward the camera
        var cp = CAM_POS, rp = P.root.position;
        var yawTo = Math.atan2(cp.x - rp.x, cp.z - rp.z) - P.root.rotation.y;
        while (yawTo > Math.PI) yawTo -= Math.PI * 2;
        while (yawTo < -Math.PI) yawTo += Math.PI * 2;
        target.hy = Math.max(-1.1, Math.min(1.1, yawTo));
        target.hp = -0.32; target.sy = target.hy * 0.25;
      } else target = idlePose(t, carrying);
      lerpPose(P.pose, target, 1 - Math.exp(-dt * (mode === 'walk' ? 14 : 6)));
      applyPose(P);

      // parcel follows the carry anchor
      if (carrying && parcel.visible) {
        P.carry.getWorldPosition(parcel.position);
        parcel.position.y -= 0.05;
        parcel.rotation.set(0, P.root.rotation.y, 0);
      }

      // trail (foot positions)
      var rp2 = P.root.position;
      var last = trail[trail.length - 1];
      if (!last || last.distanceToSquared(rp2) > 0.12) {
        trail.push(new T.Vector3(rp2.x, 0.03, rp2.z));
        if (trail.length > 46) trail.shift();
      }
      // entrance zone
      var nowIn = rp2.x > ZONE[0].x && rp2.x < ZONE[1].x && rp2.z < ZONE[0].z && rp2.z > ZONE[2].z;
      if (nowIn !== inZone) {
        inZone = nowIn;
        if (inZone) ev(identity === 'resident' ? 'RESIDENT · ZONE A' : 'UNKNOWN VISITOR · ZONE A', identity === 'resident' ? 'ok' : 'warn');
      }
    }

    // door animation
    doorAngle += (doorTarget - doorAngle) * Math.min(1, dt * 2.6);
    doorPivot.rotation.y = doorAngle;
  }

  /* ======================================================================
     Post-processing
     ====================================================================== */
  var rtOpts = { type: webgl2 ? T.HalfFloatType : T.UnsignedByteType, samples: webgl2 && !isMobile ? 4 : 0 };
  var rtScene = new T.WebGLRenderTarget(4, 4, rtOpts);
  var rtA = new T.WebGLRenderTarget(4, 4, { type: rtOpts.type });
  var rtB = new T.WebGLRenderTarget(4, 4, { type: rtOpts.type });
  var postScene = new T.Scene();
  var postCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  var quad = new T.Mesh(new T.PlaneGeometry(2, 2));
  postScene.add(quad);

  var VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  var brightMat = new T.ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, uTexel: { value: new T.Vector2() }, uThreshold: { value: 0.9 } },
    vertexShader: VERT,
    fragmentShader: [
      'uniform sampler2D tDiffuse; uniform vec2 uTexel; uniform float uThreshold; varying vec2 vUv;',
      'void main(){',
      ' vec3 c = texture2D(tDiffuse, vUv + uTexel * vec2(-1.0,-1.0)).rgb + texture2D(tDiffuse, vUv + uTexel * vec2(1.0,-1.0)).rgb;',
      ' c += texture2D(tDiffuse, vUv + uTexel * vec2(-1.0,1.0)).rgb + texture2D(tDiffuse, vUv + uTexel * vec2(1.0,1.0)).rgb;',
      ' c *= 0.25;',
      ' float l = max(max(c.r, c.g), c.b);',
      ' gl_FragColor = vec4(c * smoothstep(uThreshold, uThreshold + 0.8, l), 1.0);',
      '}'
    ].join('\n'),
    depthTest: false, depthWrite: false
  });
  var blurMat = new T.ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, uDir: { value: new T.Vector2() } },
    vertexShader: VERT,
    fragmentShader: [
      'uniform sampler2D tDiffuse; uniform vec2 uDir; varying vec2 vUv;',
      'void main(){',
      ' vec3 s = texture2D(tDiffuse, vUv).rgb * 0.227027;',
      ' s += texture2D(tDiffuse, vUv + uDir * 1.3846).rgb * 0.316216; s += texture2D(tDiffuse, vUv - uDir * 1.3846).rgb * 0.316216;',
      ' s += texture2D(tDiffuse, vUv + uDir * 3.2308).rgb * 0.070270; s += texture2D(tDiffuse, vUv - uDir * 3.2308).rgb * 0.070270;',
      ' gl_FragColor = vec4(s, 1.0);',
      '}'
    ].join('\n'),
    depthTest: false, depthWrite: false
  });
  var compMat = new T.ShaderMaterial({
    uniforms: {
      tScene: { value: null }, tBloom: { value: null },
      uTime: { value: 0 }, uAspect: { value: 1 }, uRes: { value: new T.Vector2(1, 1) },
      uMode: { value: 0 }, uExposure: { value: 1 }, uBloom: { value: 0.9 },
      uGrain: { value: 0.05 }, uGlitch: { value: 0 }, uK: { value: 0.05 }, uZoom: { value: 0.965 }
    },
    vertexShader: VERT,
    fragmentShader: [
      'uniform sampler2D tScene; uniform sampler2D tBloom;',
      'uniform float uTime, uAspect, uMode, uExposure, uBloom, uGrain, uGlitch, uK, uZoom; uniform vec2 uRes;',
      'varying vec2 vUv;',
      'float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
      'vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }',
      'vec3 ironbow(float t){',
      ' vec3 c0 = vec3(0.02, 0.0, 0.06), c1 = vec3(0.28, 0.02, 0.45), c2 = vec3(0.78, 0.07, 0.35), c3 = vec3(0.98, 0.42, 0.04), c4 = vec3(1.0, 0.86, 0.25), c5 = vec3(1.0, 1.0, 0.92);',
      ' if (t < 0.2) return mix(c0, c1, t / 0.2);',
      ' if (t < 0.42) return mix(c1, c2, (t - 0.2) / 0.22);',
      ' if (t < 0.62) return mix(c2, c3, (t - 0.42) / 0.2);',
      ' if (t < 0.82) return mix(c3, c4, (t - 0.62) / 0.2);',
      ' return mix(c4, c5, (t - 0.82) / 0.18);',
      '}',
      'void main(){',
      ' vec2 uv = vUv;',
      ' if (uGlitch > 0.0) {',
      '  float band = floor(uv.y * 28.0 + uTime * 40.0);',
      '  float r = hash(vec2(band, floor(uTime * 24.0)));',
      '  if (r > 1.0 - uGlitch * 0.7) uv.x += (hash(vec2(band, 7.0)) - 0.5) * 0.12 * uGlitch;',
      ' }',
      ' vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);',
      ' float r2 = dot(p, p);',
      ' vec2 q = p * (1.0 + uK * r2) * uZoom;',
      ' vec2 suv = q / vec2(uAspect, 1.0) + 0.5;',
      ' vec2 ca = (suv - 0.5) * (0.0028 + 0.004 * uGlitch) * (0.5 + r2);',
      ' vec3 col;',
      ' col.r = texture2D(tScene, suv + ca).r;',
      ' col.g = texture2D(tScene, suv).g;',
      ' col.b = texture2D(tScene, suv - ca).b;',
      ' col += texture2D(tBloom, suv).rgb * uBloom;',
      ' col *= uExposure;',
      ' float l;',
      ' if (uMode < 0.5) {',
      '  col = aces(col);',
      '  l = dot(col, vec3(0.299, 0.587, 0.114));',
      '  col = mix(vec3(l), col, 0.9);',
      '  col = pow(col, vec3(1.0 / 2.2));',
      '  col = mix(col, col * vec3(0.92, 1.0, 1.06), smoothstep(0.5, 0.0, l));',
      ' } else if (uMode < 1.5) {',
      '  col = aces(col);',
      '  l = pow(dot(col, vec3(0.3, 0.59, 0.11)), 1.0 / 2.2);',
      '  l = smoothstep(0.03, 0.92, l);',
      '  col = vec3(l) * vec3(0.9, 1.0, 0.94);',
      ' } else {',
      '  l = clamp(dot(col, vec3(0.3333)), 0.0, 1.0);',
      '  col = ironbow(pow(l, 0.85));',
      ' }',
      ' float g = hash(uv * uRes + fract(uTime * 7.13) * 91.7) - 0.5;',
      ' col += g * uGrain;',
      ' col *= 0.955 + 0.045 * sin(uv.y * uRes.y * 1.4);',
      ' float bar = smoothstep(0.92, 1.0, sin((uv.y + uTime * 0.07) * 6.2831) * 0.5 + 0.5);',
      ' col *= 1.0 + bar * 0.05;',
      ' float v = smoothstep(1.35, 0.3, length(p * vec2(0.85, 1.15)));',
      ' col *= mix(0.42, 1.0, v);',
      ' if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) col *= 0.0;',
      ' gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n'),
    depthTest: false, depthWrite: false
  });

  /* ---------- sensor modes ---------- */
  var MODES = [
    { name: 'NIGHT COLOUR', exposure: 1.3, bloom: 0.9, grain: 0.045, threshold: 0.85, ir: 0, fog: 0x070b10, fogD: 0.014, bg: 0x05080c, hemi: 0.55 },
    { name: 'INFRARED · 850nm', exposure: 1.05, bloom: 0.5, grain: 0.085, threshold: 1.1, ir: 1.9, fog: 0x0b0b0b, fogD: 0.02, bg: 0x060606, hemi: 0.18 },
    { name: 'THERMAL · IRONBOW', exposure: 1.0, bloom: 0.35, grain: 0.04, threshold: 0.95, ir: 0, fog: 0x000000, fogD: 0.032, bg: 0x000000, hemi: 0.15 }
  ];
  var modeIdx = 0, glitch = 0;
  function applyMode(i) {
    var m = MODES[i];
    modeIdx = i; api.mode = i;
    registry.forEach(function (r) { r.mesh.material = r.mats[i]; });
    compMat.uniforms.uMode.value = i;
    compMat.uniforms.uExposure.value = m.exposure;
    compMat.uniforms.uBloom.value = m.bloom;
    compMat.uniforms.uGrain.value = m.grain;
    brightMat.uniforms.uThreshold.value = m.threshold;
    irLamp.intensity = m.ir;
    hemi.intensity = m.hemi;
    scene.fog.color.setHex(m.fog);
    scene.fog.density = m.fogD;
    BG.setHex(m.bg);
  }
  api.setMode = function (i) {
    if (i === modeIdx) return;
    glitch = 1;
    setTimeout(function () { applyMode(i); }, reduceMotion ? 0 : 140);
    emit('sentra:mode', { index: i, name: MODES[i].name });
  };
  api.modes = MODES.map(function (m) { return m.name; });

  /* ======================================================================
     Overlay (SVG): zone, trail, detection boxes
     ====================================================================== */
  var NS = 'http://www.w3.org/2000/svg';
  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  var gZone = el('g', { 'class': 'ov-zone' }, overlay);
  var zonePoly = el('polygon', {}, gZone);
  var zoneText = el('text', {}, gZone);
  zoneText.textContent = 'ZONE A · ENTRANCE';
  var trailLine = el('polyline', { 'class': 'ov-trail' }, overlay);

  function makeBox(cls) {
    var g = el('g', { 'class': 'ov-box ' + cls }, overlay);
    var frame = el('rect', { 'class': 'ov-frame' }, g);
    var corners = el('path', { 'class': 'ov-corners' }, g);
    var tagBg = el('rect', { 'class': 'ov-tagbg', height: 17 }, g);
    var tag = el('text', { 'class': 'ov-tag' }, g);
    var sub = el('text', { 'class': 'ov-sub' }, g);
    return { g: g, frame: frame, corners: corners, tagBg: tagBg, tag: tag, sub: sub, x: 0, y: 0, w: 0, h: 0, init: false, shown: false };
  }
  var boxPerson = makeBox('ov-box--person');
  var boxCar = makeBox('ov-box--vehicle');
  var boxParcel = makeBox('ov-box--package');

  var W = 1, H = 1, dpr = 1;
  var v3 = new T.Vector3();
  var box3 = new T.Box3();
  var corners8 = [];
  for (var c8 = 0; c8 < 8; c8++) corners8.push(new T.Vector3());

  // world -> CSS pixels, including the lens distortion applied in the shader
  function toScreen(vec, out) {
    v3.copy(vec).project(camera);
    var sx = v3.x * 0.5, sy = -v3.y * 0.5; // source, centred
    var k = compMat.uniforms.uK.value, z = compMat.uniforms.uZoom.value, a = W / H;
    var tx = sx * a, ty = sy;
    var px = tx / z, py = ty / z;
    for (var i = 0; i < 4; i++) {
      var f = (1 + k * (px * px + py * py)) * z;
      px = tx / f; py = ty / f;
    }
    out.x = (px / a + 0.5) * W;
    out.y = (py + 0.5) * H;
    out.behind = v3.z > 1;
    return out;
  }
  var tmp = { x: 0, y: 0 };

  function screenBox(obj) {
    box3.setFromObject(obj);
    var mn = box3.min, mx = box3.max;
    var i = 0;
    for (var xi = 0; xi < 2; xi++) for (var yi = 0; yi < 2; yi++) for (var zi = 0; zi < 2; zi++) {
      corners8[i++].set(xi ? mx.x : mn.x, yi ? mx.y : mn.y, zi ? mx.z : mn.z);
    }
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (var j = 0; j < 8; j++) {
      toScreen(corners8[j], tmp);
      if (tmp.x < x0) x0 = tmp.x; if (tmp.x > x1) x1 = tmp.x;
      if (tmp.y < y0) y0 = tmp.y; if (tmp.y > y1) y1 = tmp.y;
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  function drawBox(B, r, show, label, sub, smooth) {
    if (!show) { if (B.shown) { B.g.classList.remove('is-on'); B.shown = false; B.init = false; } return; }
    if (!B.init) { B.x = r.x; B.y = r.y; B.w = r.w; B.h = r.h; B.init = true; }
    var k = smooth;
    B.x += (r.x - B.x) * k; B.y += (r.y - B.y) * k; B.w += (r.w - B.w) * k; B.h += (r.h - B.h) * k;
    var pad = 6, x = B.x - pad, y = B.y - pad, w = B.w + pad * 2, h = B.h + pad * 2;
    var L = Math.max(6, Math.min(16, Math.min(w, h) * 0.25));
    B.frame.setAttribute('x', x.toFixed(1)); B.frame.setAttribute('y', y.toFixed(1));
    B.frame.setAttribute('width', w.toFixed(1)); B.frame.setAttribute('height', h.toFixed(1));
    B.corners.setAttribute('d',
      'M' + x + ' ' + (y + L) + 'V' + y + 'H' + (x + L) +
      'M' + (x + w - L) + ' ' + y + 'H' + (x + w) + 'V' + (y + L) +
      'M' + (x + w) + ' ' + (y + h - L) + 'V' + (y + h) + 'H' + (x + w - L) +
      'M' + (x + L) + ' ' + (y + h) + 'H' + x + 'V' + (y + h - L));
    if (B.label !== label) { B.tag.textContent = label; B.label = label; }
    if (B.subLabel !== sub) { B.sub.textContent = sub || ''; B.subLabel = sub; }
    var tw = label.length * 6.55 + 12;
    B.tagBg.setAttribute('x', x.toFixed(1)); B.tagBg.setAttribute('y', (y - 19).toFixed(1));
    B.tagBg.setAttribute('width', tw.toFixed(1));
    B.tag.setAttribute('x', (x + 6).toFixed(1)); B.tag.setAttribute('y', (y - 7).toFixed(1));
    B.sub.setAttribute('x', x.toFixed(1)); B.sub.setAttribute('y', (y + h + 14).toFixed(1));
    if (!B.shown) { B.g.classList.add('is-on'); B.shown = true; }
  }

  var personId = 418, conf = 0.97, confT = 0;
  function updateOverlay(dt, t) {
    var k = 1 - Math.exp(-dt * 16);
    // zone
    var pts = ZONE.map(function (p) { toScreen(p, tmp); return tmp.x.toFixed(1) + ',' + tmp.y.toFixed(1); });
    zonePoly.setAttribute('points', pts.join(' '));
    toScreen(ZONE[3], tmp);
    zoneText.setAttribute('x', (tmp.x + 8).toFixed(1)); zoneText.setAttribute('y', (tmp.y - 8).toFixed(1));
    gZone.setAttribute('class', 'ov-zone' + (inZone ? (identity === 'resident' ? ' is-ok' : ' is-warn') : ''));

    // trail
    if (actor && actor.root.visible && trail.length > 1) {
      trailLine.setAttribute('points', trail.map(function (p) { toScreen(p, tmp); return tmp.x.toFixed(1) + ',' + tmp.y.toFixed(1); }).join(' '));
      trailLine.style.opacity = '1';
    } else trailLine.style.opacity = '0';

    // person
    if (t - confT > 0.35) { confT = t; conf = 0.94 + Math.random() * 0.05; }
    if (actor && actor.root.visible) {
      var rb = screenBox(actor.root);
      var who = identity === 'resident' ? 'RESIDENT' : (inZone ? 'UNKNOWN' : 'PERSON');
      var label = who + ' ' + conf.toFixed(2) + ' · ID ' + (actor === resident ? 207 : personId);
      var speed = (current && current.mode === 'walk') ? (actor.speed || 1.3).toFixed(1) + ' m/s' : 'STATIONARY';
      boxPerson.g.setAttribute('class', 'ov-box ov-box--person' + (boxPerson.shown ? ' is-on' : '') + (identity === 'resident' ? ' is-ok' : inZone ? ' is-warn' : ''));
      drawBox(boxPerson, rb, true, label, speed, k);
    } else drawBox(boxPerson, null, false);

    // vehicle
    drawBox(boxCar, screenBox(car), true, 'VEHICLE · KNOWN', 'PLATE ✓ · PARKED', 0.5);

    // parcel
    if (parcel.visible && parcelState === 'ground') drawBox(boxParcel, screenBox(parcel), true, 'PACKAGE 0.93', '', 0.5);
    else drawBox(boxParcel, null, false);
  }

  /* ======================================================================
     Camera: PTZ auto-tracking
     ====================================================================== */
  var focusAim = new T.Vector3();
  var tickT = 0;
  function updateCamera(dt, t) {
    var target = BASE_LOOK.clone();
    var tracking = actor && actor.root.visible;
    var wantFov = 44;
    if (tracking) {
      var p = actor.root.position;
      focusAim.set(p.x, 1.0, p.z);
      target.lerp(focusAim, 0.92);
      // PTZ auto-zoom: hold the subject at roughly the same height on screen
      var dist = Math.hypot(p.x - CAM_POS.x, p.z - CAM_POS.z, CAM_POS.y - 1);
      wantFov = 2 * Math.atan(1.8 / (2 * 0.17 * dist)) * 180 / Math.PI;
      wantFov = Math.max(24, Math.min(46, wantFov));
      if (p.z < -6.6) wantFov = Math.max(wantFov, 34);
    } else {
      target.x += Math.sin(t * 0.18) * 2.2; // idle patrol
    }
    if (isMobile) wantFov += 12;
    // critically damped follow
    var kk = 7.5, cc = 2 * Math.sqrt(kk) * 1.0;
    lookVel.x += (kk * (target.x - look.x) - cc * lookVel.x) * dt;
    lookVel.y += (kk * (target.y - look.y) - cc * lookVel.y) * dt;
    lookVel.z += (kk * (target.z - look.z) - cc * lookVel.z) * dt;
    look.addScaledVector(lookVel, dt);
    var fk = 4, fc = 2 * Math.sqrt(fk);
    fovVel += (fk * (wantFov - fov) - fc * fovVel) * dt;
    fov += fovVel * dt;
    camera.fov = fov;
    camera.lookAt(look);
    camera.updateProjectionMatrix();
    irLamp.target.position.copy(look);

    if (t - tickT > 0.1) {
      tickT = t;
      var dir = new T.Vector3().subVectors(look, CAM_POS).normalize();
      var pan = Math.atan2(dir.x, -dir.z) * 180 / Math.PI;
      var tilt = Math.asin(dir.y) * 180 / Math.PI;
      emit('sentra:tick', {
        pan: pan, tilt: tilt, zoom: 46 / fov, tracking: !!tracking,
        person: tracking ? { x: actor.root.position.x, z: actor.root.position.z, kind: identity } : null,
        look: { x: look.x, z: look.z }, cam: { x: CAM_POS.x, z: CAM_POS.z }, fov: fov * (W / H),
        parcel: parcel.visible && parcelState === 'ground' ? { x: parcel.position.x, z: parcel.position.z } : null,
        door: doorAngle > 0.2
      });
    }
  }

  /* ======================================================================
     Resize + loop
     ====================================================================== */
  /* ---------- adaptive quality ---------- */
  var QUALITY = [
    { dpr: 0.7, samples: 0, shadow: 512 },
    { dpr: 1.0, samples: 0, shadow: 1024 },
    { dpr: 1.6, samples: 4, shadow: 2048 }
  ];
  var quality = isMobile ? 1 : 2;
  function applyQuality() {
    var q = QUALITY[quality];
    var samples = webgl2 ? q.samples : 0;
    if (rtScene.samples !== samples) {
      rtScene.dispose();
      rtScene = new T.WebGLRenderTarget(4, 4, { type: rtOpts.type, samples: samples });
    }
    [moon, porch].forEach(function (l) {
      var size = l === porch ? Math.min(1024, q.shadow) : q.shadow;
      if (l.shadow.mapSize.x !== size) {
        l.shadow.mapSize.set(size, size);
        if (l.shadow.map) { l.shadow.map.dispose(); l.shadow.map = null; }
      }
    });
    resize();
  }
  var perf = { start: 0, frames: 0, checks: 0 };
  function watchPerf(now) {
    if (!perf.start) { perf.start = now; perf.frames = 0; return; }
    perf.frames++;
    var span = now - perf.start;
    if (span < 1600) return;
    var fps = perf.frames * 1000 / span;
    perf.start = now; perf.frames = 0; perf.checks++;
    if (perf.checks > 8) return; // settle after the first few seconds
    if (fps < 26 && quality > 0) { quality--; applyQuality(); }
    else if (fps < 12 && quality === 0 && !forceGL) { fail(); }
  }

  function resize() {
    var r = canvas.parentNode.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    dpr = Math.min(window.devicePixelRatio || 1, QUALITY[quality].dpr * (isMobile ? 0.8 : 1));
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    var pw = Math.round(W * dpr), ph = Math.round(H * dpr);
    rtScene.setSize(pw, ph);
    var bw = Math.max(1, Math.round(pw / 4)), bh = Math.max(1, Math.round(ph / 4));
    rtA.setSize(bw, bh); rtB.setSize(bw, bh);
    brightMat.uniforms.uTexel.value.set(1 / pw, 1 / ph);
    blurW = 1 / bw; blurH = 1 / bh;
    camera.aspect = W / H;
    // frame the action right of centre on wide screens, above centre on tall ones
    // with the event console on screen (wide desktop) the subject sits at ~62%; without it, further right
    if (W / H > 1.1) camera.setViewOffset(W, H, -W * (W > 1100 ? 0.125 : 0.2), -H * 0.05, W, H);
    else camera.setViewOffset(W, H, 0, H * 0.19, W, H);
    camera.updateProjectionMatrix();
    compMat.uniforms.uAspect.value = W / H;
    compMat.uniforms.uRes.value.set(pw, ph);
    overlay.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  }
  var blurW = 0.001, blurH = 0.001;

  function render() {
    renderer.setRenderTarget(rtScene);
    renderer.render(scene, camera);

    quad.material = brightMat;
    brightMat.uniforms.tDiffuse.value = rtScene.texture;
    renderer.setRenderTarget(rtA); renderer.render(postScene, postCam);

    quad.material = blurMat;
    for (var i = 0; i < 2; i++) {
      var spread = i === 0 ? 1.0 : 2.2;
      blurMat.uniforms.tDiffuse.value = rtA.texture; blurMat.uniforms.uDir.value.set(blurW * spread, 0);
      renderer.setRenderTarget(rtB); renderer.render(postScene, postCam);
      blurMat.uniforms.tDiffuse.value = rtB.texture; blurMat.uniforms.uDir.value.set(0, blurH * spread);
      renderer.setRenderTarget(rtA); renderer.render(postScene, postCam);
    }

    quad.material = compMat;
    compMat.uniforms.tScene.value = rtScene.texture;
    compMat.uniforms.tBloom.value = rtA.texture;
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCam);
  }

  var clock = new T.Clock();
  var visible = true, running = false, elapsed = 0, paused = false;
  function frame(now) {
    if (failed) { running = false; return; }
    if (!visible || document.hidden || paused) { running = false; perf.start = 0; return; }
    running = true;
    watchPerf(now || performance.now());
    var dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;
    updateStory(reduceMotion ? dt * 0.8 : dt, elapsed);
    updateCamera(dt, elapsed);
    waterTex.offset.x = elapsed * 0.012;
    waterTex.offset.y = Math.sin(elapsed * 0.3) * 0.02;
    glitch = Math.max(0, glitch - dt * 2.6);
    compMat.uniforms.uGlitch.value = reduceMotion ? 0 : glitch;
    compMat.uniforms.uTime.value = elapsed;
    render();
    updateOverlay(dt, elapsed);
    requestAnimationFrame(frame);
  }
  function start() { if (!failed && !running && !paused && visible && !document.hidden) { clock.getDelta(); perf.start = 0; requestAnimationFrame(frame); } }

  // testing hook: fast-forward the story without rendering every step
  api.debugAdvance = function (sec) {
    var steps = Math.round(sec * 30);
    for (var i = 0; i < steps; i++) { elapsed += 1 / 30; updateStory(1 / 30, elapsed); updateCamera(1 / 30, elapsed); }
    render(); updateOverlay(1, elapsed);
  };
  api.setPaused = function (p) { paused = !!p; if (!paused) start(); };
  api.debugMode = function (i) { applyMode(i); render(); updateOverlay(1, elapsed); };
  api.debugQuality = function (q) { quality = q; perf.checks = 99; applyQuality(); render(); };

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (en) { visible = en[0].isIntersecting; start(); }, { threshold: 0.01 }).observe(hero);
  }
  document.addEventListener('visibilitychange', start);
  window.addEventListener('resize', function () { isMobile = window.matchMedia('(max-width: 760px)').matches; resize(); });

  try {
    resize();
    // compile every sensor mode up front so switching never hitches
    [1, 2, 0].forEach(function (i) { applyMode(i); renderer.compile(scene, camera); });
    // warm-up: advance the story a little so the first frame already has life in it
    nextStory();
    current = queue.shift();
    render();
  } catch (e) {
    console.error(e);
    return fail();
  }
  api.ready = true;
  hero.classList.add('has-webgl');
  var went = false;
  var go = function () {
    if (went) return;
    went = true;
    emit('sentra:ready', { webgl: true });
    // snap the camera onto the first subject so the opening frame is composed
    if (actor) { look.set(actor.root.position.x, 1.0, actor.root.position.z).lerp(BASE_LOOK, 0.14); }
    start();
  };
  // wait until every deferred script (hero UI, page engine) is listening
  if (document.readyState === 'complete') go();
  else { document.addEventListener('DOMContentLoaded', go); window.addEventListener('load', go); }
})();
