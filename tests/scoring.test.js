// اختبارات معادلة النقاط — تُشغَّل بالأمر:  node --test tests/
// Uses Node's built-in test runner only (no installed packages).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/scoring.js');
const Q = require('../js/questions.js');

const q1 = Q[0], q2 = Q[1], q3 = Q[2];
const all9 = q1.options.map(o => o.id);
const ans = (qid, selected, timeMs, timedOut) => ({ qid, selected, timeMs, timedOut: !!timedOut });

test('approved questions: 3 questions, Q1 has 9 options all correct, Q2=a, Q3=a', () => {
  assert.equal(Q.length, 3);
  assert.equal(q1.options.length, 9);
  assert.ok(q1.options.every(o => o.correct));
  assert.deepEqual(q2.options.filter(o => o.correct).map(o => o.id), ['q2a']);
  assert.deepEqual(q3.options.filter(o => o.correct).map(o => o.id), ['q3a']);
});

test('Q1: each correct choice = 6 points, all nine = 54', () => {
  assert.equal(S.scoreQuestion(q1, []).points, 0);
  assert.equal(S.scoreQuestion(q1, all9.slice(0, 1)).points, 6);
  assert.equal(S.scoreQuestion(q1, all9.slice(0, 4)).points, 24);
  const full = S.scoreQuestion(q1, all9);
  assert.equal(full.points, 54);
  assert.equal(full.isCorrect, true);
  assert.equal(full.correctSelected, 9);
});

test('Q1: duplicates and unknown ids are ignored', () => {
  assert.equal(S.scoreQuestion(q1, ['q1o1', 'q1o1', 'nope']).points, 6);
});

test('multi-select: each wrong choice deducts 2, never below 0, full mark only without errors', () => {
  const mixed = { id: 'm', type: 'multi', options: [
    { id: 'a', correct: true }, { id: 'b', correct: true }, { id: 'c', correct: true },
    { id: 'x', correct: false }, { id: 'y', correct: false }] };
  assert.equal(S.scoreQuestion(mixed, ['a', 'b', 'c']).points, 18);
  assert.equal(S.scoreQuestion(mixed, ['a', 'b', 'c', 'x']).points, 16);
  assert.equal(S.scoreQuestion(mixed, ['a', 'b', 'c', 'x']).isCorrect, false);
  assert.equal(S.scoreQuestion(mixed, ['a', 'x', 'y']).points, 2);
  assert.equal(S.scoreQuestion(mixed, ['x', 'y']).points, 0); // clamped at 0
});

test('Q2 and Q3: correct = 18, wrong or empty = 0', () => {
  assert.equal(S.scoreQuestion(q2, ['q2a']).points, 18);
  assert.equal(S.scoreQuestion(q2, ['q2b']).points, 0);
  assert.equal(S.scoreQuestion(q2, []).points, 0);
  assert.equal(S.scoreQuestion(q3, ['q3a']).points, 18);
  assert.equal(S.scoreQuestion(q3, ['q3b']).points, 0);
  assert.equal(S.scoreQuestion(q3, ['q3a', 'q3b']).points, 0); // single choice cannot hold two
});

test('speed bonus: proportional to remaining time, 0 when full time used, max 10', () => {
  assert.equal(S.bonusTenths(90000), 0);
  assert.equal(S.bonusTenths(120000), 0);
  assert.equal(S.bonusTenths(45000), 50);   // half the time left -> 5.0
  assert.equal(S.bonusTenths(0), 100);      // theoretical max -> 10.0
  assert.equal(S.bonusTenths(81000), 10);   // 9 s left -> 1.0
  assert.equal(S.bonusTenths(89999), 0);    // rounds to 0.0
  // monotonic: finishing earlier never gives less
  let prev = 101;
  for (let t = 0; t <= 90000; t += 250) { const b = S.bonusTenths(t); assert.ok(b <= prev); prev = b; }
});

test('perfect fast attempt: 90 base + bonus, never above 100', () => {
  const r = S.scoreAttempt(Q, [ans('q1', all9, 9000), ans('q2', ['q2a'], 3000), ans('q3', ['q3a'], 3000)]);
  assert.equal(r.baseScore, 90);
  assert.equal(r.timeMs, 15000);
  assert.equal(r.bonusTenths, Math.round(75000 * 100 / 90000)); // 83 -> 8.3
  assert.equal(r.score, 98.3);
  assert.equal(r.correctCount, 3);
  assert.equal(r.q1Correct, 9);
  const instant = S.scoreAttempt(Q, [ans('q1', all9, 0), ans('q2', ['q2a'], 0), ans('q3', ['q3a'], 0)]);
  assert.equal(instant.score, 100);
  assert.ok(instant.scoreTenths <= 1000);
});

test('timeouts count as full 30 s and give no bonus when all three time out', () => {
  const r = S.scoreAttempt(Q, [ans('q1', all9.slice(0, 5), 30000, true), ans('q2', [], 30000, true), ans('q3', [], 30000, true)]);
  assert.equal(r.baseScore, 30);
  assert.equal(r.timeMs, 90000);
  assert.equal(r.bonusTenths, 0);
  assert.equal(r.score, 30);
  assert.equal(r.correctCount, 0);
});

test('missing answers are treated as timed-out and empty', () => {
  const r = S.scoreAttempt(Q, []);
  assert.equal(r.score, 0);
  assert.equal(r.timeMs, 90000);
});

test('times above 30 s per question are clamped', () => {
  const r = S.scoreAttempt(Q, [ans('q1', all9, 999999), ans('q2', ['q2a'], 30000), ans('q3', ['q3a'], 30000)]);
  assert.equal(r.timeMs, 90000);
  assert.equal(r.score, 90);
});

test('partial example: 6 of 9, Q2 right, Q3 wrong, 60 s used', () => {
  const r = S.scoreAttempt(Q, [ans('q1', all9.slice(0, 6), 25000), ans('q2', ['q2a'], 15000), ans('q3', ['q3c'], 20000)]);
  assert.equal(r.baseScore, 36 + 18);
  assert.equal(r.bonusTenths, Math.round(30000 * 100 / 90000)); // 33 -> 3.3
  assert.equal(r.score, 57.3);
  assert.equal(r.correctCount, 1);
});

test('ranking: score desc, then time asc, then earlier completion', () => {
  const e = (id, scoreTenths, timeMs, completedAtMs, extra) => Object.assign({ id, scoreTenths, timeMs, completedAtMs, status: 'completed' }, extra || {});
  const list = [
    e('late-tie', 900, 40000, 2000),
    e('top', 950, 50000, 5000),
    e('early-tie', 900, 40000, 1000),
    e('fast', 900, 30000, 9000),
    e('test', 1000, 1000, 1, { isTest: true }),
    e('open', 1000, 1000, 1, { status: 'in_progress' })
  ];
  const ranked = S.rank(list);
  assert.deepEqual(ranked.map(r => r.id), ['top', 'fast', 'early-tie', 'late-tie']);
  assert.deepEqual(ranked.map(r => r.rank), [1, 2, 3, 4]);
});

test('formatting', () => {
  assert.equal(S.formatScore(983), '98.3');
  assert.equal(S.formatScore(900), '90');
  assert.equal(S.formatTime(15000), '15.0');
});
