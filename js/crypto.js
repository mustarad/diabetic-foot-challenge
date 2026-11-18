/*
 * تشفير كلمة مرور المنظّم — PBKDF2-HMAC-SHA256
 * كلمة المرور لا تُكتب في الكود ولا تُحفظ نصًا؛ يُحفظ فقط ملح عشوائي + بصمة PBKDF2.
 * يستخدم Web Crypto عند توفره، وإلا تنفيذًا مكافئًا بـ JavaScript (مثلًا عند فتح الصفحة عبر عنوان شبكة http).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PassHash = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var ITERATIONS = 60000;
  var K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);

  function sha256(bytes) {
    var H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    var l = bytes.length, bitLen = l * 8;
    var padLen = ((l + 9 + 63) >> 6) << 6;
    var m = new Uint8Array(padLen);
    m.set(bytes); m[l] = 0x80;
    var dv = new DataView(m.buffer);
    dv.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000));
    dv.setUint32(padLen - 4, bitLen >>> 0);
    var W = new Uint32Array(64);
    for (var off = 0; off < padLen; off += 64) {
      for (var i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4);
      for (i = 16; i < 64; i++) {
        var w15 = W[i - 15], w2 = W[i - 2];
        var s0 = ((w15 >>> 7) | (w15 << 25)) ^ ((w15 >>> 18) | (w15 << 14)) ^ (w15 >>> 3);
        var s1 = ((w2 >>> 17) | (w2 << 15)) ^ ((w2 >>> 19) | (w2 << 13)) ^ (w2 >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K[i] + W[i]) | 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var mj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + mj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
    }
    var out = new Uint8Array(32), odv = new DataView(out.buffer);
    for (i = 0; i < 8; i++) odv.setUint32(i * 4, H[i]);
    return out;
  }

  function hmacFactory(key) {
    if (key.length > 64) key = sha256(key);
    var ipad = new Uint8Array(64), opad = new Uint8Array(64);
    for (var i = 0; i < 64; i++) { var k = key[i] || 0; ipad[i] = k ^ 0x36; opad[i] = k ^ 0x5c; }
    return function (msg) {
      var inner = new Uint8Array(64 + msg.length); inner.set(ipad); inner.set(msg, 64);
      var ih = sha256(inner);
      var outer = new Uint8Array(96); outer.set(opad); outer.set(ih, 64);
      return sha256(outer);
    };
  }

  /** PBKDF2-HMAC-SHA256, single 32-byte block. */
  function pbkdf2JS(pwBytes, salt, iterations) {
    var prf = hmacFactory(pwBytes);
    var block = new Uint8Array(salt.length + 4); block.set(salt); block[salt.length + 3] = 1;
    var u = prf(block), t = new Uint8Array(u);
    for (var i = 1; i < iterations; i++) { u = prf(u); for (var j = 0; j < 32; j++) t[j] ^= u[j]; }
    return t;
  }

  function utf8(s) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
    return Uint8Array.from(Buffer.from(s, 'utf8'));
  }
  function hex(b) { return Array.prototype.map.call(b, function (x) { return (x + 0x100).toString(16).slice(1); }).join(''); }
  function unhex(s) { var a = new Uint8Array(s.length / 2); for (var i = 0; i < a.length; i++) a[i] = parseInt(s.substr(i * 2, 2), 16); return a; }

  function subtle() {
    try {
      var c = (typeof self !== 'undefined' && self.crypto) || (typeof globalThis !== 'undefined' && globalThis.crypto);
      return c && c.subtle && typeof c.subtle.importKey === 'function' ? c.subtle : null;
    } catch (e) { return null; }
  }

  function derive(password, saltHex, iterations) {
    var pw = utf8(String(password).normalize ? String(password).normalize('NFC') : String(password));
    var salt = unhex(saltHex);
    var s = subtle();
    if (s) {
      return s.importKey('raw', pw, { name: 'PBKDF2' }, false, ['deriveBits'])
        .then(function (key) { return s.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: iterations }, key, 256); })
        .then(function (bits) { return hex(new Uint8Array(bits)); })
        .catch(function () { return hex(pbkdf2JS(pw, salt, iterations)); });
    }
    return new Promise(function (resolve) { setTimeout(function () { resolve(hex(pbkdf2JS(pw, salt, iterations))); }, 20); });
  }

  function randomHex(n) {
    var b = new Uint8Array(n);
    var c = (typeof self !== 'undefined' && self.crypto) || globalThis.crypto;
    c.getRandomValues(b);
    return hex(b);
  }

  /** constant-time-ish comparison */
  function same(a, b) {
    if (a.length !== b.length) return false;
    var r = 0; for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return r === 0;
  }

  return {
    ITERATIONS: ITERATIONS,
    sha256Hex: function (s) { return hex(sha256(utf8(s))); },
    pbkdf2JS: function (pw, saltHex, it) { return hex(pbkdf2JS(utf8(pw), unhex(saltHex), it)); },
    /** returns {salt, hash, iterations} */
    create: function (password) {
      var salt = randomHex(16);
      return derive(password, salt, ITERATIONS).then(function (hash) { return { salt: salt, hash: hash, iterations: ITERATIONS }; });
    },
    verify: function (password, record) {
      if (!record || !record.salt || !record.hash) return Promise.resolve(false);
      return derive(password, record.salt, record.iterations || ITERATIONS).then(function (h) { return same(h, record.hash); });
    },
    /** recovery code like ABCD-EFGH-JKLM (no ambiguous characters) */
    recoveryCode: function () {
      var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      var b = new Uint8Array(12);
      ((typeof self !== 'undefined' && self.crypto) || globalThis.crypto).getRandomValues(b);
      var s = '';
      for (var i = 0; i < 12; i++) { s += alphabet[b[i] % alphabet.length]; if (i === 3 || i === 7) s += '-'; }
      return s;
    },
    normalizeCode: function (c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/(.{4})(.{4})(.{4})/, '$1-$2-$3'); }
  };
});
