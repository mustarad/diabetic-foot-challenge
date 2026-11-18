"""
Independent QR decoder used only to verify js/qr.js (written separately from the encoder, from the
ISO/IEC 18004 tables). Reads matrices produced by tests/qr_dump.js and checks:
format info BCH, Reed-Solomon syndromes of every block, and that the decoded text matches.

Run:  node tests/qr_dump.js > qr.json   then   python -I tests/qr_verify.py qr.json
"""
import json, sys

# GF(256) with polynomial 0x11D
EXP = [0] * 512; LOG = [0] * 256
x = 1
for i in range(255):
    EXP[i] = x; LOG[x] = i
    x <<= 1
    if x & 0x100: x ^= 0x11D
for i in range(255, 512): EXP[i] = EXP[i - 255]

def gmul(a, b):
    return 0 if a == 0 or b == 0 else EXP[LOG[a] + LOG[b]]

ALIGN = {1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50]}
# level M block structure: list of (count, total_codewords, data_codewords)
BLOCKS_M = {1: [(1, 26, 16)], 2: [(1, 44, 28)], 3: [(1, 70, 44)], 4: [(2, 50, 32)], 5: [(2, 67, 43)],
            6: [(4, 43, 27)], 7: [(4, 49, 31)], 8: [(2, 60, 38), (2, 61, 39)], 9: [(3, 58, 36), (2, 59, 37)],
            10: [(4, 69, 43), (1, 70, 44)]}

def format_code(ecl_bits, mask):
    d = (ecl_bits << 3) | mask
    g = 0x537; v = d << 10
    for i in range(14, 9, -1):
        if v & (1 << i): v ^= g << (i - 10)
    return ((d << 10) | v) ^ 0x5412

def decode(m):
    n = len(m); ver = (n - 17) // 4
    assert 1 <= ver <= 10, 'version'
    # format info: second copy (bits 0..7 along row 8 from right, 8..14 down column 8 at bottom)
    bits = 0
    for i in range(8): bits |= (1 if m[8][n - 1 - i] else 0) << i
    for i in range(8, 15): bits |= (1 if m[n - 15 + i][8] else 0) << i
    # first copy as cross-check
    b1 = 0
    pos1 = [(0, 8), (1, 8), (2, 8), (3, 8), (4, 8), (5, 8), (7, 8), (8, 8), (8, 7), (8, 5), (8, 4), (8, 3), (8, 2), (8, 1), (8, 0)]  # (row, col)
    for i, (r, c) in enumerate(pos1): b1 |= (1 if m[r][c] else 0) << i
    assert bits == b1, 'format copies differ'
    match = [(e, k) for e in range(4) for k in range(8) if format_code(e, k) == bits]
    assert match, 'format BCH invalid'
    ecl, mask = match[0]
    assert ecl == 0, 'expected level M'
    assert m[n - 8][8], 'dark module missing'

    # function-pattern map
    f = [[False] * n for _ in range(n)]
    def mark(r0, c0, h, w):
        for r in range(r0, r0 + h):
            for c in range(c0, c0 + w):
                if 0 <= r < n and 0 <= c < n: f[r][c] = True
    mark(0, 0, 9, 9); mark(0, n - 8, 9, 8); mark(n - 8, 0, 8, 9)
    mark(6, 0, 1, n); mark(0, 6, n, 1)
    a = ALIGN[ver]
    for r in a:
        for c in a:
            if (r == 6 and c == 6) or (r == 6 and c == a[-1]) or (r == a[-1] and c == 6): continue
            mark(r - 2, c - 2, 5, 5)
    if ver >= 7:
        mark(0, n - 11, 6, 3); mark(n - 11, 0, 3, 6)
        v = ver << 12
        for i in range(17, 11, -1):
            if v & (1 << i): v ^= 0x1F25 << (i - 12)
        expect = (ver << 12) | v
        for i in range(18):
            bit = (expect >> i) & 1
            assert (1 if m[i // 3][n - 11 + i % 3] else 0) == bit, 'version info (top-right) wrong'
            assert (1 if m[n - 11 + i % 3][i // 3] else 0) == bit, 'version info (bottom-left) wrong'

    def masked(i, j):
        return [(i + j) % 2 == 0, i % 2 == 0, j % 3 == 0, (i + j) % 3 == 0, (i // 2 + j // 3) % 2 == 0,
                (i * j) % 2 + (i * j) % 3 == 0, ((i * j) % 2 + (i * j) % 3) % 2 == 0, ((i + j) % 2 + (i * j) % 3) % 2 == 0][mask]

    stream = []
    col = n - 1; up = True
    while col > 0:
        if col == 6: col -= 1
        rows = range(n - 1, -1, -1) if up else range(n)
        for r in rows:
            for c in (col, col - 1):
                if not f[r][c]:
                    stream.append((1 if m[r][c] else 0) ^ (1 if masked(r, c) else 0))
        up = not up; col -= 2
    cw = [int(''.join(map(str, stream[i:i + 8])), 2) for i in range(0, len(stream) - len(stream) % 8, 8)]

    # de-interleave
    spec = []
    for cnt, tot, dat in BLOCKS_M[ver]: spec += [(tot, dat)] * cnt
    total = sum(t for t, _ in spec)
    cw = cw[:total]
    blocks = [[] for _ in spec]
    maxd = max(d for _, d in spec)
    idx = 0
    for i in range(maxd):
        for b, (t, d) in enumerate(spec):
            if i < d: blocks[b].append(cw[idx]); idx += 1
    ecc = spec[0][0] - spec[0][1]
    for i in range(ecc):
        for b in range(len(spec)): blocks[b].append(cw[idx]); idx += 1
    assert idx == total
    # RS syndromes
    for b, blk in enumerate(blocks):
        for i in range(ecc):
            s = 0
            for v in blk: s = gmul(s, EXP[i]) ^ v
            assert s == 0, 'RS syndrome non-zero in block %d' % b
    data = []
    for b, (t, d) in enumerate(spec): data += blocks[b][:d]
    bits = ''.join(format(v, '08b') for v in data)
    assert bits[:4] == '0100', 'expected byte mode'
    cl = 8 if ver < 10 else 16
    count = int(bits[4:4 + cl], 2)
    p = 4 + cl
    out = bytes(int(bits[p + 8 * i:p + 8 * i + 8], 2) for i in range(count))
    return out.decode('utf-8'), ver, mask

cases = json.load(open(sys.argv[1], encoding='utf-8'))
ok = 0
for c in cases:
    text, ver, mask = decode(c['modules'])
    assert text == c['text'], 'text mismatch: %r vs %r' % (text, c['text'])
    assert ver == c['version'] and mask == c['mask']
    ok += 1
print('QR verified: %d codes decoded correctly (versions %s)' % (ok, sorted({c['version'] for c in cases})))
