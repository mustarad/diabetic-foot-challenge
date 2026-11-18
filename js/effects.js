/* المؤثرات البصرية — Confetti & count-up (brand palette only; respects reduce-motion) */
(function (root) {
  'use strict';
  function reduced() {
    try { return root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  }

  // Brand colours: Navy 700/400/300, Leather 600/300, Sand 100
  var COLORS = ['#1B4966', '#5A9CC4', '#8EC5E8', '#8A5A2B', '#E0AC74', '#F1EDE6'];

  function confetti(opts) {
    if (reduced()) return;
    opts = opts || {};
    var count = opts.count || 140;
    var duration = opts.duration || 2600;
    var canvas = document.createElement('canvas');
    canvas.className = 'confetti-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(2, root.devicePixelRatio || 1);
    var W = root.innerWidth, H = root.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
    var parts = [];
    for (var i = 0; i < count; i++) {
      var fromLeft = i % 2 === 0;
      parts.push({
        x: fromLeft ? -10 : W + 10,
        y: H * (0.55 + Math.random() * 0.35),
        vx: (fromLeft ? 1 : -1) * (4 + Math.random() * 7),
        vy: -(9 + Math.random() * 9),
        w: 6 + Math.random() * 6,
        h: 8 + Math.random() * 10,
        r: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        c: COLORS[i % COLORS.length],
        round: Math.random() < 0.3
      });
    }
    var start = null;
    function frame(ts) {
      if (start === null) start = ts;
      var t = ts - start;
      ctx.clearRect(0, 0, W, H);
      var alpha = t > duration - 600 ? Math.max(0, (duration - t) / 600) : 1;
      ctx.globalAlpha = alpha;
      parts.forEach(function (p) {
        p.vy += 0.32; p.vx *= 0.992; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
        if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2); ctx.fill(); }
        else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      if (t < duration) root.requestAnimationFrame(frame);
      else canvas.remove();
    }
    root.requestAnimationFrame(frame);
  }

  /** animate a number from 0 to `to` in element `el`; formatter(value) returns text */
  function countUp(el, to, formatter, ms) {
    formatter = formatter || function (v) { return String(Math.round(v)); };
    if (reduced() || to <= 0) { el.textContent = formatter(to); return Promise.resolve(); }
    ms = ms || 1400;
    return new Promise(function (resolve) {
      var start = null;
      function step(ts) {
        if (start === null) start = ts;
        var k = Math.min(1, (ts - start) / ms);
        var eased = 1 - Math.pow(1 - k, 3);
        el.textContent = formatter(k === 1 ? to : to * eased);
        if (k < 1) root.requestAnimationFrame(step); else resolve();
      }
      root.requestAnimationFrame(step);
    });
  }

  root.Effects = { confetti: confetti, countUp: countUp, reduced: reduced };
})(window);
