/* مشترك بين صفحة المسابقة ولوحة التحكم — shared: theme, language, sound toggles, icons */
(function (root) {
  'use strict';

  // Line icons drawn like the brand set: 24×24 grid, 1.75 stroke, round caps & joins, no fills.
  var P = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    soundOn: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>',
    soundOff: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
    alert: '<path d="M12 3.5L2.8 19.5h18.4z"/><path d="M12 10v4.5"/><circle cx="12" cy="17" r=".6"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    checkCircle: '<circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.8 2.8L16.2 9.6"/>',
    arrowEnd: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    arrowStart: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
    home: '<path d="M3.5 11L12 4l8.5 7"/><path d="M6 9.5V20h12V9.5"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    download: '<path d="M12 4v11M7 10.5l5 5 5-5M4.5 19.5h15"/>',
    upload: '<path d="M12 15.5v-11M7 9l5-5 5 5M4.5 19.5h15"/>',
    trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
    shield: '<path d="M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
    chart: '<path d="M4 20V4M4 20h16"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
    qr: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z"/><path d="M14 14h2.5v2.5H14zM17.5 17.5H20V20h-2.5zM14 18.5V20M18.5 14H20"/>',
    copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 5.5V4.5h-11v11h1"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    medal: '<circle cx="12" cy="15" r="5.5"/><path d="M8.5 10.5L5.5 3.5h4l2.5 5M15.5 10.5l3-7h-4l-2.5 5"/>',
    users: '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 19.5a6.5 6.5 0 0 1 13 0"/><path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M18 13.8a6.5 6.5 0 0 1 3.5 5.7"/>',
    expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
    logout: '<path d="M14 4.5h4.5v15H14M10 8l-4 4 4 4M6 12h10"/>'
  };
  function icon(name, cls) {
    return '<svg class="icon ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (P[name] || '') + '</svg>';
  }

  // ---------- theme ----------
  function systemTheme() {
    try { return root.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch (e) { return 'light'; }
  }
  function getTheme() {
    var t = null;
    try { t = localStorage.getItem('dfc.theme'); } catch (e) { /* ignore */ }
    return t === 'dark' || t === 'light' ? t : systemTheme();
  }
  function setTheme(t, save) {
    document.documentElement.setAttribute('data-theme', t);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'dark' ? '#0C1A24' : '#FAF8F4');
    if (save) { try { localStorage.setItem('dfc.theme', t); } catch (e) { /* ignore */ } }
    document.querySelectorAll('[data-logo]').forEach(function (img) {
      var kind = img.getAttribute('data-logo');
      img.src = (root.ASSET_BASE || '') + 'assets/img/' + kind + '-' + (t === 'dark' ? 'white' : 'navy') + '.png';
    });
    refreshToggles();
  }

  // ---------- header controls ----------
  function refreshToggles() {
    var t = document.documentElement.getAttribute('data-theme');
    document.querySelectorAll('[data-action="theme"]').forEach(function (b) {
      b.innerHTML = icon(t === 'dark' ? 'sun' : 'moon');
      var label = I18N.t(t === 'dark' ? 'themeToLight' : 'themeToDark');
      b.setAttribute('aria-label', label); b.title = label;
    });
    document.querySelectorAll('[data-action="lang"]').forEach(function (b) {
      b.innerHTML = icon('globe') + '<span lang="' + (I18N.lang === 'ar' ? 'en' : 'ar') + '">' + I18N.t('langSwitch') + '</span>';
      b.setAttribute('aria-label', I18N.t('langSwitchLabel'));
    });
    if (root.Sound) {
      var m = Sound.isMuted();
      document.querySelectorAll('[data-action="sound"]').forEach(function (b) {
        b.innerHTML = icon(m ? 'soundOff' : 'soundOn');
        var label = I18N.t(m ? 'soundOn' : 'soundOff');
        b.setAttribute('aria-label', label); b.title = label;
        b.setAttribute('aria-pressed', m ? 'true' : 'false');
      });
    }
  }

  function bindHeader(onLangChange) {
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-action]');
      if (!b) return;
      var a = b.getAttribute('data-action');
      if (a === 'theme') {
        document.documentElement.classList.add('theme-anim');
        setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark', true);
        setTimeout(function () { document.documentElement.classList.remove('theme-anim'); }, 400);
      } else if (a === 'lang') {
        I18N.setLang(I18N.lang === 'ar' ? 'en' : 'ar');
        refreshToggles();
        if (onLangChange) onLangChange();
      } else if (a === 'sound' && root.Sound) {
        Sound.setMuted(!Sound.isMuted());
        refreshToggles();
      }
    });
  }

  // ---------- iPad niceties ----------
  function preventZoom() {
    // Stop pinch-zoom gestures in Safari. Double-tap zoom is disabled by `touch-action: manipulation`
    // in CSS, so fast taps on several answers in a row are never swallowed.
    ['gesturestart', 'gesturechange'].forEach(function (ev) { document.addEventListener(ev, function (e) { e.preventDefault(); }, { passive: false }); });
  }

  function registerSW(path) {
    try {
      var ok = 'serviceWorker' in navigator && root.isSecureContext && /^https?:$/.test(location.protocol);
      if (ok) {
        var hadController = !!navigator.serviceWorker.controller;
        // the browser itself checks sw.js for a newer version on every visit
        navigator.serviceWorker.register(path || 'sw.js').catch(function () { /* offline cache unavailable */ });
        // a newer version took over: refresh once so the new content shows (never mid-question)
        var reloaded = false;
        navigator.serviceWorker.addEventListener('controllerchange', function () {
          if (!hadController || reloaded) return;
          if (typeof root.__dfcCanReload === 'function' && !root.__dfcCanReload()) return;
          reloaded = true;
          location.reload();
        });
      }
    } catch (e) { /* ignore */ }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }

  root.UI = { icon: icon, getTheme: getTheme, setTheme: setTheme, refreshToggles: refreshToggles, bindHeader: bindHeader, preventZoom: preventZoom, registerSW: registerSW, esc: esc };
})(window);
