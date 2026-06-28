/* =========================================================
   Site runtime
   - 共通サイドバーの読み込み
   - 言語切替（EN デフォルト / JA）・テーマ切替（ダーク / ライト）
   - 流体背景（WebGL シェーダで液体が流れるように描画）
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
    if (setFluidTheme) setFluidTheme();
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

  /* ---------- fluid background ---------- */
  // テーマ切替時に流体の配色を更新するためのフック
  var setFluidTheme = null;

  function initCosmos() {
    if (document.querySelector('.cosmos')) return;
    var cosmos = document.createElement('div');
    cosmos.className = 'cosmos';
    cosmos.setAttribute('aria-hidden', 'true');
    cosmos.innerHTML =
      '<canvas class="fluid"></canvas>' +
      '<div class="grain"></div>';
    document.body.prepend(cosmos);
    startFluid(cosmos.querySelector('.fluid'));
    if (!reducedMotion) {
      // インクはコンテンツの上に重ねる（pointer-events:none）
      var ink = document.createElement('canvas');
      ink.className = 'inkfield';
      ink.setAttribute('aria-hidden', 'true');
      document.body.appendChild(ink);
      startInk(ink);
    }
  }

  /* 流体シミュレーション風の背景：ドメインワーピングした fbm ノイズを
     フルスクリーンの WebGL シェーダで描き、液体が流れるように動かす。
     ダーク=深い藍〜スレートブルー、ライト=淡い空色。
     WebGL が使えない環境では CSS のグラデーションにフォールバックする。 */
  function startFluid(canvas) {
    var gl = null;
    try {
      gl = canvas.getContext('webgl', { antialias: false, alpha: true, premultipliedAlpha: false }) ||
           canvas.getContext('experimental-webgl', { antialias: false, alpha: true, premultipliedAlpha: false });
    } catch (e) {}
    if (!gl) { canvas.classList.add('fluid-fallback'); return; }

    var VERT =
      'attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}';

    var FRAG = [
      'precision highp float;',
      'uniform vec2 u_res;',
      'uniform float u_time;',
      'uniform vec2 u_mouse;',
      'uniform vec3 u_c1;',  // 背景の最暗色
      'uniform vec3 u_c2;',  // 中間色
      'uniform vec3 u_c3;',  // ハイライト
      'float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}',
      'float noise(vec2 p){',
      '  vec2 i=floor(p),f=fract(p);',
      '  float a=hash(i),b=hash(i+vec2(1.0,0.0)),c=hash(i+vec2(0.0,1.0)),d=hash(i+vec2(1.0,1.0));',
      '  vec2 u=f*f*(3.0-2.0*f);',
      '  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);',
      '}',
      // 回転を挟んで格子状のムラ（＝斑点）を消し、滑らかな流れにする
      'float fbm(vec2 p){',
      '  float v=0.0,a=0.55;',
      '  mat2 m=mat2(1.6,1.2,-1.2,1.6);',
      '  for(int i=0;i<6;i++){v+=a*noise(p);p=m*p;a*=0.5;}',
      '  return v;',
      '}',
      'void main(){',
      '  vec2 uv=gl_FragCoord.xy/u_res.xy;',
      '  vec2 p=(uv-0.5);p.x*=u_res.x/u_res.y;p*=2.6;',
      '  float t=u_time*0.08;',
      // カーソル付近をゆるく押して液体をかき混ぜる
      '  vec2 m=(u_mouse-0.5);m.x*=u_res.x/u_res.y;m*=2.6;',
      '  float md=length(p-m);',
      '  p+=normalize(p-m+0.0001)*0.28*exp(-md*1.3);',
      // 大きな流れの場で座標を移流させ、丸い斑点ではなく筋状の流れにする
      '  vec2 fl=vec2(fbm(p*0.6+vec2(0.0,t)),fbm(p*0.6+vec2(5.2,-t)));',
      '  fl=(fl-0.5)*2.0;',
      '  vec2 sp=p+fl*1.15+vec2(t*0.5,t*0.18);',
      // ドメインワーピング（マーブリング）
      '  vec2 q=vec2(fbm(sp),fbm(sp+vec2(3.1,1.7)));',
      '  vec2 r=vec2(fbm(sp+2.2*q+vec2(1.7,9.2)),fbm(sp+2.2*q+vec2(8.3,2.8)));',
      '  float f=fbm(sp+3.0*r);',
      // なめらかなグラデーション（塊にならないよう連続的に）
      '  vec3 col=mix(u_c1,u_c2,smoothstep(0.1,0.95,f));',
      // 流れに沿った細い筋（等高線状）で液体の照りを表現＝斑点にしない
      '  float vein=pow(abs(sin((f*1.6+q.x-q.y)*6.2831+t*1.5)),14.0);',
      '  col=mix(col,u_c3,vein*0.5);',
      // さらにもう一本ゆるい筋を重ねて流れの層を出す
      '  float vein2=pow(abs(sin((length(r)*2.0+f)*6.2831-t)),20.0);',
      '  col=mix(col,u_c3,vein2*0.28);',
      // 周辺をわずかに沈めて中央へ視線を集める
      '  float vig=smoothstep(1.35,0.2,length(uv-0.5));',
      '  col*=mix(0.85,1.05,vig);',
      '  gl_FragColor=vec4(col,1.0);',
      '}'
    ].join('\n');

    function compile(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('fluid shader error:', gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    }

    var vs = compile(gl.VERTEX_SHADER, VERT);
    var fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) { canvas.classList.add('fluid-fallback'); return; }

    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('fluid link error:', gl.getProgramInfoLog(prog));
      canvas.classList.add('fluid-fallback');
      return;
    }
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    var uRes = gl.getUniformLocation(prog, 'u_res');
    var uTime = gl.getUniformLocation(prog, 'u_time');
    var uMouse = gl.getUniformLocation(prog, 'u_mouse');
    var uC1 = gl.getUniformLocation(prog, 'u_c1');
    var uC2 = gl.getUniformLocation(prog, 'u_c2');
    var uC3 = gl.getUniformLocation(prog, 'u_c3');

    // 配色（RGB 0–1）。ダーク/ライトで切り替える
    var THEMES = {
      dark:  { c1: [0.020, 0.027, 0.063], c2: [0.094, 0.180, 0.353], c3: [0.298, 0.502, 0.741] },
      light: { c1: [0.886, 0.918, 0.961], c2: [0.741, 0.812, 0.910], c3: [0.984, 0.988, 1.000] }
    };
    function applyColors() {
      var th = document.documentElement.classList.contains('light') ? THEMES.light : THEMES.dark;
      gl.uniform3fv(uC1, th.c1);
      gl.uniform3fv(uC2, th.c2);
      gl.uniform3fv(uC3, th.c3);
    }
    setFluidTheme = function () {
      applyColors();
      if (reducedMotion) drawOnce();
    };

    // ぼかしを使わないので、くっきり見えるよう実解像度で描く（負荷対策で 1.5x 上限）
    var scale = Math.min(window.devicePixelRatio || 1, 1.5);
    function resize() {
      var w = Math.max(1, Math.round(window.innerWidth * scale));
      var h = Math.max(1, Math.round(window.innerHeight * scale));
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
    }

    var mx = 0.5, my = 0.5, tmx = 0.5, tmy = 0.5;
    if (window.matchMedia('(hover: hover)').matches) {
      window.addEventListener('pointermove', function (e) {
        tmx = e.clientX / window.innerWidth;
        tmy = 1 - e.clientY / window.innerHeight;
      }, { passive: true });
    }

    function drawOnce() {
      gl.uniform1f(uTime, 12.0);
      gl.uniform2f(uMouse, 0.5, 0.5);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    window.addEventListener('resize', resize);
    resize();
    applyColors();

    if (reducedMotion) { drawOnce(); return; }

    var start = performance.now();
    function frame(now) {
      mx += (tmx - mx) * 0.05;
      my += (tmy - my) * 0.05;
      gl.uniform1f(uTime, (now - start) / 1000);
      gl.uniform2f(uMouse, mx, my);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
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
  // 各モジュールは独立して起動する。1 つが失敗しても
  // 他（特にサイドバー読み込み）を巻き込まないよう個別に保護する。
  function safe(fn) {
    try { fn(); } catch (err) { console.error(fn.name + ' failed:', err); }
  }

  function init() {
    // サイドバーは最優先で読み込む（他の演出より重要なため）
    includeSidebar();
    safe(initControls);
    safe(initCosmos);
    safe(initTypewriter);
    safe(initNewsCollapse);
    safe(initReveal);
    safe(initPublicationFilter);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
