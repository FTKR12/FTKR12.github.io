/* =========================================================
   Site runtime
   - 共通サイドバーの読み込み
   - 宇宙背景（インクの霧 / 瞬く星 / 流れ星 / 視差）
   - About Me のタイプライター演出（クリックでスキップ）
   - スクロール時のフェードイン / Publications の年フィルタ
   ========================================================= */
(function () {
  'use strict';

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- shared sidebar ---------- */
  async function includeSidebar() {
    var placeholder = document.getElementById('shared-sidebar');
    if (!placeholder) return;
    try {
      var res = await fetch('./sidebar.html');
      if (!res.ok) throw new Error('Failed to load sidebar fragment: ' + res.status);
      placeholder.outerHTML = await res.text();
      markCurrentNav();
    } catch (err) {
      console.error('includeSidebar error:', err);
    }
  }

  function markCurrentNav() {
    var current = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav a').forEach(function (a) {
      var href = (a.getAttribute('href') || '').split('#')[0] || 'index.html';
      if (href === current) a.setAttribute('aria-current', 'page');
    });
  }

  /* ---------- cosmic background ---------- */
  function initCosmos() {
    if (document.querySelector('.cosmos')) return;
    var cosmos = document.createElement('div');
    cosmos.className = 'cosmos';
    cosmos.setAttribute('aria-hidden', 'true');
    cosmos.innerHTML =
      '<div class="nebula">' +
        '<div class="ink-blob ink-1"></div>' +
        '<div class="ink-blob ink-2"></div>' +
        '<div class="ink-blob ink-3"></div>' +
        '<div class="ink-blob ink-4"></div>' +
        '<div class="ink-blob ink-5"></div>' +
      '</div>' +
      '<canvas class="starfield"></canvas>' +
      '<div class="grain"></div>';
    document.body.prepend(cosmos);
    startStarfield(cosmos.querySelector('.starfield'));
    if (!reducedMotion) startParallax(cosmos.querySelector('.nebula'));
  }

  function startStarfield(canvas) {
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var TAU = Math.PI * 2;
    var TINTS = ['255,255,255', '255,255,255', '255,255,255', '190,227,255', '214,196,255', '255,214,236'];
    var w = 0, h = 0, stars = [], meteors = [], nextMeteor = 2600;

    function resize() {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = Math.min(420, Math.round(w * h / 4200));
      stars = [];
      for (var i = 0; i < n; i++) {
        stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: Math.random() < 0.92 ? 0.4 + Math.random() * 0.9 : 1.3 + Math.random() * 0.7,
          tw: 0.4 + Math.random() * 1.6,
          ph: Math.random() * TAU,
          dy: 0.5 + Math.random() * 2.2,
          tint: TINTS[(Math.random() * TINTS.length) | 0]
        });
      }
      if (reducedMotion) drawStatic();
    }

    function drawStatic() {
      ctx.clearRect(0, 0, w, h);
      stars.forEach(function (s) {
        ctx.fillStyle = 'rgba(' + s.tint + ',' + (0.25 + 0.6 * Math.abs(Math.sin(s.ph))).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, TAU);
        ctx.fill();
      });
    }

    function spawnMeteor() {
      var ang = (25 + Math.random() * 30) * Math.PI / 180;
      var dir = Math.random() < 0.5 ? 1 : -1;
      var speed = 420 + Math.random() * 340;
      meteors.push({
        x: w * 0.05 + Math.random() * w * 0.9,
        y: Math.random() * h * 0.35,
        vx: Math.cos(ang) * speed * dir,
        vy: Math.sin(ang) * speed,
        len: 120 + Math.random() * 120,
        life: 0,
        ttl: 0.9 + Math.random() * 0.6
      });
    }

    var last = performance.now();
    function frame(now) {
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      var t = now / 1000;
      ctx.clearRect(0, 0, w, h);

      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        var a = 0.22 + 0.78 * (0.5 + 0.5 * Math.sin(t * s.tw + s.ph));
        ctx.fillStyle = 'rgba(' + s.tint + ',' + a.toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, TAU);
        ctx.fill();
        if (s.r > 1.2) {
          ctx.fillStyle = 'rgba(' + s.tint + ',' + (a * 0.12).toFixed(3) + ')';
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r * 3.2, 0, TAU);
          ctx.fill();
        }
        s.y += s.dy * dt;
        if (s.y > h + 2) { s.y = -2; s.x = Math.random() * w; }
      }

      nextMeteor -= dt * 1000;
      if (nextMeteor <= 0) {
        spawnMeteor();
        nextMeteor = 3500 + Math.random() * 5500;
      }
      for (var j = meteors.length - 1; j >= 0; j--) {
        var m = meteors[j];
        m.life += dt;
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        var k = m.life / m.ttl;
        if (k >= 1 || m.x < -m.len || m.x > w + m.len || m.y > h + m.len) {
          meteors.splice(j, 1);
          continue;
        }
        var fade = Math.sin(Math.PI * k);
        var mag = Math.hypot(m.vx, m.vy);
        var ux = m.vx / mag, uy = m.vy / mag;
        var tail = ctx.createLinearGradient(m.x, m.y, m.x - ux * m.len, m.y - uy * m.len);
        tail.addColorStop(0, 'rgba(210,240,255,' + (0.85 * fade).toFixed(3) + ')');
        tail.addColorStop(1, 'rgba(210,240,255,0)');
        ctx.strokeStyle = tail;
        ctx.lineWidth = 1.4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(m.x - ux * m.len, m.y - uy * m.len);
        ctx.stroke();
      }

      requestAnimationFrame(frame);
    }

    window.addEventListener('resize', resize);
    resize();
    if (!reducedMotion) requestAnimationFrame(frame);
  }

  /* マウスに合わせてインク層がわずかに揺れる */
  function startParallax(nebula) {
    if (!nebula || !window.matchMedia('(hover: hover)').matches) return;
    var tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
    function step() {
      cx += (tx - cx) * 0.06;
      cy += (ty - cy) * 0.06;
      nebula.style.transform = 'translate3d(' + cx.toFixed(2) + 'px,' + cy.toFixed(2) + 'px,0)';
      if (Math.abs(tx - cx) + Math.abs(ty - cy) > 0.05) raf = requestAnimationFrame(step);
      else raf = 0;
    }
    window.addEventListener('pointermove', function (e) {
      tx = (e.clientX / window.innerWidth - 0.5) * -26;
      ty = (e.clientY / window.innerHeight - 0.5) * -18;
      if (!raf) raf = requestAnimationFrame(step);
    });
  }

  /* ---------- typewriter (About Me) ---------- */
  function wait(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  async function initTypewriter() {
    var target = document.querySelector('.type-target');
    if (!target) return;
    var cmdLine = document.querySelector('.term-line');
    var cmdEl = cmdLine ? cmdLine.querySelector('.t-cmd') : null;
    var cmdText = (cmdEl && cmdEl.dataset.cmd) || '';
    var terminal = target.closest('.terminal') || target;

    // モーション削減設定時は演出なしで全文表示
    if (reducedMotion) {
      if (cmdLine) {
        cmdLine.hidden = false;
        if (cmdEl) cmdEl.textContent = cmdText;
      }
      target.classList.add('typed');
      return;
    }

    var sourceHTML = target.innerHTML;
    try {
      // 高さを先に確保してタイプ中のレイアウトシフトを防ぐ
      target.style.minHeight = target.offsetHeight + 'px';

      var source = document.createDocumentFragment();
      while (target.firstChild) source.appendChild(target.firstChild);

      var skip = false;
      var finishNow = function () { skip = true; };
      terminal.classList.add('is-typing');
      terminal.addEventListener('click', finishNow);

      var cursor = document.createElement('span');
      cursor.className = 't-cursor busy';
      cursor.setAttribute('aria-hidden', 'true');

      var d = function (ms) { return skip ? Promise.resolve() : wait(ms); };
      var charDelay = function (ch) {
        if ('.。!?'.indexOf(ch) !== -1) return 240;
        if (',、;:'.indexOf(ch) !== -1) return 110;
        return 8 + Math.random() * 26;
      };

      async function typeText(text, parent) {
        var tn = document.createTextNode('');
        parent.insertBefore(tn, cursor);
        for (var i = 0; i < text.length; i++) {
          tn.textContent += text[i];
          await d(charDelay(text[i]));
        }
      }

      async function typeNodes(srcParent, destParent) {
        var nodes = Array.prototype.slice.call(srcParent.childNodes);
        for (var i = 0; i < nodes.length; i++) {
          var node = nodes[i];
          if (node.nodeType === Node.TEXT_NODE) {
            var text = node.textContent.replace(/\s+/g, ' ');
            if (!text.trim()) continue;
            await typeText(text, destParent);
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            var clone = node.cloneNode(false);
            destParent.insertBefore(clone, cursor);
            clone.appendChild(cursor);
            await typeNodes(node, clone);
            destParent.insertBefore(cursor, clone.nextSibling);
            await d(140);
          }
        }
      }

      // 1) コマンドを打鍵
      if (cmdLine && cmdEl) {
        cmdLine.hidden = false;
        cmdEl.appendChild(cursor);
        await d(500);
        for (var i = 0; i < cmdText.length; i++) {
          cursor.before(document.createTextNode(cmdText[i]));
          await d(45 + Math.random() * 60);
        }
        await d(380);
      }

      // 2) 出力（自己紹介文）を打鍵
      target.classList.add('typing');
      target.appendChild(cursor);
      await typeNodes(source, target);

      target.classList.add('typed');
      cursor.classList.remove('busy');
      terminal.classList.remove('is-typing');
      terminal.removeEventListener('click', finishNow);
    } catch (err) {
      console.error('typewriter error:', err);
      target.innerHTML = sourceHTML;
      target.classList.add('typed');
      if (cmdLine) {
        cmdLine.hidden = false;
        if (cmdEl) cmdEl.textContent = cmdText;
      }
    }
  }

  /* ---------- reveal on scroll ---------- */
  function initReveal() {
    var nodes = Array.prototype.slice.call(
      document.querySelectorAll('.terminal, .news, .publication-item, .cv-box')
    );
    if (!nodes.length) return;
    if (reducedMotion || !('IntersectionObserver' in window)) {
      nodes.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });
    nodes.forEach(function (el, idx) {
      el.classList.add('reveal');
      el.style.transitionDelay = (idx % 6) * 60 + 'ms';
      io.observe(el);
    });
  }

  /* ---------- publications: year filter ---------- */
  function initPublicationFilter() {
    var container = document.querySelector('.publications');
    var pubs = document.querySelectorAll('.publication-item');
    if (!container || !pubs.length) return;

    var controls = document.createElement('div');
    controls.className = 'pub-controls';
    var select = document.createElement('select');
    select.id = 'pub-filter';
    select.setAttribute('aria-label', 'Filter publications by year');
    var optAll = document.createElement('option');
    optAll.value = 'all';
    optAll.textContent = 'All';
    select.appendChild(optAll);

    var years = new Set();
    pubs.forEach(function (p) {
      var meta = p.querySelector('.pub-meta');
      if (!meta) return;
      var m = meta.textContent.match(/(19|20)\d{2}/g);
      if (m) m.forEach(function (y) { years.add(y); });
    });
    Array.from(years).sort().reverse().forEach(function (y) {
      var o = document.createElement('option');
      o.value = y;
      o.textContent = y;
      select.appendChild(o);
    });

    controls.appendChild(select);
    container.insertBefore(controls, container.firstChild);

    select.addEventListener('change', function () {
      var year = select.value;
      pubs.forEach(function (p) {
        var meta = p.querySelector('.pub-meta') ? p.querySelector('.pub-meta').textContent : '';
        var title = p.querySelector('.pub-title') ? p.querySelector('.pub-title').textContent : '';
        var match = (year === 'all') || meta.indexOf(year) !== -1 || title.indexOf(year) !== -1;
        p.style.display = match ? '' : 'none';
      });
    });
  }

  /* ---------- boot ---------- */
  function init() {
    initCosmos();
    initTypewriter();
    initReveal();
    initPublicationFilter();
    includeSidebar();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
