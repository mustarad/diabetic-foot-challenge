/*
 * معادلة النقاط والترتيب — Scoring & ranking (pure functions, tested in tests/scoring.test.js)
 *
 * السؤال الأول (متعدد): 6 نقاط لكل خيار صحيح، خصم 2 لكل خيار خاطئ، الحد الأدنى 0، الأقصى 54.
 * السؤالان الثاني والثالث: 18 نقطة للإجابة الصحيحة، 0 للخاطئة أو لعدم الإجابة.
 * مكافأة السرعة: 10 × (الوقت المتبقي من 90 ثانية ÷ 90)، تُقرَّب لأقرب عُشر نقطة.
 *   من استهلك الوقت كله يحصل على 0.
 * الحد الأقصى للنتيجة = 90 + 10 = 100.
 *
 * تُحسب النقاط داخليًا بوحدة "عُشر النقطة" (أعداد صحيحة) لتجنّب أخطاء الكسور العشرية.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Scoring = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CONFIG = Object.freeze({
    questionTimeMs: 30000,
    totalTimeMs: 90000,
    multiPerCorrect: 6,
    multiPerWrong: 2,
    singlePoints: 18,
    bonusMax: 10,
    baseMax: 90,
    maxTotal: 100
  });

  function clampTime(ms) {
    if (typeof ms !== 'number' || !isFinite(ms) || ms < 0) return CONFIG.questionTimeMs;
    return Math.min(CONFIG.questionTimeMs, Math.round(ms));
  }

  /** Score one question. Returns {points, correctSelected, wrongSelected, totalCorrect, isCorrect}. */
  function scoreQuestion(question, selectedIds) {
    var selected = Array.isArray(selectedIds) ? selectedIds : [];
    var seen = {};
    var correctSelected = 0, wrongSelected = 0, totalCorrect = 0;
    question.options.forEach(function (o) { if (o.correct) totalCorrect++; });
    selected.forEach(function (id) {
      if (seen[id]) return; // ignore duplicates
      seen[id] = true;
      var opt = question.options.filter(function (o) { return o.id === id; })[0];
      if (!opt) return; // ignore unknown ids
      if (opt.correct) correctSelected++; else wrongSelected++;
    });

    var points;
    if (question.type === 'multi') {
      points = correctSelected * CONFIG.multiPerCorrect - wrongSelected * CONFIG.multiPerWrong;
      points = Math.max(0, Math.min(totalCorrect * CONFIG.multiPerCorrect, points));
    } else {
      // single choice: exactly one selection that is the correct one
      points = (selected.length === 1 && correctSelected === 1) ? CONFIG.singlePoints : 0;
    }
    var maxPoints = question.type === 'multi' ? totalCorrect * CONFIG.multiPerCorrect : CONFIG.singlePoints;
    return {
      points: points,
      maxPoints: maxPoints,
      correctSelected: correctSelected,
      wrongSelected: wrongSelected,
      totalCorrect: totalCorrect,
      isCorrect: points === maxPoints && wrongSelected === 0
    };
  }

  /** Speed bonus in tenths of a point (0..100), from total time used in ms. */
  function bonusTenths(totalTimeMs) {
    var used = Math.max(0, Math.min(CONFIG.totalTimeMs, Math.round(totalTimeMs)));
    var remaining = CONFIG.totalTimeMs - used;
    if (remaining <= 0) return 0;
    return Math.max(0, Math.min(CONFIG.bonusMax * 10, Math.round(remaining * CONFIG.bonusMax * 10 / CONFIG.totalTimeMs)));
  }

  /**
   * answers: [{qid, selected:[ids], timeMs, timedOut}]
   * Returns the full result breakdown.
   */
  function scoreAttempt(questions, answers) {
    var byId = {};
    (answers || []).forEach(function (a) { if (a && a.qid) byId[a.qid] = a; });
    var base = 0, totalTime = 0, correctCount = 0, details = [];
    var multiCorrect = 0, multiWrong = 0, multiTotal = 0;
    questions.forEach(function (q) {
      var a = byId[q.id];
      var timeMs = a ? (a.timedOut ? CONFIG.questionTimeMs : clampTime(a.timeMs)) : CONFIG.questionTimeMs;
      var r = scoreQuestion(q, a ? a.selected : []);
      base += r.points;
      totalTime += timeMs;
      if (r.isCorrect) correctCount++;
      if (q.type === 'multi') { multiCorrect = r.correctSelected; multiWrong = r.wrongSelected; multiTotal = r.totalCorrect; }
      details.push({ qid: q.id, points: r.points, maxPoints: r.maxPoints, isCorrect: r.isCorrect, correctSelected: r.correctSelected, wrongSelected: r.wrongSelected, timeMs: timeMs, timedOut: !!(a && a.timedOut) || !a });
    });
    base = Math.min(CONFIG.baseMax, base);
    var bonus = bonusTenths(totalTime);
    var scoreT = Math.min(CONFIG.maxTotal * 10, base * 10 + bonus);
    return {
      baseScore: base,
      bonusTenths: bonus,
      bonus: bonus / 10,
      scoreTenths: scoreT,
      score: scoreT / 10,
      timeMs: totalTime,
      correctCount: correctCount,
      questionCount: questions.length,
      q1Correct: multiCorrect,
      q1Wrong: multiWrong,
      q1Total: multiTotal,
      details: details
    };
  }

  /** Ranking order: higher score, then shorter time, then earlier completion. */
  function compare(a, b) {
    if (b.scoreTenths !== a.scoreTenths) return b.scoreTenths - a.scoreTenths;
    if (a.timeMs !== b.timeMs) return a.timeMs - b.timeMs;
    return (a.completedAtMs || 0) - (b.completedAtMs || 0);
  }

  /** Sort completed, non-test attempts and attach rank (1-based). */
  function rank(entries) {
    return entries
      .filter(function (e) { return e && e.status === 'completed' && !e.isTest; })
      .slice()
      .sort(compare)
      .map(function (e, i) { var c = Object.assign({}, e); c.rank = i + 1; return c; });
  }

  function formatScore(tenths) {
    var v = tenths / 10;
    return (tenths % 10 === 0) ? String(v) : v.toFixed(1);
  }

  function formatTime(ms) {
    var s = Math.max(0, ms) / 1000;
    return s.toFixed(1);
  }

  return {
    CONFIG: CONFIG,
    scoreQuestion: scoreQuestion,
    bonusTenths: bonusTenths,
    scoreAttempt: scoreAttempt,
    compare: compare,
    rank: rank,
    formatScore: formatScore,
    formatTime: formatTime
  };
});
