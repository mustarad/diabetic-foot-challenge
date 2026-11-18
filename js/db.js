/*
 * التخزين المحلي عبر IndexedDB — Local storage (IndexedDB)
 * stores:
 *   attempts  (keyPath: id)  — every participation, completed or in progress
 *   settings  (keyPath: key) — quizOpen, testMode, admin credentials hash
 * كل مشاركة تُحفظ بمعرّف UUID ثابت؛ إعادة الحفظ بنفس المعرّف تستبدل السجل ولا تكرره.
 */
(function (root) {
  'use strict';
  var DB_NAME = 'diabetic-foot-challenge';
  var DB_VERSION = 1;
  var dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!('indexedDB' in root) || !root.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
      var req;
      try { req = root.indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { reject(e); return; }
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('attempts')) {
          var s = db.createObjectStore('attempts', { keyPath: 'id' });
          s.createIndex('status', 'status', { unique: false });
          s.createIndex('completedAtMs', 'completedAtMs', { unique: false });
        }
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
      };
      req.onsuccess = function () {
        var db = req.result;
        db.onversionchange = function () { db.close(); dbPromise = null; };
        resolve(db);
      };
      req.onerror = function () { dbPromise = null; reject(req.error || new Error('IndexedDB open failed')); };
      req.onblocked = function () { /* another tab holds an old version; wait */ };
    });
    return dbPromise;
  }

  function tx(storeName, mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(storeName, mode);
        var store = t.objectStore(storeName);
        var result;
        Promise.resolve(fn(store, function (r) { result = r; })).catch(reject);
        t.oncomplete = function () { resolve(result); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error || new Error('Transaction aborted')); };
      });
    });
  }

  function reqP(r) { return new Promise(function (res, rej) { r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }

  var DB = {
    open: open,
    putAttempt: function (attempt) {
      return tx('attempts', 'readwrite', function (s) { s.put(attempt); });
    },
    getAttempt: function (id) {
      return tx('attempts', 'readonly', function (s, done) { return reqP(s.get(id)).then(done); });
    },
    allAttempts: function () {
      return tx('attempts', 'readonly', function (s, done) { return reqP(s.getAll()).then(function (r) { done(r || []); }); });
    },
    deleteAttempts: function (ids) {
      return tx('attempts', 'readwrite', function (s) { ids.forEach(function (id) { s.delete(id); }); });
    },
    clearAttempts: function () {
      return tx('attempts', 'readwrite', function (s) { s.clear(); });
    },
    /** Import: add records whose id is not present yet (never overwrites). Returns count added. */
    importAttempts: function (list) {
      return tx('attempts', 'readwrite', function (s, done) {
        // plain callbacks keep the transaction active on every Safari version
        var r = s.getAllKeys();
        r.onsuccess = function () {
          var have = {};
          (r.result || []).forEach(function (k) { have[k] = true; });
          var added = 0;
          list.forEach(function (a) { if (!have[a.id]) { have[a.id] = true; s.put(a); added++; } });
          done(added);
        };
      });
    },
    getSetting: function (key, fallback) {
      return tx('settings', 'readonly', function (s, done) {
        return reqP(s.get(key)).then(function (r) { done(r ? r.value : fallback); });
      }).catch(function () { return fallback; });
    },
    setSetting: function (key, value) {
      return tx('settings', 'readwrite', function (s) { s.put({ key: key, value: value }); });
    },
    requestPersist: function () {
      try {
        if (navigator.storage && navigator.storage.persist) return navigator.storage.persist().catch(function () { return false; });
      } catch (e) { /* ignore */ }
      return Promise.resolve(false);
    },
    isPersisted: function () {
      try {
        if (navigator.storage && navigator.storage.persisted) return navigator.storage.persisted().catch(function () { return false; });
      } catch (e) { /* ignore */ }
      return Promise.resolve(false);
    }
  };

  DB.uuid = function () {
    if (root.crypto && typeof root.crypto.randomUUID === 'function') {
      try { return root.crypto.randomUUID(); } catch (e) { /* insecure context: fall through */ }
    }
    var b = new Uint8Array(16);
    root.crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return (x + 0x100).toString(16).slice(1); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  };

  /** normalise a name for duplicate detection (spaces, Arabic letter variants, case) */
  DB.nameKey = function (name) {
    return String(name || '')
      .replace(/[ً-ْـ]/g, '')        // tashkeel + tatweel
      .replace(/[إأآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
      .replace(/\s+/g, ' ').trim().toLowerCase();
  };

  root.DB = DB;
})(window);
