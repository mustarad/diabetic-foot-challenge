# تحدي القدم السكرية — Diabetic Foot Challenge

Offline, iPad-first (landscape) awareness quiz in the JABIRA (جبيرة) brand identity. Plain HTML/CSS/JS, no libraries, no network, no server-side code.

**For the organiser:** open `تعليمات-التشغيل.html` (Arabic, step by step).

## Structure

| Path | Purpose |
|---|---|
| `index.html` | Player flow: home → name → Q1 → Q2 → Q3 → results → home |
| `admin.html` | Organiser dashboard (hidden entry: long-press the logo on the home screen for 1.5 s) |
| `js/questions.js` | The three approved questions (Arabic text unchanged) + English translation |
| `js/scoring.js` | Pure scoring/ranking functions (unit-tested) |
| `js/db.js` | IndexedDB storage (`attempts`, `settings`) |
| `js/app.js` | Quiz flow, timer, resume, results |
| `js/admin.js` | Dashboard: table, search, details, stats, CSV/backup, import, cleanup, open/close, test mode, QR |
| `js/crypto.js` | PBKDF2-SHA256 password hashing (Web Crypto, or identical pure-JS fallback) |
| `js/qr.js` | Local QR encoder (byte mode, level M, v1–10) |
| `sw.js` | Service worker: caches every file so the app runs with no server/network after first load over `http://localhost` |
| `assets/` | Official logo files (extracted from the brand PDF), circuit pattern, app icons, fonts (OFL), sounds |

## Brand mapping (from JABIRA Brand Guidelines, Edition 01)

- Colours: Navy `#1B4966`, Ink `#0F2A3B`, Leather `#8A5A2B`, Sand `#FAF8F4`, Night `#0C1A24` + the extended palette tokens in `css/main.css`. No new colours; medals use Leather 300 / Night 300 / Leather 600.
- Type: Readex Pro (display), IBM Plex Sans Arabic (text). Body ≥ 17 px, touch targets ≥ 48 px, Western digits.
- Logo: the supplied raster artwork, navy on light / white on dark, never on the pattern.
- Circuit pattern: lifted from the guide, used only as a separate band with no copy on it.
- Voice: no emoji. The Q1 warning heading was removed at the founder's request; question texts are unchanged.
- Status colours (teal/caution/alert) are not used, since they are reserved for health readings.

## Scoring

Q1: +6 per correct option, −2 per wrong option, floor 0 (max 54). Q2/Q3: 18 or 0.
Speed bonus = round(10 × remaining / 90 s, 0.1). Max total 100. Ranking: score ↓, time ↑, completion time ↑.
`COUNT_UNCONFIRMED_ON_TIMEOUT` in `js/app.js` (default `true`) decides whether selections that were not confirmed before time ran out still count.

## Tests (developer only)

```
node --test tests/scoring.test.js tests/crypto.test.js
node tests/qr_dump.js > qr.json && python tests/qr_verify.py qr.json
python -m http.server 8765 --bind 127.0.0.1      # in another terminal
python tests/e2e_test.py http://127.0.0.1:8765/ chromium
python tests/e2e_test.py http://127.0.0.1:8765/ webkit
```

`e2e_test.py` needs Playwright; it is not needed to run the quiz.

## Updating files after deployment

Change `CACHE` in `sw.js` (e.g. `dfc-v1.0.1`) so devices pick up the new files.
