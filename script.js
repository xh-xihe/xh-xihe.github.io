/* ══════════════════════════════════════════════════════════════════════
   Xi He — academic homepage
   Vanilla JS, no dependencies. Everything here degrades gracefully:
   with JS disabled the page is a complete, readable document.

     1  Helpers            5  Publication filter + search
     2  Theme              6  BibTeX export
     3  Language           7  Copy-to-clipboard
     4  Active nav link    8  Year stamp
   ══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── 1. Helpers ───────────────────────────────────────────────────── */

  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var toastEl = $('#toast');
  var toastTimer;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 1700);
  }

  function lang() { return document.documentElement.getAttribute('lang') === 'zh' ? 'zh' : 'en'; }
  function t(en, zh) { return lang() === 'zh' ? zh : en; }

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');


  /* ── 2. Theme — system → light → dark ─────────────────────────────── */

  var THEMES = ['auto', 'light', 'dark'];

  function applyTheme(next) {
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('xihe-theme', next); } catch (e) {}
  }

  function cycleTheme() {
    var cur  = document.documentElement.getAttribute('data-theme') || 'auto';
    var next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];

    if (document.startViewTransition && !reduceMotion.matches) {
      var vt = document.startViewTransition(function () { applyTheme(next); });
      // clicking faster than the 200ms transition aborts the previous one;
      // that rejection is expected and must not surface as an uncaught error
      if (vt) {
        if (vt.ready)    vt.ready.catch(function () {});
        if (vt.finished) vt.finished.catch(function () {});
        if (vt.updateCallbackDone) vt.updateCallbackDone.catch(function () {});
      }
    } else {
      applyTheme(next);
    }
    toast({
      auto:  t('Theme: system', '主题：跟随系统'),
      light: t('Theme: light',  '主题：浅色'),
      dark:  t('Theme: dark',   '主题：深色')
    }[next]);
  }

  var themeBtn = $('#theme-toggle');
  if (themeBtn) themeBtn.addEventListener('click', cycleTheme);


  /* ── 3. Language ──────────────────────────────────────────────────── */

  function setTitle() {
    document.title = lang() === 'zh' ? 'Xi He — 量子机器学习' : 'Xi He — Quantum Machine Learning';
  }

  function setLang(l) {
    document.documentElement.setAttribute('lang', l);
    try { localStorage.setItem('xihe-lang', l); } catch (e) {}
    setTitle();
    updateCount();
  }

  // The pre-paint script may have picked zh from navigator.language; localise
  // the title for that case WITHOUT writing a preference the user never chose.
  setTitle();

  var langBtn = $('#lang-toggle');
  if (langBtn) langBtn.addEventListener('click', function () {
    setLang(lang() === 'en' ? 'zh' : 'en');
  });


  /* ── 4. Active nav link ───────────────────────────────────────────── */

  (function activeNav() {
    var links = {};
    $$('.rail-nav a[href^="#"]').forEach(function (a) {
      links[a.getAttribute('href').slice(1)] = a;
    });
    var sections = $$('main section[id]').filter(function (s) { return links[s.id]; });
    if (!sections.length) return;

    var current = null, queued = false;

    function update() {
      queued = false;
      var line = window.innerHeight * 0.28;   // the reading line
      var id = sections[0].id;

      // the last section whose top has passed the reading line wins
      sections.forEach(function (s) {
        if (s.getBoundingClientRect().top <= line) id = s.id;
      });

      // at the very bottom the last section can never reach the line
      if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 2) {
        id = sections[sections.length - 1].id;
      }

      if (id === current) return;
      if (current && links[current]) {
        links[current].classList.remove('on');
        links[current].removeAttribute('aria-current');
      }
      links[id].classList.add('on');
      links[id].setAttribute('aria-current', 'location');
      current = id;
    }

    function onScroll() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(update);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    update();
  })();


  /* ── 5. Publication filter + search ───────────────────────────────── */

  var pubList  = $('#pub-list');
  var pubItems = pubList ? $$('.pub', pubList) : [];
  var searchEl = $('#pub-search');
  var emptyEl  = $('#pub-empty');
  var countEl  = $('#pub-count');
  var filterBtns = $$('.filters button');

  var state = { type: 'all', q: '' };
  var shownCount = pubItems.length;
  var restoring = false;   // true while re-applying state read back out of the URL

  // Cache each item's searchable text and the elements we may highlight.
  pubItems.forEach(function (li) {
    li._hay = li.textContent.toLowerCase().replace(/\s+/g, ' ');
    li._marks = $$('.pub-title, .pub-authors, .pub-venue, .pub-tldr', li);
    li._marks.forEach(function (el) { el._orig = el.innerHTML; });
  });

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /* Highlight matches without ever putting the query through innerHTML:
     restore the pristine markup, then split text nodes and wrap them. */
  function highlight(li, q) {
    li._marks.forEach(function (el) {
      if (el.innerHTML !== el._orig) el.innerHTML = el._orig;
      if (!q) return;
      var re = new RegExp(escapeRe(q), 'gi');
      var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
      var nodes = [], n;
      while ((n = walker.nextNode())) nodes.push(n);
      nodes.forEach(function (node) {
        var text = node.nodeValue, m, last = 0;
        re.lastIndex = 0;
        if (!re.test(text)) return;
        re.lastIndex = 0;
        var frag = document.createDocumentFragment();
        while ((m = re.exec(text))) {
          if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
          var mark = document.createElement('mark');
          mark.textContent = m[0];
          frag.appendChild(mark);
          last = m.index + m[0].length;
          if (m[0].length === 0) re.lastIndex++;   // guard against zero-width loops
        }
        if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
        node.parentNode.replaceChild(frag, node);
      });
    });
  }

  function updateCount() {
    if (!countEl) return;
    if (!pubItems.length) return;
    var total = pubItems.length;
    countEl.textContent = (shownCount === total)
      ? t(total + ' publications', total + ' 篇')
      : t(shownCount + ' of ' + total + ' publications', total + ' 篇中的 ' + shownCount + ' 篇');
  }

  /* Filtering re-flows the list, so let the rows travel to their new positions
     instead of teleporting. Each visible row gets a transition name only for the
     duration of the swap — leaving them named permanently would make every
     later transition try to animate all twenty. */
  function withTransition(mutate) {
    if (!document.startViewTransition || reduceMotion.matches) { mutate(); return; }
    var named = pubItems.filter(function (li) { return !li.hidden; });
    named.forEach(function (li, i) { li.style.viewTransitionName = 'pub-' + i; });
    function clear() { named.forEach(function (li) { li.style.viewTransitionName = ''; }); }
    var vt = document.startViewTransition(mutate);
    if (vt && vt.finished) vt.finished.then(clear, clear);
    else clear();
  }

  function apply() {
    withTransition(function () {
      var q = state.q.trim().toLowerCase();
      shownCount = 0;
      pubItems.forEach(function (li) {
        var okType = state.type === 'all' || li.dataset.type === state.type;
        var okQ    = !q || li._hay.indexOf(q) !== -1;
        var show   = okType && okQ;
        li.hidden = !show;
        if (show) shownCount++;
        highlight(li, show ? q : '');
      });
      if (emptyEl) emptyEl.hidden = shownCount !== 0;
      updateCount();
    });
    syncUrl();
  }

  function syncUrl() {
    if (restoring) return;   // never rewrite the history entry we just read
    if (!window.history || !history.replaceState) return;
    var p = new URLSearchParams();
    if (state.type !== 'all') p.set('type', state.type);
    if (state.q.trim())       p.set('q', state.q.trim());
    var qs = p.toString();
    history.replaceState(null, '', qs ? '?' + qs + location.hash : location.pathname + location.hash);
  }

  filterBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      state.type = b.dataset.filter;
      filterBtns.forEach(function (x) {
        x.setAttribute('aria-pressed', String(x === b));
      });
      apply();
    });
  });

  if (searchEl) {
    var debounce;
    searchEl.addEventListener('input', function () {
      clearTimeout(debounce);
      debounce = setTimeout(function () { state.q = searchEl.value; apply(); }, 110);
    });
    searchEl.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { searchEl.value = ''; state.q = ''; apply(); searchEl.blur(); }
    });
  }

  // "/" focuses the publication search — the only global key binding.
  document.addEventListener('keydown', function (e) {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
    if (!searchEl) return;
    e.preventDefault();
    searchEl.focus();
    searchEl.scrollIntoView({ block: 'center', behavior: reduceMotion.matches ? 'auto' : 'smooth' });
  });

  // Read filter state out of the URL and put the controls in that state.
  function readUrl() {
    var p  = new URLSearchParams(location.search);
    var ty = p.get('type') || 'all';
    var q  = p.get('q') || '';
    if (!filterBtns.some(function (b) { return b.dataset.filter === ty; })) ty = 'all';
    state.type = ty;
    filterBtns.forEach(function (x) { x.setAttribute('aria-pressed', String(x.dataset.filter === ty)); });
    state.q = q;
    if (searchEl) searchEl.value = q;
  }

  if (pubItems.length) {
    readUrl();
    apply();   // also normalises a hand-typed or stale URL

    // Back/forward moves between history entries; without this the address bar
    // and the visible list drift apart.
    window.addEventListener('popstate', function () {
      restoring = true;
      readUrl();
      apply();
      restoring = false;
    });
  }


  /* ── 6. BibTeX export ─────────────────────────────────────────────── */

  (function bibtex() {
    if (!pubItems.length || !navigator.clipboard) return;

    var STOP = { a:1, an:1, the:1, of:1, for:1, on:1, in:1, and:1, to:1, with:1, via:1, using:1, based:1 };
    var KIND = { journal: 'article', conference: 'inproceedings', preprint: 'misc', patent: 'misc' };

    function clean(s) { return (s || '').replace(/\s+/g, ' ').trim().replace(/[.,;·]+$/, ''); }

    function cite(first, year, title) {
      var last = clean(first).split(/\s+/).pop().toLowerCase().replace(/[^a-z]/g, '') || 'anon';
      var word = 'paper';
      title.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).some(function (w) {
        if (w.length >= 3 && !STOP[w]) { word = w; return true; }   // skip "co", "a", …
        return false;
      });
      return last + year + word.replace(/[^a-z0-9]/g, '');
    }

    function build(li) {
      var title   = clean($('.pub-title', li).textContent);
      var authors = clean($('.pub-authors', li).textContent).split(/,\s*/).filter(Boolean);
      var venueEl = $('.pub-venue em', li);
      var venue   = clean(venueEl ? venueEl.textContent : '');
      var vtext   = clean(($('.pub-venue', li) || {}).textContent || '');
      var year    = li.dataset.year || '';
      var kind    = KIND[li.dataset.type] || 'misc';
      var links   = $$('.pub-links a', li);

      // volume / issue / pages out of the venue line, which has a fixed shape:
      //   "Journal 22(2), 105 · 2023"   "Phys. Rev. A 102, 062403 · 2020"
      //   "IJCAI-23, pp. 1017–1025 · 2023"
      var volEl = $('.pub-venue strong', li);
      var vol   = volEl ? clean(volEl.textContent) : '';
      var mNum  = vtext.match(/\b\d+\((\d+)\)/);
      var num   = mNum ? mNum[1] : '';
      var pages = '';
      var mPg   = vtext.match(/pp?\.\s*(\d+)\s*[–—-]\s*(\d+)/);
      if (mPg) {
        pages = mPg[1] + '--' + mPg[2];
      } else {
        var mArt = vtext.match(/\b\d+(?:\(\d+\))?,\s*(\d{3,6})\b/);   // article number
        if (mArt) pages = mArt[1];
      }

      // identifiers from the link row
      var doi = '', eprint = '', url = '', patent = '';
      links.forEach(function (a) {
        var h = a.href;
        var d = h.match(/doi\.org\/(10\.[^\s?#]+)/);
        var e = h.match(/arxiv\.org\/abs\/([\w.\/-]+)/i);
        if (d && !doi) doi = d[1];
        if (e && !eprint) eprint = e[1];
        if (!url) url = h;
      });
      if (li.dataset.type === 'patent') {
        var mp = vtext.match(/\b(CN\d+[A-Z]?)\b/);
        if (mp) patent = mp[1];
      }

      var out = ['@' + kind + '{' + (li._citeKey || cite(authors[0] || 'anon', year, title)) + ','];
      // pad short keys for alignment, but never truncate a long one
      function f(k, v) {
        if (!v) return;
        out.push('  ' + k + new Array(Math.max(1, 10 - k.length)).join(' ') + ' = {' + v + '},');
      }

      f('title', title);
      if (authors.length) f('author', authors.join(' and '));
      if (kind === 'article') {
        f('journal', venue);
      } else if (kind === 'inproceedings') {
        f('booktitle', venue);
      } else if (patent) {
        // no standard .bst reads `number` on @misc, so the patent number has
        // to ride inside howpublished or it vanishes from the bibliography
        f('howpublished', (venue ? venue + ' ' : 'Patent ') + patent);
      } else {
        f('howpublished', venue);
      }
      f('volume', vol);
      if (!patent) f('number', num);
      f('pages', pages);
      f('doi', doi);
      if (eprint) { f('eprint', eprint); f('archivePrefix', 'arXiv'); }
      f('url', url);
      out.push('  year      = {' + year + '}');
      out.push('}');
      return out.join('\n');
    }

    // One cite key per paper, assigned once in DOM order. Same author + same
    // year + same first title word used to collide silently (he2020quantum
    // appeared three times); collisions now get the conventional b/c suffix.
    var usedKeys = Object.create(null);
    pubItems.forEach(function (li) {
      var first = clean($('.pub-authors', li).textContent).split(/,\s*/)[0] || 'anon';
      var base  = cite(first, li.dataset.year || '', clean($('.pub-title', li).textContent));
      var n = usedKeys[base] = (usedKeys[base] || 0) + 1;
      li._citeKey = n === 1 ? base : base + String.fromCharCode(96 + n); // b, c, d…
    });

    pubItems.forEach(function (li) {
      var row = $('.pub-links', li);
      if (!row) {                                  // entries with no link row get one
        row = document.createElement('p');
        row.className = 'pub-links';
        $('.pub-body', li).appendChild(row);
      }
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'BibTeX';
      btn.setAttribute('aria-label', 'Copy BibTeX citation');
      btn.addEventListener('click', function () {
        navigator.clipboard.writeText(build(li)).then(
          function () { toast(t('BibTeX copied', 'BibTeX 已复制')); },
          function () { toast(t('Copy failed', '复制失败')); }
        );
      });
      row.appendChild(btn);
    });
  })();


  /* ── 7. Copy-to-clipboard (Alt+click an email) ────────────────────── */

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-copy]');
    if (!el || !navigator.clipboard) return;
    // plain click on a mailto: link still opens the mail client
    if (el.tagName === 'A' && el.getAttribute('href').indexOf('mailto:') === 0 && !e.altKey) return;
    e.preventDefault();
    navigator.clipboard.writeText(el.dataset.copy).then(
      function () { toast(t('Copied ', '已复制 ') + el.dataset.copy); },
      function () { toast(t('Copy failed', '复制失败')); }
    );
  });


  /* ── 8. Year stamp ────────────────────────────────────────────────── */

  var y = String(new Date().getFullYear());
  $$('.yr-now').forEach(function (el) { el.textContent = y; });

})();
