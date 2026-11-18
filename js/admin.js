/*
 * لوحة تحكم المنظّم — Organiser dashboard
 * - كلمة المرور لا تُكتب في الكود: يختارها المنظّم أول مرة، ويُحفظ ملح + بصمة PBKDF2 فقط في IndexedDB.
 * - رمز استعادة لمرة واحدة يسمح بتعيين كلمة مرور جديدة إن نُسيت.
 * - هذه حماية محلية من وصول المشاركين بالخطأ، وليست حماية خادم (موضَّح في الواجهة).
 */
(function () {
  'use strict';
  var Q = window.QUESTIONS;
  var $ = function (id) { return document.getElementById(id); };
  var t = function () { return I18N.t.apply(null, arguments); };
  var esc = UI.esc;
  var SESSION_KEY = 'dfc.admin.session';
  var SESSION_MS = 4 * 60 * 60 * 1000;

  var attempts = [], ranked = [], rankById = {};
  var tab = 'participants';
  var authMode = 'login'; // setup | login | recover
  var failCount = 0, lockUntil = 0;
  var qrText = null;

  // ---------------- helpers ----------------
  function toast(msg) {
    var el = $('toast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { el.classList.remove('show'); }, 2800);
  }
  function fmtDate(ms) {
    if (!ms) return '—';
    try {
      return new Date(ms).toLocaleString(I18N.lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) { return new Date(ms).toISOString(); }
  }
  function showError(id, msg) { var e = $(id); e.hidden = !msg; e.innerHTML = msg ? UI.icon('alert') + '<span>' + esc(msg) + '</span>' : ''; }

  /** modal: returns Promise<boolean> (or string when an input is requested) */
  function modal(title, bodyHTML, buttons) {
    return new Promise(function (resolve) {
      $('modal-title').textContent = title;
      $('modal-body').innerHTML = bodyHTML;
      var acts = $('modal-actions');
      acts.innerHTML = '';
      buttons.forEach(function (b) {
        var el = document.createElement('button');
        el.type = 'button';
        el.className = 'btn btn-lg ' + (b.cls || 'btn-secondary');
        el.textContent = b.label;
        el.addEventListener('click', function () {
          var v = b.value;
          if (typeof v === 'function') v = v();
          if (v === undefined) return;
          $('modal').hidden = true;
          resolve(v);
        });
        acts.appendChild(el);
      });
      $('modal').hidden = false;
      var first = $('modal-body').querySelector('input') || acts.lastChild;
      if (first) setTimeout(function () { first.focus(); }, 50);
    });
  }
  function confirmBox(text, danger) {
    return modal(t('confirm'), '<p>' + esc(text) + '</p>', [
      { label: t('cancel'), value: false },
      { label: t('confirm'), value: true, cls: danger ? 'btn-danger' : 'btn-primary' }
    ]);
  }

  // ---------------- auth ----------------
  function sessionValid() {
    try { var v = Number(sessionStorage.getItem(SESSION_KEY) || 0); return v && Date.now() - v < SESSION_MS; } catch (e) { return false; }
  }
  function setSession(on) { try { if (on) sessionStorage.setItem(SESSION_KEY, String(Date.now())); else sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ } }

  function renderAuth() {
    $('auth').hidden = false; $('dash').hidden = true; $('btn-logout').hidden = true;
    $('recovery-show').hidden = true; $('auth-form').hidden = false;
    $('auth-icon').innerHTML = UI.icon(authMode === 'login' ? 'lock' : 'shield');
    $('auth-title').textContent = authMode === 'setup' ? t('adminSetupTitle') : authMode === 'recover' ? t('adminForgot') : t('adminTitle');
    $('auth-desc').textContent = authMode === 'setup' ? t('adminSetupDesc') : authMode === 'recover' ? t('adminRecoveryUse') : t('adminLoginDesc');
    $('lbl-pass').textContent = authMode === 'login' ? t('adminPassword') : t('newPassword');
    $('in-pass').setAttribute('autocomplete', authMode === 'login' ? 'current-password' : 'new-password');
    $('f-pass2').hidden = authMode === 'login';
    $('f-code').hidden = authMode !== 'recover';
    $('auth-forgot').hidden = authMode !== 'login';
    $('auth-submit').textContent = authMode === 'login' ? t('adminLogin') : t('adminCreate');
    I18N.apply($('auth'));
  }

  function onAuthSubmit(e) {
    e.preventDefault();
    var pass = $('in-pass').value, pass2 = $('in-pass2').value;
    showError('auth-error', '');
    if (authMode === 'login') {
      if (Date.now() < lockUntil) { showError('auth-error', t('adminWrong')); return; }
      $('auth-submit').disabled = true;
      DB.getSetting('admin', null).then(function (rec) { return PassHash.verify(pass, rec); }).then(function (ok) {
        $('auth-submit').disabled = false;
        if (ok) { failCount = 0; setSession(true); $('in-pass').value = ''; openDash(); }
        else {
          failCount++;
          if (failCount >= 5) { lockUntil = Date.now() + 30000; failCount = 0; }
          showError('auth-error', t('adminWrong'));
          $('in-pass').select();
        }
      });
      return;
    }
    if (pass.length < 6) { showError('auth-error', t('adminTooShort')); return; }
    if (pass !== pass2) { showError('auth-error', t('adminMismatch')); return; }
    $('auth-submit').disabled = true;
    var proceed = Promise.resolve(true);
    if (authMode === 'recover') {
      var code = PassHash.normalizeCode($('in-code').value);
      proceed = DB.getSetting('adminRecovery', null).then(function (rec) { return PassHash.verify(code, rec); });
    }
    proceed.then(function (ok) {
      if (!ok) { $('auth-submit').disabled = false; showError('auth-error', t('adminRecoveryWrong')); return; }
      var code2 = PassHash.recoveryCode();
      return Promise.all([PassHash.create(pass), PassHash.create(code2)]).then(function (r) {
        return DB.setSetting('admin', r[0]).then(function () { return DB.setSetting('adminRecovery', r[1]); });
      }).then(function () {
        $('auth-submit').disabled = false;
        $('in-pass').value = ''; $('in-pass2').value = ''; $('in-code').value = '';
        setSession(true);
        $('auth-form').hidden = true;
        $('recovery-show').hidden = false;
        $('rec-icon').innerHTML = UI.icon('shield');
        $('recovery-code').textContent = code2;
        $('recovery-ok').focus();
      });
    }).catch(function () { $('auth-submit').disabled = false; showError('auth-error', t('storageError')); });
  }

  // ---------------- dashboard ----------------
  function openDash() {
    $('auth').hidden = true; $('dash').hidden = false; $('btn-logout').hidden = false;
    renderLogout();
    renderTabs();
    return reload();
  }
  function renderLogout() { $('btn-logout').innerHTML = UI.icon('logout', 'icon-dir') + '<span>' + esc(t('adminLogout')) + '</span>'; }

  function reload() {
    return DB.allAttempts().then(function (all) {
      attempts = all;
      ranked = Scoring.rank(all);
      rankById = {};
      ranked.forEach(function (r) { rankById[r.id] = r.rank; });
      renderPanel();
    });
  }

  function renderTabs() {
    var defs = { participants: ['users', 'tabParticipants'], stats: ['chart', 'tabStats'], manage: ['download', 'tabManage'], settings: ['settings', 'tabSettings'], qr: ['qr', 'tabQr'] };
    Object.keys(defs).forEach(function (k) {
      var b = $('tab-' + k);
      b.innerHTML = UI.icon(defs[k][0]) + '<span>' + esc(t(defs[k][1])) + '</span>';
      b.setAttribute('aria-selected', k === tab ? 'true' : 'false');
      b.setAttribute('aria-controls', 'panel-' + k);
      $('panel-' + k).hidden = k !== tab;
    });
  }
  function renderPanel() {
    if (tab === 'participants') renderParticipants();
    else if (tab === 'stats') renderStats();
    else if (tab === 'manage') renderManage();
    else if (tab === 'settings') renderSettings();
    else if (tab === 'qr') renderQr();
  }

  // participants
  function sortedAll() {
    // ranked first (by rank), then tests / in-progress by start time
    var rest = attempts.filter(function (a) { return !rankById[a.id]; }).sort(function (a, b) { return (b.startedAtMs || 0) - (a.startedAtMs || 0); });
    return ranked.concat(rest);
  }
  function statusBadge(a) {
    if (a.isTest) return '<span class="badge test">' + esc(t('statusTest')) + '</span>';
    if (a.status === 'completed') return '<span class="badge done">' + esc(t('statusCompleted')) + '</span>';
    return '<span class="badge">' + esc(t('statusInProgress')) + '</span>';
  }
  function renderParticipants() {
    $('search-icon').innerHTML = UI.icon('search');
    var q = DB.nameKey($('search').value);
    var list = sortedAll().filter(function (a) { return !q || (a.nameKey || DB.nameKey(a.name)).indexOf(q) !== -1; });
    $('count-label').textContent = list.length + ' / ' + attempts.length;
    $('tbody').innerHTML = list.map(function (a) {
      var r = rankById[a.id];
      var done = a.status === 'completed';
      return '<tr>' +
        '<td class="rank-cell">' + (r ? '<span class="medal ' + (r <= 3 ? 'm' + r : '') + '"><span class="num">' + r + '</span></span>' : '—') + '</td>' +
        '<td class="name"><bdi>' + esc(a.name) + '</bdi></td>' +
        '<td class="score num">' + (done ? Scoring.formatScore(a.scoreTenths) : '—') + '</td>' +
        '<td class="num">' + (done ? Scoring.formatTime(a.timeMs) + ' ' + t('seconds') : '—') + '</td>' +
        '<td class="num">' + (done ? a.correctCount + '/3' : '—') + '</td>' +
        '<td class="date num">' + esc(fmtDate(a.completedAtMs)) + '</td>' +
        '<td>' + statusBadge(a) + '</td>' +
        '<td><button type="button" class="btn btn-secondary btn-sm" data-detail="' + esc(a.id) + '">' + esc(t('details')) + '</button></td>' +
        '</tr>';
    }).join('');
    $('table').hidden = !list.length;
    var empty = $('table-empty');
    empty.hidden = !!list.length;
    empty.textContent = attempts.length ? t('noMatches') : t('noParticipants');
  }

  function optionText(q, id) { var o = q.options.filter(function (x) { return x.id === id; })[0]; return o ? I18N.pick(o) : id; }
  function showDetails(id) {
    var a = attempts.filter(function (x) { return x.id === id; })[0];
    if (!a) return;
    var r = rankById[a.id];
    var done = a.status === 'completed';
    var html = '<dl>' +
      '<dt>' + esc(t('colName')) + '</dt><dd><bdi>' + esc(a.name) + '</bdi></dd>' +
      '<dt>' + esc(t('colRank')) + '</dt><dd class="num">' + (r ? '#' + r : '—') + '</dd>' +
      '<dt>' + esc(t('colScore')) + '</dt><dd class="num">' + (done ? Scoring.formatScore(a.scoreTenths) + ' (' + a.baseScore + ' + ' + Scoring.formatScore(a.bonusTenths) + ')' : '—') + '</dd>' +
      '<dt>' + esc(t('colTime')) + '</dt><dd class="num">' + (done ? Scoring.formatTime(a.timeMs) + ' ' + t('secondsLong') : '—') + '</dd>' +
      '<dt>' + esc(t('q1Choices')) + '</dt><dd class="num">' + (done ? a.q1Correct + ' / 9' : '—') + '</dd>' +
      '<dt>' + esc(t('colStatus')) + '</dt><dd>' + statusBadge(a) + '</dd>' +
      '<dt>' + esc(t('colDate')) + '</dt><dd class="num">' + esc(fmtDate(a.completedAtMs)) + '</dd>' +
      '</dl><h3>' + esc(t('detailAnswers')) + '</h3>';
    Q.forEach(function (q, i) {
      var ans = (a.answers || []).filter(function (x) { return x.qid === q.id; })[0];
      var det = (a.details || []).filter(function (x) { return x.qid === q.id; })[0];
      html += '<div class="ans"><strong>' + esc(t('questionOf', i + 1, Q.length)) + (det ? ' — <span class="num">' + det.points + ' / ' + det.maxPoints + '</span>' : '') + '</strong>';
      if (!ans) html += '<span class="muted">' + esc(t('detailNoAnswer')) + '</span>';
      else {
        html += ans.selected && ans.selected.length ? '<ul>' + ans.selected.map(function (s) { return '<li>' + esc(optionText(q, s)) + '</li>'; }).join('') + '</ul>' : '<span class="muted">' + esc(t('detailNoAnswer')) + '</span>';
        html += '<div class="muted num">' + Scoring.formatTime(ans.timeMs) + ' ' + esc(t('seconds')) + (ans.timedOut ? ' · ' + esc(t('detailTimedOut')) : '') + '</div>';
      }
      html += '</div>';
    });
    modal(t('details'), html, [
      { label: t('delete'), value: 'delete', cls: 'btn-danger' },
      { label: a.isTest ? t('unmarkTest') : t('markTest'), value: 'test' },
      { label: t('close'), value: 'close', cls: 'btn-primary' }
    ]).then(function (v) {
      if (v === 'delete') {
        confirmBox(t('deleteOneConfirm', a.name), true).then(function (ok) {
          if (ok) DB.deleteAttempts([a.id]).then(reload).then(function () { toast(t('done')); });
        });
      } else if (v === 'test') {
        a.isTest = !a.isTest;
        DB.putAttempt(a).then(reload).then(function () { toast(t('done')); });
      }
    });
  }

  // stats
  function renderStats() {
    var completed = attempts.filter(function (a) { return a.status === 'completed' && !a.isTest; });
    var real = attempts.filter(function (a) { return !a.isTest; });
    var tests = attempts.filter(function (a) { return a.isTest; });
    var top = ranked.length ? ranked[0].scoreTenths : null;
    var avg = completed.length ? Math.round(completed.reduce(function (s, a) { return s + a.scoreTenths; }, 0) / completed.length) : null;
    var perfect = completed.filter(function (a) { return a.baseScore === 90; }).length;
    var kpi = function (icon, k, v, h) { return '<div class="card kpi"><span class="k">' + UI.icon(icon) + esc(k) + '</span><span class="v num">' + v + '</span>' + (h ? '<span class="h">' + esc(h) + '</span>' : '') + '</div>'; };
    $('stat-grid').innerHTML =
      kpi('users', t('statTotal'), real.length) +
      kpi('medal', t('statTop'), top === null ? '—' : Scoring.formatScore(top)) +
      kpi('chart', t('statAvg'), avg === null ? '—' : Scoring.formatScore(avg)) +
      kpi('checkCircle', t('statCompleted'), completed.length) +
      kpi('shield', t('statPerfect'), perfect, t('statPerfectHint')) +
      kpi('settings', t('statTests'), tests.length);
  }

  // manage
  function renderManage() {
    var set = function (id, icon, key) { $(id).innerHTML = UI.icon(icon) + '<span>' + esc(t(key)) + '</span>'; };
    set('act-csv', 'download', 'exportCsv');
    set('act-backup', 'download', 'exportBackup');
    $('act-import-label').innerHTML = UI.icon('upload') + '<span>' + esc(t('importBackup')) + '</span>';
    set('act-tests', 'trash', 'deleteTests');
    set('act-dupes', 'users', 'deleteDupes');
    set('act-reset', 'trash', 'resetAll');
  }
  function stamp() { var d = new Date(); var p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes()); }
  function download(name, text, type) {
    var blob = new Blob([text], { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }
  function csvCell(v) {
    var s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // spreadsheet formula injection guard
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function answerSummary(a, qi) {
    var q = Q[qi], ans = (a.answers || []).filter(function (x) { return x.qid === q.id; })[0];
    if (!ans) return '';
    var txt = (ans.selected || []).map(function (s) { return optionText(q, s); }).join(' | ');
    return (txt || t('detailNoAnswer')) + (ans.timedOut ? ' (' + t('detailTimedOut') + ')' : '');
  }
  function exportCsv() {
    var rows = [t('csvHeaders')];
    sortedAll().forEach(function (a) {
      var done = a.status === 'completed';
      rows.push([
        rankById[a.id] || '', a.name,
        done ? Scoring.formatScore(a.scoreTenths) : '', done ? a.baseScore : '', done ? Scoring.formatScore(a.bonusTenths) : '',
        done ? Scoring.formatTime(a.timeMs) : '', done ? a.correctCount : '', done ? a.q1Correct : '',
        answerSummary(a, 0), answerSummary(a, 1), answerSummary(a, 2),
        done ? t('statusCompleted') : t('statusInProgress'), a.isTest ? t('yes') : t('no'),
        a.startedAt || '', a.completedAt || '', a.lang || '', a.id
      ]);
    });
    var csv = '﻿' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n';
    download('diabetic-foot-results_' + stamp() + '.csv', csv, 'text/csv;charset=utf-8');
  }
  function exportBackup() {
    var data = { app: 'diabetic-foot-challenge', format: 1, exportedAt: new Date().toISOString(), attempts: attempts };
    download('diabetic-foot-backup_' + stamp() + '.json', JSON.stringify(data, null, 1), 'application/json');
  }
  function validAttempt(a) {
    return a && typeof a.id === 'string' && /^[0-9a-f-]{36}$/i.test(a.id) && typeof a.name === 'string' && a.name.length <= 80 &&
      (a.status === 'completed' || a.status === 'in_progress') &&
      (a.status !== 'completed' || (typeof a.scoreTenths === 'number' && a.scoreTenths >= 0 && a.scoreTenths <= 1000 && typeof a.timeMs === 'number'));
  }
  function importBackup(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try { data = JSON.parse(String(reader.result)); } catch (e) { data = null; }
      if (!data || data.app !== 'diabetic-foot-challenge' || !Array.isArray(data.attempts) || !data.attempts.every(validAttempt)) { toast(t('importError')); return; }
      var clean = data.attempts.map(function (a) {
        var c = JSON.parse(JSON.stringify(a));
        c.name = String(c.name).replace(/[\u0000-\u001F\u007F<>]/g, '').trim().slice(0, 40);
        c.nameKey = DB.nameKey(c.name);
        return c;
      });
      DB.importAttempts(clean).then(function (n) { toast(t('importDone', n)); return reload(); }).catch(function () { toast(t('storageError')); });
    };
    reader.onerror = function () { toast(t('importError')); };
    reader.readAsText(file);
  }
  function deleteTests() {
    var ids = attempts.filter(function (a) { return a.isTest; }).map(function (a) { return a.id; });
    if (!ids.length) { toast(t('testsNone')); return; }
    confirmBox(t('testsConfirm', ids.length), true).then(function (ok) { if (ok) DB.deleteAttempts(ids).then(reload).then(function () { toast(t('done')); }); });
  }
  function duplicateIds() {
    var groups = {};
    attempts.filter(function (a) { return a.status === 'completed' && !a.isTest; }).forEach(function (a) {
      var k = a.nameKey || DB.nameKey(a.name);
      (groups[k] = groups[k] || []).push(a);
    });
    var del = [];
    Object.keys(groups).forEach(function (k) {
      var g = groups[k].sort(function (x, y) { return (x.completedAtMs || 0) - (y.completedAtMs || 0); });
      g.slice(1).forEach(function (a) { del.push(a.id); });
    });
    return del;
  }
  function deleteDupes() {
    var ids = duplicateIds();
    if (!ids.length) { toast(t('dupesNone')); return; }
    confirmBox(t('dupesConfirm', ids.length), true).then(function (ok) { if (ok) DB.deleteAttempts(ids).then(reload).then(function () { toast(t('done')); }); });
  }
  function resetAll() {
    modal(t('resetAll'), '<p>' + esc(t('resetConfirm')) + '</p><input class="input input-md" id="reset-word" type="text" autocomplete="off" autocapitalize="characters">', [
      { label: t('cancel'), value: false },
      { label: t('resetAll'), cls: 'btn-danger', value: function () {
        var v = ($('reset-word').value || '').trim();
        if (v !== t('resetWord') && v.toUpperCase() !== 'DELETE' && v !== 'حذف') { $('reset-word').setAttribute('aria-invalid', 'true'); $('reset-word').focus(); return undefined; }
        return true;
      } }
    ]).then(function (ok) {
      if (ok) DB.clearAttempts().then(function () { try { localStorage.removeItem('dfc.active'); } catch (e) { /* ignore */ } }).then(reload).then(function () { toast(t('resetDone')); });
    });
  }

  // settings
  function renderSettings() {
    Promise.all([DB.getSetting('quizOpen', true), DB.getSetting('testMode', false), DB.isPersisted()]).then(function (v) {
      var open = v[0] !== false, test = !!v[1];
      var os = $('open-state'); os.className = 'state' + (open ? ' on' : ''); os.innerHTML = '<span class="dot"></span>' + esc(open ? t('quizIsOpen') : t('quizIsClosed'));
      $('toggle-open').textContent = open ? t('closeQuiz') : t('openQuiz');
      $('toggle-open').className = 'btn btn-lg ' + (open ? 'btn-secondary' : 'btn-primary');
      var ts = $('test-state'); ts.className = 'state' + (test ? ' on' : ''); ts.innerHTML = '<span class="dot"></span>' + esc(test ? t('testModeOn') : t('testModeOff'));
      $('toggle-test').textContent = test ? t('disable') : t('enable');
      $('storage-state').textContent = v[2] ? t('storagePersisted') : t('storageNotPersisted');
    });
  }
  function toggleSetting(key, def) {
    return DB.getSetting(key, def).then(function (v) { return DB.setSetting(key, !(key === 'quizOpen' ? v !== false : !!v)); }).then(renderSettings).then(function () { toast(t('done')); });
  }
  function changePassword(e) {
    e.preventDefault();
    showError('cp-error', '');
    var oldP = $('cp-old').value, n1 = $('cp-new').value, n2 = $('cp-new2').value;
    if (n1.length < 6) { showError('cp-error', t('adminTooShort')); return; }
    if (n1 !== n2) { showError('cp-error', t('adminMismatch')); return; }
    DB.getSetting('admin', null).then(function (rec) { return PassHash.verify(oldP, rec); }).then(function (ok) {
      if (!ok) { showError('cp-error', t('adminWrong')); return; }
      return PassHash.create(n1).then(function (r) { return DB.setSetting('admin', r); }).then(function () {
        $('cp-old').value = ''; $('cp-new').value = ''; $('cp-new2').value = '';
        toast(t('passwordChanged'));
      });
    });
  }

  // QR
  function isLocalUrl(u) {
    try {
      var x = new URL(u);
      if (x.protocol === 'file:') return true;
      return /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|::1)$/i.test(x.hostname);
    } catch (e) { return true; }
  }
  function quizUrl() { return location.href.replace(/admin\.html.*$/, 'index.html'); }
  function renderQr() {
    var cur = quizUrl();
    $('qr-current').textContent = cur;
    var local = isLocalUrl(cur);
    $('qr-local-warn').hidden = !local;
    $('qr-local-warn').textContent = t('qrLocalWarn');
    $('qr-copy').innerHTML = UI.icon('copy') + '<span>' + esc(t('copyLink')) + '</span>';
    $('qr-full').innerHTML = UI.icon('expand') + '<span>' + esc(t('fullscreen')) + '</span>';
    if (!qrText && !local) qrText = cur;
    if (qrText) drawQr(qrText);
  }
  function drawQr(text) {
    var svg;
    try { svg = QR.toSVG(text, { color: '#0F2A3B', bg: '#FFFFFF', label: text }); } catch (e) { showError('qr-error', t('qrTooLong')); return; }
    qrText = text;
    $('qr-box').innerHTML = svg;
    $('qr-url-shown').textContent = text;
    $('qr-view').hidden = false;
  }
  function onQrSubmit(e) {
    e.preventDefault();
    showError('qr-error', '');
    var v = $('qr-url').value.trim();
    var u;
    try { u = new URL(v); } catch (err) { u = null; }
    if (!u || !/^https?:$/.test(u.protocol)) { showError('qr-error', t('qrInvalid')); return; }
    if (new TextEncoder().encode(u.href).length > QR.maxBytes) { showError('qr-error', t('qrTooLong')); return; }
    drawQr(u.href);
  }
  function copyText(text) {
    var done = function () { toast(t('copied')); };
    var fallback = function () {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; ta.style.fontSize = '16px';
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      if (ok) done(); else toast(t('copyFail'));
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }

  // ---------------- boot ----------------
  function rerender() {
    I18N.apply(document);
    document.title = t('adminTitle');
    if (!$('auth').hidden) renderAuth();
    else { renderLogout(); renderTabs(); renderPanel(); }
  }
  function boot() {
    I18N.loadLang();
    UI.setTheme(UI.getTheme(), false);
    I18N.apply(document);
    document.title = t('adminTitle');
    UI.refreshToggles();
    UI.bindHeader(rerender);
    UI.preventZoom();

    $('auth-form').addEventListener('submit', onAuthSubmit);
    $('auth-forgot').addEventListener('click', function () { authMode = 'recover'; showError('auth-error', ''); renderAuth(); $('in-code').focus(); });
    $('recovery-ok').addEventListener('click', function () { authMode = 'login'; openDash(); });
    $('btn-logout').addEventListener('click', function () { setSession(false); authMode = 'login'; renderAuth(); });
    $('tabs').addEventListener('click', function (e) { var b = e.target.closest('[data-tab]'); if (!b) return; tab = b.getAttribute('data-tab'); renderTabs(); reload(); });
    $('search').addEventListener('input', renderParticipants);
    $('tbody').addEventListener('click', function (e) { var b = e.target.closest('[data-detail]'); if (b) showDetails(b.getAttribute('data-detail')); });
    $('act-csv').addEventListener('click', exportCsv);
    $('act-backup').addEventListener('click', exportBackup);
    $('act-import').addEventListener('change', function () { if (this.files && this.files[0]) importBackup(this.files[0]); this.value = ''; });
    $('act-tests').addEventListener('click', deleteTests);
    $('act-dupes').addEventListener('click', deleteDupes);
    $('act-reset').addEventListener('click', resetAll);
    $('toggle-open').addEventListener('click', function () { toggleSetting('quizOpen', true); });
    $('toggle-test').addEventListener('click', function () { toggleSetting('testMode', false); });
    $('form-pass').addEventListener('submit', changePassword);
    $('qr-form').addEventListener('submit', onQrSubmit);
    $('qr-copy').addEventListener('click', function () { if (qrText) copyText(qrText); });
    $('qr-full').addEventListener('click', function () { if (!qrText) return; $('qr-full-inner').innerHTML = QR.toSVG(qrText, { label: qrText }); $('qr-full-view').hidden = false; });
    $('qr-full-view').addEventListener('click', function () { this.hidden = true; });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { $('qr-full-view').hidden = true; } });

    DB.getSetting('admin', null).then(function (rec) {
      if (!rec) { authMode = 'setup'; renderAuth(); return; }
      authMode = 'login';
      if (sessionValid()) openDash(); else renderAuth();
    }).catch(function () { authMode = 'login'; renderAuth(); showError('auth-error', t('storageError')); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
