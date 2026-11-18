/* الأصوات — Sound effects (local WAV files, unlocked on first touch for iPad Safari) */
(function (root) {
  'use strict';
  var NAMES = ['start', 'select', 'confirm', 'warn', 'warn-final', 'timeup', 'result', 'winner'];
  var base = (root.SOUND_BASE || 'assets/sounds/');
  var clips = {};
  var unlocked = false;
  var muted = false;
  try { muted = localStorage.getItem('dfc.muted') === '1'; } catch (e) { /* ignore */ }

  function load() {
    NAMES.forEach(function (n) {
      try {
        var a = new Audio();
        a.preload = 'auto';
        a.src = base + n + '.wav';
        a.volume = n === 'select' ? 0.5 : 0.85;
        clips[n] = a;
      } catch (e) { /* audio not supported */ }
    });
  }

  // iPad Safari only lets audio play after a user gesture: prime every clip once on the first touch.
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    Object.keys(clips).forEach(function (n) {
      var a = clips[n];
      try {
        a.muted = true;
        var p = a.play();
        var reset = function () { a.pause(); a.currentTime = 0; a.muted = false; };
        if (p && p.then) p.then(reset).catch(function () { a.muted = false; });
        else reset();
      } catch (e) { /* ignore */ }
    });
  }

  var Sound = {
    init: function () {
      load();
      ['touchend', 'pointerup', 'keydown', 'click'].forEach(function (ev) {
        document.addEventListener(ev, unlock, { capture: true, passive: true });
      });
    },
    play: function (name) {
      if (muted) return;
      var a = clips[name];
      if (!a) return;
      try {
        a.muted = false;
        a.currentTime = 0;
        var p = a.play();
        if (p && p.catch) p.catch(function () { /* blocked until first touch */ });
      } catch (e) { /* ignore */ }
    },
    isMuted: function () { return muted; },
    setMuted: function (m) {
      muted = !!m;
      try { localStorage.setItem('dfc.muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
      if (muted) Object.keys(clips).forEach(function (n) { try { clips[n].pause(); } catch (e) { /* ignore */ } });
    }
  };
  root.Sound = Sound;
})(window);
