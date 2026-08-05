#!/usr/bin/env node
/**
 * "Việc gì đang TỚI HẠN ngay bây giờ" — suy ra từ trạng thái repo, không phải nhắc theo lịch.
 *
 *   node tooling/rituals.mjs           chỉ in việc ĐANG tới hạn (SessionStart gọi bản này)
 *   node tooling/rituals.mjs --all     bảng đầy đủ: mọi nghi thức, trạng thái, và VÌ SAO
 *   node tooling/rituals.mjs --json    cho máy đọc
 *
 * ── VÌ SAO FILE NÀY TỒN TẠI
 *
 * Một năng lực mà người dùng phải NHỚ mới dùng được thì nằm im. Đo 2026-08-05 trên repo này:
 * `reservations/` chỉ có `README.md` và `docs/progress/` chỉ có hai file khuôn — tức `/claim`
 * và `/handoff` **chưa chạy lần nào** kể từ khi harness ra đời, dù `session-start.mjs` in
 * đúng dòng *"bắt đầu bằng /claim · kết thúc bằng /handoff"* ở MỌI phiên.
 *
 * Dòng đó không sai. Nó chỉ là loại thông tin không ai hành động theo: nó nói MỌI THỨ ở MỌI
 * LÚC, nên nó không nói gì ở lúc nào cả. Cùng lớp lỗi với `harness-doctor` in *"5/5 điểm mở
 * rộng native còn TRỐNG"* suốt nhiều version mà không ai đóng (v2.8.0), và với 22 nhóm fixlog
 * trên 4 repo mà 0 bài học được promote.
 *
 * Và cái giá không phải lý thuyết: hôm nay hai phiên song song cùng commit lên một nhánh ở
 * `sakubun`, và một `git add -A` cuốn theo file sản phẩm của phiên kia. Đó đúng là cửa sổ mà
 * `/claim` đóng lại.
 *
 * ── BA LUẬT CỦA FILE NÀY
 *
 * 1. TỰ ĐỘNG TRƯỚC, NHẮC SAU. Phần nào máy làm được thì máy làm — xem mục 8 của
 *    `.claude/hooks/session-start.mjs`: sự có mặt của phiên được ghi TỰ ĐỘNG và phát hiện
 *    chồng lấn không cần ai gõ `/claim`. Chỉ phần cần PHÁN ĐOÁN của người mới được nhắc ở đây.
 * 2. NHẮC PHẢI CÓ BẰNG CHỨNG. Mỗi mục tới hạn phải kèm con số/đường dẫn đo được. "Nên chạy
 *    /harness-retro" là lời khuyên chung; "3 nhóm fixlog đã ≥2 lần" là một việc.
 * 3. BA GIÁ TRỊ, KHÔNG PHẢI HAI. `due` / `ok` / `?`. Một nghi thức KHÔNG ĐO ĐƯỢC (thiếu git,
 *    thiếu config) phải hiện ra là `?`, không được im lặng thành `ok` — im lặng thành `ok` là
 *    cách một bảng điều khiển báo "mọi thứ ổn" trong khi nó chưa nhìn.
 *
 * `evaluate()` là HÀM THUẦN trên một object trạng thái, tách khỏi `collect()`. Nhờ vậy
 * `tooling/test-hooks.mjs` khẳng định được LOGIC bằng trạng thái dựng sẵn, thay vì phải dựng
 * một repo giả cho mỗi ca — và đó là điều kiện để suite này chạy được ở project đích, nơi
 * trạng thái git là của HỌ (xem knowledge/lessons/0003).
 */
import { readdirSync, existsSync, statSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { repoPath, git, config, limit, report, telemetryDir, exists } from './lib/harness.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// PHẦN THUẦN — không đọc đĩa, không gọi git. Test khẳng định trực tiếp vào đây.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mỗi nghi thức trả về `{ state, why }` với `state` ∈ `due` | `ok` | `?`.
 *
 * `why` là BẰNG CHỨNG, không phải lời khuyên — nó phải chứa con số hoặc đường dẫn. Một dòng
 * không có bằng chứng thì người đọc không kiểm được, và thứ không kiểm được sẽ bị bỏ qua đúng
 * như dòng nhắc tĩnh mà file này thay thế.
 */
export const RITUALS = [
  {
    id: 'claim',
    cmd: '/claim',
    what: 'nhận việc: đọc nhật ký cũ, đặt chỗ vùng nóng, tạo docs/progress/<issue>.md',
    check: (s) => {
      if (s.issue === null) return { state: '?', why: 'nhánh không theo quy ước `<type>/<issue>-<slug>` nên không suy ra được issue — không đo được' };
      if (!s.issue) return { state: 'ok', why: 'đang ở nhánh tích hợp, không có issue để nhận' };
      if (!s.progressExists) return { state: 'due', why: `đang ở issue ${s.issue} mà chưa có docs/progress/${s.issue}.md — phiên sau (và người sau) không có gì để đọc` };
      return { state: 'ok', why: `docs/progress/${s.issue}.md đã có` };
    },
  },
  {
    id: 'handoff',
    cmd: '/handoff',
    what: 'kết phiên: ghi lại đã làm gì, đang dở gì, bước tiếp theo',
    check: (s) => {
      if (s.issue === null || !s.issue) return { state: 'ok', why: 'không ở trong một issue — không có gì để giao lại' };
      if (!s.progressExists) return { state: 'ok', why: '/claim đang tới hạn trước — nhật ký chưa tồn tại' };
      if (s.commitsSinceProgress > 0) {
        return { state: 'due', why: `${s.commitsSinceProgress} commit mới hơn lần sửa docs/progress/${s.issue}.md gần nhất — công việc đã đi trước nhật ký` };
      }
      return { state: 'ok', why: 'nhật ký ngang bằng với commit gần nhất' };
    },
  },
  {
    id: 'pre-merge',
    cmd: '/pre-merge',
    what: 'chạy đủ gate preMerge trước khi mở PR',
    check: (s) => {
      if (s.ahead === null) return { state: '?', why: 'không resolve được nhánh tích hợp — không đo được. Kiểm `project.integrationBranch`' };
      if (s.ahead === 0) return { state: 'ok', why: 'không có commit nào đi trước nhánh tích hợp' };
      return { state: 'due', why: `${s.ahead} commit đi trước ${s.integrationBranch} và chưa thấy dấu gate preMerge chạy ở phiên này` };
    },
  },
  {
    id: 'harness-retro',
    cmd: '/harness-retro',
    what: 'chưng fixlog thành bài học — bước DISTILL của vòng học',
    check: (s) => {
      if (s.fixlogTotal === null) return { state: '?', why: 'không đọc được fixlog — không đo được' };
      if (s.fixlogRepeated > 0) {
        return { state: 'due', why: `${s.fixlogRepeated} nhóm fixlog đã ≥2 lần (ngưỡng promote) trên tổng ${s.fixlogTotal} mục — mỗi nhóm là một ứng viên bài học ĐANG chờ` };
      }
      if (s.fixlogTotal >= 10) return { state: 'due', why: `${s.fixlogTotal} mục fixlog mà chưa nhóm nào ≥2 — đủ nhiều để đáng đọc một lượt` };
      return { state: 'ok', why: `${s.fixlogTotal} mục fixlog, chưa nhóm nào đạt ngưỡng ≥2` };
    },
  },
  {
    id: 'knowledge-promote',
    cmd: '/knowledge-promote',
    what: 'đưa bài học đã chín vào knowledge/lessons/ để nó đi theo bạn sang repo khác',
    check: (s) => {
      if (s.learningsNewerThanLessons === null) return { state: '?', why: 'không đọc được .claude/learnings/ hoặc knowledge/lessons/ — không đo được' };
      if (s.learningsNewerThanLessons > 0) {
        return { state: 'due', why: `${s.learningsNewerThanLessons} file trong .claude/learnings/ mới hơn bài học mới nhất ở knowledge/lessons/ — bài học đang ở dạng chỉ-máy-này-thấy` };
      }
      return { state: 'ok', why: 'không có learnings nào mới hơn lessons' };
    },
  },
  {
    id: 'entropy-sweep',
    cmd: '/entropy-sweep',
    what: 'cắt rule/skill/doc đã hết tác dụng',
    check: (s) => {
      if (s.skillCount === null) return { state: '?', why: 'không đếm được skill — không đo được' };
      if (s.skillCount > s.maxSkills) {
        return { state: 'due', why: `${s.skillCount} skill (trần ${s.maxSkills}) — tool/skill definition ăn context ở MỌI request` };
      }
      return { state: 'ok', why: `${s.skillCount}/${s.maxSkills} skill` };
    },
  },
  {
    id: 'wt',
    cmd: '/wt',
    what: 'dọn worktree đã merge',
    check: (s) => {
      if (s.worktrees === null) return { state: '?', why: 'không liệt kê được worktree — không đo được' };
      if (s.worktrees > s.maxWorktrees) return { state: 'due', why: `${s.worktrees} worktree (trần ${s.maxWorktrees}) — ổ cứng và file-watcher sẽ cạn` };
      return { state: 'ok', why: `${s.worktrees}/${s.maxWorktrees} worktree` };
    },
  },
  {
    // KHÔNG gộp với `/harness-retro`. Retro là bước DISTILL trên fixlog của CHÍNH repo này;
    // mục này là quyết định trên nguyên liệu ĐI LÊN từ repo khác. Hai tín hiệu khác nhau, hai
    // hành động khác nhau — gộp chúng thì một trong hai luôn bị che.
    id: 'accept-packs',
    cmd: 'knowledge/accept.mjs --list',
    what: 'quyết định trên pack đi lên từ project khác (MERGE / ACCEPT / RETURN / REJECT)',
    check: (s) => {
      if (s.pendingPacks === null) return { state: '?', why: 'không đọc được knowledge/incoming/ — không đo được' };
      if (s.pendingPacks > 0) return { state: 'due', why: `${s.pendingPacks} pack từ project khác đang chờ quyết ở knowledge/incoming/ — nguyên liệu đã tới, quyết định thì chưa` };
      return { state: 'ok', why: 'không có pack chờ quyết' };
    },
  },
];

/** Chạy toàn bộ nghi thức trên một trạng thái. Thuần, tất định. */
export function evaluate(state) {
  return RITUALS.map(r => {
    let res;
    try { res = r.check(state); } catch (e) { res = { state: '?', why: `check throw: ${String(e.message || e).slice(0, 80)}` }; }
    return { id: r.id, cmd: r.cmd, what: r.what, ...res };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PHẦN KHÔNG THUẦN — đọc đĩa và git. Mọi nhánh lỗi trả `null`, KHÔNG trả 0.
//
// `null` nghĩa là "không đo được" và nó chạy tiếp thành `?` ở trên. Trả `0` ở đây là gộp
// "không có" với "chưa nhìn" — phép gộp mà AGENTS.md cấm, và ở một bảng điều khiển thì nó
// biến "chưa nhìn" thành "mọi thứ ổn".
// ─────────────────────────────────────────────────────────────────────────────

const num = (fn, fallback = null) => { try { const v = fn(); return typeof v === 'number' && Number.isFinite(v) ? v : fallback; } catch { return fallback; } };

export function collect() {
  const cfg = config();
  const branch = (() => { try { return git(['branch', '--show-current']).stdout.trim(); } catch { return ''; } })();
  const integrationBranch = cfg.project?.integrationBranch || 'origin/main';

  // `issue`: '' nghĩa là nhánh tích hợp (không có issue — đúng, không phải thiếu);
  // `null` nghĩa là KHÔNG SUY RA ĐƯỢC (nhánh không theo quy ước) ⇒ `?`, không phải `ok`.
  const prefixes = cfg.project?.issuePrefixes ?? [];
  let issue = null;
  if (!branch || /^(main|master|develop)$/.test(branch)) issue = '';
  else {
    const m = branch.match(new RegExp(`(${prefixes.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})-?\\d+`, 'i'));
    if (m) issue = m[0];
    else if (/^(chore|docs|ci|test)\//.test(branch)) issue = '';   // nhánh việc-nhà: không cần issue
  }

  const progress = issue ? repoPath('docs', 'progress', `${issue}.md`) : null;
  const progressExists = Boolean(progress && exists(progress));

  return {
    branch, integrationBranch, issue, progressExists,

    // Số commit mới hơn lần sửa nhật ký gần nhất. Dùng mtime của file so với ngày commit —
    // thô nhưng đúng hướng, và nó KHÔNG đòi nhật ký phải được commit (thường nó chưa).
    commitsSinceProgress: !progressExists ? 0 : num(() => {
      const since = new Date(statSync(progress).mtimeMs).toISOString();
      const out = git(['log', '--oneline', `--since=${since}`]).stdout.trim();
      return out ? out.split('\n').filter(Boolean).length : 0;
    }, 0),

    ahead: num(() => {
      const r = git(['rev-list', '--count', `${integrationBranch}..HEAD`]);
      if (r.status !== 0) return null;
      return Number(r.stdout.trim());
    }),

    ...fixlogState(),

    learningsNewerThanLessons: num(() => {
      const ld = repoPath('.claude', 'learnings'), kd = repoPath('knowledge', 'lessons');
      if (!existsSync(ld) || !existsSync(kd)) return null;
      const newest = (dir) => Math.max(0, ...readdirSync(dir).filter(f => f.endsWith('.md') && !f.startsWith('_'))
        .map(f => statSync(join(dir, f)).mtimeMs));
      const lessonAt = newest(kd);
      return readdirSync(ld).filter(f => f.endsWith('.md') && !f.startsWith('_'))
        .filter(f => statSync(join(ld, f)).mtimeMs > lessonAt).length;
    }),

    skillCount: num(() => readdirSync(repoPath('.claude', 'skills'), { withFileTypes: true }).filter(d => d.isDirectory()).length),
    maxSkills: limit('maxSkills', 12),
    worktrees: num(() => (git(['worktree', 'list', '--porcelain']).stdout.match(/^worktree /gm) || []).length),
    maxWorktrees: limit('maxWorktrees', 4),
    // Đếm pack CHƯA ĐƯỢC QUYẾT, không đếm pack TỒN TẠI.
    //
    // Pack là SNAPSHOT: `upstream --apply` sinh lại nó mỗi lần chạy. Bản đầu đếm số thư mục,
    // nên ngay sau khi quyết xong và dọn, lần chạy `upstream` kế tiếp lại dựng pack cũ và mục
    // này ĐỎ LẠI — một mục đỏ vĩnh viễn dạy đúng thứ file này ra đời để diệt.
    //
    // Neo là `sourceCommit` của pack: nó là commit của repo GỬI. Repo đó không đổi thì commit
    // không đổi, nên "đã quyết" là một trạng thái bền. Repo đó có fixlog mới ⇒ commit mới ⇒
    // mục này đỏ lại, và lần đó thì nó ĐÚNG.
    pendingPacks: num(() => {
      const d = repoPath('knowledge', 'incoming');
      if (!existsSync(d)) return 0;
      let log = '';
      try { log = readFileSync(repoPath('knowledge', 'DECISIONS.log'), 'utf8'); } catch {}
      const packs = readdirSync(d, { withFileTypes: true }).filter(x => x.isDirectory());
      return packs.filter(x => {
        let commit = null;
        try { commit = JSON.parse(readFileSync(join(d, x.name, 'pack.json'), 'utf8')).sourceCommit; } catch {}
        // Không đọc được commit ⇒ coi là CHƯA quyết. Thà nhắc thừa một lần còn hơn im lặng
        // bỏ qua nguyên liệu đi lên — chiều LÊN là chiều dễ tắt nhất của vòng học.
        return !commit || !log.includes(commit);
      }).length;
    }),
  };
}

/** fixlog: tổng số mục, và số NHÓM đã đạt ngưỡng ≥2 (ngưỡng promote của /harness-propose). */
function fixlogState() {
  try {
    const f = join(telemetryDir(), 'manual-fixes.log');
    if (!existsSync(f)) return { fixlogTotal: 0, fixlogRepeated: 0 };
    const lines = readFileSync(f, 'utf8').split('\n').filter(Boolean);
    // Cùng phép chuẩn hoá với `tooling/fixlog.mjs --top`: 6 từ đầu dài hơn 3 ký tự. Hai bản
    // của cùng một phép nhóm sẽ lệch nhau vào ngày có người sửa một bản — nên nếu phép này
    // còn phải dùng ở chỗ thứ ba, nó phải chuyển vào `lib/harness.mjs` trước.
    const norm = s => s.toLowerCase().replace(/[^a-z0-9à-ỹ\s]/gi, ' ').split(/\s+/).filter(w => w.length > 3).slice(0, 6).join(' ');
    const groups = new Map();
    for (const l of lines) {
      const text = l.split('|').slice(3).join('|').trim() || l;
      const k = norm(text);
      groups.set(k, (groups.get(k) ?? 0) + 1);
    }
    return { fixlogTotal: lines.length, fixlogRepeated: [...groups.values()].filter(n => n >= 2).length };
  } catch { return { fixlogTotal: null, fixlogRepeated: null }; }
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────
// So ĐƯỜNG DẪN ĐÃ RESOLVE, không so hậu tố tên file: `test-hooks.mjs` IMPORT module này để
// khẳng định `evaluate()`, và một guard so tên sẽ chạy luôn cả CLI trong lúc test.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const ALL = process.argv.includes('--all');
  const JSONOUT = process.argv.includes('--json');
  const results = evaluate(collect());

  if (JSONOUT) { console.log(JSON.stringify(results, null, 2)); process.exit(0); }

  const due = results.filter(r => r.state === 'due');
  const unknown = results.filter(r => r.state === '?');

  if (!ALL) {
    // Bản NGẮN cho SessionStart: chỉ việc tới hạn. Không có gì tới hạn thì IM LẶNG —
    // một dòng "không có gì cần làm" mỗi phiên là chính loại nhiễu file này thay thế.
    for (const r of due) console.log(`   ▸ ${r.cmd.padEnd(20)} ${r.why}`);
    if (unknown.length) console.log(`   ? ${unknown.length} nghi thức KHÔNG đo được — node tooling/rituals.mjs --all`);
    process.exit(0);
  }

  report('NGHI THỨC', {
    fail: due.map(r => `${r.cmd.padEnd(20)} ${r.why}`),
    unknown: unknown.map(r => `${r.cmd.padEnd(20)} ${r.why}`),
    ok: results.filter(r => r.state === 'ok').map(r => `${r.cmd.padEnd(20)} ${r.why}`),
  });
  console.log('  Mọi năng lực của harness đều nằm ở bảng trên — không có cái nào chỉ tồn tại');
  console.log('  trong tài liệu. Mục ĐỎ là việc đang tới hạn, kèm số đo để bạn tự kiểm.\n');
  process.exit(0);
}
