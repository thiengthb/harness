#!/usr/bin/env node
/**
 * BƯỚC 3 CỦA `/claim`, PHẦN MÁY LÀM ĐƯỢC — dò chồng lấn TRƯỚC khi bắt tay.
 *
 *   node tooling/overlap-scan.mjs                        # dò theo file bạn ĐÃ chạm
 *   node tooling/overlap-scan.mjs src/a.ts src/b/**       # dò theo file bạn ĐỊNH chạm
 *   node tooling/overlap-scan.mjs --json
 *
 * ── VÌ SAO TÁCH RA KHỎI SKILL
 *
 * `/claim` là skill NGƯỜI GỌI (`disable-model-invocation: true`) vì bước 3 của nó kết bằng
 * *"KHÔNG tự quyết. Hỏi người."* — đó là phán đoán phối hợp, không phải phép tính. Nhưng
 * phần ĐI TÌM chồng lấn thì thuần cơ học: đọc PR đang mở, đối chiếu `paths.hot`, đọc
 * `reservations/`. AGENTS.md đã nói đúng hướng này: *"Phần máy làm được thì máy đã làm;
 * `/claim` giữ lại đúng phần cần phán đoán."*
 *
 * Tách ra để **agent chạy được phần dò** và đưa người kết quả, thay vì người phải nhớ gõ
 * `/claim` mới biết mình đang giẫm chân ai. Đo 2026-08-06: `/claim` chưa chạy lần nào kể từ
 * khi harness ra đời, nên bước 3 trên thực tế **chưa từng được thực hiện**.
 *
 * ── KHÁC GÌ `check-reservations.mjs`
 *
 * Cái kia là GUARD ở pre-commit: bạn đã viết code rồi, nó chặn lúc commit. Cái này chạy
 * TRƯỚC khi viết, và nhìn rộng hơn (PR đang mở + vùng nóng, không chỉ reservation). Hai thứ
 * ở hai đầu của cùng một việc; cái này không chặn gì bao giờ — nó chỉ báo cáo.
 *
 * ── BA GIÁ TRỊ, KHÔNG PHẢI HAI
 *
 * `gh` chưa cài / chưa đăng nhập / repo không có remote GitHub ⇒ nhánh PR là **`?` KHÔNG ĐO
 * ĐƯỢC**, không phải "không có chồng lấn". Gộp hai cái đó là cách một công cụ phối hợp báo
 * "đường quang" trong khi nó chưa hề nhìn — và đó là lúc nó nguy hiểm hơn là không có.
 */
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { repoPath, git, run, readJson, matchGlob, matchAny, pathsFor, config, report, toRepoRel } from './lib/harness.mjs';

const JSON_OUT = process.argv.includes('--json');
const wanted = process.argv.slice(2).filter(a => !a.startsWith('--'));

// ── Phạm vi: file bạn ĐỊNH chạm, hoặc file bạn ĐÃ chạm ───────────────────────
const integration = config().project?.integrationBranch || 'origin/main';
let scope = wanted, scopeWhy = `${wanted.length} đường dẫn bạn nêu`;
if (!scope.length) {
  const d = git(['diff', '--name-only', `${integration}...HEAD`]);
  const w = git(['status', '--porcelain']);
  const changed = new Set([
    ...(d.status === 0 ? d.stdout.split('\n') : []),
    ...(w.status === 0 ? w.stdout.split('\n').map(l => l.slice(3)) : []),
  ].map(s => s.trim()).filter(Boolean).map(toRepoRel));
  scope = [...changed];
  scopeWhy = `${scope.length} file bạn đã chạm so với ${integration}`;
}

const ok = [], warn = [], fail = [], unknown = [];
const found = { scope, hot: [], reservations: [], prs: [], unmeasured: [] };

if (!scope.length) {
  ok.push('chưa chạm file nào và cũng không nêu đường dẫn — không có gì để đối chiếu');
}

// ── ① Vùng nóng ──────────────────────────────────────────────────────────────
// Không phải chồng lấn với MỘT người cụ thể — là xác suất chồng lấn với BẤT KỲ ai.
const hotGlobs = pathsFor('hot');
if (!hotGlobs.length) {
  unknown.push('`paths.hot` rỗng trong harness.config.json — chưa đo được vùng nóng. '
    + 'Đo bằng `node tooling/coactivity.mjs` rồi điền vào đó (bậc 0 của Coordination Ladder)');
} else {
  const hot = scope.filter(f => matchAny(f, hotGlobs));
  found.hot = hot;
  if (hot.length) warn.push(`${hot.length} file thuộc VÙNG NÓNG: ${hot.slice(0, 6).join(' · ')}${hot.length > 6 ? ` … +${hot.length - 6}` : ''}`
    + ' — đây là chỗ nên đặt chỗ (`reservations/`) trước khi sửa');
  else if (scope.length) ok.push(`không file nào chạm vùng nóng (${hotGlobs.length} pattern)`);
}

// ── ② Reservation còn hiệu lực của NGƯỜI KHÁC ────────────────────────────────
// Cùng phép đọc với `check-reservations.mjs`: hết hạn ⇒ bỏ qua, không cần ai dọn.
const me = process.env.DEV_ID || process.env.USER || process.env.USERNAME || '';
const resDir = repoPath('reservations');
if (!me) {
  unknown.push('chưa set DEV_ID ⇒ không phân biệt được reservation nào là CỦA BẠN. '
    + 'Set trong .claude/settings.local.json → env.DEV_ID');
}
if (existsSync(resDir)) {
  const now = Date.now();
  for (const f of readdirSync(resDir).filter(x => x.endsWith('.json'))) {
    const r = readJson(join(resDir, f));
    if (!r || !Array.isArray(r.files)) continue;
    if (r.owner === me) continue;
    if (new Date(r.expires).getTime() < now) continue;      // hết hạn = tự nhả
    const hits = scope.filter(s => r.files.some(p => matchGlob(s, p)));
    if (hits.length) {
      found.reservations.push({ owner: r.owner, reason: r.reason, expires: r.expires, files: hits });
      fail.push(`${hits.length} file đang được ${r.owner} đặt chỗ (${r.reason || 'không nêu lý do'}, hết hạn ${r.expires}): ${hits.slice(0, 4).join(' · ')}`);
    }
  }
  if (!found.reservations.length && scope.length) ok.push('không đụng reservation còn hiệu lực của ai');
}

// ── ③ PR đang mở chạm cùng file ──────────────────────────────────────────────
// `gh` là phụ thuộc NGOÀI. Thiếu nó thì đây là `?`, không phải "đường quang".
const ghv = run('gh', ['--version']);
if (ghv.status !== 0) {
  unknown.push('không chạy được `gh` ⇒ KHÔNG đối chiếu được PR đang mở. Đây là nhánh chồng lấn '
    + 'HAY GẶP NHẤT và nó đang không được nhìn — cài GitHub CLI, hoặc tự chạy `gh pr list --state open`');
} else {
  const pr = run('gh', ['pr', 'list', '--state', 'open', '--json', 'number,title,author,files,headRefName']);
  if (pr.status !== 0) {
    unknown.push(`\`gh pr list\` thất bại (chưa \`gh auth login\`? repo không có remote GitHub?) ⇒ PR đang mở KHÔNG được đối chiếu: ${String(pr.stderr || '').trim().slice(0, 120)}`);
  } else {
    let list = [];
    try { list = JSON.parse(pr.stdout || '[]'); } catch { list = []; }
    const mineBranch = git(['branch', '--show-current']).stdout.trim();
    for (const p of list) {
      if (p.headRefName === mineBranch) continue;           // PR của chính nhánh này
      const theirs = (p.files || []).map(x => x.path);
      const hits = scope.filter(s => theirs.includes(s));
      if (hits.length) {
        found.prs.push({ number: p.number, title: p.title, author: p.author?.login, files: hits });
        fail.push(`${hits.length} file chồng với PR #${p.number} của ${p.author?.login ?? '?'} ("${String(p.title).slice(0, 50)}"): ${hits.slice(0, 4).join(' · ')}`);
      }
    }
    if (!found.prs.length) ok.push(`${list.length} PR đang mở, không cái nào chạm file của bạn`);
  }
}

found.unmeasured = unknown;

if (JSON_OUT) {
  console.log(JSON.stringify(found, null, 2));
  process.exit(0);
}

console.log(`\nPhạm vi đối chiếu: ${scopeWhy}`);
report('OVERLAP SCAN', { ok, warn, fail, unknown });

if (fail.length) {
  console.log('\n  CÓ CHỒNG LẤN. Ba lựa chọn — KHÔNG tự quyết, hỏi người:');
  console.log('     a) chọn issue khác        chồng nhiều, PR kia sắp merge');
  console.log('     b) đợi PR kia merge       chồng ở vùng nhỏ, PR kia < 1 ngày tuổi');
  console.log('     c) đặt chỗ + chỉ chạm phần không chồng');
}
console.log('\n  Script này KHÔNG chặn gì và KHÔNG quyết gì — nó chỉ đi tìm.');
console.log('  Phần quyết định thuộc `/claim` (skill NGƯỜI gọi), và đó là cố ý.\n');
process.exit(0);
