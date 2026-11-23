/* ==========================================================================
   Page-wide behaviour: clocks, reveals, tilt cards, the approach timeline,
   the survey form + live map label, FAQ animation and night-vision mode.
   ========================================================================== */
(function () {
  'use strict';

  var FX = window.SentraFX;
  var reduce = function () { return FX && FX.reducedMotion(); };
  var WHATSAPP_NUMBER = ''; // e.g. '2348012345678' (international format, digits only)

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  /* ---------- clocks ---------- */
  var clocks = document.querySelectorAll('[data-clock]');
  var fullClocks = document.querySelectorAll('[data-clock-full]');
  function tickClock() {
    var d = new Date();
    var t = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    var full = pad(d.getDate()) + '-' + pad(d.getMonth() + 1) + '-' + d.getFullYear() + '  ' + t;
    for (var i = 0; i < clocks.length; i++) clocks[i].textContent = 'LIVE ' + t;
    for (var j = 0; j < fullClocks.length; j++) fullClocks[j].textContent = full;
  }
  tickClock();
  setInterval(tickClock, 1000);

  var year = document.querySelector('[data-year]');
  if (year) year.textContent = String(new Date().getFullYear());

  /* ---------- reveals ---------- */
  var revealEls = Array.prototype.slice.call(document.querySelectorAll('[data-reveal], [data-focus]'));
  if ('IntersectionObserver' in window && !reduce()) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        // stagger siblings that arrive together
        var group = el.parentElement ? Array.prototype.indexOf.call(el.parentElement.children, el) : 0;
        el.style.transitionDelay = el.hasAttribute('data-reveal') ? Math.min(group, 4) * 90 + 'ms' : '';
        el.classList.add('is-in');
        io.unobserve(el);
        if (el.hasAttribute('data-reveal')) {
          setTimeout(function () { el.style.transitionDelay = ''; }, 1600);
        }
      });
    }, { threshold: 0.18, rootMargin: '0px 0px -6% 0px' });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* ---------- tilt + glare cards ---------- */
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches && !reduce()) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-tilt]'), function (card) {
      var raf = 0, ev = null;
      card.addEventListener('pointermove', function (e) {
        ev = e;
        if (raf) return;
        raf = requestAnimationFrame(function () {
          raf = 0;
          var r = card.getBoundingClientRect();
          var x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
          card.style.setProperty('--ry', ((x - 0.5) * 5).toFixed(2) + 'deg');
          card.style.setProperty('--rx', ((0.5 - y) * 5).toFixed(2) + 'deg');
          card.style.setProperty('--gx', (x * 100).toFixed(1) + '%');
          card.style.setProperty('--gy', (y * 100).toFixed(1) + '%');
        });
      });
      card.addEventListener('pointerleave', function () {
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
      });
    });
  }

  /* ---------- approach: signal travels along the wire as you scroll ---------- */
  var approach = document.querySelector('[data-approach]');
  if (approach) {
    var steps = Array.prototype.slice.call(approach.querySelectorAll('.step'));
    var queued = false;
    var updateApproach = function () {
      queued = false;
      var r = approach.getBoundingClientRect();
      var vh = window.innerHeight;
      var p = Math.max(0, Math.min(1, (vh * 0.92 - r.top) / (vh * 0.45)));
      if (reduce()) p = 1;
      approach.style.setProperty('--p', p.toFixed(3));
      steps.forEach(function (s, i) { s.classList.toggle('is-lit', p >= i / steps.length + 0.06); });
    };
    window.addEventListener('scroll', function () { if (!queued) { queued = true; requestAnimationFrame(updateApproach); } }, { passive: true });
    window.addEventListener('resize', updateApproach);
    updateApproach();
  }

  /* ---------- survey form ---------- */
  var form = document.querySelector('[data-form]');
  var mapLabel = document.querySelector('[data-map-label]');
  var whatsapp = document.querySelector('[data-whatsapp]');
  if (form) {
    var msg = form.querySelector('[data-form-msg]');
    var area = form.querySelector('[data-area]');

    var updateWhatsApp = function () {
      if (!whatsapp) return;
      var data = new FormData(form);
      var parts = ['Hello Sentra, I would like a site survey.'];
      if (data.get('property')) parts.push('Property: ' + data.get('property'));
      if (data.get('service')) parts.push('Service: ' + data.get('service'));
      if (data.get('area')) parts.push('Area: ' + data.get('area'));
      if (data.get('name')) parts.push('Name: ' + data.get('name'));
      whatsapp.href = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(parts.join('\n'));
    };

    if (area && mapLabel) {
      var bumpT = 0;
      area.addEventListener('input', function () {
        var v = area.value.trim();
        mapLabel.textContent = v ? 'Your property · ' + v : 'Your property';
        mapLabel.classList.add('is-bump');
        clearTimeout(bumpT);
        bumpT = setTimeout(function () { mapLabel.classList.remove('is-bump'); }, 180);
      });
    }
    form.addEventListener('input', function (e) {
      updateWhatsApp();
      if (e.target.classList.contains('is-invalid') && e.target.value.trim()) e.target.classList.remove('is-invalid');
    });
    form.addEventListener('change', updateWhatsApp);
    updateWhatsApp();

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = form.elements.name, contact = form.elements.contact;
      var bad = [];
      [name, contact].forEach(function (f) {
        var ok = f.value.trim().length > 1;
        f.classList.toggle('is-invalid', !ok);
        f.setAttribute('aria-invalid', String(!ok));
        if (!ok) bad.push(f);
      });
      if (bad.length) {
        msg.className = 'form__msg is-err';
        msg.textContent = 'Please add your name and a phone number or email.';
        bad[0].focus();
        return;
      }
      // No backend wired up yet: see README for connecting a form service.
      var d = new Date();
      var ref = 'SEN-' + d.getFullYear().toString().slice(2) + pad(d.getMonth() + 1) + '-' + Math.floor(1000 + Math.random() * 9000);
      form.classList.add('is-sent');
      msg.className = 'form__msg is-ok';
      msg.textContent = 'Request logged · ref ' + ref + '. We will be in touch to book your survey.';
      form.querySelector('button[type="submit"] span').textContent = 'Request received';
    });
  }

  /* ---------- FAQ: animated details ---------- */
  Array.prototype.forEach.call(document.querySelectorAll('.faq__item'), function (item) {
    var summary = item.querySelector('summary');
    var body = item.querySelector('.faq__body');
    var anim = null;
    summary.addEventListener('click', function (e) {
      if (reduce() || !body.animate) return;
      e.preventDefault();
      if (anim) anim.cancel();
      if (item.open) {
        anim = body.animate({ height: [body.offsetHeight + 'px', '0px'], opacity: [1, 0] }, { duration: 320, easing: 'cubic-bezier(.65,0,.35,1)' });
        anim.onfinish = function () { item.open = false; anim = null; };
      } else {
        item.open = true;
        var h = body.offsetHeight;
        anim = body.animate({ height: ['0px', h + 'px'], opacity: [0, 1] }, { duration: 420, easing: 'cubic-bezier(.16,1,.3,1)' });
        anim.onfinish = function () { anim = null; };
      }
    });
  });

  /* ---------- night vision (IR) mode ---------- */
  var irBtn = document.querySelector('[data-ir-toggle]');
  var toast = document.querySelector('[data-toast]');
  var hudIr = document.querySelector('[data-hud-ir]');
  var toastT = 0;
  function showToast(text) {
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('is-on');
    clearTimeout(toastT);
    toastT = setTimeout(function () { toast.classList.remove('is-on'); }, 1800);
  }
  if (irBtn) {
    irBtn.addEventListener('click', function () {
      var on = !document.documentElement.classList.contains('is-ir');
      document.documentElement.classList.toggle('is-ir', on);
      irBtn.setAttribute('aria-pressed', String(on));
      if (hudIr) hudIr.textContent = on ? 'IR · 850nm' : 'DAY';
      showToast(on ? 'IR night view · ON' : 'IR night view · OFF');
    });
  }
})();
