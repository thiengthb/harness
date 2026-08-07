#!/usr/bin/env node
/**
 * Phần MÁY KIỂM ĐƯỢC của /entropy-sweep.
 *
 *   node tooling/entropy-scan.mjs
 *
 * Harness không tự tốt lên theo thời gian — nó TỰ XẤU ĐI, vì codebase đổi và model
 * đổi mà tài liệu thì không. Không ai gửi thông báo khi một mảnh harness hết hạn.
 *
 * Script này tìm những dấu hiệu hết hạn mà máy phát hiện được. Phần cần phán đoán
 * ("mục này còn đúng không?") vẫn thuộc về skill /entropy-sweep và con người.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, basename, relative, sep } from 'node:path';
import { parseFrontmatter } from './lib/frontmatter.mjs';
import { repoPath, config, limit, report, git, matchAny, pathsFor, readJson, stateDir, repoRole } from './lib/harness.mjs';

const ROLE = repoRole();
const ok = [], warn = [], fail = [];
const cfg = config();
const STALE_DAYS = limit('docStaleDays', 90);
const now = Date.now();
const daysAgo = d => (now - new Date(d).getTime()) / 86400_000;

function walk(dir, filter = () => true) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, filter));
    else if (filter(p)) out.push(p);
  }
  return out;
}
// PARITY CONTRACT. `walk()` dựng đường dẫn bằng `join()` ⇒ dấu phân cách của HỆ ĐIỀU HÀNH.
// Bản cũ cắt chuỗi bằng `'/'`, nên trên Windows nó không cắt được gì và mọi đường dẫn in ra
// thành `\.claude\rules\...` — thừa một dấu gạch, sai kiểu, và (tệ hơn) trùng đúng chỗ mà
// `basename` phía dưới cũng hỏng. `relative()` + chuẩn hoá về POSIX là cách duy nhất cho ra
// CÙNG một chuỗi trên cả ba OS, và đó là điều kiện để so sánh/allowlist hoạt động.
const rel = p => relative(repoPath(''), p).split(sep).join('/');

// ── 1. Rule: thiếu paths / owner / expires-review ────────────────────────────
const GLOBAL_OK = ['danger-zones.md', 'README.md', '_TEMPLATE.md'];
for (const f of walk(repoPath('.claude', 'rules'), p => extname(p) === '.md')) {
  // `basename()`, KHÔNG `split('/')`. Trên Windows `walk()` trả `...\rules\README.md`, nên
  // `split('/')` trả về NGUYÊN đường dẫn — và `GLOBAL_OK.includes(<cả đường dẫn>)` luôn false.
  // Hậu quả đo được 2026-08-06: allowlist ngay phía trên KHÔNG BAO GIỜ khớp trên Windows, và
  // người dùng Windows thấy 5 cảnh báo vĩnh viễn về hai file đã được miễn từ đầu — trong khi
  // Linux/macOS im lặng. Một công cụ nói hai chuyện khác nhau tuỳ máy thì không ai tin nó nữa,
  // và cảnh báo thật nằm cạnh sẽ chết chung.
  const name = basename(f);
  const { data } = parseFrontmatter(readFileSync(f, 'utf8'));
  if (GLOBAL_OK.includes(name)) continue;

  if (!data.paths) warn.push(`${rel(f)}: thiếu \`paths\` — thuế context cho MỌI người ở MỌI request`);
  if (!data.owner) warn.push(`${rel(f)}: thiếu \`owner\` — không ai chịu trách nhiệm`);
  if (!data['expires-review']) warn.push(`${rel(f)}: thiếu \`expires-review\` — sẽ không bao giờ bị xét lại`);
  else if (daysAgo(data['expires-review']) > 0) warn.push(`${rel(f)}: QUÁ HẠN review (${data['expires-review']})`);
  if (!data.why) warn.push(`${rel(f)}: thiếu \`why\` — rule là Ý KIẾN cho tới khi có số PR đứng sau`);
}

// ── 2. Bài học: quá hạn, hoặc ĐÃ ĐẠT điều kiện thoát ─────────────────────────
for (const f of walk(repoPath('knowledge', 'lessons'), p => extname(p) === '.md' && !p.includes('_TEMPLATE'))) {
  const { data } = parseFrontmatter(readFileSync(f, 'utf8'));
  if (data.status !== 'active') continue;
  const r = data['expires-review'];
  if (r && daysAgo(r) > 0) {
    warn.push(`${rel(f)}: quá hạn review (${r}) — ĐIỀU KIỆN THOÁT đã xảy ra chưa? → "${String(data['exit-condition']).slice(0, 80)}"`);
  }
  if (['rule', 'skill'].includes(String(data.representation)) && daysAgo(data.added) > 120) {
    warn.push(`${rel(f)}: dạng "${data.representation}" đã ${Math.round(daysAgo(data.added))} ngày — hạ xuống test/hook được chưa?`);
  }
  for (const a of (Array.isArray(data.artifacts) ? data.artifacts : [])) {
    const clean = String(a).split(' ')[0];
    if (clean.includes('/') && !existsSync(repoPath(clean))) {
      fail.push(`${rel(f)}: artifact "${clean}" KHÔNG TỒN TẠI — bài học trỏ vào hư không`);
    }
  }
}

// ── 3. Tài liệu quá hạn last-verified ────────────────────────────────────────
for (const f of walk(repoPath('docs'), p => extname(p) === '.md')) {
  const { data } = parseFrontmatter(readFileSync(f, 'utf8'));
  if (!data['last-verified']) continue;
  const d = daysAgo(data['last-verified']);
  if (d > STALE_DAYS) warn.push(`${rel(f)}: last-verified ${Math.round(d)} ngày trước (>${STALE_DAYS}) — VERIFY trước khi tin`);
}

// ── 4. Skill trỏ tới lệnh/file không tồn tại ─────────────────────────────────
const declaredCmds = new Set(Object.keys(cfg.commands || {}).filter(k => cfg.commands[k]));
for (const f of walk(repoPath('.claude', 'skills'), p => p.endsWith('SKILL.md'))) {
  const body = readFileSync(f, 'utf8');
  for (const m of body.matchAll(/node\s+((?:tooling|evals)\/[\w./-]+\.mjs)/g)) {
    if (!existsSync(repoPath(m[1]))) fail.push(`${rel(f)}: trỏ tới ${m[1]} — KHÔNG TỒN TẠI`);
  }
  for (const m of body.matchAll(/`commands\.(\w+)`/g)) {
    if (!declaredCmds.has(m[1]) && cfg.commands && !(m[1] in cfg.commands)) {
      warn.push(`${rel(f)}: nhắc tới commands.${m[1]} — không có trong harness.config.json`);
    }
  }
}

// ── 5. Skill / rule không được nhắc tới ở đâu (ứng viên gỡ bỏ) ───────────────
const allText = [...walk(repoPath('docs'), p => extname(p) === '.md'),
                 ...walk(repoPath('.claude'), p => extname(p) === '.md'),
                 repoPath('AGENTS.md'), repoPath('README.md')]
  .filter(existsSync).map(f => readFileSync(f, 'utf8')).join('\n');

const skillDirs = existsSync(repoPath('.claude', 'skills'))
  ? readdirSync(repoPath('.claude', 'skills'), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name) : [];
for (const s of skillDirs) {
  const mentions = (allText.match(new RegExp(`/${s}\\b`, 'g')) || []).length;
  if (mentions <= 1) warn.push(`skill \`${s}\`: gần như không được nhắc tới ở đâu — ứng viên GỠ BỎ`);
}

// ── 6. Ngưỡng kích thước ─────────────────────────────────────────────────────
if (skillDirs.length > 12) {
  warn.push(`${skillDirs.length} skill (ngưỡng 12) — bằng chứng cộng đồng: ≤12 cho kết quả tốt hơn skill tràn lan. Bỏ bớt trước khi thêm.`);
}
const agentsLines = existsSync(repoPath('AGENTS.md')) ? readFileSync(repoPath('AGENTS.md'), 'utf8').split('\n').length : 0;
if (agentsLines > 150) warn.push(`AGENTS.md ${agentsLines} dòng (>150) — có thứ thuộc về rules/ (theo path), skill, hoặc hook`);

// ── 7. Hook đã đăng ký nhưng không có test ───────────────────────────────────
const settings = existsSync(repoPath('.claude', 'settings.json'))
  ? readFileSync(repoPath('.claude', 'settings.json'), 'utf8') : '';
const testsSrc = existsSync(repoPath('tooling', 'test-hooks.mjs'))
  ? readFileSync(repoPath('tooling', 'test-hooks.mjs'), 'utf8') : '';
const registered = new Set();
for (const m of settings.matchAll(/hooks\/([\w-]+\.mjs)/g)) {
  registered.add(m[1]);
  if (!testsSrc.includes(m[1])) {
    fail.push(`hook ${m[1]} đã đăng ký nhưng KHÔNG CÓ TEST — code có quyền chặn công việc cả team mà không ai kiểm`);
  }
  if (!existsSync(repoPath('.claude', 'hooks', m[1]))) {
    fail.push(`settings.json gọi hook ${m[1]} nhưng FILE KHÔNG TỒN TẠI — hook fail mỗi tool call`);
  }
}

// ── 7b. Chiều ngược lại: file hook có mà KHÔNG đăng ký ───────────────────────
// Lớp bug im lặng nhất trong hệ nâng cấp: upgrade.mjs copy hook mới sang project,
// nhưng settings.json thuộc lớp NỘI DUNG nên không bị ghi đè. Hook nằm đó chết,
// không ai biết, và guard mà bạn tưởng đang chạy thì không chạy.
// (Gặp thật khi thêm protect-migrations.mjs ở v1.3.0 — xem harness-migrations/001.)
if (existsSync(repoPath('.claude', 'hooks'))) {
  for (const f of readdirSync(repoPath('.claude', 'hooks'))) {
    if (!f.endsWith('.mjs') || f.startsWith('_') || registered.has(f)) continue;
    fail.push(`hook ${f} TỒN TẠI nhưng không được đăng ký trong settings.json — guard bạn tưởng đang chạy thì không chạy`);
  }
}

// ── 7c. Pack nạp vào rồi bỏ quên ─────────────────────────────────────────────
// `import.mjs` cố tình dừng ở knowledge/incoming/ và chờ người duyệt. Nhưng "chờ
// người" không có hạn thì thành "không bao giờ" — và incoming/ tích thành bãi rác
// mà ai cũng tưởng là backlog. Một pack chờ >30 ngày là một quyết định chưa ra.
const INC = repoPath('knowledge', 'incoming');
if (existsSync(INC)) {
  for (const pack of readdirSync(INC)) {
    const dir = join(INC, pack, 'lessons');
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir).filter(f => f.endsWith('.md'));
    if (!files.length) continue;
    const oldest = Math.min(...files.map(f => statSync(join(dir, f)).mtimeMs));
    const days = Math.round((Date.now() - oldest) / 86400000);
    if (days > 30) {
      warn.push(`knowledge/incoming/${pack}: ${files.length} bài học chờ duyệt ${days} ngày — quyết đi: node tooling/knowledge/accept.mjs --list`);
    }
  }
}

// ── 7d. Bài học mang đi được mà CHƯA BAO GIỜ gửi lên template ────────────────
// Đối xứng với 7c, và là chiều bị bỏ quên hơn hẳn: pack chờ duyệt thì NHÌN THẤY được
// (nó nằm trong repo), còn "chưa gửi lên" thì KHÔNG có triệu chứng nào ở đây cả. Hậu quả
// rơi vào project TIẾP THEO của bạn — nó khởi động từ đúng số bài học seed của template,
// dù repo này đã học được 12 thứ. Trí tuệ tích ở LÁ, không bao giờ về GỐC.
// CHỈ ở repo TIÊU THỤ. Repo template LÀ upstream — nhắc nó "gửi lên" là vô nghĩa, và một
// cảnh báo vô nghĩa nổ mọi lần dạy người ta bỏ qua cả bảng. Tín hiệu: manifest chỉ tồn tại
// ở đích (apply-to/upgrade ghi ra), cùng tín hiệu mà --audit và harness-doctor đã dùng.
const manifestForUpstream = readJson(repoPath('.claude', 'harness-manifest.json'));
const IS_CONSUMER = ROLE === 'consumer';
const upLast = readJson(join(stateDir(), 'upstream-last.json'));
// CHỈ đếm bài học project NÀY tự viết. Bài học SEED đi kèm template thì template đã có sẵn
// — `upstream.mjs` lọc chúng ra và báo "0 để đóng góp", nhưng cảnh báo này không có template
// trong tay để so. Không lọc thì nó nổ ở MỌI project vừa áp xong, tức là nó bắt đầu đời mình
// bằng một dương tính giả — và cảnh báo đầu tiên bạn thấy mà sai là cảnh báo dạy bạn bỏ qua
// những cảnh báo sau. Tín hiệu: `added:` sau ngày áp template.
// TÍN HIỆU CHÍNH: danh sách bài học SEED do apply-to ghi vào manifest — chính xác, không
// đoán. Ngày tháng là tín hiệu SAI ở đây: bài seed `0003` có `added` đúng bằng ngày áp
// template, nên mọi phép so ngày đều phải chọn giữa bỏ sót bài tự viết cùng ngày và tố giác
// một bài seed. Với project áp trước 2.7.1 (chưa có `seededLessons`) thì lùi về so ngày và
// chọn hướng IM LẶNG: bỏ sót một lần nhắc chỉ làm chậm một đóng góp, còn nhắc sai làm hỏng
// lòng tin vào cả bảng báo cáo.
const seeded = new Set(manifestForUpstream?.seededLessons ?? []);
const appliedAt = Date.parse(String(manifestForUpstream?.appliedAt ?? manifestForUpstream?.upgradedAt ?? '').slice(0, 10)) || 0;
const portable = !IS_CONSUMER ? [] : existsSync(repoPath('knowledge', 'lessons'))
  ? readdirSync(repoPath('knowledge', 'lessons'))
      .filter(f => f.endsWith('.md') && !f.startsWith('_'))
      .filter(f => {
        if (seeded.has(f)) return false;
        const txt = readFileSync(repoPath('knowledge', 'lessons', f), 'utf8');
        if (!/^scope:\s*(universal|stack:)/m.test(txt)) return false;
        if (seeded.size) return true;                        // danh sách seed CHÍNH XÁC đã có
        const added = Date.parse((txt.match(/^added:\s*(\S+)/m) || [])[1] ?? '') || 0;
        return added > appliedAt;                            // lùi về: chọn hướng im lặng
      })
  : [];
if (portable.length) {
  const days = upLast?.at ? Math.round((Date.now() - Date.parse(upLast.at)) / 86400000) : null;
  if (days === null) {
    warn.push(`${portable.length} bài học mang đi được nhưng CHƯA BAO GIỜ gửi lên template — `
      + `project sau của bạn sẽ khởi động lại từ số 0. Chạy: node tooling/knowledge/upstream.mjs`);
  } else if (days > 30) {
    warn.push(`${days} ngày chưa gửi bài học lên template (${portable.length} bài mang đi được) — `
      + `node tooling/knowledge/upstream.mjs`);
  }
}

// ── 8. CHANGEME còn sót ──────────────────────────────────────────────────────
// Trong REPO TEMPLATE, CHANGEME là đúng — đó là placeholder cho project sẽ dùng nó.
// Trong PROJECT THẬT, CHANGEME nghĩa là harness chưa được cấu hình → gate không tồn tại.
const IS_TEMPLATE = ROLE === 'template';

const changeme = [];
for (const f of ['harness.config.json', 'AGENTS.md', '.github/CODEOWNERS']) {
  if (existsSync(repoPath(f)) && readFileSync(repoPath(f), 'utf8').includes('CHANGEME')) changeme.push(f);
}
if (changeme.length) {
  if (IS_TEMPLATE) ok.push(`còn CHANGEME ở ${changeme.length} file — ĐÚNG, đây là repo template (placeholder cho project sẽ dùng)`);
  else fail.push(`còn CHANGEME: ${changeme.join(', ')} — harness CHƯA được cấu hình cho project này, gate không tồn tại`);
}

// ── 9. File harness bị sửa gần đây mà không cập nhật whats-new ───────────────
const since = new Date(now - 14 * 86400_000).toISOString().slice(0, 10);
const touched = git(['log', `--since=${since}`, '--name-only', '--pretty=format:']).stdout
  .split('\n').filter(Boolean).filter(f => matchAny(f, pathsFor('harness')));
if (touched.length) {
  const wnTouched = git(['log', `--since=${since}`, '--name-only', '--pretty=format:']).stdout.includes('.claude/whats-new.md');
  if (!wnTouched) warn.push(`${new Set(touched).size} file harness đổi trong 14 ngày nhưng .claude/whats-new.md KHÔNG đổi — nửa team đang hành xử theo rule cũ`);
}

// ── 9b. Đường dẫn trỏ vào hư không ───────────────────────────────────────────
//
// NHẬN TỪ `sakubun` (pack upstream @0655730, 2026-08-07). Phép kiểm này ra đời ở repo con,
// không ở đây — và nó là ca đầu tiên chiều ĐI LÊN thật sự chuyển được một cơ chế, sau khi
// v2.27.0 làm bên nhận đọc được pack không-có-bài-học nào.
//
// Loại hết hạn ĐẮT NHẤT với agent, và không có triệu chứng nào: với agent, mọi text trong
// repo có thẩm quyền như nhau, nên một đường dẫn chết không báo lỗi — nó gửi người đọc tới
// chỗ trống, và người đọc TỰ NGHĨ RA nội dung đáng lẽ ở đó.
//
// Đo ở `sakubun` 2026-08-06: 16 chỗ trong SOURCE trỏ vào `docs/plans/*` (5 file kế hoạch
// được viện dẫn như thẩm quyền thiết kế) — `git log --all` cho thư mục đó TRỐNG: nó chưa
// bao giờ được commit. §4 ở trên chỉ kiểm skill trỏ vào `tooling/*.mjs` nên cả nhóm lọt lưới.
//
// HAI LOẠI TRỪ CỐ Ý — không có chúng thì tín hiệu chìm trong dương tính giả (bản đầu ở
// `sakubun` báo 120 hit, phần lớn là văn xuôi như `origin/main` và `"n/a"`):
//   · HỒ SƠ LỊCH SỬ (changelog · learnings · progress · whats-new) — chúng append-only và
//     PHẢI nhắc file đã đổi tên hoặc đã xoá. Bắt lỗi chúng là bắt chúng làm sai việc của
//     chúng. Cùng danh sách, cùng lý do với `HISTORICAL` ở `harness-doctor.mjs`.
//   · chuỗi có glob/placeholder, và đường dẫn có segment đầu không phải thư mục thật ở gốc
//     repo — đó là văn xuôi, không phải đường dẫn.
//
// KHÁC BẢN CỦA `sakubun` MỘT CHỖ: nó quét source bằng danh sách thư mục cứng
// `['app','components','lib','e2e','tooling']` — hình dạng của một app Next.js. Ở template
// thì `git ls-files` là nguồn đúng: repo-agnostic, tự bỏ file gitignore/generated, và không
// có danh sách nào để mục.
{
  const TOP_LEVEL = new Set(readdirSync(repoPath('')));
  const PROSE = p => /[*{}<>$]|\.\.|^https?:|^~|^@/.test(p);
  // Thư mục SINH RA LÚC CHẠY và gitignored: vắng mặt trên một cây sạch là ĐÚNG, không phải hỏng.
  const IGNORED_REF = p => p.startsWith('.git/') || p.startsWith('knowledge/incoming')
    || p.startsWith('.claude/telemetry') || p.startsWith('.claude/state') || p.startsWith('.claude/worktrees')
    // Dấu của repo TIÊU THỤ: nó KHÔNG BAO GIỜ tồn tại ở template (`repoRole()` dựa vào chính
    // sự vắng mặt đó). Tài liệu ở đây phải giải thích được nó, nếu không repo con không biết
    // mình đang cầm cái gì. Vắng mặt ở đây là ĐÚNG, không phải đường dẫn chết.
    || p === '.claude/harness-manifest.json';

  const dangling = new Map();
  const noteRef = (p, where) => {
    if (!p || PROSE(p) || IGNORED_REF(p)) return;
    const clean = p.split('#')[0].split(':')[0].replace(/\/$/, '');
    if (!clean.includes('/') || !TOP_LEVEL.has(clean.split('/')[0])) return;
    if (existsSync(repoPath(clean))) return;
    if (!dangling.has(clean)) dangling.set(clean, new Set());
    dangling.get(clean).add(where);
  };

  const HISTORY = (r) => r.includes('HARNESS-CHANGELOG') || r.startsWith('.claude/learnings/')
    || r.startsWith('docs/progress/') || r === '.claude/whats-new.md'
    // `evals/tasks/**` MÔ TẢ thứ agent phải TẠO RA khi chạy task — cùng lý do bỏ qua fixture.
    // Một task nói "assert `features/eval-probe.json` tồn tại" đang làm đúng việc của nó;
    // file đó không tồn tại LÚC NÀY chính là điều kiện ban đầu của phép đo.
    || r.startsWith('evals/tasks/');

  const tracked = git(['ls-files']).stdout.split('\n').filter(Boolean);
  for (const r of tracked.filter(r => r.endsWith('.md') && !HISTORY(r))) {
    let txt = ''; try { txt = readFileSync(repoPath(r), 'utf8'); } catch { continue; }
    for (const m of txt.matchAll(/`([^`\s]+)`/g)) noteRef(m[1], r);
  }
  // Comment trong SOURCE trỏ vào `docs/` — chỗ duy nhất tìm ra nhóm plan doc không tồn tại.
  // Bỏ qua test và fixture: chúng CỐ Ý dựng đường dẫn không tồn tại để kiểm hook, và một
  // fixture trỏ vào chỗ trống là fixture đang làm đúng việc. (Không viết ví dụ ra đây —
  // chính comment này sẽ thành con trỏ chết. Bản của `sakubun` đã bị bắt đúng như vậy.)
  for (const r of tracked.filter(r => /\.(ts|tsx|mjs|js)$/.test(r)
      && !r.startsWith('tooling/test-') && !r.includes('/fixtures/') && !r.includes('generated'))) {
    let txt = ''; try { txt = readFileSync(repoPath(r), 'utf8'); } catch { continue; }
    for (const m of txt.matchAll(/docs\/[A-Za-z0-9_./-]+\.md/g)) noteRef(m[0], r);
  }

  if (dangling.size) {
    const rows = [...dangling.entries()].sort((a, b) => b[1].size - a[1].size);
    const shown = rows.slice(0, 6).map(([p, w]) => `${p} (${[...w].slice(0, 2).join(', ')}${w.size > 2 ? `, +${w.size - 2}` : ''})`);
    fail.push(`${dangling.size} đường dẫn được tài liệu/comment trỏ tới nhưng KHÔNG TỒN TẠI: ${shown.join(' · ')}`
      + (rows.length > 6 ? ` … +${rows.length - 6} nữa` : '')
      + ' — sửa đường dẫn, tạo file, hoặc xoá lời nhắc. Đừng để nguyên.');
  }
}

// ── 10. PHÒNG CHỜ NGHỈ HƯU — có bằng chứng, và KHÔNG có lệnh xoá ─────────────
//
//   node tooling/entropy-scan.mjs --stage <file> --why "lý do ≥20 ký tự"
//   node tooling/entropy-scan.mjs --verify        đo lại; DẤU HIỆU SỐNG = miễn tội
//   node tooling/entropy-scan.mjs --ready         in lệnh cho MỘT CON NGƯỜI
//
// SUY ĐOÁN VÔ TỘI. Gánh nặng chứng minh nằm ở bên XOÁ, không bao giờ ở bên GIỮ.
// Một file không bị bỏ vì không ai chứng minh được nó đang dùng; nó chỉ bị bỏ khi
// ai đó chứng minh được CÁI GÌ ĐÃ THAY THẾ NÓ.
//
// CỐ Ý KHÔNG CÓ LỆNH `--delete`. Một bước không thu hồi được không phải việc của
// agent. `--ready` in ra lệnh, người gõ.
//
// SỰ CHỜ ĐỢI CHÍNH LÀ THÍ NGHIỆM — đó là cách duy nhất quan sát được nhu cầu mà
// mình chưa nghĩ ra. Và khi miễn tội, ĐỒNG HỒ BỊ XOÁ chứ không phải tạm dừng.
//
// Nguy hiểm ở đây không phải sự bất cẩn mà là SỰ TỰ TIN: một checker không crash,
// nó cho ra một phán quyết tử hình tự tin, cụ thể, và sai.
//
// ĐIỀU KIỆN THOÁT: nếu sau 6 tháng `--verify` chưa MỘT LẦN NÀO miễn tội cho file
// nào, phòng chờ này là nghi thức — rút thời gian chờ từ 30 ngày xuống 14.
const ATTIC = repoPath('.claude', 'state', 'attic.json');
const readAttic = () => { try { return JSON.parse(readFileSync(ATTIC, 'utf8')); } catch { return { staged: [] }; } };

/**
 * HAI CON SỐ, không phải một. Một món chỉ đủ điều kiện nghỉ hưu khi CẢ HAI đúng:
 *   · không có dấu hiệu dùng nào trong TOÀN BỘ lịch sử (không phải "N ngày im ắng")
 *   · có NHIỀU NHẤT MỘT liên kết trỏ tới
 * Một lần nhắc là NHẮC; hai lần là PHỤ THUỘC. Đừng bao giờ xoá theo một con số:
 * "không script nào đọc file này" từng được dùng làm bằng chứng không ai đọc,
 * và tầng bị kết án hoá ra được đọc 93 lần bởi con người.
 */
function evidenceFor(target) {
  const t = String(target).replace(/^\.\//, '');
  // `basename()` xử lý cả hai dấu phân cách trên Windows — `target` ở đây là chuỗi người gõ,
  // và người trên Windows hay dán đường dẫn có `\`.
  const base = basename(t).replace(/\.[^.]+$/, '');
  const inbound = git(['grep', '-l', '--', base]).stdout.split('\n')
    .filter(Boolean).filter(f => f !== t);
  const commits = git(['log', '--oneline', '--', t]).stdout.split('\n').filter(Boolean).length;
  return { inbound: inbound.length, inboundFiles: inbound.slice(0, 5), commits, at: new Date().toISOString() };
}

const ai = process.argv.indexOf('--stage');
if (ai >= 0) {
  const target = process.argv[ai + 1];
  const wi = process.argv.indexOf('--why');
  const why = wi >= 0 ? process.argv[wi + 1] : '';
  // KHÔNG BAO GIỜ ĐỦ ĐIỀU KIỆN: lớp harness. Một cái phanh mà đề xuất đầu tiên của
  // nó là xoá một luật an toàn đang sống thì sẽ bị tắt ngay — và tắt là đúng.
  if (!target || !existsSync(repoPath(target))) { console.error(`Không tồn tại: ${target}`); process.exit(1); }
  if (matchAny(target, pathsFor('harness'))) { console.error(`${target} thuộc paths.harness — KHÔNG BAO GIỜ đủ điều kiện nghỉ hưu tự động.`); process.exit(1); }
  if (why.length < 20) { console.error('--why phải ≥20 ký tự. "không dùng nữa" không phải lý do; CÁI GÌ đã thay thế nó?'); process.exit(1); }
  const a = readAttic();
  a.staged = a.staged.filter(s => s.file !== target);
  a.staged.push({ file: target, why, stagedAt: new Date().toISOString(), evidence: evidenceFor(target) });
  const { writeJson } = await import('./lib/harness.mjs');
  writeJson(ATTIC, a);
  console.log(`Đã đưa vào phòng chờ: ${target}\n  Chờ ≥30 ngày VÀ ≥2 lần retro tuần. Bất kỳ dấu hiệu sống nào cũng miễn tội và XOÁ đồng hồ.`);
  process.exit(0);
}
if (process.argv.includes('--verify') || process.argv.includes('--ready')) {
  const a = readAttic(); const kept = []; const lines = [];
  for (const s of a.staged) {
    if (!existsSync(repoPath(s.file))) { lines.push(`  đã biến mất: ${s.file}`); continue; }
    const now2 = evidenceFor(s.file);
    const alive = now2.inbound > s.evidence.inbound || now2.commits > s.evidence.commits;
    const days = Math.round(daysAgo(s.stagedAt));
    if (alive) { lines.push(`  MIỄN TỘI ${s.file} — có dấu hiệu sống (inbound ${s.evidence.inbound}→${now2.inbound}, commit ${s.evidence.commits}→${now2.commits}). Đồng hồ bị XOÁ.`); continue; }
    if (days >= 30 && now2.inbound <= 1) lines.push(`  SẴN SÀNG  ${s.file} (chờ ${days} ngày, inbound ${now2.inbound}) — lý do: ${s.why}\n            → ${cfg.project?.dri || 'DRI'} gõ:  git rm ${s.file}`);
    else lines.push(`  còn chờ  ${s.file} (${days}/30 ngày, inbound ${now2.inbound} — cần ≤1)`);
    kept.push(s);
  }
  a.staged = kept;
  const { writeJson } = await import('./lib/harness.mjs');
  writeJson(ATTIC, a);
  console.log(`\n=== PHÒNG CHỜ NGHỈ HƯU (${kept.length} đang chờ) ===`);
  console.log(lines.length ? lines.join('\n') : '  (trống)');
  console.log('\n  Không có lệnh --delete, cố ý. Bước không thu hồi được không phải việc của agent.\n');
  process.exit(0);
}
const stagedNow = readAttic().staged.length;
if (stagedNow) ok.push(`phòng chờ: ${stagedNow} mục — chạy \`--verify\` để đo lại (dấu hiệu sống = miễn tội)`);

if (!warn.length && !fail.length) ok.push('không phát hiện dấu hiệu hết hạn nào');

const good = report('ENTROPY SCAN', { ok, warn, fail });
console.log(`  Đây chỉ là phần MÁY kiểm được. Phần cần phán đoán ("mục này còn đúng
  với code hiện tại không?") thuộc về skill /entropy-sweep và con người.

  KHÔNG TỰ XOÁ gì. Đề xuất, người quyết định.\n`);
process.exit(good ? 0 : 1);
