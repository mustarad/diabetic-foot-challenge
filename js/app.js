/*
 * منطق المسابقة — Quiz flow
 * home → register → q1 → q2 → q3 → results → home
 *
 * التوقيت: كل سؤال له "وقت بدء" مطلق (Date.now). الوقت المتبقي يُحسب دائمًا من الساعة،
 * فلا يتأثر بتأخر المتصفح أو تبديل التبويبات أو إغلاق الصفحة وإعادة فتحها.
 * منع التكرار: كل مشاركة لها معرّف UUID ثابت يُحفظ في localStorage؛ الحفظ بنفس المعرّف
 * يستبدل السجل نفسه، لذلك تحديث الصفحة لا يُنشئ مشاركة ثانية.
 */
(function () {
  'use strict';

  var Q = window.QUESTIONS;
  var C = Scoring.CONFIG;
  var ACTIVE_KEY = 'dfc.active';
  var TRANSITION_MS = 900;      // pause between questions (not counted against the player)
  var TIMEUP_MS = 1600;         // "time is up" overlay before the next question
  var COUNTDOWN_MS = 3700;      // 3 · 2 · 1 · go — before question 1 (not counted against the player)
  var GO_MS = 700;              // how long "go" stays on screen
  var lastCount = null;
  // عند انتهاء الوقت: تُحتسب الخيارات المحددة غير المؤكدة؟ (true = نعم). غيّرها إلى false لاحتساب السؤال صفرًا.
  var COUNT_UNCONFIRMED_ON_TIMEOUT = true;

  var $ = function (id) { return document.getElementById(id); };
  var t = function () { return I18N.t.apply(null, arguments); };
  var state = null;            // active attempt (persisted)
  var screen = 'home';
  var ticker = null;
  var busy = false;            // true while a confirm/timeout transition is running
  var warned = { ten: false, five: false };
  var quizOpen = true, testMode = false;
  var lastResult = null;

  // ---------------- persistence of the active attempt ----------------
  function saveState() { try { localStorage.setItem(ACTIVE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } }
  function loadState() { try { return JSON.parse(localStorage.getItem(ACTIVE_KEY) || 'null'); } catch (e) { return null; } }
  function clearState() { state = null; try { localStorage.removeItem(ACTIVE_KEY); } catch (e) { /* ignore */ } }

  function attemptRecord(extra) {
    var r = {
      id: state.id,
      name: state.name,
      nameKey: DB.nameKey(state.name),
      lang: I18N.lang,
      isTest: !!state.isTest,
      status: 'in_progress',
      startedAtMs: state.startedAtMs,
      startedAt: new Date(state.startedAtMs).toISOString(),
      answers: state.answers.slice()
    };
    return Object.assign(r, extra || {});
  }

  // ---------------- screens ----------------
  function show(name) {
    screen = name;
    ['home', 'register', 'quiz', 'results'].forEach(function (n) { $('screen-' + n).hidden = n !== name; });
    var el = $('screen-' + name);
    el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter');
    window.scrollTo(0, 0);
    document.title = t('appTitle');
  }
  function focusHeading(id) { var h = $(id); if (h) try { h.focus({ preventScroll: true }); } catch (e) { h.focus(); } }

  function toast(msg) {
    var el = $('toast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }

  // ---------------- leaderboard ----------------
  function medalHTML(rank) {
    var cls = rank <= 3 ? 'm' + rank : '';
    return '<span class="medal ' + cls + '" aria-label="' + UI.esc(t('medal')[rank - 1] || (t('rankN') + ' ' + rank)) + '"><span class="num">' + rank + '</span></span>';
  }
  function itemHTML(e, meId, i) {
    var me = e.id === meId;
    return '<li class="board-item ' + (e.rank > 3 ? 'top' + Math.min(e.rank, 5) : '') + (me ? ' me' : '') + '" style="--i:' + (i || 0) + '"' + (me ? ' aria-current="true"' : '') + '>' +
      medalHTML(e.rank) +
      '<div class="who"><div class="name" ' + (me ? 'data-you="(' + UI.esc(t('you')) + ')"' : '') + '><bdi>' + UI.esc(e.name) + '</bdi></div>' +
      '<div class="time">' + UI.icon('clock') + '<span class="num">' + Scoring.formatTime(e.timeMs) + '</span> ' + t('seconds') + '</div></div>' +
      '<div class="score"><span class="num" data-count="' + e.scoreTenths + '">' + Scoring.formatScore(e.scoreTenths) + '</span><small>' + t('points') + '</small></div>' +
      '</li>';
  }
  function renderBoard(listEl, ranked, meId, animate) {
    var top = ranked.slice(0, 5);
    listEl.classList.toggle('stagger', animate !== false);
    if (!top.length) { listEl.innerHTML = '<li class="board-empty">' + UI.esc(t('top5Empty')) + '</li>'; return; }
    var html = top.map(function (e, i) { return itemHTML(e, meId, i); }).join('');
    var mine = meId ? ranked.filter(function (e) { return e.id === meId; })[0] : null;
    if (mine && mine.rank > 5) html += '<li class="board-sep" aria-hidden="true"></li>' + itemHTML(mine, meId, 6);
    listEl.innerHTML = html;
    if (animate !== false) {
      Array.prototype.forEach.call(listEl.querySelectorAll('[data-count]'), function (el, i) {
        var to = Number(el.getAttribute('data-count'));
        setTimeout(function () { Effects.countUp(el, to, function (v) { return Scoring.formatScore(Math.round(v)); }, 900); }, 120 + i * 90);
      });
    }
  }
  function loadRanked() {
    return DB.allAttempts().then(function (all) { return Scoring.rank(all); }).catch(function () { return []; });
  }

  // ---------------- home ----------------
  function renderHome() {
    $('board-icon-home').innerHTML = UI.icon('medal');
    var icons = ['checkCircle', 'clock', 'medal'];
    $('facts').innerHTML = t('facts').map(function (f, i) { return '<li style="--i:' + i + '">' + UI.icon(icons[i]) + '<span>' + UI.esc(f) + '</span></li>'; }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('.hero > *'), function (el, i) { el.style.setProperty('--d', i); });
    $('btn-start').innerHTML = '<span>' + UI.esc(t('startChallenge')) + '</span>' + UI.icon('arrowEnd', 'icon-dir');
    $('btn-start').hidden = !quizOpen;
    var cn = $('closed-note');
    cn.hidden = quizOpen;
    cn.innerHTML = UI.icon('lock') + '<div><strong>' + UI.esc(t('closedTitle')) + '</strong><span>' + UI.esc(t('closedDesc')) + '</span></div>';
    return loadRanked().then(function (r) { renderBoard($('board-home'), r, null); });
  }
  function goHome() {
    stopTicker();
    hideOverlay();
    clearState();
    lastResult = null;
    return refreshSettings().then(function () {
      show('home');
      return renderHome();
    }).then(function () { focusHeading('home-title'); });
  }

  // ---------------- register ----------------
  function renderRegister() {
    $('btn-begin').innerHTML = '<span>' + UI.esc(t('startNow')) + '</span>' + UI.icon('arrowEnd', 'icon-dir');
    $('btn-reg-back').innerHTML = UI.icon('arrowStart', 'icon-dir') + '<span>' + UI.esc(t('back')) + '</span>';
    var err = $('name-error');
    if (!err.hidden) err.innerHTML = UI.icon('alert') + '<span>' + UI.esc(t('nameError')) + '</span>';
  }
  function goRegister() {
    if (!quizOpen) return;
    show('register');
    renderRegister();
    var input = $('name');
    input.value = '';
    $('name-error').hidden = true;
    $('greet').hidden = true;
    $('form-register').classList.remove('ready');
    input.removeAttribute('aria-invalid');
    $('btn-begin').disabled = false;
    // focus inside the same tap so iPad opens the keyboard
    try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); }
  }
  function cleanName(v) { return String(v || '').replace(/[\u0000-\u001F\u007F<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40); }

  function begin(ev) {
    if (ev) ev.preventDefault();
    if (busy) return;
    var name = cleanName($('name').value);
    if (name.length < 2) {
      var err = $('name-error');
      err.hidden = false;
      err.innerHTML = UI.icon('alert') + '<span>' + UI.esc(t('nameError')) + '</span>';
      $('name').setAttribute('aria-invalid', 'true');
      $('name').focus();
      return;
    }
    busy = true;
    $('btn-begin').disabled = true;
    $('name').blur();
    refreshSettings().then(function () {
      if (!quizOpen) { busy = false; return goHome(); }
      var now = Date.now();
      state = {
        id: DB.uuid(),
        name: name,
        isTest: testMode,
        startedAtMs: now,
        qIndex: 0,
        qStartMs: now + COUNTDOWN_MS,
        selected: [],
        answers: [],
        phase: 'question'
      };
      saveState();
      return DB.putAttempt(attemptRecord()).then(function () {
        busy = false;
        lastCount = null;
        warned = { ten: false, five: false };
        show('quiz');
        renderQuestion(true);
        startTicker();
      });
    }).catch(function () {
      busy = false;
      clearState();
      $('btn-begin').disabled = false;
      toast(t('storageError'));
    });
  }

  // ---------------- quiz ----------------
  function currentQ() { return Q[state.qIndex]; }

  function renderQuestion(animate) {
    var q = currentQ(), i = state.qIndex;
    $('q-progress-label').textContent = t('questionOf', i + 1, Q.length);
    var steps = $('q-steps');
    steps.setAttribute('aria-valuenow', String(i + 1));
    steps.setAttribute('aria-valuetext', t('questionOf', i + 1, Q.length));
    Array.prototype.forEach.call(steps.children, function (s, k) {
      s.className = 'step' + (k < i ? ' done' : k === i ? ' current' : '');
    });
    var w = $('q-warning');
    if (q.warning) { w.hidden = false; w.innerHTML = UI.icon('alert') + '<span>' + UI.esc(I18N.pick(q.warning)) + '</span>'; }
    else w.hidden = true;
    $('q-text').textContent = I18N.pick(q.text);
    $('q-hint').textContent = q.type === 'multi' ? t('multiHint') : t('singleHint');
    $('timer-unit').textContent = t('seconds');

    var list = $('q-options');
    list.className = 'options ' + q.type;
    list.setAttribute('role', q.type === 'multi' ? 'group' : 'radiogroup');
    list.setAttribute('aria-labelledby', 'q-text');
    list.classList.toggle('stagger', !!animate);
    list.innerHTML = q.options.map(function (o, k) {
      var on = state.selected.indexOf(o.id) !== -1;
      var mark = q.type === 'multi' ? UI.icon('check') : '<span>' + t('letters')[k] + '</span>';
      return '<li style="--i:' + k + '"><button type="button" class="opt" role="' + (q.type === 'multi' ? 'checkbox' : 'radio') + '" aria-checked="' + on + '" data-id="' + o.id + '">' +
        '<span class="mark" aria-hidden="true">' + mark + '</span><span class="otext">' + UI.esc(I18N.pick(o)) + '</span></button></li>';
    }).join('');
    updateSelectionUI();
    var card = $('qcard');
    card.classList.remove('leave', 'arrive');
    if (animate) { void card.offsetWidth; card.classList.add('arrive'); }
    tick();
    if (animate) focusHeading('q-text');
  }

  function updateSelectionUI() {
    var q = currentQ();
    var n = state.selected.length;
    $('q-count').textContent = q.type === 'multi' ? t('selectedCount', n) : '';
    var btn = $('btn-confirm');
    btn.classList.remove('saved');
    btn.innerHTML = '<span>' + UI.esc(q.type === 'multi' ? t('confirmMulti') : t('confirmSingle')) + '</span>' + UI.icon('check');
    btn.disabled = n === 0 || busy;
  }

  function onOptionTap(e) {
    var b = e.target.closest('.opt');
    if (!b || busy || !state || state.phase !== 'question') return;
    if (Date.now() < state.qStartMs) return; // still in transition
    var q = currentQ(), id = b.getAttribute('data-id');
    if (q.type === 'multi') {
      var k = state.selected.indexOf(id);
      if (k === -1) state.selected.push(id); else state.selected.splice(k, 1);
    } else {
      state.selected = [id];
    }
    saveState();
    Array.prototype.forEach.call($('q-options').querySelectorAll('.opt'), function (el) {
      var on = state.selected.indexOf(el.getAttribute('data-id')) !== -1;
      el.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    if (state.selected.indexOf(id) !== -1) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
    Sound.play('select');
    updateSelectionUI();
  }

  /** record the answer for the current question and move on */
  function recordAnswer(timedOut, at) {
    var q = currentQ();
    var used = timedOut ? C.questionTimeMs : Math.max(0, Math.min(C.questionTimeMs, at - state.qStartMs));
    var sel = timedOut && !COUNT_UNCONFIRMED_ON_TIMEOUT ? [] : state.selected.slice();
    state.answers = state.answers.filter(function (a) { return a.qid !== q.id; });
    state.answers.push({ qid: q.id, selected: sel, timeMs: used, timedOut: !!timedOut, answeredAtMs: timedOut ? state.qStartMs + C.questionTimeMs : at });
    state.selected = [];
    state.qIndex += 1;
  }

  function confirmAnswer() {
    if (busy || !state || state.phase !== 'question' || !state.selected.length) return;
    var now = Date.now();
    if (now < state.qStartMs) return;
    if (now >= state.qStartMs + C.questionTimeMs) { timeUp(); return; }
    busy = true;
    Sound.play('confirm');
    var btn = $('btn-confirm');
    btn.disabled = true;
    btn.classList.add('saved');
    btn.innerHTML = UI.icon('checkCircle') + '<span>' + UI.esc(t('saved')) + '</span>';
    $('q-options').classList.add('locked');
    recordAnswer(false, now);
    advance(false);
  }

  function timeUp() {
    if (busy || !state || state.phase !== 'question') return;
    busy = true;
    Sound.play('timeup');
    $('q-options').classList.add('locked');
    recordAnswer(true);
    var last = state.qIndex >= Q.length;
    showOverlay('clock', t('timeUp'), last ? t('timeUpEnd') : t('timeUpNext'));
    advance(true);
  }

  /** after an answer: persist, then show next question or finish */
  function advance(afterTimeUp) {
    var wait = afterTimeUp ? TIMEUP_MS : 650;
    // the next question's clock starts only after the transition has finished
    if (state.qIndex < Q.length) state.qStartMs = Date.now() + wait + 260 + 140;
    saveState();
    DB.putAttempt(attemptRecord()).catch(function () { /* final save retries below */ });
    setTimeout(function () {
      if (!state) return;
      if (state.qIndex >= Q.length) { finish(); return; }
      var card = $('qcard');
      card.classList.add('leave');
      setTimeout(function () {
        hideOverlay();
        $('q-options').classList.remove('locked');
        warned = { ten: false, five: false };
        busy = false;
        renderQuestion(true);
      }, 260);
    }, wait);
  }

  function finish() {
    stopTicker();
    var res = Scoring.scoreAttempt(Q, state.answers);
    var lastAns = state.answers[state.answers.length - 1];
    var completedAtMs = (lastAns && lastAns.answeredAtMs) || Date.now();
    var rec = attemptRecord({
      status: 'completed',
      completedAtMs: completedAtMs,
      completedAt: new Date(completedAtMs).toISOString(),
      scoreTenths: res.scoreTenths,
      score: res.score,
      baseScore: res.baseScore,
      bonusTenths: res.bonusTenths,
      timeMs: res.timeMs,
      correctCount: res.correctCount,
      q1Correct: res.q1Correct,
      q1Wrong: res.q1Wrong,
      details: res.details
    });
    state.phase = 'done';
    saveState();
    DB.putAttempt(rec).then(function () {
      busy = false;
      hideOverlay();
      showResults(rec, true);
    }).catch(function () {
      busy = false;
      hideOverlay();
      toast(t('storageError'));
      showResults(rec, true);
    });
  }

  // ---------------- timer ----------------
  var CIRC = 2 * Math.PI * 44;
  function tick() {
    if (!state || screen !== 'quiz' || state.phase !== 'question') return;
    var now = Date.now();
    if (state.qIndex >= Q.length) return;
    renderCountdown(now);
    var remaining = state.qStartMs + C.questionTimeMs - Math.max(now, state.qStartMs);
    if (remaining <= 0 && !busy) { renderTimer(0); timeUp(); return; }
    renderTimer(Math.max(0, remaining));
  }
  /** 3 · 2 · 1 · go overlay before the first question (driven by the real clock, survives reloads) */
  function renderCountdown(now) {
    var first = state.qIndex === 0 && !state.answers.length;
    var left = state.qStartMs - now;
    if (!first || left <= 0) {
      if (lastCount !== null) { lastCount = null; $('overlay').classList.remove('countdown'); if (!busy) hideOverlay(); }
      return;
    }
    var label = left > GO_MS ? String(Math.ceil((left - GO_MS) / 1000)) : t('go');
    if (label === lastCount) return;
    lastCount = label;
    var ov = $('overlay');
    ov.classList.add('countdown');
    $('overlay-icon').innerHTML = '';
    $('overlay-title').innerHTML = '<span class="count-num num">' + UI.esc(label) + '</span>';
    $('overlay-text').textContent = label === t('go') ? state.name : t('getReady');
    ov.hidden = false;
    var n = ov.querySelector('.count-num'); if (n) { n.classList.remove('pop-in'); void n.offsetWidth; n.classList.add('pop-in'); }
    Sound.play(label === t('go') ? 'start' : 'select');
  }

  var lastSecs = null;
  function renderTimer(ms) {
    var secs = Math.ceil(ms / 1000);
    var tv = $('timer-val');
    if (secs !== lastSecs) {
      lastSecs = secs;
      tv.textContent = String(secs);
      tv.classList.remove('flip'); void tv.offsetWidth; tv.classList.add('flip');
    }
    $('timer-ring').setAttribute('aria-label', t('timerLabel', secs));
    $('timer-bar').setAttribute('stroke-dashoffset', String(CIRC * (1 - ms / C.questionTimeMs)));
    var tm = $('timer'), chip = $('timer-chip');
    var warn = ms <= 10000 && ms > 0, fin = ms <= 5000 && ms > 0;
    tm.classList.toggle('warn', warn);
    tm.classList.toggle('final', fin);
    if (warn) {
      chip.hidden = false;
      chip.innerHTML = UI.icon('clock') + '<span>' + UI.esc(fin ? t('fiveLeft') : t('tenLeft')) + '</span>';
      if (!busy) {
        if (!warned.ten) { warned.ten = true; if (!fin) Sound.play('warn'); }
        if (fin && !warned.five) { warned.five = true; Sound.play('warn-final'); }
      }
    } else chip.hidden = true;
  }
  function startTicker() {
    stopTicker();
    ticker = setInterval(tick, 200);
    tick();
  }
  function stopTicker() { if (ticker) clearInterval(ticker); ticker = null; }

  // ---------------- overlay ----------------
  function showOverlay(iconName, title, text) {
    $('overlay-icon').innerHTML = UI.icon(iconName);
    $('overlay-title').textContent = title;
    $('overlay-text').textContent = text;
    $('overlay').hidden = false;
  }
  function hideOverlay() { $('overlay').hidden = true; }

  // ---------------- results ----------------
  function messageFor(score) {
    var m = t('msgs');
    for (var i = 0; i < m.length; i++) if (score >= m[i].min) return m[i].t;
    return m[m.length - 1].t;
  }
  function showResults(rec, celebrate) {
    lastResult = rec;
    show('results');
    return loadRanked().then(function (ranked) {
      renderResults(rec, ranked, celebrate);
      focusHeading('res-name');
    });
  }
  function renderResults(rec, ranked, celebrate) {
    var mine = ranked.filter(function (e) { return e.id === rec.id; })[0];
    var rankNo = mine ? mine.rank : null;
    $('res-name').innerHTML = '<bdi>' + UI.esc(rec.name) + '</bdi>';
    $('res-msg').textContent = messageFor(rec.score);
    var si = 0;
    var stat = function (icon, k, v) { return '<div class="stat" style="--i:' + (si++) + '"><span class="k">' + UI.icon(icon) + UI.esc(k) + '</span><span class="v">' + v + '</span></div>'; };
    $('res-stats').classList.toggle('stagger', !!celebrate);
    $('res-stats').innerHTML =
      stat('clock', t('timeTaken'), '<span class="num">' + Scoring.formatTime(rec.timeMs) + '</span> <small>' + t('secondsLong') + '</small>') +
      stat('checkCircle', t('correctAnswers'), '<span class="num">' + rec.correctCount + ' / ' + Q.length + '</span>') +
      stat('check', t('q1Choices'), '<span class="num">' + rec.q1Correct + ' / 9</span>') +
      stat('medal', t('yourRank'), rankNo ? '<span class="num">#' + rankNo + '</span> <small>' + UI.esc(t('ofN', ranked.length)) + '</small>' : '<small>—</small>');
    $('res-bonus').innerHTML = UI.esc(t('speedBonus')) + ': <span class="num">+' + Scoring.formatScore(rec.bonusTenths) + '</span>';
    $('btn-home').innerHTML = UI.icon('home') + '<span>' + UI.esc(t('backHome')) + '</span>';
    $('board-icon-res').innerHTML = UI.icon('medal');
    renderBoard($('board-res'), ranked, rec.id, !!celebrate);
    var bar = $('res-bar');
    if (bar) {
      bar.style.transition = celebrate ? '' : 'none';
      bar.style.width = celebrate ? '0%' : (rec.scoreTenths / 10) + '%';
      if (celebrate) setTimeout(function () { bar.style.width = (rec.scoreTenths / 10) + '%'; }, 60);
    }

    var cg = $('res-congrats');
    var top5 = rankNo && rankNo <= 5;
    if (rec.isTest) cg.innerHTML = '<p class="test-note">' + UI.esc(t('testEntry')) + '</p>';
    else if (top5) cg.innerHTML = '<div class="congrats" role="status">' + medalHTML(rankNo) + '<span>' + UI.esc(t('congratsTop5')) + '</span></div>';
    else cg.innerHTML = '';

    var scoreEl = $('res-score');
    if (celebrate) {
      scoreEl.textContent = '0';
      Sound.play(top5 ? 'winner' : 'result');
      Effects.countUp(scoreEl, rec.scoreTenths, function (v) { return Scoring.formatScore(Math.round(v)); }, 1500).then(function () {
        if (top5) Effects.confetti({ count: 180, duration: 3200 });
        else Effects.confetti({ count: 70, duration: 2200 });
      });
    } else {
      scoreEl.textContent = Scoring.formatScore(rec.scoreTenths);
    }
  }

  // ---------------- settings ----------------
  function refreshSettings() {
    return Promise.all([DB.getSetting('quizOpen', true), DB.getSetting('testMode', false)]).then(function (v) {
      quizOpen = v[0] !== false; testMode = !!v[1];
    }).catch(function () { quizOpen = true; testMode = false; });
  }

  // ---------------- language change keeps progress ----------------
  function rerender() {
    I18N.apply(document);
    document.title = t('appTitle');
    if (screen === 'home') renderHome();
    else if (screen === 'register') renderRegister();
    else if (screen === 'quiz' && state && state.phase === 'question' && state.qIndex < Q.length) {
      var locked = $('q-options').classList.contains('locked');
      renderQuestion(false);
      if (locked) $('q-options').classList.add('locked');
      if (!$('overlay').hidden) {
        $('overlay-title').textContent = t('timeUp');
        $('overlay-text').textContent = state.qIndex >= Q.length ? t('timeUpEnd') : t('timeUpNext');
      }
      if (busy) { var b = $('btn-confirm'); b.disabled = true; }
    } else if (screen === 'results' && lastResult) loadRanked().then(function (r) { renderResults(lastResult, r, false); });
  }

  // ---------------- resume after reload ----------------
  function resume() {
    var s = loadState();
    if (!s || !s.id) return Promise.resolve(false);
    state = s;
    if (state.phase === 'done') {
      return DB.getAttempt(state.id).then(function (rec) {
        if (rec && rec.status === 'completed') { showResults(rec, false); return true; }
        clearState(); return false;
      }).catch(function () { clearState(); return false; });
    }
    // fast-forward any question whose time ran out while the page was closed
    var now = Date.now();
    while (state.qIndex < Q.length && now >= state.qStartMs + C.questionTimeMs) {
      var start = state.qStartMs;
      recordAnswer(true);
      if (state.qIndex < Q.length) state.qStartMs = start + C.questionTimeMs;
    }
    saveState();
    if (state.qIndex >= Q.length) { finish(); return Promise.resolve(true); }
    DB.putAttempt(attemptRecord()).catch(function () { /* ignore */ });
    show('quiz');
    warned = { ten: false, five: false };
    renderQuestion(true);
    startTicker();
    return Promise.resolve(true);
  }

  // ---------------- hidden organiser entry: long-press the logo ----------------
  function bindAdminEntry() {
    var brand = $('brand'), timer = null;
    var startPress = function () { clearTimeout(timer); timer = setTimeout(function () { if (screen === 'home') location.href = 'admin.html'; }, 1500); };
    var cancel = function () { clearTimeout(timer); };
    brand.addEventListener('pointerdown', startPress);
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { brand.addEventListener(ev, cancel); });
    brand.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  // ---------------- boot ----------------
  function boot() {
    I18N.loadLang();
    UI.setTheme(UI.getTheme(), false);
    Sound.init();
    I18N.apply(document);
    UI.refreshToggles();
    UI.bindHeader(rerender);
    UI.preventZoom();
    UI.registerSW('sw.js');
    if (/^https?:$/.test(location.protocol)) {
      var l = document.createElement('link'); l.rel = 'manifest'; l.href = 'manifest.webmanifest'; document.head.appendChild(l);
    }
    DB.requestPersist();
    bindAdminEntry();

    $('btn-start').addEventListener('click', goRegister);
    $('form-register').addEventListener('submit', begin);
    $('btn-reg-back').addEventListener('click', goHome);
    $('name').addEventListener('input', function () {
      var n = cleanName(this.value);
      if (!$('name-error').hidden && n.length >= 2) { $('name-error').hidden = true; this.removeAttribute('aria-invalid'); }
      var g = $('greet');
      if (n.length >= 2) {
        var txt = t('hello', n);
        if (g.textContent !== txt) { g.textContent = txt; }
        if (g.hidden) { g.hidden = false; g.classList.remove('show'); void g.offsetWidth; g.classList.add('show'); }
      } else g.hidden = true;
      $('form-register').classList.toggle('ready', n.length >= 2);
    });
    // touch ripple on every button / answer card
    document.addEventListener('pointerdown', function (e) {
      var b = e.target.closest('.btn, .opt, .ctrl, .facts li');
      if (!b || b.disabled || Effects.reduced()) return;
      var r = b.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2;
      var s = document.createElement('span');
      s.className = 'ripple';
      s.style.width = s.style.height = d + 'px';
      s.style.left = (e.clientX - r.left - d / 2) + 'px';
      s.style.top = (e.clientY - r.top - d / 2) + 'px';
      b.appendChild(s);
      setTimeout(function () { s.remove(); }, 650);
    }, { passive: true });
    $('q-options').addEventListener('click', onOptionTap);
    $('btn-confirm').addEventListener('click', confirmAnswer);
    $('btn-home').addEventListener('click', goHome);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });
    window.addEventListener('pageshow', function () { tick(); });
    window.addEventListener('focus', tick);
    // other tabs/admin may change data: refresh the home board when it comes back into view
    document.addEventListener('visibilitychange', function () { if (!document.hidden && screen === 'home') refreshSettings().then(renderHome); });

    refreshSettings().then(resume).then(function (resumed) {
      if (!resumed) { show('home'); renderHome(); }
    });
  }

  // expose a tiny hook for automated tests (read-only state snapshot)
  window.__dfc = { state: function () { return state ? JSON.parse(JSON.stringify(state)) : null; }, screen: function () { return screen; } };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
