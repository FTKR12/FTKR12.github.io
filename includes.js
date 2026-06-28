/* =========================================================
   Site runtime
   - 共通サイドバーの読み込み
   - 言語切替（EN デフォルト / JA）・テーマ切替（ダーク / ライト）
   - 宇宙背景（インクの霧 / 瞬く星 / 流れ星 / 視差）
   - 水に垂れるインク（タップ／スライド。マットな色からランダム選択）
   - About Me のタイプライター演出（クリックでスキップ、言語切替で再タイプ）
   - News 折りたたみ / スクロールフェードイン / Publications 年フィルタ
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

  /* ---------- language & theme ---------- */
  function currentLang() {
    return document.documentElement.classList.contains('lang-ja') ? 'ja' : 'en';
  }

  function applyLanguage(lang) {
    var ja = lang === 'ja';
    var root = document.documentElement;
    root.classList.toggle('lang-ja', ja);
    root.lang = ja ? 'ja' : 'en';
    try { localStorage.setItem('site-lang', ja ? 'ja' : 'en'); } catch (e) {}

    document.querySelectorAll('.lang-btn').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.lang === (ja ? 'ja' : 'en')));
    });

    var allOpt = document.querySelector('#pub-filter option[value="all"]');
    if (allOpt) allOpt.textContent = ja ? 'すべて' : 'All';

    // About のターミナルを新しい言語で再タイプ
    if (aboutState && !reducedMotion) runTyping();
  }

  function applyTheme(theme) {
    var light = theme === 'light';
    document.documentElement.classList.toggle('light', light);
    try { localStorage.setItem('site-theme', light ? 'light' : 'dark'); } catch (e) {}
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', light ? '#e9edf4' : '#04050e');
  }

  /* 言語・テーマ切替ドック（右上固定） */
  function initControls() {
    if (document.querySelector('.ctrl-dock')) return;
    var dock = document.createElement('div');
    dock.className = 'ctrl-dock';
    dock.innerHTML =
      '<div class="lang-switch" role="group" aria-label="Language">' +
        '<button type="button" class="lang-btn" data-lang="en" aria-pressed="true">EN</button>' +
        '<button type="button" class="lang-btn" data-lang="ja" aria-pressed="false">JA</button>' +
      '</div>' +
      '<button type="button" class="theme-btn" aria-label="Toggle light / dark theme">' +
        '<svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>' +
        '</svg>' +
        '<svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<circle cx="12" cy="12" r="4"/>' +
          '<path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>' +
        '</svg>' +
      '</button>';
    document.body.appendChild(dock);

    dock.querySelectorAll('.lang-btn').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.lang === currentLang()));
      b.addEventListener('click', function () {
        if (b.dataset.lang !== currentLang()) applyLanguage(b.dataset.lang);
      });
    });
    dock.querySelector('.theme-btn').addEventListener('click', function () {
      applyTheme(document.documentElement.classList.contains('light') ? 'dark' : 'light');
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
    if (!reducedMotion) {
      // インクはコンテンツの上に重ねる（pointer-events:none）
      var ink = document.createElement('canvas');
      ink.className = 'inkfield';
      ink.setAttribute('aria-hidden', 'true');
      document.body.appendChild(ink);
      startInk(ink);
      startParallax(cosmos.querySelector('.nebula'));
    }
  }

  function startStarfield(canvas) {
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var TAU = Math.PI * 2;
    var TINTS = ['255,255,255', '255,255,255', '255,255,255', '226,235,248', '206,220,238', '236,242,250'];
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

  /* 水に垂れるインク：タップで一滴、スライドで筋状に滲む。
     ときどき自然にも一滴落ちる。色はマットなラインナップからランダム選択 */
  function startInk(canvas) {
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var TAU = Math.PI * 2;
    var MAX_PARTS = 360;
    var w = 0, h = 0;
    var parts = [];

    function resize() {
      w = window.innerWidth;
      h = window.innerHeight;
      // ぼかしレイヤーの上に乗るので等倍解像度で十分
      canvas.width = w;
      canvas.height = h;
    }
    window.addEventListener('resize', resize);
    resize();

    function rnd(a, b) { return a + Math.random() * (b - a); }

    function addPart(p) {
      if (parts.length >= MAX_PARTS) parts.shift();
      parts.push(p);
    }

    // マットな色のラインナップ（H, S%, L%）。この中からランダムに選ぶ
    var PALETTE = [
      [210, 36, 58],  // スレートブルー
      [190, 42, 52],  // ダスティシアン
      [150, 24, 55],  // セージグリーン
      [260, 26, 60],  // ラベンダーグレー
      [345, 28, 58],  // ダスティローズ
      [40, 32, 58]    // サンドゴールド
    ];

    function spawnDrop(x, y, big) {
      var c = PALETTE[(Math.random() * PALETTE.length) | 0];
      var hue = c[0] + rnd(-5, 5);
      var sat = c[1] + rnd(-4, 4);
      var light = c[2] + rnd(-3, 3);
      // 中心のにじみ（ゆっくり大きく広がる）
      addPart({
        x: x, y: y,
        vx: rnd(-4, 4), vy: rnd(2, 10),
        r: big ? rnd(10, 18) : rnd(6, 10),
        maxR: big ? rnd(110, 190) : rnd(50, 90),
        grow: rnd(.5, .9),
        peak: big ? rnd(.28, .38) : rnd(.18, .26),
        decay: big ? rnd(.09, .14) : rnd(.12, .18),
        hue: hue, sat: sat, light: light,
        age: 0, depth: 0, branchAt: rnd(.5, 1.4), branched: false
      });
      // 触手（外へ伸びるインクの筋）
      var n = big ? 8 : 5;
      for (var i = 0; i < n; i++) {
        var ang = Math.random() * TAU;
        var off = rnd(4, 16);
        var sp = big ? rnd(26, 90) : rnd(18, 50);
        addPart({
          x: x + Math.cos(ang) * off, y: y + Math.sin(ang) * off,
          vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp + rnd(0, 8),
          r: rnd(3, 7), maxR: big ? rnd(28, 64) : rnd(16, 36),
          grow: rnd(.5, 1.1),
          peak: rnd(.12, .2),
          decay: rnd(.14, .24),
          hue: (hue + rnd(-8, 8) + 360) % 360, sat: sat, light: light + rnd(-3, 3),
          age: 0, depth: 1, branchAt: rnd(.4, 1.0), branched: false
        });
      }
    }

    // 筋の先からさらに枝分かれして広がる（マーブリング感）
    function branch(p) {
      var kids = 1 + (Math.random() * 2 | 0);
      for (var i = 0; i < kids; i++) {
        var ang = Math.random() * TAU;
        var sp = rnd(10, 34);
        addPart({
          x: p.x, y: p.y,
          vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp + rnd(0, 6),
          r: Math.max(2, p.r * .5), maxR: p.maxR * rnd(.4, .7),
          grow: rnd(.5, 1.0),
          peak: p.peak * rnd(.6, .9),
          decay: p.decay * rnd(1.0, 1.4),
          hue: (p.hue + rnd(-6, 6) + 360) % 360, sat: p.sat, light: p.light,
          age: 0, depth: p.depth + 1, branchAt: rnd(.4, 1.0), branched: false
        });
      }
    }

    // 最初の一滴と環境ドリップ
    setTimeout(function () {
      spawnDrop(rnd(w * .15, w * .85), rnd(h * .1, h * .5), true);
    }, 600);
    var nextDrip = rnd(3000, 6000);

    var last = performance.now();
    function frame(now) {
      var dt = Math.min(.05, (now - last) / 1000);
      last = now;

      nextDrip -= dt * 1000;
      if (nextDrip <= 0) {
        spawnDrop(rnd(w * .05, w * .95), rnd(h * .05, h * .8), Math.random() < .35);
        nextDrip = rnd(4500, 10000);
      }

      ctx.clearRect(0, 0, w, h);
      // ダーク: 加算で発光 / ライト: 重ね塗りで紙のインク
      ctx.globalCompositeOperation =
        document.documentElement.classList.contains('light') ? 'source-over' : 'lighter';

      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i];
        p.age += dt;

        // フェードイン → 減衰
        var k = Math.min(p.age / .4, 1);
        var alpha = p.peak * k * Math.exp(-p.decay * Math.max(0, p.age - .4));
        if (alpha < .004) { parts.splice(i, 1); continue; }

        // 減速しながら漂い、わずかに沈む
        var damp = Math.exp(-1.1 * dt);
        p.vx = p.vx * damp + rnd(-26, 26) * dt;
        p.vy = p.vy * damp + rnd(-26, 26) * dt + 2.5 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.r += (p.maxR - p.r) * p.grow * dt;

        if (!p.branched && p.depth < 2 && p.age > p.branchAt) {
          p.branched = true;
          branch(p);
        }

        var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        var c = p.hue + ',' + p.sat.toFixed(0) + '%,' + p.light.toFixed(0) + '%';
        g.addColorStop(0, 'hsla(' + c + ',' + alpha.toFixed(3) + ')');
        g.addColorStop(.7, 'hsla(' + c + ',' + (alpha * .45).toFixed(3) + ')');
        g.addColorStop(1, 'hsla(' + c + ',0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, TAU);
        ctx.fill();
      }

      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    // タップ＝大きな一滴 / スライド＝小さな滴の筋
    var lastX = -1e4, lastY = -1e4;
    window.addEventListener('pointerdown', function (e) {
      spawnDrop(e.clientX, e.clientY, true);
      lastX = e.clientX;
      lastY = e.clientY;
    }, { passive: true });
    window.addEventListener('pointermove', function (e) {
      var dx = e.clientX - lastX, dy = e.clientY - lastY;
      if (dx * dx + dy * dy < 4900) return; // 70px ごと
      lastX = e.clientX;
      lastY = e.clientY;
      spawnDrop(e.clientX, e.clientY, false);
    }, { passive: true });
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

  var aboutState = null;

  function initTypewriter() {
    var target = document.querySelector('.type-target');
    if (!target) return;
    var cmdLine = document.querySelector('.term-line');
    var cmdEl = cmdLine ? cmdLine.querySelector('.t-cmd') : null;
    var cmdText = (cmdEl && cmdEl.dataset.cmd) || '';
    var terminal = target.closest('.terminal') || target;

    // モーション削減設定時は演出なしで全文表示（言語切替は CSS が行う）
    if (reducedMotion) {
      if (cmdLine) {
        cmdLine.hidden = false;
        if (cmdEl) cmdEl.textContent = cmdText;
      }
      target.classList.add('typed');
      return;
    }

    // 高さを先に確保してタイプ中のレイアウトシフトを防ぐ
    var h0 = target.offsetHeight;
    var source = document.createDocumentFragment();
    while (target.firstChild) source.appendChild(target.firstChild);
    target.style.minHeight = h0 + 'px';

    aboutState = {
      target: target,
      source: source,
      cmdLine: cmdLine,
      cmdEl: cmdEl,
      cmdText: cmdText,
      terminal: terminal,
      gen: 0
    };
    runTyping();
  }

  async function runTyping() {
    var s = aboutState;
    if (!s) return;
    var gen = ++s.gen;
    var lang = currentLang();
    var target = s.target;
    var terminal = s.terminal;

    function alive() { return aboutState === s && gen === s.gen; }

    // 再タイプ時も直前の高さを保ってから消す（カードの潰れ防止）
    if (target.offsetHeight) target.style.minHeight = target.offsetHeight + 'px';
    target.classList.remove('typed');
    target.classList.add('typing');
    target.innerHTML = '';
    if (s.cmdLine) s.cmdLine.hidden = false;
    if (s.cmdEl) s.cmdEl.textContent = '';

    var cursor = document.createElement('span');
    cursor.className = 't-cursor busy';
    cursor.setAttribute('aria-hidden', 'true');

    var skip = false;
    var finishNow = function () { skip = true; };
    terminal.classList.add('is-typing');
    terminal.addEventListener('click', finishNow);

    var d = function (ms) { return (skip || !alive()) ? Promise.resolve() : wait(ms); };
    var charDelay = function (ch) {
      if ('.。!?！？'.indexOf(ch) !== -1) return 240;
      if (',、;:：'.indexOf(ch) !== -1) return 110;
      return 8 + Math.random() * 26;
    };

    async function typeText(text, parent) {
      var tn = document.createTextNode('');
      parent.insertBefore(tn, cursor);
      for (var i = 0; i < text.length; i++) {
        if (!alive()) return;
        tn.textContent += text[i];
        await d(charDelay(text[i]));
      }
    }

    async function typeNodes(srcParent, destParent) {
      var nodes = Array.prototype.slice.call(srcParent.childNodes);
      for (var i = 0; i < nodes.length; i++) {
        if (!alive()) return;
        var node = nodes[i];
        if (node.nodeType === Node.TEXT_NODE) {
          var text = node.textContent.replace(/\s+/g, ' ');
          if (!text.trim()) continue;
          await typeText(text, destParent);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          var nl = node.getAttribute('lang');
          if (nl && nl !== lang) continue; // 表示中でない言語はスキップ
          var clone = node.cloneNode(false);
          destParent.insertBefore(clone, cursor);
          clone.appendChild(cursor);
          await typeNodes(node, clone);
          if (!alive()) return;
          destParent.insertBefore(cursor, clone.nextSibling);
          await d(140);
        }
      }
    }

    try {
      // 1) コマンドを打鍵
      if (s.cmdEl) {
        s.cmdEl.appendChild(cursor);
        await d(500);
        for (var i = 0; i < s.cmdText.length; i++) {
          if (!alive()) break;
          cursor.before(document.createTextNode(s.cmdText[i]));
          await d(45 + Math.random() * 60);
        }
        await d(380);
      }
      if (!alive()) return;

      // 2) 出力（自己紹介文）を打鍵
      target.appendChild(cursor);
      await typeNodes(s.source, target);
    } catch (err) {
      console.error('typewriter error:', err);
      if (alive()) {
        target.innerHTML = '';
        target.appendChild(s.source.cloneNode(true));
        if (s.cmdEl) s.cmdEl.textContent = s.cmdText;
      }
    } finally {
      terminal.removeEventListener('click', finishNow);
    }

    if (!alive()) return;
    // カーソルは最後の段落の内側に残す（次の行に落とさず "…Hamagami. ▌" の形にする）
    if (cursor.previousElementSibling) cursor.previousElementSibling.appendChild(cursor);
    target.classList.add('typed');
    target.classList.remove('typing');
    target.style.minHeight = '';
    cursor.classList.remove('busy');
    terminal.classList.remove('is-typing');
  }

  /* ---------- news: 言語ごとに上位5件のみ表示、残りは折りたたみ ---------- */
  function initNewsCollapse() {
    var list = document.querySelector('.news ul');
    if (!list) return;
    var LIMIT = 5;
    var counts = { en: 0, ja: 0 };

    ['en', 'ja'].forEach(function (L) {
      var items = Array.prototype.slice.call(list.querySelectorAll('li')).filter(function (li) {
        return (li.getAttribute('lang') || 'en') === L;
      });
      items.slice(LIMIT).forEach(function (li, i) {
        li.classList.add('news-extra');
        li.style.animationDelay = (i * 50) + 'ms'; // 展開時に順番にポップイン
      });
      counts[L] = Math.max(0, items.length - LIMIT);
    });
    if (!counts.en && !counts.ja) return;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'news-toggle';

    function render(open) {
      btn.innerHTML = open
        ? '<span lang="en">show less</span><span lang="ja">折りたたむ</span>'
        : '<span lang="en">… show ' + counts.en + ' more</span><span lang="ja">… 残り' + counts.ja + '件を表示</span>';
    }
    function setOpen(open) {
      list.classList.toggle('news-open', open);
      btn.setAttribute('aria-expanded', String(open));
      render(open);
    }
    setOpen(false);

    btn.addEventListener('click', function () {
      setOpen(btn.getAttribute('aria-expanded') !== 'true');
    });

    list.parentNode.appendChild(btn);
  }

  /* ---------- reveal on scroll ----------
     一度きりではなく、ビューポートを出入りするたびに再生する。
     スクロール方向に合わせて出現方向を変え、同時に入った要素は時差で順番に。 */
  function initReveal() {
    var nodes = Array.prototype.slice.call(
      document.querySelectorAll('.terminal, .news, .content h4, .publication-item, .cv-item')
    );
    if (!nodes.length) return;
    if (reducedMotion || !('IntersectionObserver' in window)) {
      nodes.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }

    // スクロール方向（上向きなら要素は上から降りてくる）
    var lastY = window.scrollY, goingUp = false;
    window.addEventListener('scroll', function () {
      var y = window.scrollY;
      if (y !== lastY) goingUp = y < lastY;
      lastY = y;
    }, { passive: true });

    var io = new IntersectionObserver(function (entries) {
      var delay = 0;
      entries.forEach(function (entry) {
        var el = entry.target;
        if (entry.isIntersecting) {
          el.style.setProperty('--rv-y', goingUp ? '-12px' : '12px');
          el.style.transitionDelay = delay + 'ms';
          delay = Math.min(delay + 70, 350);
          el.classList.add('is-visible');
        } else {
          el.style.transitionDelay = '0ms';
          el.classList.remove('is-visible');
        }
      });
    }, { threshold: 0.05, rootMargin: '0px 0px -4% 0px' });

    nodes.forEach(function (el) {
      el.classList.add('reveal');
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
    optAll.textContent = currentLang() === 'ja' ? 'すべて' : 'All';
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
    initControls();
    initCosmos();
    initTypewriter();
    initNewsCollapse();
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
