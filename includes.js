// サイドバー断片を読み込み、インタラクションを初期化する
(function () {
  const SIDEBAR_ID = 'shared-sidebar';

  async function includeSidebar() {
    const placeholder = document.getElementById(SIDEBAR_ID);
    if (!placeholder) return;

    try {
      const res = await fetch('./sidebar.html');
      if (!res.ok) throw new Error(`Failed to load sidebar fragment: ${res.status}`);
      const html = await res.text();

      // placeholder 要素自体を置換して断片のルートノードを挿入
      placeholder.outerHTML = html;

      // 挿入後にインタラクション（Follow ボタン等）を初期化
      initSidebarInteractions();
    } catch (err) {
      console.error('includeSidebar error:', err);
    }
  }

  function initSidebarInteractions() {
  // 二重初期化を防ぐフラグ
  if (document.documentElement.dataset.sidebarInit === 'true') return;
  document.documentElement.dataset.sidebarInit = 'true';

    const btn = document.querySelector('.follow-btn');
    const social = document.getElementById('social-links') || document.querySelector('.social');
    if (!btn || !social) return;

  // 表示/非表示のヘルパー
    const show = () => {
      btn.setAttribute('aria-expanded', 'true');
      social.classList.add('show');
      social.setAttribute('aria-hidden', 'false');
    };
    const hide = () => {
      btn.setAttribute('aria-expanded', 'false');
      social.classList.remove('show');
      social.setAttribute('aria-hidden', 'true');
    };
    const toggle = () => (social.classList.contains('show') ? hide() : show());

  // 初期 aria 状態を設定
  social.setAttribute('aria-hidden', social.classList.contains('show') ? 'false' : 'true');
  if (!btn.hasAttribute('aria-expanded')) btn.setAttribute('aria-expanded', 'false');

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggle();
    });

  // 外部クリックで閉じる
    document.addEventListener('click', (ev) => {
      if (!social.classList.contains('show')) return;
      const target = ev.target;
      if (!social.contains(target) && !btn.contains(target)) hide();
    });

  // Esc キーで閉じる
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && social.classList.contains('show')) {
        hide();
        btn.focus();
      }
    });
  }

  // Run include on DOMContentLoaded or immediately if already loaded
  // ---- site-wide utilities ----
  function setupThemeToggle() {
    var root = document.documentElement;
    // small floating toggle: create if not present
    var existing = document.getElementById('theme-toggle');
    if (!existing) {
      var btn = document.createElement('button');
      btn.id = 'theme-toggle';
      btn.setAttribute('aria-label', 'テーマ切替');
      btn.textContent = '🌙';
      btn.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:999;backdrop-filter:blur(6px);padding:10px;border-radius:12px;border:0;cursor:pointer';
      document.body.appendChild(btn);
      existing = btn;
    }
    var toggle = existing;
    var saved = localStorage.getItem('site-theme');
    if (saved === 'light') document.documentElement.classList.add('light');
    function updateIcon(){ if(document.documentElement.classList.contains('light')) toggle.textContent='☀️'; else toggle.textContent='🌙' }
    updateIcon();
    toggle.addEventListener('click', function(){
      document.documentElement.classList.toggle('light');
      var mode = document.documentElement.classList.contains('light') ? 'light' : 'dark';
      localStorage.setItem('site-theme', mode);
      updateIcon();
    });
  }

  function setupRevealOnScroll(){
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting){
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    },{threshold:0.12});
    // Observe common blocks and individual CV items for a nicer staggered reveal
    var revealNodes = Array.prototype.slice.call(document.querySelectorAll('.card, .publication-item, .about, .news'));
    // Add each individual CV item so entries reveal one-by-one
    var cvItems = Array.prototype.slice.call(document.querySelectorAll('.cv-box .cv-item'));
    revealNodes = revealNodes.concat(cvItems);

    revealNodes.forEach(function(el, idx){
      // add base class and a small staggered delay
      el.classList.add('reveal');
      // keep delays small and wrap to avoid huge cumulative delays
      var delay = (idx % 6) * 70; // 0,70,140,...ms
      el.style.transitionDelay = delay + 'ms';
      io.observe(el);
    });
  }

  function setupPublicationInteractions(){
    var pubs = document.querySelectorAll('.publication-item');
    if(!pubs || pubs.length===0) return;

    // Build controls (filter + search)
    var container = document.querySelector('.publications');
    if(container){
      var controls = document.createElement('div');
      controls.className = 'pub-controls';
      var select = document.createElement('select'); select.id = 'pub-filter';
      var optAll = document.createElement('option'); optAll.value='all'; optAll.textContent='All'; select.appendChild(optAll);
      // collect years from meta text
      var years = new Set();
      pubs.forEach(function(p){
        var meta = p.querySelector('.pub-meta'); if(!meta) return;
        var m = meta.textContent.match(/(19|20)\d{2}/g);
        if(m) m.forEach(function(y){ years.add(y); });
      });
      Array.from(years).sort().reverse().forEach(function(y){ var o=document.createElement('option'); o.value=y; o.textContent=y; select.appendChild(o); });

      // only add the year filter (search input removed per request)
      controls.appendChild(select);
      container.insertBefore(controls, container.firstChild);

      // filter logic
      function applyFilter(){
        var year = select.value;
        pubs.forEach(function(p){
          var meta = p.querySelector('.pub-meta') ? p.querySelector('.pub-meta').textContent : '';
          var title = p.querySelector('.pub-title') ? p.querySelector('.pub-title').textContent : '';
          var matchYear = (year==='all') || (meta.indexOf(year)!==-1) || (title.indexOf(year)!==-1);
          p.style.display = matchYear ? '' : 'none';
        });
      }
      select.addEventListener('change', applyFilter);
    }

    // NOTE: Abstract toggles removed — keep publication items simple (no auto-added buttons/panels)
  }

  function setupCVInteractions(){
    // CV toggle removed per request. Function retained as no-op for backwards compatibility.
    return;
  }

  // orchestrate initializers after DOM ready and sidebar include
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){
      includeSidebar().then(function(){
        setupThemeToggle();
        setupRevealOnScroll();
        setupPublicationInteractions();
        setupCVInteractions();
      });
    });
  } else {
    includeSidebar().then(function(){
      setupThemeToggle();
      setupRevealOnScroll();
      setupPublicationInteractions();
      setupCVInteractions();
    });
  }
})();
