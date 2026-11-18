// يولّد رموز QR للتحقق المستقل — dumps QR matrices for tests/qr_verify.py
'use strict';
const QR = require('../js/qr.js');
const texts = [
  'A', 'http://192.168.1.20:8080/', 'https://example.com/diabetic-foot-challenge/index.html',
  'http://localhost:8080/index.html?x=1', 'تحدي القدم السكرية',
  'x'.repeat(40), 'y'.repeat(60), 'z'.repeat(80), 'w'.repeat(100), 'v'.repeat(120), 'u'.repeat(150), 't'.repeat(180), 's'.repeat(213)
];
const out = [];
for (const t of texts) {
  for (let mask = 0; mask < 8; mask++) {
    const q = QR.encode(t, mask);
    out.push({ text: t, version: q.version, mask: q.mask, modules: q.modules.map(r => r.map(Boolean)) });
  }
  const auto = QR.encode(t);
  out.push({ text: t, version: auto.version, mask: auto.mask, modules: auto.modules });
}
process.stdout.write(JSON.stringify(out));
