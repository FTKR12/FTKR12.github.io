/* =========================================================
   Site runtime
   - 共通サイドバーの読み込み
   - 言語切替（EN デフォルト / JA）・テーマ切替（ダーク / ライト）
   - 煙の背景（WebGL シェーダで白い煙が流れるように描画）
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
      // 乱流（abs ノイズの重ね合わせ）。煙特有の細い筋とシワを作る
      'float turb(vec2 p){',
      '  float v=0.0,a=0.5;',
      '  mat2 m=mat2(1.6,1.2,-1.2,1.6);',
      '  for(int i=0;i<7;i++){v+=a*abs(noise(p)*2.0-1.0);p=m*p;a*=0.5;}',
      '  return v;',
      '}',
      'void main(){',
      '  vec2 uv=gl_FragCoord.xy/u_res.xy;',
      '  vec2 p=(uv-0.5);p.x*=u_res.x/u_res.y;p*=3.0;',
      '  float t=u_time*0.05;',
      // カーソル付近をゆるく押して煙をかき乱す
      '  vec2 m=(u_mouse-0.5);m.x*=u_res.x/u_res.y;m*=3.0;',
      '  float md=length(p-m);',
      '  p+=normalize(p-m+0.0001)*0.22*exp(-md*1.4);',
      // 大きな流れの場で座標を移流させ、立ち上る煙のように流す
      '  vec2 fl=vec2(fbm(p*0.5+vec2(0.0,t)),fbm(p*0.5+vec2(5.2,-t)));',
      '  fl=(fl-0.5)*2.0;',
      '  vec2 sp=p+fl*1.0+vec2(t*0.3,t*0.1);',
      // 乱流ベースのドメインワーピングで、シワの寄った煙の筋を作る
      '  vec2 q=vec2(turb(sp+vec2(0.0,t)),turb(sp+vec2(3.7,1.3)-t*0.2));',
      '  float f=turb(sp+2.6*q+vec2(0.0,t*0.4));',
      // コントラストを付けて煙の筋を立たせる（ぼやけ防止）
      '  float dens=smoothstep(0.18,0.62,f);',
      // 細かい乱流をもう一段かけて煙のディテール（質感）を足す
      '  dens*=0.55+0.6*turb(sp*2.3-vec2(0.0,t*0.6));',
      '  dens=clamp(dens,0.0,1.0);',
      // 背景（暗色）に白い煙を重ねるだけ。色味は混ぜない
      '  vec3 col=mix(u_c1,u_c3,dens);',
      // 周辺をわずかに沈めて中央へ視線を集める
      '  float vig=smoothstep(1.5,0.1,length(uv-0.5));',
      '  col*=mix(0.9,1.03,vig);',
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

    // 配色（RGB 0–1）。色味を出さず c1=背景 / c3=煙 の2色だけで構成する
    var THEMES = {
      dark:  { c1: [0.018, 0.020, 0.028], c2: [0.018, 0.020, 0.028], c3: [0.96, 0.97, 0.99] },
      light: { c1: [0.920, 0.930, 0.945], c2: [0.920, 0.930, 0.945], c3: [0.40, 0.44, 0.50] }
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
