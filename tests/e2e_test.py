"""
اختبارات شاملة في متصفح حقيقي (للمطوّر فقط — لا يحتاجها تشغيل المسابقة).
End-to-end tests in a real browser engine via Playwright (developer tool, not needed to run the quiz).

  1) serve the folder:   python -m http.server 8765 --bind 127.0.0.1
  2) run:                python tests/e2e_test.py [base_url] [browser]
     browser = chromium (default) or webkit (Safari engine, if installed)
"""
import json, os, sys, tempfile, shutil, subprocess, time
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8765/'
ENGINE = sys.argv[2] if len(sys.argv) > 2 else 'chromium'
ALL9 = ['q1o%d' % i for i in range(1, 10)]
RESULTS = []
ERRORS = []

def check(name, cond, info=''):
    RESULTS.append((name, bool(cond), info))
    print(('PASS ' if cond else 'FAIL ') + name + ((' — ' + str(info)) if info and not cond else ''))

def watch(page, label):
    page.on('pageerror', lambda e: ERRORS.append('%s PAGEERROR %s' % (label, e)))
    page.on('console', lambda m: ERRORS.append('%s console.%s %s' % (label, m.type, m.text)) if m.type == 'error' else None)

def new_page(browser, w=1180, h=820, clock=True, **kw):
    ctx = browser.new_context(viewport={'width': w, 'height': h}, has_touch=True, accept_downloads=True, **kw)
    page = ctx.new_page(); watch(page, '%dx%d' % (w, h))
    if clock: page.clock.install()
    return ctx, page

def start(page, name):
    page.click('#btn-start'); page.fill('#name', name); page.click('#btn-begin')
    page.wait_for_selector('#screen-quiz:not([hidden])')
    page.clock.run_for(4000)

def answer(page, ids, confirm=True):
    if confirm and not ids and not page.evaluate('__dfc.state().selected.length'):
        page.clock.run_for(30500); page.clock.run_for(2500)  # nothing chosen: let the time run out
        return
    for i in ids: page.click('[data-id="%s"]' % i)
    if confirm:
        page.click('#btn-confirm'); page.clock.run_for(1300)

def play(page, name, q1, q2, q3, think_ms=0):
    start(page, name)
    for ids in (q1, q2, q3):
        if think_ms: page.clock.run_for(think_ms)
        answer(page, ids)
    page.clock.run_for(800)
    page.wait_for_selector('#screen-results:not([hidden])')
    page.wait_for_selector('#board-res .board-item')

def attempts(page):
    return page.evaluate('DB.allAttempts()')

with sync_playwright() as p:
    browser = getattr(p, ENGINE).launch()

    # ---------- 1. first load, fonts, no external requests ----------
    ctx, page = new_page(browser, clock=False)
    external = []
    page.on('request', lambda r: external.append(r.url) if not r.url.startswith(BASE) and not r.url.startswith('data:') and not r.url.startswith('blob:') else None)
    page.goto(BASE + 'index.html'); page.wait_for_load_state('networkidle')
    check('home shows title and question', page.inner_text('#home-title') == 'تحدي القدم السكرية' and 'هل ترغب في خوض التحدي؟' in page.inner_text('#screen-home'))
    check('Arabic is default and RTL', page.evaluate('document.documentElement.dir') == 'rtl')
    page.evaluate('document.fonts.ready')
    check('brand fonts loaded locally', page.evaluate("document.fonts.check('20px \"Readex Pro\"') && document.fonts.check('20px \"IBM Plex Sans Arabic\"')"))
    check('no external network requests', not external, external)
    page.wait_for_timeout(800)
    sw = page.evaluate('navigator.serviceWorker.getRegistration().then(r => !!(r && (r.active || r.installing || r.waiting)))')
    check('service worker registered for offline use', sw)
    ctx.close()

    # ---------- 2. name required ----------
    ctx, page = new_page(browser)
    page.goto(BASE + 'index.html')
    page.click('#btn-start')
    check('register screen opens', page.is_visible('#screen-register'))
    check('name input is focused for keyboard', page.evaluate("document.activeElement.id") == 'name')
    page.click('#btn-begin')
    check('cannot start without a name', page.is_visible('#name-error') and page.is_visible('#screen-register'))
    page.fill('#name', ' ')
    page.click('#btn-begin')
    check('blank name rejected', page.is_visible('#screen-register'))
    check('input font ≥16px (no iOS focus zoom)', page.evaluate("parseFloat(getComputedStyle(document.getElementById('name')).fontSize)") >= 16)

    # ---------- 3/4. timer, warnings, timeout auto-advance ----------
    page.fill('#name', 'مختبر الوقت')
    page.press('#name', 'Enter')
    page.wait_for_selector('#screen-quiz:not([hidden])')
    page.clock.run_for(4000)
    check('timer starts at 30', page.inner_text('#timer-val') == '30')
    page.clock.run_for(5000)
    check('timer counts down', page.inner_text('#timer-val') == '25', page.inner_text('#timer-val'))
    page.click('[data-id="q1o1"]'); page.click('[data-id="q1o2"]')
    page.clock.run_for(15500)
    check('10-second visual warning', 'warn' in page.get_attribute('#timer', 'class') and page.is_visible('#timer-chip'))
    page.clock.run_for(5000)
    check('5-second extra warning', 'final' in page.get_attribute('#timer', 'class'))
    page.clock.run_for(5000)
    check('time-up overlay shown', page.is_visible('#overlay'))
    page.clock.run_for(2500)
    st = page.evaluate('__dfc.state()')
    check('auto-advanced to question 2', st['qIndex'] == 1 and page.inner_text('#q-progress-label') == 'السؤال 2 من 3')
    check('cannot go back (no back control on quiz)', page.query_selector('#screen-quiz button:has-text("رجوع")') is None)
    a1 = st['answers'][0]
    check('timed-out Q1 recorded as 30 s with its selections', a1['timedOut'] and a1['timeMs'] == 30000 and len(a1['selected']) == 2)
    # switch tab simulation: clock jumps while hidden, remaining time follows real clock
    page.clock.run_for(12000)
    check('timer unaffected by delays (uses real elapsed time)', page.inner_text('#timer-val') in ('16', '17', '18', '19'), page.inner_text('#timer-val'))
    # language switch keeps progress
    page.click('[data-id="q2a"]')
    page.click('[data-action="lang"]')
    st2 = page.evaluate('__dfc.state()')
    check('switch to English keeps question and selection', page.evaluate('document.documentElement.dir') == 'ltr' and st2['qIndex'] == 1 and st2['selected'] == ['q2a'] and 'Question 2 of 3' == page.inner_text('#q-progress-label'))
    check('English question text', 'How can diabetic foot be prevented?' == page.inner_text('#q-text'))
    page.click('[data-action="lang"]')
    check('back to Arabic keeps selection', page.get_attribute('[data-id="q2a"]', 'aria-checked') == 'true')
    # reload mid-quiz -> resumes, same id
    before_id = st2['id']
    page.reload(); page.wait_for_selector('#screen-quiz:not([hidden])')
    st3 = page.evaluate('__dfc.state()')
    check('reload resumes the same attempt', st3['id'] == before_id and st3['qIndex'] == 1)
    answer(page, [])  # keep q2a, confirm
    page.click('[data-id="q3a"]'); page.click('[data-id="q3b"]')
    check('single choice keeps only one selection', page.evaluate('__dfc.state().selected') == ['q3b'])
    page.click('#btn-confirm'); page.clock.run_for(2000)
    page.wait_for_selector('#screen-results:not([hidden])')
    rows = attempts(page)
    me = [r for r in rows if r['id'] == before_id][0]
    # Q1: 2 correct = 12 (timed out, selections kept), Q2 18, Q3 18 -> 48 base
    check('scoring of partial Q1 + Q2 + Q3', me['baseScore'] == 48 and me['q1Correct'] == 2 and me['correctCount'] == 2, me['baseScore'])
    check('saved as completed', me['status'] == 'completed' and me['completedAt'].endswith('Z'))
    page.reload(); page.wait_for_selector('#screen-results:not([hidden])')
    check('reload on results does not duplicate', len(attempts(page)) == 1)
    page.click('#btn-home')
    page.wait_for_selector('#screen-home:not([hidden])')
    check('back home shows the question and updated top five', 'هل ترغب في خوض التحدي؟' in page.inner_text('#screen-home') and 'مختبر الوقت' in page.inner_text('#board-home'))
    check('result kept after going home, no repeat', len(attempts(page)) == 1)

    # ---------- 5-9. scoring cases, bonus, 100 cap, ranking ----------
    play(page, 'كامل سريع', ALL9, ['q2a'], ['q3b'])
    r = [x for x in attempts(page) if x['name'] == 'كامل سريع'][0]
    check('all nine options = 54 + 18 + 18 = 90 base', r['baseScore'] == 90 and r['q1Correct'] == 9)
    check('speed bonus granted (>0, ≤10)', 0 < r['bonusTenths'] <= 100, r['bonusTenths'])
    check('total never exceeds 100', r['scoreTenths'] <= 1000)
    check('results screen shows congrats for top five', page.is_visible('.congrats'))
    check('player highlighted in the board', page.query_selector('#board-res .board-item.me') is not None)
    page.click('#btn-home')
    for n, q1 in [('لاعب 3', ALL9[:3]), ('لاعب 4', ALL9[:4]), ('لاعب 5', ALL9[:5]), ('لاعب 6', ALL9[:6])]:
        play(page, n, q1, ['q2a'], ['q3a'], think_ms=4000)
        page.click('#btn-home')
    play(page, 'الأخير', [], ['q2b'], ['q3a'], think_ms=1000)
    check('outside top five: real rank shown below the list', page.query_selector('#board-res .board-sep') is not None and page.query_selector('#board-res .board-item.me') is not None)
    check('no congrats when outside top five', not page.is_visible('.congrats'))
    ranked = page.evaluate('Scoring.rank(await DB.allAttempts()).map(r => r.name)') if False else page.evaluate('DB.allAttempts().then(a => Scoring.rank(a).map(r => r.name))')
    check('ranking order by score', ranked[0] == 'كامل سريع' and ranked[-1] == 'الأخير', ranked)
    check('database keeps every entry (not only top five)', len(attempts(page)) == 7)
    page.click('#btn-home')
    check('home board shows exactly five', page.eval_on_selector_all('#board-home .board-item', 'e => e.length') == 5)

    # ---------- theme ----------
    page.click('[data-action="theme"]')
    t1 = page.evaluate("document.documentElement.getAttribute('data-theme')")
    page.reload()
    t2 = page.evaluate("document.documentElement.getAttribute('data-theme')")
    check('theme toggles and is remembered', t1 == 'dark' and t2 == 'dark')
    check('logo switches to white version in dark mode', 'white' in page.get_attribute('.brand-logo', 'src'))
    page.click('[data-action="sound"]')
    check('mute button toggles', page.get_attribute('[data-action="sound"]', 'aria-pressed') == 'true')
    page.screenshot(path=os.path.join(tempfile.gettempdir(), 'dfc_home_dark.png'))

    # ---------- admin ----------
    page.goto(BASE + 'admin.html')
    page.wait_for_selector('#auth:not([hidden])')
    check('admin asks to set a password first time', page.is_visible('#f-pass2'))
    src = open(os.path.join(os.path.dirname(__file__), '..', 'js', 'admin.js'), encoding='utf-8').read()
    page.fill('#in-pass', 'Org-2026!'); page.fill('#in-pass2', 'Org-2026!'); page.click('#auth-submit')
    page.wait_for_selector('#recovery-show:not([hidden])')
    code = page.inner_text('#recovery-code')
    check('recovery code shown once', len(code) == 14)
    stored = page.evaluate("DB.getSetting('admin')")
    check('password not stored in plain text', 'Org-2026!' not in json.dumps(stored) and len(stored['hash']) == 64)
    check('no password inside front-end code', 'Org-2026!' not in src)
    page.click('#recovery-ok')
    page.wait_for_selector('#dash:not([hidden])')
    page.wait_for_timeout(500)
    check('participants table lists all', page.eval_on_selector_all('#tbody tr', 'e => e.length') == 7, (page.eval_on_selector_all('#tbody tr', 'e => e.length'), len(attempts(page))))
    page.fill('#search', 'لاعب')
    check('search filters by name', page.eval_on_selector_all('#tbody tr', 'e => e.length') == 4)
    page.fill('#search', '')
    page.click('#tbody tr:first-child [data-detail]')
    check('details dialog opens', page.is_visible('#modal') and 'كامل سريع' in page.inner_text('#modal-body'))
    page.click('#modal-actions button:has-text("إغلاق")')
    page.click('#tab-stats')
    page.wait_for_timeout(500)
    kpis = page.eval_on_selector_all('.kpi .v', 'e => e.map(x => x.textContent)') + ['', '', '', '', '', '']
    check('statistics: total 7, completed 7, perfect 1', kpis[0] == '7' and kpis[3] == '7' and kpis[4] == '1', kpis)
    page.click('#tab-manage')
    with page.expect_download() as d:
        page.click('#act-csv')
    path = d.value.path(); raw = open(path, 'rb').read()
    check('CSV export has UTF-8 BOM for Excel and all rows', raw.startswith(b'\xef\xbb\xbf') and raw.decode('utf-8-sig').count('\r\n') == 8)
    with page.expect_download() as d2:
        page.click('#act-backup')
    backup_path = d2.value.path()
    bk = json.load(open(backup_path, encoding='utf-8'))
    check('backup export contains all entries', len(bk['attempts']) == 7)
    # mark one as test then delete tests
    page.click('#tab-participants'); page.click('#tbody tr:last-child [data-detail]')
    page.click('#modal-actions button:has-text("وسم كتجريبية")')
    page.wait_for_timeout(300)
    page.click('#tab-manage'); page.click('#act-tests'); page.click('#modal-actions button:has-text("تأكيد")'); page.wait_for_timeout(400)
    check('delete test results', len(attempts(page)) == 6)
    # duplicates
    page.goto(BASE + 'index.html'); play(page, 'لاعب 3', ALL9, ['q2a'], ['q3b']); page.click('#btn-home')
    page.goto(BASE + 'admin.html'); page.wait_for_selector('#dash:not([hidden])')
    page.click('#tab-manage'); page.click('#act-dupes'); page.click('#modal-actions button:has-text("تأكيد")'); page.wait_for_timeout(400)
    names = [a['name'] for a in attempts(page)]
    check('delete duplicates keeps first entry per name', names.count('لاعب 3') == 1 and len(names) == 6)
    # close quiz
    page.click('#tab-settings'); page.click('#toggle-open'); page.wait_for_timeout(300)
    page.goto(BASE + 'index.html')
    check('closed quiz hides start button', page.is_visible('#closed-note') and not page.is_visible('#btn-start'))
    page.goto(BASE + 'admin.html'); page.wait_for_selector('#dash:not([hidden])')
    page.click('#tab-settings'); page.click('#toggle-open'); page.wait_for_timeout(300)
    # reset with confirmation word
    page.click('#tab-manage'); page.click('#act-reset')
    page.click('#modal-actions button.btn-danger')
    check('reset needs the confirmation word', page.is_visible('#modal'))
    page.fill('#reset-word', 'حذف'); page.click('#modal-actions button.btn-danger'); page.wait_for_timeout(400)
    check('reset clears all results', len(attempts(page)) == 0)
    # import backup
    page.set_input_files('#act-import', backup_path); page.wait_for_timeout(600)
    check('import backup restores entries', len(attempts(page)) == 7)
    page.set_input_files('#act-import', backup_path); page.wait_for_timeout(600)
    check('importing the same backup twice does not duplicate', len(attempts(page)) == 7)
    # QR
    page.click('#tab-qr')
    page.wait_for_timeout(500)
    check('QR: localhost link flagged as not reachable from other devices', page.is_visible('#qr-local-warn') and not page.is_visible('#qr-view'))
    page.fill('#qr-url', 'http://192.168.1.20:8765/index.html'); page.click('#qr-form button[type=submit]')
    check('QR generated for a network link', page.is_visible('#qr-box svg'))
    mat = page.evaluate("QR.encode('http://192.168.1.20:8765/index.html')")
    json.dump([{'text': 'http://192.168.1.20:8765/index.html', 'version': mat['version'], 'mask': mat['mask'], 'modules': mat['modules']}], open(os.path.join(tempfile.gettempdir(), 'dfc_qr.json'), 'w'))
    # logout + wrong password
    page.click('#btn-logout'); page.fill('#in-pass', 'wrong-pass'); page.click('#auth-submit'); page.wait_for_timeout(800)
    check('wrong admin password rejected', page.is_visible('#auth-error') and page.is_hidden('#dash'))
    page.fill('#in-pass', 'Org-2026!'); page.click('#auth-submit'); page.wait_for_selector('#dash:not([hidden])')
    check('correct admin password accepted', True)
    # recovery path
    page.click('#btn-logout'); page.click('#auth-forgot')
    page.fill('#in-code', code.lower()); page.fill('#in-pass', 'NewPass-1'); page.fill('#in-pass2', 'NewPass-1'); page.click('#auth-submit')
    page.wait_for_selector('#recovery-show:not([hidden])')
    check('recovery code resets the password', True)
    ctx.close()

    # ---------- offline: load once, then SHUT THE SERVER DOWN (no server, no network) ----------
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8799', '--bind', '127.0.0.1', '--directory', root], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.5)
    OFF = 'http://127.0.0.1:8799/'
    ctx, page = new_page(browser, clock=False)
    page.goto(OFF + 'index.html'); page.wait_for_load_state('networkidle')
    page.evaluate('navigator.serviceWorker.ready'); page.wait_for_timeout(1500)
    page.reload(); page.wait_for_load_state('networkidle'); page.wait_for_timeout(500)
    srv.terminate(); srv.wait(); time.sleep(0.5)
    page.goto(OFF + 'index.html'); page.wait_for_selector('#screen-home:not([hidden])')
    page.evaluate('document.fonts.ready')
    check('works offline after first visit (index)', page.inner_text('#home-title') == 'تحدي القدم السكرية' and page.evaluate("document.fonts.check('20px \"Readex Pro\"')"))
    page.click('#btn-start'); page.fill('#name', 'دون إنترنت'); page.click('#btn-begin'); page.wait_for_selector('#screen-quiz:not([hidden])')
    page.wait_for_timeout(3900); page.click('[data-id="q1o1"]'); page.click('#btn-confirm'); page.wait_for_timeout(1300)
    page.click('[data-id="q2a"]'); page.click('#btn-confirm'); page.wait_for_timeout(1300)
    page.click('[data-id="q3b"]'); page.click('#btn-confirm'); page.wait_for_selector('#screen-results:not([hidden])', timeout=6000)
    check('full round offline is saved', any(a['name'] == 'دون إنترنت' and a['status'] == 'completed' for a in attempts(page)))
    page.goto(OFF + 'admin.html'); page.wait_for_selector('#auth:not([hidden])')
    check('admin page works offline', page.is_visible('#auth-form'))
    ctx.close()

    # ---------- persistence after closing the browser ----------
    udir = tempfile.mkdtemp(prefix='dfc_profile_')
    try:
        pctx = getattr(p, ENGINE).launch_persistent_context(udir, viewport={'width': 1180, 'height': 820})
        pg = pctx.pages[0] if pctx.pages else pctx.new_page(); watch(pg, 'persist')
        pg.goto(BASE + 'index.html'); pg.click('#btn-start'); pg.fill('#name', 'باقٍ بعد الإغلاق'); pg.click('#btn-begin')
        pg.wait_for_selector('#screen-quiz:not([hidden])'); pg.wait_for_timeout(3900)
        for q, o in (('q1', 'q1o1'), ('q2', 'q2a'), ('q3', 'q3b')):
            pg.click('[data-id="%s"]' % o); pg.click('#btn-confirm'); pg.wait_for_timeout(1300)
        pg.wait_for_selector('#screen-results:not([hidden])', timeout=6000)
        pctx.close()
        pctx = getattr(p, ENGINE).launch_persistent_context(udir, viewport={'width': 1180, 'height': 820})
        pg = pctx.pages[0] if pctx.pages else pctx.new_page()
        pg.goto(BASE + 'index.html'); pg.wait_for_timeout(600)
        pg.click('#btn-home') if pg.is_visible('#btn-home') else None
        pg.wait_for_timeout(400)
        check('results survive closing and reopening the browser', 'باقٍ بعد الإغلاق' in pg.inner_text('#board-home'))
        pctx.close()
    finally:
        shutil.rmtree(udir, ignore_errors=True)

    # ---------- iPad layouts: no horizontal scroll, questions fit without scrolling ----------
    sizes = [(1180, 820, 'iPad Air landscape'), (1024, 768, 'iPad 9.7 landscape'), (1366, 1024, 'iPad Pro 12.9 landscape'),
             (820, 1180, 'iPad Air portrait'), (768, 1024, 'iPad 9.7 portrait'), (390, 844, 'phone')]
    for w, h, label in sizes:
        for lang in ('ar', 'en'):
            ctx, page = new_page(browser, w, h)
            page.goto(BASE + 'index.html')
            if lang == 'en': page.click('[data-action="lang"]')
            noh = page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            start(page, 'Layout تجربة')
            fits = []
            for qi, ids in enumerate((ALL9, ['q2a'], ['q3b'])):
                for i in ids: page.click('[data-id="%s"]' % i)
                fits.append(page.evaluate('[document.documentElement.scrollHeight - innerHeight, document.documentElement.scrollWidth - innerWidth]'))
                if qi == 0 and lang == 'ar': page.screenshot(path=os.path.join(tempfile.gettempdir(), 'dfc_q1_%dx%d.png' % (w, h)))
                page.click('#btn-confirm'); page.clock.run_for(1300)
            page.clock.run_for(800); page.wait_for_selector('#screen-results:not([hidden])')
            if lang == 'ar': page.screenshot(path=os.path.join(tempfile.gettempdir(), 'dfc_res_%dx%d.png' % (w, h)))
            resw = page.evaluate('document.documentElement.scrollWidth - innerWidth')
            if label != 'phone':
                check('%s [%s]: questions fit without scrolling' % (label, lang), all(f[0] <= 0 for f in fits), fits)
            check('%s [%s]: no horizontal scroll' % (label, lang), noh and all(f[1] <= 0 for f in fits) and resw <= 0, (noh, fits, resw))
            ctx.close()

    # touch targets
    ctx, page = new_page(browser)
    page.goto(BASE + 'index.html'); start(page, 'لمس')
    small = page.evaluate("[...document.querySelectorAll('button:not([hidden])')].filter(b => b.offsetParent).map(b => b.getBoundingClientRect()).filter(r => r.height < 48 || r.width < 48).length")
    check('all visible buttons ≥ 48 px touch targets', small == 0, small)
    ctx.close()
    browser.close()

real_errors = [e for e in ERRORS if 'favicon' not in e]
check('no JavaScript errors in any page', not real_errors, real_errors[:5])
passed = sum(1 for r in RESULTS if r[1])
print('\n%d / %d checks passed (%s)' % (passed, len(RESULTS), ENGINE))
sys.exit(0 if passed == len(RESULTS) else 1)
