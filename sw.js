/*
 * Service Worker — يحفظ جميع ملفات المسابقة في ذاكرة الجهاز بعد أول فتح (من الموقع أو من http://localhost)
 * فتعمل الصفحة بعدها دون إنترنت ودون خادم.
 * (لا يعمل عند فتح الملف مباشرة file:// — وهذا طبيعي.)
 */
var CACHE = 'dfc-v1.1.0';
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
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// cache first; never needs the network once installed
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      return fetch(e.request).then(function (res) {
        if (res && res.ok && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      }).catch(function () {
        if (e.request.mode === 'navigate') return caches.match('index.html');
        return new Response('', { status: 504 });
      });
    })
  );
});
