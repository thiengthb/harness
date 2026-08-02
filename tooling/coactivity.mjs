#!/usr/bin/env node
/**
 * BẬC 0 của Coordination Ladder: ĐO, đừng đoán.
 *
 *   node tooling/coactivity.mjs [--days 30] [--limit 300]
 *
 * Bước gần như không ai làm: đếm xem bạn CÓ vấn đề conflict không, trước khi
 * thêm bất cứ máy móc phối hợp nào.
 *
 * Bối cảnh để đọc số của bạn (nghiên cứu 33.596 PR agent / 2.807 repo):
 *   - 40,2% repo có cặp PR agent chồng thời gian; nới 1 tuần → 53,4%
 *   - ~19,8% cặp co-active của CÙNG một loại agent có conflict văn bản
 *   - ~41,7% nếu trộn nhiều vendor agent  ← đây là lý do chuẩn hoá MỘT agent/repo
 * Nghĩa là ~4/5 cặp song song KHÔNG conflict. Đừng serialize mọi thứ vì sợ 20%.
 */
import { run, report, repoPath, writeJson } from './lib/harness.mjs';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? Number(process.argv[i + 1]) : d; };
const DAYS = arg('--days', 30);
const LIMIT = arg('--limit', 300);

const gh = run('gh', ['pr', 'list', '--state', 'all', '--limit', String(LIMIT),
  '--json', 'number,createdAt,closedAt,mergedAt,author,files,title']);

if (gh.status !== 0) {
  console.error('Cần `gh` CLI đã đăng nhập.  gh auth login');
  console.error(gh.stderr);
  process.exit(1);
}

const since = Date.now() - DAYS * 86400_000;
const prs = JSON.parse(gh.stdout)
  .map(p => ({
    n: p.number,
    author: p.author?.login ?? '?',
    start: new Date(p.createdAt).getTime(),
    end: new Date(p.mergedAt || p.closedAt || Date.now()).getTime(),
    files: (p.files || []).map(f => f.path),
    title: p.title,
  }))
  .filter(p => p.end >= since);

if (prs.length < 2) { console.log(`Chỉ ${prs.length} PR trong ${DAYS} ngày — chưa đủ dữ liệu.`); process.exit(0); }

let coactive = 0, overlapping = 0;
const pairAuthors = new Map();
const fileTouch = new Map();
const overlapDetail = [];

for (const p of prs) for (const f of p.files) fileTouch.set(f, (fileTouch.get(f) || 0) + 1);

for (let i = 0; i < prs.length; i++) {
  for (let j = i + 1; j < prs.length; j++) {
    const a = prs[i], b = prs[j];
    if (a.start > b.end || b.start > a.end) continue;   // không chồng thời gian
    coactive++;
    const shared = a.files.filter(f => b.files.includes(f));
    if (shared.length) {
      overlapping++;
      overlapDetail.push({ a: a.n, b: b.n, shared: shared.slice(0, 5) });
      const key = [a.author, b.author].sort().join(' ↔ ');
      pairAuthors.set(key, (pairAuthors.get(key) || 0) + 1);
    }
  }
}

const hot = [...fileTouch.entries()].sort((x, y) => y[1] - x[1]).slice(0, 10);
const rate = coactive ? (overlapping / coactive * 100) : 0;

const ok = [
  `${prs.length} PR trong ${DAYS} ngày`,
  `${coactive} cặp CO-ACTIVE (chồng thời gian)`,
  `${overlapping} cặp CHẠM CÙNG FILE  →  ${rate.toFixed(1)}%  (đối chiếu: ~19,8% cùng-vendor, ~41,7% trộn-vendor)`,
];
const warn = [];

if (coactive === 0) {
  warn.push('Không có cặp co-active → BẬC 0: DỪNG. Máy móc phối hợp là overhead thuần.');
} else if (rate > 30) {
  warn.push('Tỉ lệ cao bất thường. Cả team có đang dùng CÙNG một agent không? Trộn vendor làm conflict tăng ~gấp đôi.');
}

console.log('\n=== TOP 10 FILE NÓNG (chép vào harness.config.json → paths.hot) ===');
for (const [f, n] of hot) console.log(`  ${String(n).padStart(3)}×  ${f}`);
console.log('\n  → Conflict thường tập trung ở 3–5 file (barrel index, router, schema, lockfile, i18n),');
console.log('    KHÔNG rải đều. Đây là danh sách để partition (bậc 1) và đặt chỗ (bậc 2).');

if (pairAuthors.size) {
  console.log('\n=== AI HAY CHỒNG VỚI AI ===');
  for (const [k, v] of [...pairAuthors].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`  ${String(v).padStart(3)}×  ${k}`);
  console.log('  → Hai người hay chồng nhau: cân nhắc partition theo quyền sở hữu file (bậc 1).');
}

writeJson(repoPath('.claude', 'state', 'coactivity.json'), {
  measuredAt: new Date().toISOString(), days: DAYS, prs: prs.length,
  coactivePairs: coactive, overlappingPairs: overlapping, overlapRate: Number(rate.toFixed(1)),
  hotFiles: hot.map(([f, n]) => ({ file: f, touches: n })),
  authorPairs: [...pairAuthors].map(([pair, n]) => ({ pair, n })),
});

report('CO-ACTIVITY', { ok, warn });
console.log('  Leo ladder: đo → partition → đặt chỗ → serialize. DỪNG ở bậc đầu tiên đủ dùng.\n');
