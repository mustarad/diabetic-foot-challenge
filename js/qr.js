/*
 * مولّد رمز QR محلي (بدون مكتبات خارجية) — Local QR Code generator
 * Byte mode, error-correction level M, versions 1–10 (up to 213 bytes), automatic mask choice.
 * Follows ISO/IEC 18004. Verified by tests/qr_verify.py (independent decoder).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QR = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // index = version (1..10); level M
  var ECC_PER_BLOCK_M = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
  var NUM_BLOCKS_M = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
  var FORMAT_BITS_M = 0; // L=1, M=0, Q=3, H=2

  function rawDataModules(ver) {
    var r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var na = Math.floor(ver / 7) + 2;
      r -= (25 * na - 10) * na - 55;
      if (ver >= 7) r -= 36;
    }
    return r;
  }
  function dataCodewords(ver) { return Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK_M[ver] * NUM_BLOCKS_M[ver]; }

  function alignPositions(ver) {
    if (ver === 1) return [];
    var size = ver * 4 + 17;
    var na = Math.floor(ver / 7) + 2;
    var step = Math.ceil((ver * 4 + 4) / (na * 2 - 2)) * 2;
    var res = [6];
    for (var pos = size - 7; res.length < na; pos -= step) res.splice(1, 0, pos);
    return res;
  }

  function gfMul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; }
    return z & 0xFF;
  }
  function rsDivisor(degree) {
    var r = []; for (var i = 0; i < degree - 1; i++) r.push(0); r.push(1);
    var root = 1;
    for (i = 0; i < degree; i++) {
      for (var j = 0; j < r.length; j++) { r[j] = gfMul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
      root = gfMul(root, 0x02);
    }
    return r;
  }
  function rsRemainder(data, div) {
    var r = div.map(function () { return 0; });
    data.forEach(function (b) {
      var f = b ^ r.shift(); r.push(0);
      div.forEach(function (c, i) { r[i] ^= gfMul(c, f); });
    });
    return r;
  }

  function utf8Bytes(s) {
    if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(s));
    return Array.from(Buffer.from(s, 'utf8'));
  }

  function encode(text, forceMask) {
    var bytes = utf8Bytes(text);
    var ver, cap;
    for (ver = 1; ver <= 10; ver++) {
      var ccBits = ver < 10 ? 8 : 16;
      cap = dataCodewords(ver) * 8;
      if (4 + ccBits + bytes.length * 8 <= cap) break;
    }
    if (ver > 10) throw new Error('QR: text too long');
    var ccBits2 = ver < 10 ? 8 : 16;

    // bit stream
    var bits = [];
    function push(val, len) { for (var i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); }
    push(4, 4);                  // byte mode 0100
    push(bytes.length, ccBits2); // character count
    bytes.forEach(function (b) { push(b, 8); });
    push(0, Math.min(4, cap - bits.length));
    push(0, (8 - bits.length % 8) % 8);
    for (var pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) push(pad, 8);
    var data = [];
    for (var i = 0; i < bits.length; i += 8) { var v = 0; for (var k = 0; k < 8; k++) v = (v << 1) | bits[i + k]; data.push(v); }

    // ECC + interleave
    var nb = NUM_BLOCKS_M[ver], eccLen = ECC_PER_BLOCK_M[ver];
    var rawCw = Math.floor(rawDataModules(ver) / 8);
    var numShort = nb - rawCw % nb;
    var shortLen = Math.floor(rawCw / nb);
    var div = rsDivisor(eccLen);
    var blocks = [];
    for (i = 0, k = 0; i < nb; i++) {
      var dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1));
      k += dat.length;
      var ecc = rsRemainder(dat, div);
      if (i < numShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    var all = [];
    for (i = 0; i < blocks[0].length; i++) {
      for (var j = 0; j < blocks.length; j++) {
        if (i !== shortLen - eccLen || j >= numShort) all.push(blocks[j][i]);
      }
    }

    var size = ver * 4 + 17;
    var mod = [], fn = [];
    for (i = 0; i < size; i++) { mod.push(new Array(size).fill(false)); fn.push(new Array(size).fill(false)); }
    function setF(x, y, dark) { mod[y][x] = dark; fn[y][x] = true; }

    // function patterns
    for (i = 0; i < size; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
    [[3, 3], [size - 4, 3], [3, size - 4]].forEach(function (c) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var d = Math.max(Math.abs(dx), Math.abs(dy)), xx = c[0] + dx, yy = c[1] + dy;
        if (xx >= 0 && xx < size && yy >= 0 && yy < size) setF(xx, yy, d !== 2 && d !== 4);
      }
    });
    var ap = alignPositions(ver), last = ap.length - 1;
    for (i = 0; i < ap.length; i++) for (j = 0; j < ap.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      for (var dy2 = -2; dy2 <= 2; dy2++) for (var dx2 = -2; dx2 <= 2; dx2++) setF(ap[i] + dx2, ap[j] + dy2, Math.max(Math.abs(dx2), Math.abs(dy2)) !== 1);
    }
    function drawFormat(mask) {
      var d = (FORMAT_BITS_M << 3) | mask, rem = d;
      for (var q = 0; q < 10; q++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      var b = ((d << 10) | rem) ^ 0x5412;
      function bit(n) { return ((b >>> n) & 1) !== 0; }
      for (var q2 = 0; q2 <= 5; q2++) setF(8, q2, bit(q2));
      setF(8, 7, bit(6)); setF(8, 8, bit(7)); setF(7, 8, bit(8));
      for (q2 = 9; q2 < 15; q2++) setF(14 - q2, 8, bit(q2));
      for (q2 = 0; q2 < 8; q2++) setF(size - 1 - q2, 8, bit(q2));
      for (q2 = 8; q2 < 15; q2++) setF(8, size - 15 + q2, bit(q2));
      setF(8, size - 8, true);
    }
    drawFormat(0); // reserve
    if (ver >= 7) {
      var rem = ver;
      for (i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      var vb = (ver << 12) | rem;
      for (i = 0; i < 18; i++) {
        var bt = ((vb >>> i) & 1) !== 0, a = size - 11 + i % 3, bb = Math.floor(i / 3);
        setF(a, bb, bt); setF(bb, a, bt);
      }
    }

    // place codewords (zigzag)
    var bi = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (j = 0; j < 2; j++) {
          var x = right - j;
          var upward = ((right + 1) & 2) === 0;
          var y = upward ? size - 1 - vert : vert;
          if (!fn[y][x] && bi < all.length * 8) {
            mod[y][x] = ((all[bi >>> 3] >>> (7 - (bi & 7))) & 1) !== 0;
            bi++;
          }
        }
      }
    }

    function maskFn(m, x, y) {
      switch (m) {
        case 0: return (x + y) % 2 === 0;
        case 1: return y % 2 === 0;
        case 2: return x % 3 === 0;
        case 3: return (x + y) % 3 === 0;
        case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
        case 5: return (x * y) % 2 + (x * y) % 3 === 0;
        case 6: return ((x * y) % 2 + (x * y) % 3) % 2 === 0;
        default: return ((x + y) % 2 + (x * y) % 3) % 2 === 0;
      }
    }
    function applyMask(m) {
      for (var yy = 0; yy < size; yy++) for (var xx = 0; xx < size; xx++) if (!fn[yy][xx] && maskFn(m, xx, yy)) mod[yy][xx] = !mod[yy][xx];
    }
    function penalty() {
      var p = 0, yy, xx, run, dark = 0;
      function lines(get) {
        for (var a = 0; a < size; a++) {
          run = 1;
          for (var b = 1; b < size; b++) {
            if (get(a, b) === get(a, b - 1)) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1;
          }
          // finder-like 1:1:3:1:1 with 4 light on one side
          for (b = 0; b + 10 < size + 4; b++) {
            var seq = [];
            for (var c = -4; c < 11; c++) { var idx = b + c; seq.push(idx >= 0 && idx < size ? get(a, idx) : false); }
            // seq[4..10] = pattern 1011101, with 4 light before or after
            var core = seq[4] && !seq[5] && seq[6] && seq[7] && seq[8] && !seq[9] && seq[10];
            if (core) {
              var before = !seq[0] && !seq[1] && !seq[2] && !seq[3];
              var after = !seq[11] && !seq[12] && !seq[13] && !seq[14];
              if (before || after) p += 40;
            }
          }
        }
      }
      lines(function (r, c) { return mod[r][c]; });
      lines(function (c, r) { return mod[r][c]; });
      for (yy = 0; yy < size - 1; yy++) for (xx = 0; xx < size - 1; xx++) {
        var cc = mod[yy][xx];
        if (cc === mod[yy][xx + 1] && cc === mod[yy + 1][xx] && cc === mod[yy + 1][xx + 1]) p += 3;
      }
      for (yy = 0; yy < size; yy++) for (xx = 0; xx < size; xx++) if (mod[yy][xx]) dark++;
      var total = size * size;
      var kk = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
      p += Math.max(0, kk) * 10;
      return p;
    }

    var mask = forceMask;
    if (mask === undefined || mask === null) {
      var best = Infinity;
      for (var m = 0; m < 8; m++) {
        applyMask(m); drawFormat(m);
        var pen = penalty();
        if (pen < best) { best = pen; mask = m; }
        applyMask(m); // undo (XOR)
      }
    }
    applyMask(mask); drawFormat(mask);
    return { version: ver, size: size, mask: mask, modules: mod };
  }

  /** SVG string; dark modules in `color` on `bg`, with a 4-module quiet zone. */
  function toSVG(text, opts) {
    opts = opts || {};
    var q = encode(text), border = 4, n = q.size + border * 2;
    var path = '';
    for (var y = 0; y < q.size; y++) for (var x = 0; x < q.size; x++) if (q.modules[y][x]) path += 'M' + (x + border) + ',' + (y + border) + 'h1v1h-1z';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n + ' ' + n + '" shape-rendering="crispEdges" role="img" aria-label="' + (opts.label || 'QR') + '">' +
      '<rect width="100%" height="100%" fill="' + (opts.bg || '#FFFFFF') + '"/>' +
      '<path d="' + path + '" fill="' + (opts.color || '#0F2A3B') + '"/></svg>';
  }

  return { encode: encode, toSVG: toSVG, maxBytes: 213 };
});
