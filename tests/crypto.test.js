// اختبار تشفير كلمة المرور مقابل مكتبة Node المدمجة — node --test tests/crypto.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const nodeCrypto = require('node:crypto');
const P = require('../js/crypto.js');

test('SHA-256 matches known vectors', () => {
  assert.equal(P.sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(P.sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  const long = 'a'.repeat(1000) + 'مسابقة';
  assert.equal(P.sha256Hex(long), nodeCrypto.createHash('sha256').update(long, 'utf8').digest('hex'));
});

test('pure-JS PBKDF2 equals Node PBKDF2 (so Web Crypto and fallback agree)', () => {
  const salt = '00112233445566778899aabbccddeeff';
  for (const pw of ['secret1', 'كلمة-سر-عربية', 'x'.repeat(100)]) {
    const ref = nodeCrypto.pbkdf2Sync(Buffer.from(pw, 'utf8'), Buffer.from(salt, 'hex'), 1000, 32, 'sha256').toString('hex');
    assert.equal(P.pbkdf2JS(pw, salt, 1000), ref);
  }
});

test('create + verify round trip', async () => {
  const rec = await P.create('organiser-2026');
  assert.equal(rec.hash.length, 64);
  assert.ok(!JSON.stringify(rec).includes('organiser-2026'));
  assert.equal(await P.verify('organiser-2026', rec), true);
  assert.equal(await P.verify('organiser-2027', rec), false);
});

test('recovery code format', () => {
  const c = P.recoveryCode();
  assert.match(c, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(P.normalizeCode(c.toLowerCase().replace(/-/g, ' ')), c);
});
