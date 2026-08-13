#!/usr/bin/env node
/**
 * Đo kích thước harness.  Chỉ số NGƯỢC TRỰC GIÁC quan trọng nhất.
 *
 *   node tooling/harness-size.mjs [--baseline]
 *
 * Một harness đang TỐT LÊN thường đang NHỎ ĐI, vì mỗi bài học được đẩy xuống
 * dạng biểu diễn rẻ hơn (test, generator, hook) thay vì tích thành văn bản.
 *
 * Nếu số này đi lên trong khi bạn "cải thiện harness" → bạn đang phình harness,
 * không đang cải thiện nó.
 *
 * CỐ Ý KHÔNG ĐO `tooling/`. Chỉ số này đo phần ĐẮT của thang biểu diễn — prose
 * trong AGENTS.md, rule cứng, skill, hook. `tooling/` là đầu RẺ (computational
 * control): thêm 300 dòng script tất định để bỏ được 3 dòng rule cứng là một
 * thắng lợi, và một chỉ số phạt nó sẽ đẩy bạn đi sai hướng.
 * Nói rõ ở đây vì nếu không, người đọc sẽ tưởng harness không phình khi nó có phình.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { repoPath, readJson, writeJson, report, exists, worktreeInfo, limit, REPO_ROOT, guardFlags } from './lib/harness.mjs';

guardFlags(process.argv.slice(2), { bool: ['--baseline'] }, { name: 'harness-size.mjs' });

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

const lines = f => { try { return readFileSync(f, 'utf8').split('\n').length; } catch { return 0; } };
const sum = fs => fs.reduce((n, f) => n + lines(f), 0);

const md = p => extname(p) === '.md';

/**
 * Đếm skill theo TẦNG DISCOVERY, không theo số thư mục.
 *
 * `disable-model-invocation: true` đưa chi phí context của một skill về **0**: model không
 * thấy `description` của nó nên nó không cạnh tranh với skill khác. Một skill nghi thức
 * (`/claim`, `/pre-merge`) do đó KHÔNG phải là thuế.
 *
 * Trước 2.4.0 file này đếm **thư mục** và so với hằng số `12` **viết cứng ngay trong bảng
 * `THRESHOLDS`** — nó không đọc `limits.maxSkills` bao giờ. Cùng lúc `harness-doctor` đếm
 * theo tầng discovery và `harness.config.json → $comment_maxSkills` tự khai *"Đếm theo
 * tầng DISCOVERY, không theo tổng số file… harness-doctor đọc field này."*
 *
 * Kết quả: MỘT khái niệm hai nghĩa, hai tool cho hai phán quyết trái nhau về cùng một
 * repo, và với file này thì `limits.maxSkills` là một **field ma** — đúng lớp
 * `budget.modelTiering` bị cắt ở 2.0.0. Config đã tự khai nghĩa của nó, nên file này sai.
 *
 * Tổng số thư mục vẫn được in ra, dưới nhãn khác, vì nó là **bề mặt bảo trì** — một số
 * đáng biết, chỉ không phải số đáng gác.
 */
const skillDirs = existsSync(repoPath('.claude/skills'))
  ? readdirSync(repoPath('.claude/skills'), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)
  : [];
const discoverableSkills = skillDirs.filter(name => {
  const f = repoPath('.claude/skills', name, 'SKILL.md');
  if (!existsSync(f)) return false;
  const fm = readFileSync(f, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
  return !/^disable-model-invocation:\s*true/m.test(fm);
}).length;

const metrics = {
  'AGENTS.md (dòng)': exists(repoPath('AGENTS.md')) ? lines(repoPath('AGENTS.md')) : 0,
  'rules (số file)': walk(repoPath('.claude/rules'), md).length,
  'rules (dòng)': sum(walk(repoPath('.claude/rules'), md)),
  'skills (discovery)': discoverableSkills,
  'skills (tổng thư mục)': skillDirs.length,
  'skills (dòng)': sum(walk(repoPath('.claude/skills'), md)),
  'agents (số)': walk(repoPath('.claude/agents'), md).length,
  'hooks (số)': walk(repoPath('.claude/hooks'), p => p.endsWith('.mjs')).length,
  'hooks (dòng)': sum(walk(repoPath('.claude/hooks'), p => p.endsWith('.mjs'))),
  'mcp servers': Object.keys(readJson(repoPath('.mcp.json'), {})?.mcpServers ?? {}).length,
  'lessons (số)': walk(repoPath('knowledge/lessons'), p => md(p) && !p.includes('_TEMPLATE')).length,
};

// Ngưỡng cảnh báo — không phải luật, là tín hiệu để đi đọc lại
const THRESHOLDS = {
  'AGENTS.md (dòng)': [150, 'Dài hơn 150 dòng: có thứ thuộc về rules/ (theo path), skill, hoặc hook'],
  'rules (dòng)': [400, 'Rule nhiều = thuế context ở mọi request. Rule nào không có `paths` frontmatter?'],
  // Ngưỡng ĐỌC TỪ CONFIG, không viết cứng: nó là con số của đội, và một ngưỡng viết cứng
  // trong hai tool là hai ngưỡng sẽ lệch nhau.
  'skills (discovery)': [limit('maxSkills', 12),
    'Skill trong tầng discovery trả tiền thuê `description` MỌI phiên. Thêm `disable-model-invocation: true` cho skill nghi thức: chi phí về 0, không mất chức năng'],
  'mcp servers': [5, '3–5 server/project. Tool definition ăn context mỗi request'],
};

const ok = [], warn = [];
for (const [k, v] of Object.entries(metrics)) {
  const t = THRESHOLDS[k];
  if (t && v > t[0]) warn.push(`${k}: ${v} (ngưỡng ${t[0]}) — ${t[1]}`);
  else ok.push(`${k}: ${v}`);
}

// ── RATCHET: mốc khai báo CÔNG KHAI, có ngày, có người khai ──────────────────
//
// Một cái gác ĐỎ NGAY NGÀY ĐẦU là một cái gác sẽ bị TẮT. Nó không dạy ai điều gì —
// nó dạy người ta cách tắt gate. Nên: chốt mức HÔM NAY làm mốc, chỉ nổ khi số TĂNG,
// và hạ mốc trong CÙNG COMMIT với mỗi lần sửa.
//
// Backlog nằm CÔNG KHAI ở đây, có ngày, không giấu. Đây không phải file sinh tự động:
// hạ một mốc phải là một dòng diff mà DRI nhìn thấy.
//
// ĐIỀU KIỆN THOÁT: một mốc về 0 → xoá dòng đó, đổi thành gate cứng.
// HẬU QUẢ CAM KẾT TRƯỚC: sau 60 ngày mà KHÔNG mốc nào được hạ trong một commit nào,
// ratchet đang CHE một backlog thay vì tiêu nó — bỏ nó đi, đừng gia hạn.
const BASELINES = {
  'hooks-without-mutant': { n: 1, since: '2026-08-06', by: '@dri', why: '9/10 hook có mutant bị giết. Còn lại: session-start.mjs — nó KHÔNG CÓ phép kiểm nào để chứng minh, nó chỉ IN. Mutant trả lời câu "phép kiểm này có thật không"; hook không có phép kiểm thì câu hỏi đó vô nghĩa, và một mutant gượng ép cho nó sẽ chỉ khẳng định "đoạn in này chưa chết". Nên mốc này KHÔNG về 0 bằng cách viết thêm test — nó về 0 khi DRI quyết định mẫu số chỉ gồm hook CÓ nhánh chặn. Hạ 6→3→1 ngày 2026-08-06. Test chế độ hỏng (FAILMODE) KHÔNG tính ở đây: nó chứng minh hook hỏng thì CHẶN, không chứng minh phép kiểm của nó có thật.' },
};
// KHÔNG khai mốc cho thứ file này không tự đo. Một mốc không có phép đo đi kèm là
// một field ma — nó trông như đang gác, và không ai phát hiện ra là không.
// (`rules-without-paths` được đo ở harness-doctor, nơi nó có ngưỡng riêng.)

/**
 * Metric ĐỔI TÊN vẫn phải mang theo lịch sử của nó.
 *
 * `skills (số)` → `skills (tổng thư mục)` ở 2.4.0: **cùng một phép đo** (số thư mục), chỉ
 * đổi nhãn để nhường tên gác cho `skills (discovery)`. Không có bảng này thì một lần đổi
 * tên biến metric thành *"chưa có mốc"* **vĩnh viễn** trên mọi máy đã có baseline — và cách
 * duy nhất để dọn (`--baseline`) sẽ **XOÁ luôn** tín hiệu phình đang có. Tức là phải chọn
 * giữa một `n/a` mãi mãi và mất bằng chứng; cả hai đều là mất mát không cần thiết.
 *
 * `skills (discovery)` **cố ý KHÔNG có alias**: nó là phép đo MỚI, chưa từng được đo ở
 * baseline nào. `n/a` của nó là `n/a` THẬT — đừng gán cho nó một lịch sử nó không có.
 */
const BASELINE_ALIASES = { 'skills (tổng thư mục)': 'skills (số)' };

// So với baseline — VÀ CHỈ SO KHI CÙNG MỘT CÂY.
const basePath = repoPath('.claude', 'state', 'harness-size-baseline.json');
const wt = worktreeInfo();
const treeId = wt.isWorktree ? `worktree:${REPO_ROOT}` : 'main-tree';
const na = [], unknown = [];

if (process.argv.includes('--baseline')) {
  writeJson(basePath, { at: new Date().toISOString(), tree: treeId, metrics });
  ok.push(`đã ghi baseline (${treeId}) → ${basePath}`);
} else {
  const base = readJson(basePath);
  if (!base) {
    unknown.push('chưa có baseline — chạy với --baseline để ghi. Không có mốc thì "phình hay co" là CHƯA ĐO ĐƯỢC, không phải "không đổi"');
  } else if ((base.tree ?? 'main-tree') !== treeId) {
    // Đây là chỗ N1 cắn: sparsePaths làm worktree THIẾU FILE CÓ CHỦ Ý. So với mốc
    // lấy ở cây chính sẽ báo "harness đang co" trong khi không có gì co.
    unknown.push(`baseline đo ở \`${base.tree ?? 'main-tree'}\`, đang chạy ở \`${treeId}\` — TỪ CHỐI so. `
      + `sparsePaths làm file vắng mặt hợp lệ; so hai cây khác nhau cho ra một con số sai mà trông đúng.`);
  } else {
    // Metric VẮNG MẶT trong baseline là `n/a`, KHÔNG phải `0`.
    //
    // Bản cũ dùng `base.metrics[k] ?? 0`. Cái `?? 0` đó trông vô hại và nó BỊA RA sự
    // phình: ngay lần đổi tên metric đầu tiên (`skills (số)` → `skills (discovery)` +
    // `skills (tổng thư mục)` ở 2.4.0), báo cáo nói `+3` và `+12` cho hai metric chưa
    // từng được đo, rồi kết luận "Harness đang PHÌNH" — về một thay đổi KHÔNG thêm một
    // dòng skill nào. Một mốc chưa tồn tại không phải mốc bằng không.
    const deltas = [], fresh = [];
    for (const [k, v] of Object.entries(metrics)) {
      const bm = base.metrics ?? {};
      // Metric ĐỔI TÊN phải mang theo lịch sử của nó.
      const key = k in bm ? k : (BASELINE_ALIASES[k] in bm ? BASELINE_ALIASES[k] : null);
      if (!key) { fresh.push(`${k}=${v}`); continue; }
      const d = v - bm[key];
      if (d !== 0) deltas.push(`${k}: ${d > 0 ? '+' : ''}${d}`);
    }
    if (fresh.length) {
      na.push(`metric MỚI, chưa có mốc: ${fresh.join(' · ')} — xu hướng CHƯA ĐO ĐƯỢC, không phải "+N từ 0". `
        + `Chạy \`--baseline\` để ghim (và nhớ: ghim lại sẽ XOÁ luôn tín hiệu phình đang có).`);
    }
    if (deltas.length) {
      const grew = deltas.filter(d => d.includes('+')).length;
      (grew > deltas.length / 2 ? warn : ok).push(`so với baseline (${base.at.slice(0, 10)}): ${deltas.join(', ')}`);
      if (grew > deltas.length / 2) warn.push('Harness đang PHÌNH. Mỗi thay đổi promote phải kèm một đề xuất CẮT BỎ.');
    } else ok.push('không đổi so với baseline');
  }
}

// Ratchet: đo thật, so với mốc khai báo.
const hookFiles = existsSync(repoPath('.claude', 'hooks'))
  ? readdirSync(repoPath('.claude', 'hooks')).filter(f => f.endsWith('.mjs')) : [];
const testSrc = existsSync(repoPath('tooling', 'test-hooks.mjs'))
  ? readFileSync(repoPath('tooling', 'test-hooks.mjs'), 'utf8') : '';
// Đếm TRONG khối `const MUTANTS = [...]`, không phải cả file. Bản đầu neo vào
// `mutate(<file>` — nhưng mutant được KHAI trong mảng và mutate() nhận biến, nên
// check đếm 0 mãi mãi. Lại là PHẠM VI, không phải logic: chỗ cần nhìn trước tiên.
const mutantBlock = testSrc.match(/const MUTANTS = \[([\s\S]*?)\n\];/)?.[1] ?? '';
// HAI dạng mutant, và bản đầu chỉ đếm một.
//
// Dạng BẢNG: khai trong `const MUTANTS = [...]`, chạy qua `mutate()`.
// Dạng RỜI: viết tay khi mutant cần dựng bối cảnh riêng — `observe.mjs` phải xoá mẩu bánh mì
// rồi bắn một sự kiện `StopFailure` trước khi kiểm, thứ bảng không diễn đạt được.
//
// Chỉ đếm dạng bảng thì `observe.mjs` bị tính là "chưa có mutant" VĨNH VIỄN, dù nó có một
// mutant thật đang bị giết mỗi lần chạy suite. Sai theo chiều an toàn (bi quan), nhưng vẫn là
// một con số không đúng nghĩa của nó — và tệ hơn: cái mốc này KHÔNG BAO GIỜ về 0 được, trong
// khi chính file này khai ĐIỀU KIỆN THOÁT là *"một mốc về 0 → xoá dòng đó"*. Một ratchet không
// thể về 0 thì không phải ratchet, nó là một dòng trang trí vĩnh viễn.
//
// Dạng rời nhận diện qua NHÃN `MUTANT <file>` mà nó in ra — dạng bảng dùng `${hook.padEnd(21)}`
// nên không sinh ra chuỗi đó. Rủi ro: ai viết đúng chuỗi ấy trong một comment sẽ được tính oan.
// Chấp nhận được, vì cái giá của chiều ngược lại (mốc kẹt mãi) đã đo được là cao hơn.
const hasMutant = (f) => mutantBlock.includes(`'${f}'`) || testSrc.includes(`MUTANT ${f}`);
const noMutant = hookFiles.filter(f => !hasMutant(f)).length;
for (const [key, measured] of [['hooks-without-mutant', noMutant]]) {
  const b = BASELINES[key];
  if (!b) continue;
  if (measured > b.n) warn.push(`RATCHET VƯỢT MỐC — ${key}: ${measured} > ${b.n} (khai ${b.since} bởi ${b.by}). Số này chỉ được phép GIẢM.`);
  else if (measured < b.n) warn.push(`RATCHET: ${key} đã xuống ${measured} (mốc ${b.n}) — HẠ MỐC trong CÙNG commit này, nếu không backlog sẽ bị che.`);
  else ok.push(`ratchet ${key}: ${measured} = mốc (${b.why})`);
}

report('HARNESS SIZE', { ok, warn, na, unknown });
console.log('  Xu hướng tốt = PHẲNG HOẶC GIẢM. Xem knowledge/README.md.\n');
process.exit(0);
