/*
 * Service Worker — يحفظ جميع ملفات المسابقة في ذاكرة الجهاز بعد أول فتح (من الموقع أو من http://localhost)
 * فتعمل الصفحة بعدها دون إنترنت ودون خادم.
 * (لا يعمل عند فتح الملف مباشرة file:// — وهذا طبيعي.)
 */
var CACHE = 'dfc-v1.3.0';
var FILES = [
  './', 'index.html', 'admin.html', 'manifest.webmanifest',
  'css/fonts.css', 'css/main.css', 'css/admin.css', 'css/motion.css',
  'js/i18n.js', 'js/questions.js', 'js/scoring.js', 'js/db.js', 'js/sound.js', 'js/effects.js', 'js/common.js', 'js/app.js',
  'js/crypto.js', 'js/qr.js', 'js/admin.js',
  'assets/fonts/ReadexPro-Variable.ttf', 'assets/fonts/IBMPlexSansArabic-Regular.ttf', 'assets/fonts/IBMPlexSansArabic-Medium.ttf',
  'assets/fonts/IBMPlexSansArabic-SemiBold.ttf', 'assets/fonts/IBMPlexSansArabic-Bold.ttf',
  'assets/img/logo-primary-navy.png', 'assets/img/logo-primary-white.png', 'assets/img/symbol-navy.png', 'assets/img/symbol-white.png',
  'assets/img/wordmark-navy.png', 'assets/img/wordmark-white.png', 'assets/img/circuit-tile.png',
  'assets/img/app-icon-180.png', 'assets/img/app-icon-192.png', 'assets/img/app-icon-512.png',
  'assets/sounds/start.wav', 'assets/sounds/select.wav', 'assets/sounds/confirm.wav', 'assets/sounds/warn.wav',
  'assets/sounds/warn-final.wav', 'assets/sounds/timeup.wav', 'assets/sounds/result.wav', 'assets/sounds/winner.wav'
];

self.addEventListener('install', function (e) {
  // cache: 'reload' skips the browser's HTTP cache so a new version never stores stale files
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.addAll(FILES.map(function (f) { return new Request(f, { cache: 'reload' }); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function store(req, res) {
  if (res && res.ok && res.type === 'basic') {
    var copy = res.clone();
    caches.open(CACHE).then(function (c) { c.put(req, copy); });
  }
  return res;
}
function fromCache(req) {
  return caches.match(req, { ignoreSearch: true }).then(function (hit) {
    if (hit) return hit;
    if (req.mode === 'navigate') return caches.match('index.html');
    return null;
  }).then(function (hit) {
    // last resort: let the browser's own HTTP cache answer (works even if the saved copy was cleared)
    return hit || fetch(req.url).catch(function () { return null; });
  }).then(function (res) {
    return res || new Response('', { status: 504, statusText: 'Offline' });
  });
}

/*
 * Pages, code and styles: NETWORK FIRST — when there is internet the newest version always shows
 * (so edits appear right away); with no internet (or a very slow one) the saved copy is used.
 * Fonts, images and sounds: CACHE FIRST — they never change and load instantly.
 */
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  var isCode = req.mode === 'navigate' || /\.(html|js|css|webmanifest)$/.test(url.pathname) || /\/$/.test(url.pathname);
  if (isCode) {
    e.respondWith(new Promise(function (resolve) {
      var done = false;
      var fallback = function () { if (!done) { done = true; resolve(fromCache(req)); } };
      var timer = setTimeout(fallback, 4000);
      // a plain request by address (not the navigation request itself) keeps Safari happy
      fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' })).then(function (res) {
        clearTimeout(timer);
        if (!res || !res.ok) { fallback(); return; }
        if (res.redirected) res = new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers });
        store(req, res);
        if (!done) { done = true; resolve(res); }
      }).catch(function () { clearTimeout(timer); fallback(); });
    }));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (hit) {
    return hit || fetch(req).then(function (res) { return store(req, res); }).catch(function () { return fromCache(req); });
  }));
});
