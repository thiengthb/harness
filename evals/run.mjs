#!/usr/bin/env node
/**
 * Runner eval — khung tối thiểu.
 *
 *   node evals/run.mjs                 # toàn bộ
 *   node evals/run.mjs --task 0001
 *   node evals/run.mjs --bare          # harness trần (deprecation review) — ĐÒI `evals.command`
 *   node evals/run.mjs --dry           # chỉ liệt kê, không chạy
 *
 * Runner này CỐ Ý chưa gọi agent: cách gọi phụ thuộc tool bạn dùng và có tính phí.
 * Nó lo phần khó và ổn định: liệt kê task, tách capability/regression, chạy
 * assertion tất định, so với baseline, và cảnh báo khi bạn đo nhiễu.
 *
 * Nối agent: điền hàm runAgent() ở dưới.
 */
import { readdirSync, readFileSync, existsSync, mkdtempSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseFrontmatter } from '../tooling/lib/frontmatter.mjs';
import { repoPath, readJson, writeJson, report, git, config, spill, infraFailure, budgetExhausted, agentEnvelope, envelopeBudget, stateDir, MAX_BUFFER, guardFlags } from '../tooling/lib/harness.mjs';

guardFlags(process.argv.slice(2), { bool: ['--bare', '--dry', '--denominators', '--baseline'], valued: ['--task'] }, { name: 'evals/run.mjs' });

const argv = process.argv.slice(2);
const has = f => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i > -1 ? argv[i + 1] : d; };

const BARE = has('--bare');
const DRY = has('--dry');
const ONLY = val('--task', '');

/**
 * `EVAL_TASKS_DIR` chuyển thư mục task. CHỈ dùng cho TEST, cùng lý do như `HARNESS_CONFIG`
 * và `HARNESS_STATE_DIR`: `tooling/test-evals.mjs` cần một task TỐI THIỂU để kiểm `runAgent()`
 * (thay placeholder, cắt wall-clock, đếm retry). Chạy trên task THẬT thì suite sẽ kéo theo cả
 * `harness-doctor` của task 0001 — chậm, và nó đo thứ khác.
 */
const DIR = process.env.EVAL_TASKS_DIR || repoPath('evals', 'tasks');
if (!existsSync(DIR)) { console.error('Không có evals/tasks/'); process.exit(1); }

const tasks = readdirSync(DIR)
  .filter(f => f.endsWith('.md') && !f.startsWith('_'))
  .map(f => {
    const { data, body } = parseFrontmatter(readFileSync(join(DIR, f), 'utf8'));
    return { file: f, ...data, body };
  })
  .filter(t => !ONLY || String(t.id) === ONLY);

if (!tasks.length) {
  console.log(`\nChưa có task eval nào trong evals/tasks/.\n
Không có bộ eval thì bạn đang tối ưu MÙ: mọi thay đổi harness là phỏng đoán.
Bắt đầu bằng 4 task "đã từng thất bại" — lấy trực tiếp từ:

  node tooling/fixlog.mjs --top

Đó là loại task giá trị nhất, vì nó bảo vệ chính bài học bạn vừa trả giá để có.
Khuôn: evals/tasks/_TEMPLATE.md\n`);
  process.exit(0);
}

// ── Cảnh báo vệ sinh eval ────────────────────────────────────────────────────
const hygiene = [];
if (!process.env.EVAL_ISOLATED) {
  hygiene.push('EVAL_ISOLATED chưa set — bạn đang chạy CÓ MẠNG. Model có thể suy ra là đang bị eval và tìm ra đáp án.');
}
const dirty = git(['status', '--porcelain']).stdout;
if (dirty) hygiene.push(`repo dirty (${dirty.split('\n').length} file) — kết quả không tái lập được`);

const env = {
  node: process.versions.node,
  platform: process.platform,
  cpus: (await import('node:os')).cpus().length,
  commit: git(['rev-parse', '--short', 'HEAD']).stdout,
  bare: BARE,
};

// ── Chạy assertion tất định trong task ───────────────────────────────────────
//
// BA TRẠNG THÁI, KHÔNG PHẢI HAI. `gates.mjs` có `skip` (chưa khai lệnh ⇒ gate không tồn
// tại), `rituals.mjs` có `?`, `harness-size` có `n/a`. Runner này — công cụ DUY NHẤT trong
// bộ có quyền nói *"KHÔNG promote thay đổi này"* — trước 2.24.0 chỉ có pass/fail, nên mọi
// thứ CHƯA ĐO ĐƯỢC bị đếm là HỎNG.
//
// Đo 2026-08-07 trên harness không hỏng: `REGRESSION 40% (2/5)`, và **không FAIL nào là
// hỏng thật**. Một bộ đo báo 40% khi mọi thứ đúng thì lần sau nó báo 40% vì hỏng thật cũng
// không ai phản ứng.
//
// Hai nguồn của `n/a`:
//   · assertion còn PLACEHOLDER chưa điền (`<…>` hoặc `CHANGEME`) — nó chưa là một lệnh
//   · assertion chỉ đúng SAU KHI agent chạy, mà `evals.command` chưa khai ⇒ không agent nào
//     chạy. Đánh dấu bằng dòng `# requires-agent` ngay TRƯỚC nó.
const PLACEHOLDER = /<[^>]*\s[^>]*>|CHANGEME/;

/**
 * Task khai một CẢNH phải dựng trước khi prompt của nó có nghĩa — mà runner KHÔNG chạy mục đó.
 *
 * `runAssertions()` chỉ trích đúng một khối: `## Chấm lớp 1`. Mọi khối bash khác trong task là
 * văn bản cho người đọc, và với hầu hết mục thì đúng như vậy. Với `## Dựng cảnh` thì không:
 * agent vẫn được gọi, vẫn trả lời, vẫn được chấm — chỉ là nó trả lời về một tình huống KHÔNG
 * TỒN TẠI.
 *
 * Đo 2026-08-07 trên `0004-khong-merge-tay-lockfile` (prompt: *"Có conflict khi merge. Giải
 * quyết giúp tôi rồi commit."*) — transcript thật: *"Không có conflict nào để giải quyết."*
 * Task vẫn vào mẫu số và vẫn được chấm **PASS**, tức nó đẩy tỉ lệ **LÊN**. Cùng lớp với #93
 * nhưng ngược chiều, và chiều này im lặng hơn: không ai đi điều tra một con số đẹp.
 *
 * Nên: có `## Dựng cảnh` ⇒ KHÔNG gọi agent (không tiêu tiền cho một phép đo không xảy ra),
 * KHÔNG chấm, ra khỏi mẫu số, và nói ra lý do. Cho runner tự chạy mục đó là một thay đổi HỢP
 * ĐỒNG riêng, không phải một dòng code: setup CỐ Ý ghi vào repo đang đo, còn
 * `worktreeFingerprint()` dưới đây tồn tại để chặn đúng chuyện ghi vào repo đang đo. Hai thứ
 * đó phải phân biệt được trước đã, và chỗ phân biệt được là một cây CÔ LẬP. Xem #104.
 */
const SETUP_SECTION = /^##\s+Dựng cảnh\s*$/m;

/**
 * Gộp dòng thành LỆNH LOGIC. Bản trước `split('\n')` thẳng, nên một `node -e "…"` nhiều dòng
 * bị băm thành N "lệnh" rời.
 *
 * Hậu quả không chỉ là đếm sai. Đo 2026-08-07 trên Windows: dòng
 * `…filter(([,v])=>v.passes===true…)` chạy MỘT MÌNH trong `cmd.exe`, và `>` trong `=>` là
 * CHUYỂN HƯỚNG OUTPUT ⇒ runner **tạo một file `v.passes` trong repo nó đang đo**, rồi
 * `apply-to --audit` (assertion số 3 của eval 0001) đỏ vì đúng cái file vừa bị tạo.
 * Bộ eval tự làm hỏng assertion kế tiếp của chính nó.
 */
function splitCommands(src) {
  const out = [];
  let cur = '', agentNext = false, pendingAgent = false, fullNext = '', pendingFull = '';
  const flush = () => {
    if (!cur.trim()) return;
    out.push({ cmd: cur.trim(), requiresAgent: pendingAgent, fullArmOnly: pendingFull });
    cur = ''; pendingAgent = false; pendingFull = '';
  };
  for (const raw of src.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!cur && /^\s*#/.test(line)) {                 // chú thích chỉ là chú thích khi ở NGOÀI một lệnh
      if (/^\s*#\s*requires-agent\b/.test(line)) agentNext = true;
      // `# full-arm-only: <lý do>` — assertion KHÔNG SO ĐƯỢC giữa hai chiều, do BẢN CHẤT nó.
      // Lý do BẮT BUỘC: đây là cửa để một task tự đưa mình ra khỏi phép trừ, và một cửa như
      // vậy không có lý do sẽ được dùng để làm đẹp con số. Xem `runAssertions`.
      // RÀNG BUỘC "PHẢI CÓ LÝ DO" ĐƯỢC GIỮ BỞI **HAI** LỚP, và đo được điều đó:
      //   · regex đòi `:` + ít nhất một ký tự;
      //   · `fm[1].trim()` rỗng ⇒ falsy ⇒ dấu không được nhận.
      // Mutation 2026-08-11: phá RIÊNG lớp nào cũng cho mutant **TƯƠNG ĐƯƠNG** (nới regex ⇒
      // capture rỗng ⇒ vẫn falsy; điền hộ lý do ⇒ regex vẫn chặn ở `fm === null`). Chỉ mutant
      // phá **cả hai cùng lúc** mới giết được ca ⑲g — và nó giết thật. Ghi ra vì một mutant
      // sống sót ở đây là "phòng thủ hai lớp", KHÔNG phải "test hở"; đừng gỡ một lớp cho gọn.
      const fm = line.match(/^\s*#\s*full-arm-only\s*:\s*(.+)$/);
      if (fm) fullNext = fm[1].trim();
      continue;
    }
    if (!cur && !line.trim()) continue;
    if (!cur) pendingAgent = agentNext, agentNext = false, pendingFull = fullNext, fullNext = '';
    cur += (cur ? '\n' : '') + line;
    // Nháy còn lẻ ⇒ lệnh chưa kết thúc. Đếm trên chuỗi đã bỏ ký tự thoát.
    const bare = cur.replace(/\\./g, '');
    const balanced = (bare.match(/"/g) || []).length % 2 === 0 && (bare.match(/'/g) || []).length % 2 === 0;
    if (balanced && !/\\$/.test(line)) flush();
  }
  flush();
  return out;
}

/** Khối assertion của một task, đã gộp thành lệnh logic. Rỗng khi task không có khối nào. */
function assertionsOf(body) {
  const block = body.match(/## Chấm lớp 1[\s\S]*?```bash\n([\s\S]*?)```/);
  return block ? splitCommands(block[1]) : [];
}

/**
 * `# full-arm-only: <lý do>` — assertion CHỈ CHẤM ĐƯỢC Ở CHIỀU ĐẦY ĐỦ, do bản chất của nó.
 *
 * Khác hẳn "assertion đỏ sẵn vì `--bare` gỡ mất file nó đọc" — ca đó là **công cụ báo oan** và
 * phải VÁ (v2.57.0/v2.58.0 vá bốn công cụ như vậy). Ca này thì không vá được: mẫu vật là
 * `0007`, mà assertion của nó chạy `tooling/test-evals.mjs`, và suite đó kiểm chính `--bare`.
 * Trong một cây ĐÃ trần, `--bare` **từ chối chạy** ("KHÔNG gỡ được gì") — đúng thiết kế.
 *
 * HAI THỨ, KHÔNG MỘT. Đánh dấu như vậy KHÔNG làm assertion biến mất:
 *   · chiều ĐẦY ĐỦ vẫn CHẠY và vẫn chấm nó — giá trị regression giữ nguyên;
 *   · phép TRỪ loại nó khỏi **cả hai** vế — vì một assertion chỉ chạy ở một bên thì hai bên
 *     đang chấm trên hai tập, và đó là đúng bệnh v2.54.0 sinh ra để chữa.
 *
 * Nên mỗi task có HAI phán quyết: `passed` (mọi assertion — tỉ lệ regression) và
 * `passedComparable` (chỉ assertion so được — phép trừ). Gộp chúng lại là quay về lỗi cũ.
 *
 * CỬA NÀY CÓ THỂ BỊ LẠM DỤNG, nên nó đắt một cách cố ý: lý do BẮT BUỘC (không có `:` thì không
 * nhận), lý do được IN RA ở cả `--denominators` lẫn báo cáo, và task nào đánh dấu tới mức
 * `ranComparable === 0` thì ra khỏi phép trừ hoàn toàn — làm đẹp con số bằng cách đánh dấu hết
 * sẽ cho ra **giao rỗng**, tức không có con số nào.
 */
function runAssertions(body, agentRan, root, skip = null) {
  // `bare` chỉ để NÓI ĐÚNG TÊN cây trong thông điệp — hai chiều có hai nguyên nhân khác nhau
  // cho cùng một hiện tượng, và gộp chúng vào một câu là gửi người đọc đi sai hướng.
  const bare = BARE;
  const cmds = assertionsOf(body);
  const failed = [], na = [];
  let ran = 0, ranComparable = 0, failedComparable = 0;
  for (const { cmd, requiresAgent, fullArmOnly } of cmds) {
    const one = cmd.split('\n')[0].slice(0, 70);
    if (PLACEHOLDER.test(cmd)) { na.push(`${one} — còn placeholder chưa điền`); continue; }
    if (requiresAgent && !agentRan) { na.push(`${one} — chấm output của agent, mà \`evals.command\` chưa khai`); continue; }
    if (fullArmOnly && bare) {
      na.push(`${one} — task khai \`full-arm-only\`: ${fullArmOnly}. Không chạy ở chiều trần, và ra khỏi phép trừ ở CẢ HAI chiều.`);
      continue;
    }
    if (skip?.has(cmd)) {
      na.push(`${one} — ĐỎ SẴN trên ${bare ? 'cây trần' : 'cây đầy đủ'} TRƯỚC KHI agent chạy ⇒ `
        + (bare
          ? 'nó đo lớp harness, không đo agent'
          : 'nó KHÔNG đo agent. Cây eval là clone `--depth 1` không remote: assertion đọc lịch sử git, `origin`, hoặc file chưa commit sẽ đỏ ở đây mà xanh trong repo bạn đang mở'));
      continue;
    }
    ran++;
    if (!fullArmOnly) ranComparable++;
    const r = spawnSync(cmd, { shell: true, encoding: 'utf8', cwd: root });
    if ((r.status ?? 1) !== 0) {
      failed.push(cmd);
      if (!fullArmOnly) failedComparable++;
    }
  }
  return { ran, ranComparable, failed, failedComparable, na };
}

/**
 * TIỀN KIỂM của chế độ trần — thứ làm phép trừ có nghĩa thay vì chỉ có số.
 *
 * Gỡ lớp harness ra khỏi một cây thì có assertion **đứt theo**: `0001` chạy
 * `node tooling/test-hooks.mjs`, và suite đó đọc `.claude/`. Nếu để nguyên, task đó ĐỎ ở lần
 * chạy trần và XANH ở lần chạy đầy đủ — rồi phép trừ ghi chênh lệch đó vào cột *"giá trị của
 * harness"*, trong khi agent không liên quan gì. Một số 0 do cấu trúc được thay bằng một số
 * DƯƠNG do cấu trúc thì không khá hơn: nó chỉ sai theo hướng dễ chịu hơn.
 *
 * Nên: chạy các assertion KHÔNG phụ thuộc agent trên cây trần **trước khi agent chạy**. Cái
 * nào đã đỏ khi chưa có gì xảy ra thì nó không nói gì về agent ⇒ `n/a` cho lần chạy này.
 *
 * Tất định, không cần task tự khai, và nó tự đúng khi ai đó đổi `BARE_STRIP`.
 *
 * CHẠY Ở CẢ HAI CHIỀU TỪ #155, và đó là một phần của cùng bản vá. Trước đó nó chỉ chạy ở chiều
 * trần vì chiều đầy đủ là repo THẬT và tiền kiểm sẽ chạy mọi lệnh thêm một lượt vào đó — lý do
 * đúng, tiền đề nay đã hết: cả hai chiều đều là cây dùng một lần.
 *
 * Để nó chạy một chiều là tự tạo ra đúng cái lỗi mà nó ra đời để chống, chỉ ở phía kia: một
 * assertion đã ĐỎ trước khi agent chạy sẽ thành `n/a` ở chiều trần và thành `FAIL` ở chiều đầy
 * đủ. Hai MẪU SỐ khác nhau, rồi hiệu số ghi chênh lệch đó vào cột "giá trị của harness".
 *
 * Chỉ bỏ qua khi KHÔNG có agent (`evals.command` rỗng): khi đó ROOT là cây sống, và tiền kiểm
 * sẽ chạy mọi lệnh thêm một lượt vào repo người ta đang làm việc.
 */
/**
 * Rút việc AGENT vừa làm ra khỏi cây sắp bị xoá, thành một patch áp lại được.
 *
 * Đây không phải tính năng phụ — nó là hệ quả BẮT BUỘC của #155. Trước bản vá, chiều đầy đủ
 * chạy trong repo sống, nên thay đổi của agent nằm lại trong cây làm việc và có người thấy.
 * Hai lần thu hoạch thật của cả lớp eval đến từ đúng chỗ đó, và cả hai lần điểm số nói ngược:
 *
 *   PR #149  agent task `0007` viết 7 ca `mergeBaseline` bắt một lời khai sai trong docstring
 *            của `rituals.mjs` — runner chấm task đó là FAIL (nó cạn trần lượt).
 *   PR #157  agent task `0006` thêm trạng thái `n/a` cho bảng nghi thức.
 *
 * Cô lập cây mà không rút patch ra thì bản vá này **phá một thứ đang có giá trị** và không ai
 * biết, vì thứ bị mất chưa bao giờ có tên trong báo cáo.
 *
 * COMMIT rồi mới `git show`: không commit thì `git diff` của task N gồm cả việc của task N−1
 * (mọi task chạy tuần tự trong CÙNG một cây), và một patch trộn hai tác giả thì không áp được
 * cho ai. Commit cũng làm mỗi task bắt đầu từ cây SẠCH, nên phép so vân tay quanh assertion
 * chỉ còn thấy đúng thứ assertion viết.
 *
 * `-c user.*` truyền thẳng: cây tạm không thừa kế `user.name` của repo, và một CI không khai
 * identity sẽ làm `git commit` fail — biến một bước ghi chép thành một lỗi giữa lượt đo.
 */
function capturePatch(root, id) {
  const add = git(['add', '-A'], { cwd: root });
  if (add.status !== 0) return null;
  const c = git(['-c', 'user.name=harness-eval', '-c', 'user.email=eval@harness.local',
    'commit', '--quiet', '--no-verify', '-m', `eval task ${id}`], { cwd: root });
  if (c.status !== 0) return null;                       // không có gì để commit ⇒ agent không sửa gì
  const show = git(['show', '--format=', 'HEAD'], { cwd: root });
  if (show.status !== 0 || !show.stdout.trim()) return null;
  return spill(`eval-patch-${id}`, show.stdout);
}

function preflight(body, root) {
  const dead = new Set();
  for (const { cmd, requiresAgent } of assertionsOf(body)) {
    if (requiresAgent || PLACEHOLDER.test(cmd)) continue;
    const r = spawnSync(cmd, { shell: true, encoding: 'utf8', cwd: root });
    if ((r.status ?? 1) !== 0) dead.add(cmd);
  }
  return dead;
}

/**
 * Assertion KHÔNG ĐƯỢC ghi vào repo đang đo. Lưới bắt lớp lỗi `v.passes` ở trên — và mọi
 * biến thể của nó, vì nguyên nhân gốc (shell của OS diễn giải chuỗi khác nhau) không thể
 * chặn hết bằng cách sửa từng task.
 *
 * Trả về danh sách đường dẫn mới bẩn, hoặc `null` khi không đọc được git (⇒ `?`, không phải
 * "sạch" — cùng luật ba giá trị với phần trên).
 */
function worktreeFingerprint(root) {
  const r = git(['status', '--porcelain'], { cwd: root });
  return r.status === 0 ? r.stdout : null;
}

// ── HARNESS TRẦN: một cơ chế, không phải một cái nhãn ────────────────────────
//
// Tới 2.42.4, `--bare` **không gỡ gì cả**. Nó đổi tên file baseline, đổi tiêu đề, đổi lời
// nhắn cuối — và `spawnSync` trong `runAgent()` không nhận nó: cùng `cwd`, cùng `env`, cùng
// bộ hook. Hai lần chạy đo **cùng một thứ**, nên `eval − eval --bare` luôn ≈ 0.
//
// Điều đó tệ hơn một cờ hỏng, vì `docs/adr/harness/0002` và `evals/README.md` đặt đúng phép
// trừ đó làm **chỉ số trung tâm**, và lời nhắn cuối của runner dạy người đọc rằng chênh lệch
// nhỏ nghĩa là *"phần lớn harness của bạn là dead weight"*. Một số 0 do cấu trúc, kèm một
// dòng hướng dẫn diễn giải nó thành kết luận sai về chính harness. Xem #91.
//
// GỠ CÁI GÌ — ranh giới là "Claude Code TỰ NẠP thứ này hay không":
//
//   gỡ   .claude/settings.json   đăng ký hook + permission ⇒ không có nó, hook không chạy
//   gỡ   .claude/rules · skills · agents · .mcp.json       ⇒ nạp vào context/tầng discovery
//   gỡ   CLAUDE.md · AGENTS.md                             ⇒ memory file, ~4.6k token (ADR 0002)
//   GIỮ  .claude/hooks/**                                  ⇒ script TRƠ khi không được đăng ký
//   GIỮ  tooling/ · harness.config.json                    ⇒ chỉ chạy khi CÓ NGƯỜI GỌI
//
// Giữ `tooling/` không phải là nhân nhượng: assertion lớp 1 gọi thẳng vào đó, và nếu gỡ nó
// thì lần chạy trần không còn dụng cụ để chấm — ta sẽ đo "harness còn tồn tại không" thay vì
// "agent có hành xử khác không". Cái ta muốn trừ đi là **ảnh hưởng tự động lên agent**.
//
// ĐỔI TÊN, không xoá: cây vẫn đọc được sau khi chạy nếu cần dựng lại hiện trường.
const BARE_STRIP = [
  '.claude/settings.json',
  '.claude/rules',
  '.claude/skills',
  '.claude/agents',
  'CLAUDE.md',
  'AGENTS.md',
  '.mcp.json',
];

/**
 * Clone dùng một lần, đã gỡ remote và gỡ lớp harness. `--depth 1` + `file://` vì clone local
 * mặc định bỏ qua `--depth` (git nói thẳng điều đó) — đo trên repo này: 0.9 giây, 840 KB.
 *
 * Gỡ remote là bắt buộc, không phải vệ sinh: agent chạy trong cây này với quyền ghi, và một
 * `git push` từ đó là push vào repo thật.
 */
/**
 * Xoá cây tạm — và KHÔNG BAO GIỜ ném. Trả `null` khi sạch, hoặc câu lỗi để gọi là một WARN.
 *
 * Đo 2026-08-08 trên Windows, chạy `--bare --task 0001` (task spawn nhiều tiến trình con nhất
 * trong bộ): `rmSync` ném `EPERM` **trên chính thư mục**, sau khi đã xoá hết file bên trong —
 * còn đúng hai thư mục rỗng. Xoá lại vài giây sau thì được ngay. Đây là ca handle-còn-treo
 * kinh điển của Windows: `spawnSync` đã trả về, nhưng handle của tiến trình con (hoặc của phần
 * mềm diệt virus đang quét) chưa đóng. `maxRetries: 3` × 100ms mặc định không đủ.
 *
 * Hai điều rút ra, và điều thứ hai quan trọng hơn:
 *   · thử lại lâu hơn (10 × 200ms) — vá phần lớn ca;
 *   · **dọn dẹp thất bại không được là một exception.** Bản đầu ném sau khi đã in xong báo
 *     cáo: phép đo đã xong, đã đúng, và người dùng nhận một stack trace + exit code sai. Một
 *     lỗi ở bước dọn rác không được phép nuốt kết quả của bước đo.
 */
function rmTree(dir) {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
    return null;
  } catch (e) {
    return `${e.code || 'lỗi'} — còn sót cây tạm ở ${dir}, xoá tay khi rảnh`;
  }
}

const TREE_PREFIX = 'harness-eval-tree-';
// Tiền tố CŨ, chỉ để dọn rác của bản trước 2.53.0 — cây trần từng mang tên riêng.
const STALE_PREFIXES = [TREE_PREFIX, 'harness-eval-bare-'];

/**
 * Dọn cây trần của những lần chạy TRƯỚC. Cần thiết vì `rmTree` được phép thất bại, và cái
 * được phép thất bại thì sẽ thất bại — mỗi lần một cây 840 KB nằm lại trong tmp.
 *
 * Đo 2026-08-08 trên Windows: sau `--bare --task 0001`, hai thư mục RỖNG (`…/` và `…/repo`)
 * không xoá được, **kể cả từ một tiến trình mới**, trong khi cây của lần chạy trước đó thì xoá
 * được ngay. Không tiến trình nào giữ chúng (đã soi `Win32_Process`) — dấu hiệu của trình quét
 * nền, không phải của một handle bị rò trong code này. Nên đây là ca "sẽ tự hết sau vài phút",
 * và cách đúng là **quét lại ở lần chạy sau**, không phải thử lại lâu hơn ở lần này.
 *
 * Ngưỡng 1 giờ, không phải "mọi cây": hai lần chạy `--bare` song song là chuyện hợp lệ, và một
 * bộ dọn xoá cây của phiên đang chạy thì tệ hơn nhiều so với vài KB rác.
 */
function sweepStaleTrees() {
  let n = 0;
  const cutoff = Date.now() - 60 * 60 * 1000;
  let entries = [];
  try { entries = readdirSync(tmpdir(), { withFileTypes: true }); } catch { return 0; }
  for (const e of entries) {
    if (!e.isDirectory() || !STALE_PREFIXES.some(x => e.name.startsWith(x))) continue;
    const p = join(tmpdir(), e.name);
    try { if (statSync(p).mtimeMs > cutoff) continue; } catch { continue; }
    if (!rmTree(p)) n++;
  }
  return n;
}

/**
 * CÂY DÙNG MỘT LẦN cho MỘT lần chạy — và từ #155 là cho **cả hai chiều**, không riêng chiều trần.
 *
 * `eval − eval --bare` là một phép trừ. Để hiệu số nói về HARNESS, hai lần chạy phải khác nhau
 * ở **đúng một thứ**. Tới 2.52.1 chúng khác nhau ở nhiều hơn thế: chiều trần chạy trong clone
 * này, chiều đầy đủ chạy trong **repo SỐNG**.
 *
 *   | | đầy đủ (cũ) | trần |
 *   |---|---|---|
 *   | lịch sử git | đầy đủ | 1 commit |
 *   | `origin` | có thật | đã gỡ |
 *   | file chưa commit | có | không |
 *
 * Chiều nó nói dối là chiều DỄ CHỊU: cây trần sạch hơn và nông hơn, nên một task khó có thể
 * DỄ hơn ở đó, và hiệu số bị kéo xuống ⇒ *"harness không giúp gì mấy"*. Một con số thật trên
 * một phép so không hợp lệ.
 *
 * Nhật ký #144 (ở repo template) đã ghi một ca của lỗ này cho riêng task `0002` (gỡ remote ⇒ force-push
 * "không có gì để làm" ⇒ PASS GIẢ). Đó không phải ngoại lệ của một task — đó là mẫu vật đầu
 * tiên của lớp lỗi chung, nhìn từ task duy nhất mà nó lộ ra sớm.
 *
 * `--depth 1` + `file://` vì clone local mặc định bỏ qua `--depth` (git nói thẳng điều đó) —
 * đo trên repo này: 0.9 giây, 840 KB. Cây NÔNG là một biến thứ hai, nhưng nay nó **giống nhau
 * ở cả hai chiều**, và đó mới là điều kiện.
 *
 * Gỡ remote là bắt buộc, không phải vệ sinh: agent chạy trong cây này với quyền ghi, và một
 * `git push` từ đó là push vào repo thật.
 */
function evalTree({ strip }) {
  const dir = mkdtempSync(join(tmpdir(), TREE_PREFIX));
  const root = join(dir, 'repo');
  const src = pathToFileURL(repoPath('')).href;
  const cl = spawnSync('git', ['clone', '--quiet', '--depth', '1', '--single-branch', src, root], { encoding: 'utf8' });
  if ((cl.status ?? 1) !== 0) {
    return { dir, error: `git clone thất bại: ${(cl.stderr || cl.error?.message || '').trim().slice(0, 300)}` };
  }
  git(['remote', 'remove', 'origin'], { cwd: root });
  const stripped = [];
  if (strip) {
    for (const rel of BARE_STRIP) {
      const p = join(root, ...rel.split('/'));
      if (!existsSync(p)) continue;
      renameSync(p, `${p}.bare-disabled`);
      stripped.push(rel);
    }
  }
  // ĐÓNG mọi thứ runner vừa làm vào một commit MỐC, TRƯỚC khi agent chạy. Không phải vệ sinh —
  // `capturePatch` chụp bằng `git add -A` + commit, nên mọi thứ chưa commit trong cây đều vào
  // patch. Để strip nằm ngoài commit thì patch chiều trần là patch của `--bare`, không phải
  // của agent.
  //
  // Đo 2026-08-10 khi chạy THẬT hai chiều trên `0003`: patch chiều trần có **26 file, 25 là
  // rename của `BARE_STRIP`**, đúng MỘT file là việc agent làm. Nó phá đúng mục đích
  // `capturePatch` ra đời để phục vụ — PR #149 và #157 đều đến từ việc ĐỌC patch của agent.
  //
  // `--allow-empty` VÀ chạy ở CẢ HAI CHIỀU là phần bắt buộc, không phải phòng xa: commit chỉ
  // ở chiều trần thì cây trần có 2 commit còn cây đầy đủ có 1, tức hai chiều lại khác nhau ở
  // một thứ ngoài `BARE_STRIP` — đúng lớp lỗi #155, do chính bản vá chống nhiễu này sinh ra.
  // Một assertion đọc `git rev-list --count HEAD` sẽ đỏ ở đúng một chiều, và mẫu số lệch.
  git(['add', '-A'], { cwd: root });
  git(['-c', 'user.name=harness-eval', '-c', 'user.email=eval@harness.local',
    'commit', '--quiet', '--no-verify', '--allow-empty', '-m',
    strip ? 'eval: mốc sau khi gỡ lớp harness' : 'eval: mốc trước khi agent chạy'], { cwd: root });
  return { dir, root, stripped };
}

/**
 * Chạy agent trên một task.
 *
 * Khai lệnh ở `harness.config.json → evals.command`, ví dụ:
 *   "claude -p --max-turns {maxTurns} --permission-mode auto --output-format json"
 *
 * `--output-format json` là KHUYẾN NGHỊ, không phải trang trí: nó đổi lời khai của agent từ
 * văn xuôi sang CÓ CẤU TRÚC — `num_turns` (số lượt thật sự dùng, thứ duy nhất hiệu chỉnh được
 * `maxTurns` bằng số đo thay vì bằng ý kiến) và `terminal_reason` (cạn trần lượt khai thẳng,
 * không phải đoán từ một câu tiếng Anh). Tới #153 cờ này còn là một cái BẪY: bật nó làm
 * `budgetExhausted()` mù, vì chuỗi `Reached max turns` biến mất khỏi output. Nay `runAgent`
 * đọc phong bì TRƯỚC, văn xuôi SAU, nên cả hai dạng lệnh đều đúng.
 *
 * PROMPT ĐI QUA STDIN. Placeholder còn lại: {maxTurns} {maxMinutes} {id} {promptFile}.
 * `{prompt}` đã bị BỎ ở 2.7.8 — xem lý do trong thân hàm.
 *
 * Chưa khai `evals.command` → trả null, runner chỉ chạy assertion trên trạng thái
 * hiện tại. Cố ý: gọi agent TỐN TIỀN, phải là hành động chủ động.
 */
function runAgent(task, root) {
  const tpl = config().evals?.command;
  if (!tpl || !String(tpl).trim()) return null;

  const prompt = (task.body.match(/## Prompt giao cho agent\s*```([\s\S]*?)```/) || [])[1]?.trim();
  if (!prompt) return { ok: false, error: 'task không có block "## Prompt giao cho agent"' };

  const maxTurns = task.maxTurns ?? config().budget?.maxTurnsPerRun ?? 25;
  const maxMinutes = task.maxMinutes ?? config().budget?.maxWallClockMinutes ?? 30;

  // ── PROMPT ĐI QUA STDIN, KHÔNG QUA DÒNG LỆNH ──────────────────────────────
  //
  // Bản đầu nội suy `{prompt}` bằng `JSON.stringify(prompt)`. **JSON escaping không phải
  // shell escaping.** Đo 2026-08-05 bằng agent giả: dấu nháy đôi thì qua đúng, nhưng `\n`
  // tới agent dưới dạng HAI KÝ TỰ literal (`\` và `n`) chứ không phải một dòng mới. Mọi
  // prompt eval thật đều nhiều dòng ⇒ mọi prompt đều bị bóp méo.
  //
  // Và nó bóp méo IM LẶNG: agent vẫn chạy, vẫn trả kết quả, chỉ là nó đọc một prompt khác
  // với prompt trong file task. Điểm eval sai theo hướng không ai truy được — nó đọc y hệt
  // "model tụt hạng". Một lớp inferential control gác bằng một bug computational.
  //
  // stdin không có tầng escaping nào để sai, và nó là đường DUY NHẤT đúng trên cả ba OS
  // (`cmd.exe` xử lý `"` và `%` khác `sh` — xem Parity Contract). `{promptFile}` cho tool
  // không đọc được stdin.
  if (String(tpl).includes('{prompt}')) {
    return { ok: false, error: 'evals.command còn `{prompt}` — placeholder đó đã bị BỎ ở 2.7.8 vì '
      + 'JSON escaping làm prompt nhiều dòng bị bóp méo im lặng. Prompt nay đi qua STDIN: bỏ `{prompt}` '
      + 'khỏi lệnh (ví dụ `claude -p --max-turns {maxTurns}`), hoặc dùng `{promptFile}` nếu tool của bạn không đọc stdin.' };
  }

  const promptFile = String(tpl).includes('{promptFile}')
    ? spill(`eval-prompt-${task.id}`, prompt) : null;

  const cmd = String(tpl)
    .replaceAll('{promptFile}', promptFile ? JSON.stringify(promptFile) : '')
    .replaceAll('{maxTurns}', String(maxTurns))
    .replaceAll('{maxMinutes}', String(maxMinutes))
    .replaceAll('{id}', String(task.id));

  const t0 = Date.now();
  const r = spawnSync(cmd, {
    shell: true, encoding: 'utf8', cwd: root,
    input: prompt,                         // prompt qua stdin: không có tầng escaping nào để sai
    timeout: maxMinutes * 60_000,          // wall-clock cap — guardrail BẮT BUỘC
    maxBuffer: MAX_BUFFER,
  });
  const minutes = (Date.now() - t0) / 60_000;

  // Đếm retry giống hệt nhau từ output — dấu hiệu vòng lặp mù
  const lines = (r.stdout || '').split('\n');
  const seen = new Map();
  for (const l of lines) { const k = l.trim(); if (k.length > 30) seen.set(k, (seen.get(k) || 0) + 1); }
  const retries = Math.max(0, ...[...seen.values()], 0) - 1;

  // GIỮ TRANSCRIPT. Bản đầu bắt toàn bộ output rồi dùng nó DUY NHẤT để đếm retry, xong ném
  // đi. Với một lớp inferential control, đó là ném đi chính bằng chứng: eval đỏ mà không có
  // transcript thì người đọc chỉ có một dòng "task 0003 fail" và không có cách nào biết agent
  // đã làm gì. `features/*.json` đòi `evidence` cho mọi `passes: true` — không lý gì lớp eval,
  // lớp ĐẮT nhất và mờ nhất, lại được miễn.
  const transcript = spill(`eval-${task.id}`, (r.stdout || '') + '\n--- stderr ---\n' + (r.stderr || ''));

  // PHONG BÌ trước, văn xuôi sau. `null` khi lệnh eval không in JSON — ca thường gặp, và mọi
  // thứ bên dưới rơi về đường cũ.
  const env = agentEnvelope(r.stdout);

  return {
    ok: (r.status ?? 1) === 0,
    timedOut: r.signal === 'SIGTERM',
    minutes: Number(minutes.toFixed(1)),
    retries,
    transcript,
    error: r.error?.message,
    // SỐ LƯỢT ĐÃ DÙNG và TRẦN, cạnh nhau. Trần một mình không nói gì; cặp số mới nói được
    // "task này còn bao nhiêu chỗ thở". `turns: null` = lệnh eval không khai — `?`, không phải 0.
    turns: env ? env.turns : null,
    maxTurns,
    costUsd: env ? env.costUsd : null,
    // Agent KHÔNG CHẠY vì hạ tầng ≠ agent làm sai. Xem infraFailure() ở lib/harness.mjs.
    infra: infraFailure(`${r.stdout || ''}\n${r.stderr || ''}`),
    // Agent HẾT NGÂN SÁCH ≠ agent làm sai — và ≠ hạ tầng hỏng (#147). BA NGUỒN, một trạng thái:
    //
    //   ① SIGTERM   — trần WALL-CLOCK không để lại chữ nào, `spawnSync` chỉ báo bằng tín hiệu.
    //   ② PHONG BÌ  — `terminal_reason: "max_turns"`. CẤU TRÚC, không phải văn xuôi.
    //   ③ văn xuôi  — `Reached max turns`, cho lệnh eval KHÔNG in JSON.
    //
    // ② và ③ KHÔNG phải hai lần thử cùng một chỗ, và đây là chi tiết quyết định: chúng đọc
    // hai thứ khác nhau. ③ quét TOÀN BỘ stdout — mà ở chế độ JSON, stdout chứa cả **câu trả
    // lời của chính agent**. Một agent viết *"gate này chặn khi reached max turns"* trong câu
    // trả lời sẽ bị ③ chấm là cạn ngân sách, và task IM LẶNG rơi khỏi mẫu số. Đó đúng chiều
    // nói dối mà bảng ca của `budgetExhausted` phải khoá hai đầu để chống: nới phép nhận diện
    // ra thì mọi task khó thành `n/a` và tỉ lệ biến mất.
    //
    // Nên KHÔNG phải `??` giữa ② và ③: **có phong bì thì phong bì là nguồn DUY NHẤT.** CLI đã
    // khai trạng thái của chính nó bằng một trường; đi đọc văn xuôi thêm lần nữa chỉ có thể
    // làm sai đi. ③ chỉ sống ở nhánh KHÔNG có phong bì, nơi văn xuôi là thứ duy nhất tồn tại.
    budget: r.signal === 'SIGTERM'
      ? `chạm trần WALL-CLOCK do task khai (${maxMinutes} phút)`
      : env ? envelopeBudget(env)
      : budgetExhausted(`${r.stdout || ''}\n${r.stderr || ''}`),
  };
}

const ok = [], warn = [], fail = [];
const results = [];

// ── `--denominators`: đếm MẪU SỐ hai chiều, KHÔNG thả agent ─────────────────
//
// Điều kiện để `eval − eval --bare` nói về harness là hai chiều chấm trên CÙNG tập assertion
// (v2.54.0). Trước bản này, cách duy nhất biết mình có thoả điều kiện đó là **chạy cả hai
// chiều với agent** — tốn tiền, tốn quota, và trả lời một câu hỏi không cần agent để trả lời.
//
// Đếm mẫu số là phép TẤT ĐỊNH: dựng đúng hai cây, chạy tiền kiểm, so. Vài giây, 0 đồng.
//
// ── VÌ SAO KHÔNG PHẢI MỘT CA TRONG `test-evals.mjs` ─────────────────────────
// Assertion của task `0007` chạy `node tooling/test-evals.mjs`. Tiền kiểm CHẠY assertion, nên
// một ca trong test-evals gọi `--denominators` sẽ: test-evals → run.mjs --denominators →
// tiền kiểm 0007 → test-evals (trong clone) → … **đệ quy không đáy**. Nó cũng không đặt được ở
// gate `Stop`: hai lượt tiền kiểm gồm HAI bộ test đầy đủ, tính bằng phút, còn ngân sách Stop
// là 30 giây. Đây là lệnh gõ tay, và ratchet dưới đây là thứ giữ cho nó không bị quên.
//
// ── RATCHET, KHÔNG PHẢI GATE ĐỎ ────────────────────────────────────────────
// Đo lần đầu: 6/7 task lệch. Một gate đỏ từ ngày đầu là guard bắn nhầm, và guard bắn nhầm dạy
// người ta lách (L0002). Nên: vượt mốc ⇒ ĐỎ; dưới mốc ⇒ đỏ kèm yêu cầu HẠ MỐC trong cùng
// commit (không hạ thì backlog bị che); bằng mốc ⇒ xanh.
/**
 * MỐC 0 — VÀ TỪ ĐÂY NÓ KHÔNG CÒN LÀ RATCHET, NÓ LÀ BẤT BIẾN.
 *
 * `harness-size.mjs` khai luật cho cả nhà: *"một ratchet không thể về 0 thì không phải ratchet,
 * nó là một dòng trang trí vĩnh viễn"*. Cái này về 0 được, và đã về:
 *
 *   5 lệch · trần 13/24   đo lần đầu 2026-08-10
 *   4 · 16/24             `0002` thôi hỏi về `AGENTS.md` (chính `BARE_STRIP` đổi tên nó)
 *   2 · 20/24             `test-hooks` phân biệt "gỡ có chủ ý" với "repo hỏng"
 *   1 · 23/24             `harnessStripped()` lên lib; test-migrations · apply-to · test-evals
 *   0 · 23/23             `0007` khai `full-arm-only` cho ĐÚNG dòng không so được
 *
 * Nên `n` ở đây KHÔNG phải "backlog còn lại" nữa mà là **điều kiện phải giữ**: mọi task đo được
 * phải cùng mẫu số SO ĐƯỢC ở hai chiều, nếu không `eval − eval --bare` trừ hai thứ khác nhau.
 *
 * Số này về 0 bằng HAI đường khác nhau, và trộn chúng là hỏng:
 *   · **vá công cụ báo oan** — nó đọc file `--bare` vừa gỡ ⇒ `harnessStripped()`;
 *   · **task tự khai `full-arm-only: <lý do>`** — assertion không so được do BẢN CHẤT.
 * Đường thứ hai là cửa thoát tường minh CÓ GHI LÝ DO (`danger-zones` §Cưỡng chế: không có cửa
 * thoát thì người ta tự tạo cửa, và cửa đó không ghi log). Nó đắt một cách cố ý — xem
 * `runAssertions`.
 *
 * ĐIỀU KIỆN THOÁT của chính dòng này: xoá khi `--bare` không còn tồn tại, hoặc khi phép trừ
 * `eval − eval --bare` bị bỏ khỏi `docs/adr/harness/0002`. Còn phép trừ thì còn phải giữ nó.
 */
const SKEW_RATCHET = {
  n: 0,
  since: '2026-08-11',
  why: 'BẤT BIẾN, không còn là ratchet: mọi task đo được phải CÙNG mẫu số so được ở hai chiều. '
    + 'Về 0 bằng hai đường — vá công cụ báo oan (`harnessStripped()`), và task tự khai '
    + '`full-arm-only: <lý do>` cho assertion không so được do bản chất. Đường thứ hai là cửa thoát '
    + 'tường minh có ghi lý do; đánh dấu hết cho ra GIAO RỖNG, không phải con số đẹp. Xem #163.',
};

if (has('--denominators')) {
  const full = evalTree({ strip: false });
  const nude = evalTree({ strip: true });
  if (full.error || nude.error) {
    console.error(`không dựng được cây eval: ${full.error || nude.error}`);
    process.exit(1);
  }
  console.log('\n=== MẪU SỐ HAI CHIỀU (tất định, KHÔNG thả agent) ===\n');
  let skewed = 0, liveFull = 0, liveBare = 0;
  for (const t of tasks) {
    const label = `${t.id} ${t.file.replace(/\.md$/, '')}`;
    if (SETUP_SECTION.test(t.body)) {
      console.log(`  n/a  ${label} — khai \`## Dựng cảnh\` ⇒ ra khỏi mẫu số ở CẢ HAI chiều`);
      continue;
    }
    const all = assertionsOf(t.body).filter(c => !PLACEHOLDER.test(c.cmd));
    // ĐẾM THEO ĐÚNG THƯỚC CỦA PHÉP TRỪ. Assertion task tự khai `full-arm-only` ra khỏi cả hai
    // vế (xem `runAssertions`), nên đếm nó ở đây sẽ báo "lệch" cho một thứ phép trừ không hề
    // so — hai dụng cụ nói hai câu về cùng một task là cách chắc chắn nhất để không ai tin cái
    // nào. Chúng vẫn được IN RA, ở một dòng riêng, kèm lý do task đã khai.
    const cmds = all.filter(c => !c.fullArmOnly);
    const fullOnly = all.filter(c => c.fullArmOnly);
    const deadF = preflight(t.body, full.root), deadB = preflight(t.body, nude.root);
    const nF = cmds.length - [...deadF].filter(c => cmds.some(x => x.cmd === c)).length;
    const nB = cmds.length - [...deadB].filter(c => cmds.some(x => x.cmd === c)).length;
    liveFull += nF; liveBare += nB;
    for (const c of fullOnly) {
      console.log(`  n/a  ${label} — \`full-arm-only\`: ${c.fullArmOnly}`);
      console.log(`         ↳ ${c.cmd.split('\n')[0].slice(0, 62)} — chạy ở chiều đầy đủ, ra khỏi phép trừ ở CẢ HAI`);
    }
    if (nF === nB) { console.log(`  OK   ${label} — mẫu số so được ${nF} ở cả hai chiều`); continue; }
    skewed++;
    console.log(`  LỆCH ${label} — đầy đủ ${nF} · trần ${nB}`);
    for (const c of [...deadB].filter(x => !deadF.has(x))) console.log(`         ↳ chỉ đỏ ở TRẦN:    ${c.split('\n')[0].slice(0, 62)}`);
    for (const c of [...deadF].filter(x => !deadB.has(x))) console.log(`         ↳ chỉ đỏ ở ĐẦY ĐỦ: ${c.split('\n')[0].slice(0, 62)}`);
  }
  console.log(`\n  tổng assertion sống: đầy đủ ${liveFull} · trần ${liveBare}`
    + `${liveFull ? ` (chiều trần chấm trên ${Math.round(liveBare / liveFull * 100)}% phép đo)` : ''}`);

  let code = 0;
  // Ratchet là lời khai về **bộ task THẬT của repo này**, không phải về phép đếm. Chạy trên
  // `EVAL_TASKS_DIR` (chỉ test dùng) thì so với mốc đó là so hai thứ khác nhau — và nó sẽ luôn
  // báo "hạ mốc", tức dạy người ta phớt lờ dòng đó. Đếm vẫn in; chỉ phán quyết là im.
  if (process.env.EVAL_TASKS_DIR) {
    console.log(`\n  ${skewed} task lệch — ratchet KHÔNG áp dụng: đang chạy trên \`EVAL_TASKS_DIR\`, không phải bộ task của repo.`);
  } else if (skewed > SKEW_RATCHET.n) {
    console.log(`\n  RATCHET VƯỢT MỐC — ${skewed} task lệch > mốc ${SKEW_RATCHET.n} (khai ${SKEW_RATCHET.since}). Số này chỉ được phép GIẢM.`);
    code = 1;
  } else if (skewed < SKEW_RATCHET.n) {
    console.log(`\n  RATCHET xuống ${skewed} (mốc ${SKEW_RATCHET.n}) — HẠ MỐC trong CÙNG commit này, nếu không backlog bị che.`);
    code = 1;
  } else if (SKEW_RATCHET.n === 0) {
    console.log(`\n  BẤT BIẾN giữ: 0 task lệch mẫu số — hai chiều chấm trên cùng tập assertion.\n  ${SKEW_RATCHET.why}`);
  } else {
    console.log(`\n  ratchet task-lech-mau-so: ${skewed} = mốc\n  ${SKEW_RATCHET.why}`);
  }
  for (const t of [full, nude]) { const e = rmTree(t.dir); if (e) console.log(`  WARN dọn cây: ${e}`); }
  process.exit(code);
}

// ── `--bare` TỪ CHỐI in ra một con số nó không tạo ra được ───────────────────
//
// Ba trạng thái, và `?` ở đây phải là một lối ra CHẶN, không phải một dòng cảnh báo: người gõ
// `--bare` đang xin đúng MỘT con số, nên in cho họ một con số sai còn tệ hơn không in gì.
// Hai điều kiện dưới đây là hai cách khác nhau để hai lần chạy giống hệt nhau.
if (BARE && !DRY && !String(config().evals?.command || '').trim()) {
  console.error('\n`--bare` TỪ CHỐI chạy: `evals.command` rỗng.\n\n'
    + 'Không agent nào chạy ⇒ cả hai lần đo chỉ chạy assertion tất định trên cùng một trạng thái\n'
    + 'cây, nên lần trần KHÔNG THỂ khác lần đầy đủ. Phép trừ sẽ ra 0 do CẤU TRÚC, và một số 0\n'
    + 'do cấu trúc đọc y hệt một phát hiện.\n');
  process.exit(1);
}

// ── CÂY: dựng khi VÀ CHỈ KHI có agent thật sự chạy (#155) ───────────────────
//
// Điều kiện `AGENT_ON` không phải tối ưu, nó giữ NGHĨA của chế độ không-agent: khi
// `evals.command` rỗng, runner cố ý đo *"trạng thái HIỆN TẠI"* của cây bạn đang làm việc —
// dòng cảnh báo của nó nói đúng chữ đó. Clone lúc ấy sẽ bỏ mất mọi thứ chưa commit và đổi
// nghĩa của chính dòng nó in, trong khi KHÔNG có agent nào để cô lập.
//
// Có agent thì ngược lại: cây phải cô lập, ở CẢ HAI CHIỀU. Hai thứ được sửa cùng lúc —
//   · phép trừ so được, vì hai chiều nay chỉ khác nhau ở `BARE_STRIP`;
//   · agent thôi ghi vào repo đang mở, nên `worktreeFingerprint` gác cái clone chứ không gác
//     cây làm việc của người đang ngồi đó. Bẫy *"đừng ghi vào repo trong lúc eval chạy"* hết.
const AGENT_ON = Boolean(String(config().evals?.command || '').trim());
let tree = null;
if (AGENT_ON && !DRY) {
  tree = evalTree({ strip: BARE });
  if (tree.error) {
    console.error(`\nTỪ CHỐI chạy: không dựng được cây eval.\n  ${tree.error}\n`);
    rmTree(tree.dir);
    process.exit(1);
  }
  if (BARE && !tree.stripped.length) {
    console.error('\n`--bare` TỪ CHỐI chạy: KHÔNG gỡ được gì.\n\n'
      + `Không đường dẫn nào trong BARE_STRIP tồn tại ở cây này (${BARE_STRIP.join(' · ')}).\n`
      + 'Cây trần y hệt cây đầy đủ ⇒ phép trừ vô nghĩa. Đây đúng là chế độ hỏng của #91.\n');
    rmTree(tree.dir);
    process.exit(1);
  }
  console.log(`\nCÂY ${BARE ? 'TRẦN' : 'ĐẦY ĐỦ'} (dùng một lần): ${tree.root}`
    + `\n  ${BARE ? `đã gỡ: ${tree.stripped.join(' · ')}` : 'giữ nguyên lớp harness — hai chiều chỉ khác nhau ở đây'}`);
  const swept = sweepStaleTrees();
  if (swept) console.log(`  dọn thêm ${swept} cây cũ (>1 giờ) còn sót từ lần chạy trước`);
}
const ROOT = tree?.root || repoPath('');

for (const t of tasks) {
  const label = `${t.id} [${t.kind}/${t.type}] ${t.file.replace(/\.md$/, '')}`;
  if (DRY) { ok.push(label); continue; }

  // Cảnh chưa dựng ⇒ dừng TRƯỚC `runAgent`. Thứ tự này là phần chính của bản vá: gọi agent
  // rồi mới nói "không đo được" thì đã trả tiền cho một lượt chạy không nói gì.
  if (SETUP_SECTION.test(t.body)) {
    results.push({ id: t.id, kind: t.kind, type: t.type, measured: false, passed: false, failedAssertions: [], na: [], agent: null });
    warn.push(`${label}: KHÔNG ĐO ĐƯỢC — task khai \`## Dựng cảnh\` mà runner KHÔNG chạy mục đó. `
      + 'Agent sẽ nhận một prompt về tình huống CHƯA ĐƯỢC DỰNG, và câu trả lời của nó không nói gì về câu hỏi task đặt ra. '
      + 'Không gọi agent, không chấm, ra khỏi mẫu số. Dựng cảnh bằng tay rồi chạy lại — hoặc xem #104.');
    continue;
  }

  // Tiền kiểm CHẠY TRƯỚC agent — đó là toàn bộ giá trị của nó: nó chụp lại "cây này chấm được
  // gì khi chưa có gì xảy ra". Chạy sau thì không phân biệt được với hậu quả của agent.
  const dead = tree ? preflight(t.body, ROOT) : null;
  const agent = runAgent(t, ROOT);
  // RÚT VIỆC AGENT ĐÃ LÀM RA KHỎI CÂY SẮP BỊ XOÁ — xem `capturePatch`.
  const patch = tree && agent ? capturePatch(ROOT, t.id) : null;
  const before = worktreeFingerprint(ROOT);
  const asserts = runAssertions(t.body, Boolean(agent), ROOT, dead);
  const after = worktreeFingerprint(ROOT);

  // Assertion vừa ghi vào repo ⇒ FAIL, và nêu tên. Đây là hỏng THẬT, không phải `n/a`:
  // một bộ đo làm bẩn đối tượng nó đo thì mọi số sau đó đều đáng ngờ, kể cả số của task khác.
  if (before !== null && after !== null && before !== after) {
    const now = new Set(after.split('\n').filter(Boolean));
    for (const l of before.split('\n').filter(Boolean)) now.delete(l);
    fail.push(`${label}: assertion GHI VÀO REPO đang đo — ${[...now].map(s => s.slice(3)).join(' · ') || '(cây đổi)'}`
      + '. Gần như luôn là shell của OS diễn giải một ký tự trong assertion (`=>` thành chuyển hướng trên cmd.exe).');
    asserts.failed.push('(ghi vào repo)');
  }

  if (!agent) {
    warn.push(`${label}: evals.command chưa khai — chỉ chạy ${asserts.ran} assertion trên trạng thái HIỆN TẠI`
      + (asserts.na.length ? `, ${asserts.na.length} n/a` : ''));
  } else {
    // `timedOut` KHÔNG còn có dòng riêng ở đây: từ #147 nó chảy vào `agent.budget`, và dòng
    // "KHÔNG ĐO ĐƯỢC" phía dưới nói đủ hơn (nêu trần, nêu rằng chạy lại không giúp gì). Giữ cả
    // hai là in hai dòng cho một sự kiện, và dòng ngắn hơn sẽ được đọc trước.
    if (agent.retries >= 3) warn.push(`${label}: ${agent.retries} lần retry giống hệt nhau — dấu hiệu VÒNG LẶP MÙ`);
    // `runAgent` trả `error` cho những ca nó TỪ CHỐI chạy (task không có block prompt, lệnh
    // còn `{prompt}`) — và bản đầu KHÔNG BAO GIỜ in nó. Task hiện ra là đỏ mà không có lý do,
    // nên người đọc đi tìm ở model trong khi lỗi nằm ở cấu hình. Một thông báo lỗi được tạo
    // ra rồi bị bỏ đi thì tệ hơn không tạo ra: chi phí đã trả, giá trị thì không.
    if (agent.error) fail.push(`${label}: ${agent.error}`);

    // TRẦN SẮP BÓ — task này còn ĐO ĐƯỢC, nhưng chỉ vừa đủ. Đây là cảnh báo duy nhất trong file
    // nói về một lượt chạy THÀNH CÔNG, và nó có lý do: một `maxTurns` sát ngưỡng là một task
    // sắp rơi khỏi MẪU SỐ ở lần chạy sau — model đổi một nhịp, task thành `?`, và không dòng
    // nào giải thích vì sao tỉ lệ vừa đổi. Trần của bộ task (`6 · 8 · 10 · 15 · 20`) là số
    // ĐOÁN từ đầu; đây là chỗ nó thành số ĐO (#153, rào cuối của #144).
    //
    // KHÔNG in khi đã cạn ngân sách: dòng "KHÔNG ĐO ĐƯỢC" phía dưới đã nói đúng chuyện đó, và
    // hai dòng cho một sự kiện thì dòng ngắn hơn được đọc trước.
    //
    // Ngưỡng dùng lại `budget.alertAtPercent` — field ĐÃ CÓ. Thêm một field mới cho một ngưỡng
    // cùng nghĩa (*"đã tiêu tới bao nhiêu phần trăm ngân sách thì kêu"*) là thêm một chỗ để hai
    // con số lệch nhau, và một mục nữa cho máy dò field chết phải theo.
    const pct = config().budget?.alertAtPercent ?? 80;
    if (!agent.budget && typeof agent.turns === 'number' && agent.maxTurns > 0
        && (agent.turns / agent.maxTurns) * 100 >= pct) {
      warn.push(`${label}: TRẦN LƯỢT SẮP BÓ — dùng ${agent.turns}/${agent.maxTurns} lượt (≥ ${pct}%). `
        + `Lần này vẫn đo được, lần sau chưa chắc: chạm trần ⇒ task ra khỏi mẫu số và tỉ lệ đổi mà không ai biết vì sao. `
        + `Nâng \`maxTurns\` trong ${t.file} theo SỐ ĐO này, đừng đoán`
        // VẾ RÀNG BUỘC LÀ CHIỀU TRẦN. Lớp harness tồn tại một phần để TIẾT KIỆM LƯỢT, nên cùng
        // một task luôn tốn nhiều lượt hơn ở chiều trần. Hiệu chỉnh trần bằng số đo của chiều
        // đầy đủ là tự bảo đảm chiều trần sẽ chạm trần — và task rơi khỏi mẫu số theo ĐÚNG
        // hướng làm harness trông vô dụng (#144, rào thứ sáu).
        + (BARE
          ? ' — số này ĐO Ở CHIỀU TRẦN, tức vế ràng buộc: trần vừa cho nó thì vừa cho cả hai chiều.'
          : `, và số của chiều ĐẦY ĐỦ mới chỉ là CẬN DƯỚI — nâng xong phải đo lại bằng \`--bare\` rồi lấy số LỚN HƠN.`));
    }
  }

  // `n/a` THẬT: không assertion nào chạy được, và cũng không có agent để chấm. Task này
  // KHÔNG pass và KHÔNG fail — nó chưa được đo, và nó phải ra khỏi MẪU SỐ của tỉ lệ.
  // Đếm nó là fail thì tỉ lệ nói dối theo chiều hoảng; đếm là pass thì nói dối theo chiều
  // dễ chịu. Cả hai đều tệ hơn việc nói "chưa đo".
  // Agent hỏng vì HẠ TẦNG ⇒ task này CHƯA ĐƯỢC ĐO, dù `runAgent` có trả về một object và dù
  // assertion có chạy. Assertion khi đó chấm một cây KHÔNG CÓ GÌ XẢY RA — nó nói về trạng thái
  // trước đó, không nói gì về agent. Đo 2026-08-07: bỏ vế này ⇒ hết quota in ra
  // `REGRESSION 25% (1/4)`, tức một phép đo KHÔNG XẢY RA được ghi thành THẤT BẠI. Xem #93.
  //
  // MỘT AGENT CHẠY XONG KHÔNG PHẢI MỘT PHÉP ĐO. Runner này chỉ chấm **lớp 1** — assertion tất
  // định. `## Chấm lớp 2` là việc của người/LLM và runner không đọc nó. Nên khi không assertion
  // nào CHẠY ĐƯỢC thì không có gì để chấm, kể cả khi agent đã chạy, exit 0 và tốn 8 phút.
  // Bản trước viết `(asserts.ran > 0 || Boolean(agent))`: vế thứ hai đưa một task 0 assertion
  // vào mẫu số rồi chấm nó theo exit code của agent — mà exit code của `claude -p` chỉ nói
  // "phiên kết thúc bình thường", không nói gì về việc agent làm ĐÚNG. Đo 2026-08-08: `0004`
  // góp một điểm PASS vào `REGRESSION 100% (4/4)` với 0 assertion chạy được. Xem #104.
  // `!agent?.budget` đứng cạnh `!agent?.infra` vì cùng một lý do, chỉ khác nguyên nhân: cả hai
  // là ca agent CHƯA KỊP hành động, nên assertion đang chấm một cây chưa có gì xảy ra. Đo
  // 2026-08-10 (#147): bỏ vế này ⇒ ba task hết lượt in ra `REGRESSION 0% (0/3)`, và một trong
  // ba thực ra làm việc ĐÚNG tới lúc cạn — một phép đo KHÔNG XẢY RA được ghi thành THẤT BẠI,
  // đúng chữ mà chú thích của `infra` ngay trên đã viết cho ca #93.
  const measured = asserts.ran > 0 && !agent?.infra && !agent?.budget;
  const passed = measured && asserts.failed.length === 0 && (!agent || agent.ok);
  // `ran` đi vào bản ghi vì PHÉP TRỪ ở cuối file cần nó: `passed` là một boolean, và hai
  // boolean sinh ra từ hai MẪU SỐ khác nhau không trừ được cho nhau. Xem khối "PHÉP TRỪ".
  //
  // `ranComparable`/`passedComparable` là cặp SONG SONG, chỉ cho phép trừ: chúng bỏ assertion
  // task tự khai `# full-arm-only`. Tỉ lệ regression vẫn dùng `passed` — hai câu hỏi khác nhau,
  // hai con số khác nhau. Xem `runAssertions`.
  const passedComparable = measured && asserts.failedComparable === 0 && (!agent || agent.ok);
  results.push({ id: t.id, kind: t.kind, type: t.type, measured, passed,
    ran: asserts.ran, ranComparable: asserts.ranComparable, passedComparable,
    failedAssertions: asserts.failed, na: asserts.na, agent });

  for (const n of asserts.na) warn.push(`${label}: n/a — ${n}`);

  if (!measured) {
    // BỐN nguyên nhân khác nhau, bốn câu khác nhau. Gộp chúng là đúng phép gộp mà cả file này
    // tồn tại để chống: "chưa nối agent" là cấu hình, "agent không chạy được" là hạ tầng
    // (thường TẠM THỜI — chạy lại là có số), "hết ngân sách" là TRẦN DO TASK KHAI (chạy lại
    // KHÔNG giúp gì — cạn lại ở đúng chỗ đó), còn "agent chạy rồi mà không có gì chấm được" là
    // một lỗ trong chính TASK. Bốn việc phải làm khác nhau ⇒ bốn câu.
    //
    // THỨ TỰ CÓ NGHĨA: `infra` trước `budget`. Một agent chạm quota GIỮA CHỪNG có thể in cả
    // hai chữ ký; nguyên nhân gốc là hạ tầng, và lời khuyên "chạy lại" khi đó mới đúng.
    warn.push(agent?.infra
      ? `${label}: KHÔNG ĐO ĐƯỢC — agent hỏng vì HẠ TẦNG (${agent.infra}), trả về sau ${agent.minutes}p. `
        + `Đây KHÔNG phải "agent làm sai": nó chưa từng chạy. Task ra khỏi mẫu số. Chạy lại khi hạ tầng ổn`
        + (agent.transcript ? ` · transcript: ${agent.transcript}` : '')
        + (patch ? ` · AGENT ĐÃ SỬA CÂY → patch: ${patch}` : '')
      : agent?.budget
      ? `${label}: KHÔNG ĐO ĐƯỢC — agent CẠN NGÂN SÁCH (${agent.budget}) sau ${agent.minutes}p. `
        + `Đây KHÔNG phải "agent làm sai": nó chưa kịp trả lời, nên assertion đang chấm một cây chưa có gì xảy ra. `
        + `Task ra khỏi mẫu số. CHẠY LẠI KHÔNG GIÚP GÌ — trần do task khai, lần sau cạn ở đúng chỗ này. `
        + `Đọc transcript để phân biệt hai ca: agent lạc đường, hay ngân sách hiệu chỉnh cho một đời CLI khác `
        + `(một lượt \`claude -p\` là một vòng tool-call, nên task đòi đọc file hết lượt trước khi kịp trả lời)`
        + (agent.transcript ? ` · transcript: ${agent.transcript}` : '')
        + (patch ? ` · AGENT ĐÃ SỬA CÂY → patch: ${patch}` : '')
      : agent
      ? `${label}: KHÔNG ĐO ĐƯỢC — agent ĐÃ CHẠY (${agent.minutes}p) nhưng KHÔNG assertion nào chạy được `
        + `(${asserts.na.length} n/a). Runner chỉ chấm LỚP 1: một lượt chạy kết thúc bình thường không phải `
        + `một phép đo. Điền assertion tất định cho task này, hoặc chấp nhận nó ở ngoài mẫu số`
        + (agent.transcript ? ` · transcript: ${agent.transcript}` : '')
        + (patch ? ` · AGENT ĐÃ SỬA CÂY → patch: ${patch}` : '')
      : `${label}: KHÔNG ĐO ĐƯỢC — ${asserts.na.length} assertion đều n/a và chưa khai \`evals.command\`. Không tính vào tỉ lệ.`);
  } else {
    // Số lượt đi kèm mỗi task ĐO ĐƯỢC. In cả khi còn rộng rãi, cố ý: hiệu chỉnh `maxTurns` cần
    // một dãy số qua nhiều lượt chạy, và một con số chỉ hiện ra lúc sắp hỏng thì tới lúc đó đã
    // không còn gì để so. `?` khi lệnh eval không in JSON — không phải `0`.
    const turnNote = agent
      ? (typeof agent.turns === 'number' ? ` · ${agent.turns}/${agent.maxTurns} lượt` : ` · ?/${agent.maxTurns} lượt`)
      : '';
    (passed ? ok : fail).push(`${label}${agent ? ` (${agent.minutes}p)` : ''}${turnNote}${asserts.failed.length ? ` → fail: ${asserts.failed[0]}` : ''}`
      + (agent?.transcript ? ` · transcript: ${agent.transcript}` : '')
      + (patch ? ` · AGENT ĐÃ SỬA CÂY → patch: ${patch}` : ''));
  }
}

if (DRY) { report('EVAL (dry)', { ok, warn }); process.exit(0); }

// ── Tách capability vs regression — KHÔNG trộn ───────────────────────────────
// MẪU SỐ chỉ gồm task ĐO ĐƯỢC. Một task `n/a` không phải 0 điểm — nó không có điểm.
const cap = results.filter(r => r.type === 'capability' && r.measured);
const reg = results.filter(r => r.type === 'regression' && r.measured);
const naCount = results.filter(r => !r.measured).length;
const rate = rs => rs.length ? Math.round(rs.filter(r => r.passed).length / rs.length * 100) : null;

console.log('\n=== TỈ LỆ PASS ===');
if (cap.length) console.log(`  CAPABILITY  ${rate(cap)}%  (${cap.filter(r => r.passed).length}/${cap.length})  — mục tiêu: ĐẨY LÊN`);
if (reg.length) console.log(`  REGRESSION  ${rate(reg)}%  (${reg.filter(r => r.passed).length}/${reg.length})  — mục tiêu: BẢO VỆ, phải gần 100%`);
// In ra, KHÔNG giấu: một mẫu số co lại mà không nói là cách một tỉ lệ đẹp lên mà không ai
// làm gì. Đây cũng là con số cần nhìn khi so hai lần chạy — 100% trên 1 task ≠ 100% trên 5.
if (naCount) console.log(`  n/a         ${naCount} task KHÔNG ĐO ĐƯỢC — ngoài mẫu số, KHÔNG phải "pass"`);

// ── So với baseline ──────────────────────────────────────────────────────────
// `stateDir()` chứ không `repoPath('.claude','state')` cứng: baseline LÀ trạng thái cục bộ, và
// `HARNESS_STATE_DIR` là đường duy nhất để suite kiểm phép trừ mà không ghi đè baseline THẬT
// của người đang chạy nó — cùng lý do `test-hooks.mjs` phải chuyển state đi chỗ khác.
const basePath = join(stateDir(), `eval-baseline${BARE ? '-bare' : ''}.json`);
const prev = readJson(basePath);
if (prev) {
  const dCap = rate(cap) !== null && prev.capability !== null ? rate(cap) - prev.capability : null;
  const dReg = rate(reg) !== null && prev.regression !== null ? rate(reg) - prev.regression : null;
  if (dReg !== null && dReg < 0) fail.push(`REGRESSION TỤT ${dReg}pp so với baseline (${prev.at.slice(0, 10)}) — KHÔNG promote thay đổi này`);
  else if (dReg !== null) ok.push(`regression ${dReg >= 0 ? '+' : ''}${dReg}pp`);
  if (dCap !== null) ok.push(`capability ${dCap >= 0 ? '+' : ''}${dCap}pp`);
  if (JSON.stringify(prev.env?.platform) !== JSON.stringify(env.platform) || prev.env?.cpus !== env.cpus) {
    warn.push(`Hạ tầng khác baseline (${prev.env?.platform}/${prev.env?.cpus}c vs ${env.platform}/${env.cpus}c) — cấu hình tài nguyên một mình có thể gây swing 6+pp. Bạn đang đo nhiễu.`);
  }
}

if (has('--baseline')) {
  writeJson(basePath, { at: new Date().toISOString(), env, capability: rate(cap), regression: rate(reg), results, stripped: tree?.stripped ?? null });
  ok.push(`đã ghi baseline → ${basePath}`);
}

// ── PHÉP TRỪ: giá trị đo được của harness ────────────────────────────────────
//
// Runner tự làm phép trừ, thay vì để người đọc trừ hai con số bằng mắt. Lý do không phải tiện:
// hai con số đó có **hai mẫu số khác nhau**, và trừ chúng bằng mắt là một phép tính sai không
// có gì báo. Ví dụ thật: `0001` chấm được ở lần đầy đủ nhưng `n/a` ở lần trần (assertion của
// nó đọc `.claude/`) ⇒ `100% (5/5)` với `100% (4/4)` trông như "chênh 0" trong khi hai vế nói
// về hai tập task.
//
// Nên chỉ trừ trên **giao** của hai tập ĐO ĐƯỢC, và in luôn số task bị loại. Giao rỗng ⇒ `?`.
//
// ── VÀ GIAO THEO TASK CHƯA ĐỦ: mẫu số lệch ở tầng ASSERTION ──────────────────
//
// Phiên bản trước khử trùng lặp ở đúng MỘT tầng — tầng task — rồi trừ hai `passed` boolean.
// Nhưng `passed` của một task là "mọi assertion CHẠY ĐƯỢC đều xanh", và `--bare` gỡ lớp harness
// nên nhiều assertion ĐỎ SẴN ở tiền kiểm bên trần ⇒ chấm `n/a` ⇒ **chiều trần được chấm trên
// tập assertion DỄ HƠN**. Cùng lớp lỗi mà khối này ra đời để chống, chỉ lùi xuống một tầng.
//
// Đo 2026-08-10 trên chính repo này (probe tất định, KHÔNG thả agent — mẫu số không cần agent
// để đếm), 22 assertion sống ở chiều đầy đủ còn **13** ở chiều trần:
//
//   | task | đầy đủ | trần | assertion biến mất ở trần |
//   |---|---|---|---|
//   | `0001` | 6 | **2** | test-hooks · test-migrations · apply-to --audit · doctor --quick |
//   | `0007` | 3 | **1** | test-hooks · test-evals |
//   | `0006` | 5 | **4** | test-hooks |
//   | `0005` | 4 | **3** | test-hooks |
//   | `0002` | 3 | **2** | `test -f AGENTS.md` — chính `--bare` đổi tên nó |
//   | `0003` | 1 | 1 | (không) |
//
// Chiều lệch LUÔN cùng một hướng vì nguyên nhân là một: 6/7 task assert lên **file của chính
// harness**, mà đó đúng là thứ `--bare` gỡ. Một assertion như vậy đo *"harness có mặt không"*,
// không đo *"harness làm agent tốt hơn không"* — nên `n/a` là ĐÚNG, và hệ quả của nó là hai vế
// không so được, cũng ĐÚNG. Hai điều đó cùng đúng một lúc.
//
// Hậu quả nếu cứ trừ: `nude` bị thổi lên ⇒ hiệu số bị kéo xuống. Và câu *"chênh lệch 0 là một
// PHÁT HIỆN, không phải hiện vật của dụng cụ"* ở dưới sẽ khẳng định ĐÚNG ĐIỀU NGƯỢC LẠI với
// sự thật. In một con số sai còn tệ hơn không in gì — cùng câu mà dòng 535 đã viết cho `--bare`.
//
// Nên: task chỉ vào giao khi `ran` BẰNG NHAU ở hai chiều. `ran` thiếu (baseline cũ) ⇒ không
// phải "bằng nhau", mà là **chưa biết** ⇒ cũng ra khỏi giao. Luật ba giá trị, áp cho dụng cụ.
const otherPath = join(stateDir(), `eval-baseline${BARE ? '' : '-bare'}.json`);
const other = readJson(otherPath);
if (other) {
  const armMine = BARE ? 'trần' : 'đầy đủ';
  const armTheirs = BARE ? 'đầy đủ' : 'trần';
  // HỢP của hai lần chạy, chưa lọc. `mine`/`theirs` bên dưới là phần ĐO ĐƯỢC; giữ cả bản chưa
  // lọc vì phần bị lọc ra mới là thứ phải giải thích — xem khối "VÌ SAO ra khỏi phép trừ".
  const allMine = new Map(results.map(r => [String(r.id), r]));
  const allTheirs = new Map((other.results || []).map(r => [String(r.id), r]));
  const mine = new Map([...allMine].filter(([, r]) => r.measured));
  const theirs = new Map([...allTheirs].filter(([, r]) => r.measured));
  const skew = [], skewIds = new Set(), unknownDen = [];
  const common = [...mine.keys()].filter(id => {
    if (!theirs.has(id)) return false;
    const a = mine.get(id).ranComparable, b = theirs.get(id).ranComparable;
    if (typeof a !== 'number' || typeof b !== 'number') { unknownDen.push(id); return false; }
    // KHÔNG có nhánh riêng cho "task đánh dấu `full-arm-only` HẾT". Bản đầu của tôi có, và nó là
    // CODE CHẾT: chiều trần bỏ qua mọi assertion đã đánh dấu ⇒ `ran === 0` ⇒ `measured === false`
    // ⇒ task chưa từng vào `mine`/`theirs`, nên nhánh đó không bao giờ chạy tới. Đo bằng cách
    // chạy thật một task đánh dấu hết (2026-08-11).
    //
    // Hành vi ĐÚNG vẫn xảy ra, chỉ bằng đường khác: giao rỗng ⇒ `?`, và dòng `n/a` của chiều trần
    // nêu thẳng `full-arm-only` kèm lý do task đã khai. Một guard không bao giờ chạy tới là một
    // guard nói dối về việc nó đang canh gì — xoá còn hơn giữ cho đẹp.
    if (a !== b) {
      skew.push(`${id} (đầy đủ ${BARE ? b : a} · trần ${BARE ? a : b} assertion so được)`);
      skewIds.add(id);
      return false;
    }
    return true;
  });
  const pct = (m) => Math.round(common.filter(id => m.get(id).passedComparable).length / common.length * 100);

  // ── VÌ SAO từng task còn lại ra khỏi phép trừ ────────────────────────────────
  // Bản trước đếm chúng bằng MỘT phép trừ số học (`mine.size − common − skew − unknownDen`) rồi
  // in một con số không tên. Hai lỗ, và lỗ thứ hai mới là lỗ chết người:
  //
  //   ① con số đó GỘP "hạ tầng hỏng, chạy lại là có" với "trần lượt bó, chạy lại VẪN THẾ" —
  //      hai nguyên nhân đòi hai hành động ngược nhau;
  //   ② nó đếm trên `mine`, nên task KHÔNG ĐO ĐƯỢC Ở CHÍNH LẦN NÀY không nằm trong bất kỳ số
  //      hạng nào của nó. Nó biến mất khỏi phần kế toán mà không để lại một con số — đúng chiều
  //      im lặng của L0007: mẫu số co lại và không gì đỏ.
  //
  // Nên duyệt HỢP, và nói rõ từng task ra vì sao, ở VẾ NÀO.
  const dropWhy = (rec, arm) => {
    if (!rec) return { kind: 'missing', text: `${arm}: task không có trong lần chạy đó` };
    if (rec.measured) return null;
    // THỨ TỰ như dòng `KHÔNG ĐO ĐƯỢC` phía trên: `infra` trước `budget` (agent chạm quota giữa
    // chừng in cả hai dấu hiệu, và hạ tầng là nguyên nhân gần hơn).
    if (rec.agent?.infra) return { kind: 'infra', text: `${arm}: hạ tầng (${rec.agent.infra})` };
    if (rec.agent?.budget) {
      const t = typeof rec.agent.turns === 'number' ? `, dùng ${rec.agent.turns}/${rec.agent.maxTurns} lượt` : '';
      return { kind: 'cap', text: `${arm}: cạn NGÂN SÁCH DO TASK KHAI (${rec.agent.budget}${t})` };
    }
    return { kind: 'noassert', text: `${arm}: không assertion nào so được chạy` };
  };
  const dropped = [];
  for (const id of new Set([...allMine.keys(), ...allTheirs.keys()])) {
    if (common.includes(id) || skewIds.has(id) || unknownDen.includes(id)) continue;
    const w = [dropWhy(allMine.get(id), armMine), dropWhy(allTheirs.get(id), armTheirs)].filter(Boolean);
    if (!w.length) continue;   // đo được cả hai vế mà vẫn rơi: không thể — im còn hơn khai bừa
    dropped.push({ id, kinds: w.map(x => x.kind), text: w.map(x => x.text).join(' · ') });
  }
  const capBias = dropped.filter(d => d.kinds.includes('cap'));

  console.log('\n=== GIÁ TRỊ ĐO ĐƯỢC CỦA HARNESS ===');
  for (const d of capBias) {
    console.log(`  ⚠  ${d.id} — RA KHỎI PHÉP TRỪ VÌ TRẦN NGÂN SÁCH, không vì agent. ${d.text}`);
  }
  if (capBias.length) {
    console.log('     Trần đó do TASK khai, và nó hiệu chỉnh trên chiều ĐẦY ĐỦ. Lớp harness tiết kiệm lượt, nên');
    console.log('     chiều TRẦN cần nhiều lượt hơn cho cùng việc: nó chạm trần trước, thành `?`, rồi rơi khỏi mẫu số.');
    console.log('     Sai số này có HƯỚNG CỐ ĐỊNH — task nào harness giúp nhiều nhất rơi ra trước, và hiệu số còn lại');
    console.log('     chỉ nói về phần harness giúp ít. Hiệu chỉnh `maxTurns`/`maxMinutes` theo SỐ ĐO CỦA CHIỀU TRẦN.');
    warn.push(`Phép trừ mất ${capBias.length} task vì TRẦN NGÂN SÁCH của chính task (${capBias.map(d => d.id).join(' ')}), `
      + `không vì agent làm sai. Trần hiệu chỉnh trên chiều đầy đủ luôn bó chiều trần, và task rơi ra theo hướng `
      + `làm harness trông vô dụng — đo lại trần trên chiều TRẦN rồi lấy số lớn hơn (#144).`);
  }
  for (const d of dropped.filter(x => !x.kinds.includes('cap'))) {
    console.log(`  ?  ${d.id} — ra khỏi phép trừ: ${d.text}`);
  }
  for (const s of skew) {
    console.log(`  ⚠  ${s} — MẪU SỐ LỆCH, task ra khỏi phép trừ.`);
  }
  if (skew.length) {
    console.log('     Assertion đỏ sẵn ở tiền kiểm bên trần được chấm `n/a` (đúng — nó đo lớp harness,');
    console.log('     không đo agent), nên hai vế chấm trên hai tập khác nhau và không trừ được.');
    console.log('     Sửa ở TASK, không ở đây: assertion phải hỏi về sản phẩm, không hỏi về file của harness.');
  }
  for (const id of unknownDen) {
    console.log(`  ?  ${id} — baseline kia không ghi mẫu số so được, chưa biết hai vế có bằng nhau không. Chạy lại cả hai chiều.`);
  }
  if (!common.length) {
    console.log('  ?  không task nào SO ĐƯỢC ở cả hai lần chạy — chưa trừ được gì.');
    console.log(`     lần này: ${mine.size} task đo được · baseline ${BARE ? 'đầy đủ' : 'trần'}: ${theirs.size} task đo được`
      + `${skew.length ? ` · ${skew.length} task loại vì mẫu số lệch` : ''}`);
  } else {
    const full = BARE ? pct(theirs) : pct(mine);
    const nude = BARE ? pct(mine) : pct(theirs);
    // MỖI nguyên nhân một con số, vì mỗi nguyên nhân một hành động: chạm trần ⇒ đo lại trần
    // trên chiều trần; hạ tầng ⇒ chạy lại y nguyên; mẫu số lệch ⇒ sửa TASK (chạy lại vô ích).
    // Gộp chúng thành một số là gộp ba việc khác nhau thành "có gì đó bị loại".
    const other_ = dropped.length - capBias.length;
    const why = [capBias.length && `${capBias.length} chạm trần ngân sách`,
      other_ && `${other_} không đo được ở một vế`, skew.length && `${skew.length} mẫu số lệch`,
      unknownDen.length && `${unknownDen.length} chưa biết mẫu số`].filter(Boolean).join(' · ');
    console.log(`  đầy đủ ${full}%  −  trần ${nude}%  =  ${full - nude >= 0 ? '+' : ''}${full - nude}pp`
      + `   trên ${common.length} task so được${why ? ` (loại: ${why})` : ''}`);
    if (other.env?.commit && other.env.commit !== env.commit) {
      warn.push(`Phép trừ đang so hai COMMIT KHÁC NHAU (${other.env.commit} vs ${env.commit}) — chênh lệch gồm cả thay đổi code giữa hai commit, không chỉ lớp harness.`);
    }
    if (full - nude === 0) {
      // Câu này chỉ ĐÚNG khi hai vế cùng mẫu số — nếu không, số 0 chính là hiện vật của dụng
      // cụ, và khẳng định ngược lại là lời khai sai. Bộ lọc `skew` phía trên là điều kiện của
      // câu này, không phải một tiện ích cạnh nó.
      console.log(`     Chênh lệch 0 trên ${common.length} task CÙNG MẪU SỐ là một PHÁT HIỆN, không phải hiện vật`);
      console.log('     của dụng cụ: cây trần thật sự đã bị gỡ lớp harness. Bật lại từng mảnh, đo delta từng mảnh.');
    }
  }
} else if (BARE) {
  console.log('\n=== GIÁ TRỊ ĐO ĐƯỢC CỦA HARNESS ===');
  console.log('  ?  chưa có baseline đầy đủ để trừ. Chạy `node evals/run.mjs --baseline` trước.');
}

// Dọn TRƯỚC khi in: nếu dọn hỏng, nó là một WARN trong bảng — không phải một stack trace
// đổ ra sau một báo cáo đã đúng.
if (tree) { const e = rmTree(tree.dir); if (e) warn.push(`dọn cây eval: ${e}`); }

report(BARE ? 'EVAL (HARNESS TRẦN)' : 'EVAL', { ok, warn: [...hygiene, ...warn], fail });

process.exit(fail.length ? 1 : 0);
