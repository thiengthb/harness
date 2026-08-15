#!/usr/bin/env node
/**
 * Test hook như test unit.  ĐÂY LÀ THỨ GẦN NHƯ KHÔNG AI LÀM.
 *
 * Hook là code có quyền chặn công việc của cả team — nhưng hầu như không ai test nó.
 * Bảng case dưới đây mất 30 phút để viết và ngăn được cả một lớp sự cố
 * "hook mới làm cả team đứng".
 *
 * Chạy trong CI trên cả 3 OS (.github/workflows/harness-parity.yml).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync, mkdtempSync, rmSync, readdirSync, cpSync, mkdirSync, unlinkSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { repoPath, report, exists, git, run, tmpdir, repoRole, readJson, TEST_TELEMETRY_DIR, TEST_STATE_DIR, TEST_RUN_ID, testRunPath, sweepStaleTestRuns, isRecordedRemoval, removedSkillNames, declaredCommands, tallyLines, inferIssue, devId, MECHANISM_PATHS, NOT_FOR_CONSUMER, fixlogKey, groupStillClosed, groupTracked, coordinationLayer, verificationCoverage, PACK_SCHEMA, packPending, packMaterial, budgetStatus, budgetPlan, dangerousCommand, infraFailure, budgetExhausted, agentEnvelope, envelopeBudget, mergeState, codeOnly, openTelemetryEntries, closeTelemetry, TELEMETRY_CLOSED, resolveSharedState, configCoverageOf, configCoverage, harnessStripped, flatCapoReading, releaseTagGap, handledGroups, mergeRitualStates, stuckRituals, GIT_DISCARD_WHOLE_TREE, backtickEvalHazard, backtickSubstitution, verdictLine, emitVerdict, codeScanDesync, frictionReading, slotCounters, backtickEvalHazardIn, contextLossPending, selfPraiseClaims, promoteDeclined, parseFlags, guardFlags, netNewLines, REMOVED_PATHS } from './lib/harness.mjs';
import { pickEventArray, pickFrontmatterKeys, normKey, nativeHookEvents, SCAN } from './native-surface.mjs';

const BLOCK = 2, OK = 0;

// Suite này spawn hook THẬT trong repo THẬT. Không chuyển đích telemetry thì mỗi lần
// chạy nó bơm hàng chục dòng `gate-fails` vào `.claude/telemetry/` — và những con số
// đó là đầu vào của `/harness-retro` bước 4, chỗ bắt buộc đề xuất CẮT BỎ. Bộ đếm bị
// chính test của nó làm nhiễu là bộ đếm nói dối, và nói dối về hướng nguy hiểm.
const TEST_ENV = {
  // MỌI CỬA THOÁT PHẢI ĐÓNG. Suite này assert LOGIC của hook, nên nó phải kiểm soát
  // môi trường, không được thừa hưởng môi trường của người đang chạy nó. Chính DRI là
  // người hay chạy suite nhất, và DRI là người duy nhất có `HARNESS_DRI=1` trong env —
  // nên nếu không xoá ở đây thì mọi case "agent KHÔNG tự sửa harness" chuyển sang xanh-giả
  // ĐÚNG TRÊN MÁY CỦA NGƯỜI DUY NHẤT sửa được hook. Case nào cần cửa thoát thì tự khai
  // trong `env` của nó (spread SAU TEST_ENV nên nó thắng).
  HARNESS_DRI: '',
  HARNESS_ALLOW_MIGRATION_EDIT: '',
  HARNESS_ALLOW_SKIPPED_GATES: '',
  // Cửa thoát của `declareFailMode`. Không xoá ở đây thì mọi ca "gác ném lỗi phải CHẶN"
  // chuyển sang xanh-giả trên máy của người đang phải mở cửa thoát đó để đi tiếp — tức là
  // đúng lúc suite cần nói thật nhất.
  HARNESS_FAIL_OPEN: '',
  // Hằng số ở `lib`, KHÔNG viết tay ở đây: `harness-doctor` ĐỌC đúng thư mục này như nguồn
  // bằng chứng thứ hai ("hook có chạy được không, hay crash im lặng?"). Hai chuỗi viết tay
  // lệch nhau thì doctor đọc thư mục rỗng và kết luận sai về hook vừa chạy xong.
  HARNESS_TELEMETRY_DIR: TEST_TELEMETRY_DIR,
  // Không có dòng này, mỗi lần chạy suite sẽ ăn mất thông báo `.claude/whats-new.md` của chính
  // bạn: cơ chế đó cố ý chỉ in MỘT LẦN cho mỗi version, nên "đã in rồi" là trạng thái
  // không lấy lại được. Test không được phép tiêu thụ trạng thái thật của người dùng.
  HARNESS_STATE_DIR: TEST_STATE_DIR,
};

// Mỗi lần chạy một thư mục riêng (#100) ⇒ phải có ai đó dọn, nếu không `tmpdir()` phình theo
// số lần chạy suite. Dọn Ở ĐÂY chứ không ở `finally`: doctor ĐỌC thư mục của con SAU KHI con
// thoát, nên con tự xoá lúc kết thúc sẽ giết đúng nguồn bằng chứng thứ hai.
sweepStaleTestRuns();

// ─────────────────────────────────────────────────────────────────────────────
// BỐN PHẦN BẮT BUỘC của một suite gác
//
// Đầu ra của một cái gác không phải một giá trị trả về — nó là BỘ BA
// (stdout, stderr, exit code), và nó chạy trên repo THẬT. Nên suite phải có đủ:
//
//   ① ĐƯỜNG IM LẶNG      với input nó phải bỏ qua: exit 0 VÀ KHÔNG IN GÌ.
//                        Một cái gác bình luận về mọi thứ sẽ bị tắt tiếng,
//                        và sau đó nó không gác gì.
//   ② ĐƯỜNG HÀNH ĐỘNG    khẳng định bằng THÔNG ĐIỆP, không chỉ exit code.
//                        "nó exit 2" KHÔNG phải bằng chứng nó nổ ĐÚNG LÝ DO.
//                        Mọi nhánh từ chối phải kiểm CẢ phần TỪ CHỐI LẪN phần GỢI Ý:
//                        gợi ý là thứ agent đọc để biết phải làm gì. Xoá dòng gợi ý
//                        đi mà suite vẫn xanh thì suite không bảo vệ được giá trị
//                        thật của hook.
//   ③ ≥1 MUTANT BỊ GIẾT  phá công cụ trong một BẢN SAO, chứng minh suite đỏ được.
//                        Một suite chưa từng thấy đỏ là suite chưa rõ giá trị.
//   ④ MUTANT VẪN CHẠY ĐƯỢC  xem header của `mutate()` — đây là cái bẫy.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Chạy một MUTANT của hook và trả { killed, ran, note }.
 *
 * `ran` là trường quan trọng, không phải `killed` — một mutant CHỈ CRASH chứng minh suite nhận
 * ra file hỏng, KHÔNG nói gì về hành vi mà mutant tuyên bố đã gỡ. Vá an toàn: `[].push(...)`
 * thay vì `if (false)`.
 *
 * ĐỌC `knowledge/lessons/0006-do-khong-duoc-khong-phai-la-khong.md` §"Ba cách một MUTANT SỐNG
 * SÓT" TRƯỚC KHI đi sửa bản vá: hai trong ba nguyên nhân KHÔNG nằm ở bản vá (mutant tương
 * đương · ca test neo rộng hơn thứ nó khoá), và mutant đầu tiên phải tiêu vào PHẠM VI chứ
 * không vào logic. Kiến thức đó ở MỘT chỗ, không ở đây — bản trước giữ nó cả ở đây lẫn trong
 * bài học, và tôi vẫn tự viết lại script mutation bốn lần mà không đọc chỗ nào (2026-08-11).
 *
 * Mutant chạy trên một BẢN SAO cạnh file gốc (cần cùng thư mục để import tương đối
 * `../../tooling/lib/harness.mjs` còn resolve được). File gốc KHÔNG BAO GIỜ bị ghi.
 */
/**
 * Tên file hook tạm. HÀM THUẦN để test được — cùng lý do `dangerousCommand()` được tách.
 *
 * Ba khối trong suite này ghi một bản ĐÃ SỬA của hook thật rồi chạy nó: `mutate()`, mutant
 * `observe.mjs`, và bảng chế-độ-hỏng. Cả ba BẮT BUỘC ghi vào `.claude/hooks/` — bản sửa phải
 * giải được import tương đối của hook gốc, nên không đẩy sang `tmpdir()` được. Thứ tách được
 * chỉ có CÁI TÊN, và vì thế nó phải đi qua đúng một chỗ.
 *
 * Trước #100 cả ba tên đều là hằng. Hai suite song song ⇒ bên này ghi đè file của bên kia, rồi
 * `finally { rmSync }` của bên này xoá file bên kia GIỮA LÚC nó đang spawn. Đo 2026-08-08, cả
 * hai kiểu hỏng cùng xuất hiện:
 *   · `exit=1`              — module vừa bị xoá, node không nạp được
 *   · `exit=2, mong đợi 1`  — chạy nhầm bản sửa của suite kia, assertion đọc nó là hành vi thật
 * Kiểu thứ hai nguy hiểm hơn: nó không giống lỗi hạ tầng, nó giống hook có bug.
 */
const hookTempName = (kind, runId) => `.${kind}.tmp.${runId}.mjs`;

function mutate(hookFile, apply, input, { mayCrash = false, env = null } = {}) {
  const src = repoPath('.claude', 'hooks', hookFile);
  if (!exists(src)) return { killed: false, ran: false, note: 'hook không tồn tại' };
  const original = readFileSync(src, 'utf8');
  const mutated = apply(original);
  if (mutated === original) {
    return { killed: false, ran: false, note: 'MUTANT KHÔNG ĐỔI GÌ — neo sai chuỗi. Đây là lỗi của TEST, không phải của hook.' };
  }
  const tmp = repoPath('.claude', 'hooks', hookTempName('mutant', TEST_RUN_ID));
  try {
    writeFileSync(tmp, mutated, 'utf8');
    // Giá trị env có thể là hàm — lười tính, GIỐNG bảng `cases`. Hook nào cần fixture dựng
    // trong lúc setup (protect-migrations cần một commit "đã merge") thì không thể khai giá
    // trị đó ở thời điểm mảng MUTANTS được viết ra.
    const extra = Object.fromEntries(
      Object.entries(env || {}).map(([k, v]) => [k, String(typeof v === 'function' ? v() : v)]),
    );
    const r = spawnSync(process.execPath, [tmp], {
      input: JSON.stringify(input), encoding: 'utf8', cwd: repoPath(''),
      env: { ...process.env, ...TEST_ENV, ...extra },
    });
    const status = r.status ?? -1;
    const ran = status === OK || status === BLOCK;     // chạy được, dù chặn hay không
    if (!ran && !mayCrash) {
      return { killed: false, ran: false, status,
        note: `MUTANT CHỈ CRASH (exit=${status}) — KHÔNG CHỨNG MINH GÌ. Đổi cách vá: dùng \`[].push(...)\` thay vì \`if (false)\`.` };
    }
    // Giết = mutant KHÔNG còn chặn nữa (tức là hành vi thật đã bị gỡ, và suite thấy).
    return { killed: status !== BLOCK, ran, status };
  } finally {
    try { rmSync(tmp, { force: true }); } catch {}
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dựng một commit "đã merge" TẤT ĐỊNH để test protect-migrations.
//
// Không dùng origin/main: CI clone nông thường không có nó, và test phụ thuộc
// trạng thái remote là test lúc xanh lúc đỏ. Ở đây ta tạo một commit lơ lửng
// (không ref, git gc sẽ dọn) chứa đúng một file db/migrations/0001_init.sql,
// rồi trỏ HARNESS_INTEGRATION_BRANCH vào nó. Không đụng index, không tạo ref.
// ─────────────────────────────────────────────────────────────────────────────
// Identity đặt qua -c: máy CI thường KHÔNG có user.email, và commit-tree sẽ fail.
const ID = ['-c', 'user.name=harness-test', '-c', 'user.email=harness@test.local'];

function mktree(entries) {
  const r = git(['mktree'], { input: entries.map(e => `${e.mode} ${e.type} ${e.sha}\t${e.name}`).join('\n') + '\n' });
  if (r.status !== 0) throw new Error(`git mktree: ${r.stderr}`);
  return r.stdout;
}

// Nhánh đang chạy — `protect-integration-branch` cần nó để dựng ca "đang đứng trên nhánh
// tích hợp" mà không phụ thuộc suite chạy ở nhánh nào.
// KHÔNG có fallback `|| 'main'`. HEAD detached thì KHÔNG có nhánh, và một fallback ở đây
// biến "không đo được" thành "đo được, giá trị main" — rồi hai ca dưới dựng trên một tiền đề
// sai và đỏ ở CI vì một lý do không liên quan gì tới thứ chúng khẳng định.
const CUR_BRANCH = git(['branch', '--show-current']).stdout.trim();
let MERGED_REF = null, setupErr = '';
try {
  const blob = git(['hash-object', '-w', '--stdin'], { input: '-- migration đã merge, dùng cho test\n' }).stdout;
  const tMig = mktree([{ mode: '100644', type: 'blob', sha: blob, name: '0001_init.sql' }]);
  const tDb = mktree([{ mode: '040000', type: 'tree', sha: tMig, name: 'migrations' }]);
  const tRoot = mktree([{ mode: '040000', type: 'tree', sha: tDb, name: 'db' }]);
  const c = git([...ID, 'commit-tree', tRoot, '-m', 'fixture: migration da merge']);
  if (c.status !== 0) throw new Error(`git commit-tree: ${c.stderr}`);
  MERGED_REF = c.stdout;
} catch (e) { setupErr = String(e.message || e); }

/**
 * Guard theo ĐƯỜNG DẪN phải được assert trên một `paths` DỰNG SẴN, không phải trên config
 * thật của repo đang chạy suite. `tooling/setup.mjs` thu hẹp `paths.migrations` về đúng thư
 * mục migration có thật của project (ví dụ `prisma/migrations/**`) — sau đó
 * `db/migrations/0001_init.sql` không còn khớp, hook không chặn, và suite ĐỎ ở mọi project
 * đã cấu hình ĐÚNG. Tức là: làm việc số 1 khi áp template sẽ làm test của harness đỏ.
 *
 * Lần thứ tư lớp lỗi này nổ (knowledge/lessons/0003). Cơ chế sửa đã có sẵn từ trước —
 * `HARNESS_CONFIG` — chỉ là các case này chưa được nối vào nó.
 */
const GUARD_CFG = { HARNESS_CONFIG: () => repoPath('tooling', 'fixtures', 'config-guard-paths.json') };

const cases = [
  // ── DCG ────────────────────────────────────────────────────────────────────
  ['dcg.mjs', { tool_input: { command: 'git push --force origin main' } }, BLOCK, 'force push bị chặn', null, /force-with-lease/],
  ['dcg.mjs', { tool_input: { command: 'git push -f' } }, BLOCK, 'force push dạng -f bị chặn'],
  ['dcg.mjs', { tool_input: { command: 'git push --force-with-lease' } }, OK, 'force-with-lease ĐƯỢC PHÉP (biến thể an toàn)'],
  ['dcg.mjs', { tool_input: { command: 'git reset --hard HEAD~1' } }, BLOCK, 'reset --hard bị chặn'],
  ['dcg.mjs', { tool_input: { command: 'git clean -fd' } }, BLOCK, 'git clean -fd bị chặn'],
  ['dcg.mjs', { tool_input: { command: 'rm -rf /' } }, BLOCK, 'rm -rf / bị chặn'],
  ['dcg.mjs', { tool_input: { command: 'rm -rf ./build/tmp' } }, OK, 'rm -rf đường dẫn hẹp được phép'],
  ['dcg.mjs', { tool_input: { command: 'DROP TABLE users;' } }, BLOCK, 'DROP TABLE bị chặn'],
  ['dcg.mjs', { tool_input: { command: 'terraform apply -auto-approve' } }, BLOCK, 'apply không review plan bị chặn'],
  ['dcg.mjs', { tool_input: { command: 'git status && git log --oneline -5' } }, OK, 'lệnh git thường được phép'],

  // ── Secrets ────────────────────────────────────────────────────────────────
  ['block-secrets.mjs', { tool_input: { file_path: '.env' } }, BLOCK, 'ghi .env bị chặn'],
  ['block-secrets.mjs', { tool_input: { file_path: '.env.production' } }, BLOCK, 'ghi .env.* bị chặn'],
  ['block-secrets.mjs', { tool_input: { file_path: 'certs/server.pem' } }, BLOCK, 'ghi .pem bị chặn'],
  ['block-secrets.mjs', { tool_input: { file_path: 'src/a.ts', content: 'const k = "sk-abcdefghijklmnopqrstuvwxyz012345"' } }, BLOCK, 'secret trong nội dung bị chặn'], // harness-allow-secret
  ['block-secrets.mjs', { tool_input: { file_path: 'src/a.ts', content: 'const k = process.env.API_KEY' } }, OK, 'đọc từ env được phép'],
  // Hai pattern này TỪNG chỉ có ở hook, không có ở pre-commit (xem SECRET_PATTERNS trong
  // lib). Chuỗi bị GHÉP ở runtime là cố ý: `block-secrets` KHÔNG honor marker
  // `harness-allow-secret`, nên một literal đủ hình dạng ở đây sẽ bị chính nó chặn lúc
  // ai đó sửa file này. Đừng "dọn" hai dòng này thành literal — bạn sẽ không ghi được file.
  ['block-secrets.mjs', { tool_input: { file_path: 'src/a.ts', content: 'const t = "' + 'xox' + 'b-0000000000-AAAAAAAAAAAA"' } }, BLOCK, 'Slack token trong nội dung bị chặn', null, /Slack token/],
  ['block-secrets.mjs', { tool_input: { file_path: 'src/a.ts', content: 'const t = "' + 'eyJ' + 'aaaaaaaaaaaaaaaaaaaaa.' + 'bbbbbbbbbbbbbbbbbbbbb.' + 'cc"' } }, BLOCK, 'JWT trong nội dung bị chặn', null, /JWT/],
  // `.env.example` PHẢI đi qua: tooling/init.mjs copy nó thành .env, .gitignore whitelist nó, và
  // paths.secrets mặc định phủ định nó bằng `!**/.env.example`. Trước đây case này assert BLOCK và
  // gọi đó là "cố ý" — nhưng nó làm pre-commit chặn commit ĐẦU TIÊN của mọi project mới.
  ['block-secrets.mjs', { tool_input: { file_path: '.env.example' } }, OK, '.env.example được phép (paths.secrets phủ định nó)'],
  ['block-secrets.mjs', { tool_input: { file_path: 'config/.env.example' } }, OK, '.env.example trong thư mục con cũng được phép'],

  // ── Generated ──────────────────────────────────────────────────────────────
  // Gợi ý "sửa NGUỒN rồi chạy {gen}" LÀ toàn bộ giá trị của hook này — không có nó,
  // agent bị chặn mà không biết đường nào đi tiếp. Khẳng định nó, đừng chỉ đếm exit.
  ['block-generated-edit.mjs', { tool_input: { file_path: 'packages/api-client/x.gen.ts' } }, BLOCK, 'sửa .gen.* bị chặn', GUARD_CFG, /Sửa nguồn sinh ra file này/],
  ['block-generated-edit.mjs', { tool_input: { file_path: 'packages/core/src/a.ts' } }, OK, 'file nguồn được phép', GUARD_CFG],
  // Case này TRƯỚC ĐÂY khẳng định "sửa migration bị chặn" — SAI, và test đã đóng
  // đinh cái sai đó. Migration hầu hết là viết tay; chặn hết là bắn nhầm hằng ngày.
  // Nay do protect-migrations.mjs lo, và chỉ khi migration ĐÃ MERGE.
  ['block-generated-edit.mjs', { tool_input: { file_path: 'db/migrations/001_init.sql' } }, OK, 'migration KHÔNG phải generated — được sửa', GUARD_CFG],

  // ── Migration đã merge ─────────────────────────────────────────────────────
  ['protect-migrations.mjs', { tool_input: { file_path: 'packages/core/src/a.ts' } }, OK, 'file thường không liên quan', GUARD_CFG],
  ['protect-migrations.mjs', { tool_input: { file_path: 'db/migrations/999_moi_toanh.sql' } }, OK, 'migration MỚI luôn được phép', GUARD_CFG],
  ['protect-migrations.mjs', { tool_input: { file_path: 'db/migrations/0001_init.sql' } }, BLOCK, 'migration ĐÃ MERGE bị chặn', { ...GUARD_CFG, HARNESS_INTEGRATION_BRANCH: () => MERGED_REF }, /migration MỚI|đã merge/],
  ['protect-migrations.mjs', { tool_input: { file_path: 'db/migrations/0001_init.sql' } }, OK, 'cửa thoát HARNESS_ALLOW_MIGRATION_EDIT mở được', { ...GUARD_CFG, HARNESS_INTEGRATION_BRANCH: () => MERGED_REF, HARNESS_ALLOW_MIGRATION_EDIT: '1' }, /Sửa migration đã merge với cửa thoát/],
  ['protect-migrations.mjs', { tool_input: { file_path: 'db/migrations/0001_init.sql' } }, OK, 'nhánh tích hợp không resolve được → FAIL OPEN, không chặn', { ...GUARD_CFG, HARNESS_INTEGRATION_BRANCH: 'nhanh-khong-ton-tai-2f9a' }],
  ['protect-migrations.mjs', { tool_input: null }, OK, 'input rác không làm crash'],

  // ── Harness ────────────────────────────────────────────────────────────────
  ['protect-harness.mjs', { tool_input: { file_path: '.claude/settings.json' } }, BLOCK, 'agent không tự sửa settings.json', null, /harness-propose|HARNESS_DRI/],
  ['protect-harness.mjs', { tool_input: { file_path: '.claude/hooks/dcg.mjs' } }, BLOCK, 'agent không tự sửa hook'],
  ['protect-harness.mjs', { tool_input: { file_path: 'AGENTS.md' } }, BLOCK, 'agent không tự sửa AGENTS.md'],
  ['protect-harness.mjs', { tool_input: { file_path: 'harness.config.json' } }, BLOCK, 'agent không tự sửa config'],
  // Cửa thoát DRI: nó là đường DUY NHẤT để bảo trì chính harness bằng agent, nên nó
  // phải mở được VÀ phải hét lên (im lặng = không audit được). Trước 2.0.0 không có
  // case nào cho nhánh này — tức là nhánh mà DRI dựa vào hoàn toàn không được kiểm.
  ['protect-harness.mjs', { tool_input: { file_path: '.claude/settings.json' } }, OK, 'cửa thoát DRI mở được và HÉT LÊN', { HARNESS_DRI: '1' }, /quyền DRI/],
  // Sự kiện vòng đời KHÔNG có `tool_input` — `ConfigChange` gửi file_path ở CẤP TRÊN.
  // Không có fallback trong toolFilePath(), lớp phòng thủ thứ hai này pass() im lặng.
  ['protect-harness.mjs', { hook_event_name: 'ConfigChange', source: 'project_settings', file_path: '.claude/settings.json' }, BLOCK, 'ConfigChange: file_path ở CẤP TRÊN vẫn bị chặn', null, /harness-propose|HARNESS_DRI/],
  ['protect-harness.mjs', { tool_input: { file_path: '.claude/learnings/2026-W31-ai.md' } }, OK, 'ĐỀ XUẤT được phép — đây là đường hợp pháp'],
  ['protect-harness.mjs', { tool_input: { file_path: 'docs/progress/ABC-1.md' } }, OK, 'nhật ký được phép'],
  ['protect-harness.mjs', { tool_input: { file_path: 'src/index.ts' } }, OK, 'code thường được phép'],

  // ── Feature files ──────────────────────────────────────────────────────────
  ['protect-feature-files.mjs', { tool_input: { file_path: 'features/_index.json' } }, BLOCK, '_index.json do DRI quản', null, /DRI|PR riêng/],
  ['protect-feature-files.mjs', { tool_input: { file_path: 'src/index.ts' } }, OK, 'ngoài features/ không đụng tới'],

  // ── Bảo vệ test (fixture: tooling/fixtures/example.test.js — 2 block, 3 assert) ──
  ['protect-tests.mjs',
    { tool_input: { file_path: 'tooling/fixtures/example.test.js', content: 'it("một", () => { expect(1).toBe(1); });' } },
    BLOCK, 'thu nhỏ test bị chặn (sửa test cho pass thay vì sửa code)', null, /harness-allow-test-shrink|thu nhỏ/i],
  ['protect-tests.mjs',
    { tool_input: { file_path: 'tooling/fixtures/example.test.js', content: 'describe("x",()=>{it("a",()=>{expect(1).toBe(1);expect(2).toBe(2);});it("b",()=>{expect(3).toBe(3);});it("c",()=>{expect(4).toBe(4);});});' } },
    OK, 'THÊM test luôn được phép'],
  ['protect-tests.mjs',
    { tool_input: { file_path: 'tooling/fixtures/example.test.js', content: '// harness-allow-test-shrink — test đã lỗi thời\nit("một", () => { expect(1).toBe(1); });' } },
    OK, 'thu nhỏ CÓ CHỦ Ý được phép qua marker', null, /Thu nhỏ test có chủ ý/],
  ['protect-tests.mjs',
    { tool_input: { file_path: 'src/a.ts', content: 'export const x = 1' } },
    OK, 'file không phải test thì bỏ qua'],
  ['protect-tests.mjs',
    { tool_input: { file_path: 'tooling/fixtures/khong-ton-tai.test.js', content: 'it("a",()=>{});' } },
    OK, 'file test MỚI luôn được phép'],

  // ── Hook KHÔNG chặn: phải chạy sạch, không bao giờ crash ───────────────────
  // Một hook crash sẽ chặn MỌI THỨ. Đây là test rẻ nhất và quan trọng nhất cho chúng.
  ['session-start.mjs', {}, OK, 'chạy được với input rỗng', null, /📍/],
  ['session-start.mjs', { source: 'startup' }, OK, 'chạy được với input thật', null, /📍/],
  // Hai case dưới assert LOGIC "lệnh chưa khai → bỏ qua", nên chúng phải chạy trên một config DỰNG
  // SẴN (fixtures/config-unconfigured.json), không phải trên config thật của project. Bám vào config
  // thật thì điền `commands` — việc SỐ 1 khi áp template — sẽ làm chính test suite này đỏ.
  // Gate bị BỎ QUA phải NÓI RA rằng nó bị bỏ qua. Đây là TRẠNG THÁI THỨ BA:
  // không phải pass, không phải fail — "harness không chạy". Một gate im lặng bỏ
  // qua đọc y hệt một gate đang xanh, và đó là cách một repo tưởng mình có gate.
  ['post-edit-lint.mjs', { tool_input: { file_path: 'a.ts' } }, OK, 'lintFix chưa khai → bỏ qua', { HARNESS_CONFIG: () => repoPath('tooling', 'fixtures', 'config-unconfigured.json') }],
  ['post-edit-lint.mjs', { tool_input: { file_path: 'assets/logo.png' } }, OK, 'file không lint được → bỏ qua'],
  ['post-edit-lint.mjs', { tool_input: { file_path: 'packages/x/y.gen.ts' } }, OK, 'file generated → bỏ qua', GUARD_CFG],
  ['post-edit-lint.mjs', {}, OK, 'không có file_path → bỏ qua'],
  // NHÁNH CHẶN — bốn ca trên đều đi vào `pass()`, nên tới 2.33.0 phần hook thật sự LÀM GÌ ĐÓ
  // chưa từng chạy trong suite. Fixture `config-lint-fails.json` trỏ `lintFix` tới một script
  // thất bại tất định; đó là đường duy nhất tới được nhánh này.
  //
  // Hợp đồng output ở ② biết SỰ KIỆN: đây là `PostToolUse`, nên nó KHÔNG bị đòi nói "BỊ CHẶN"
  // — file đã ghi xong rồi, câu đó sai sự thật. Nó phải mang `⛔` và một dòng gợi ý `→ `.
  ['post-edit-lint.mjs', { tool_input: { file_path: 'src/a.ts' } }, BLOCK, 'lint thất bại → dừng việc tiếp theo, và NÓI được làm gì',
    { HARNESS_CONFIG: () => repoPath('tooling', 'fixtures', 'config-lint-fails.json') }, /lint còn lỗi/],

  // ── observe.mjs — QUAN SÁT, không bao giờ chặn ở BẤT KỲ sự kiện nào ─────────
  // Nó nhận 3 sự kiện khác nhau trong MỘT file, nên cái phải khẳng định là: mỗi nhánh
  // exit 0, và nhánh THIẾT BỊ ĐO phải IM LẶNG (một thiết bị đo bình luận sẽ bị tắt tiếng).
  ['observe.mjs', { hook_event_name: 'InstructionsLoaded', load_reason: 'session_start', memory_type: 'Project', file_path: 'CLAUDE.md' }, OK, 'InstructionsLoaded: đo và IM LẶNG'],
  ['observe.mjs', { hook_event_name: 'StopFailure', error: 'rate_limit' }, OK, 'StopFailure (tiền): không chặn, không in (vendor bỏ qua output)'],
  ['observe.mjs', { hook_event_name: 'StopFailure', error: 'server_error' }, OK, 'StopFailure (kỹ thuật): không chặn, không in'],
  ['observe.mjs', { hook_event_name: 'SessionStart' }, OK, 'SessionStart: autoMemoryDirectory rỗng → im lặng'],
  ['observe.mjs', { hook_event_name: 'SessionStart' }, OK, 'autoMemoryDirectory trỏ vào CÂY REPO → HÉT LÊN', { HARNESS_CONFIG: () => repoPath('tooling', 'fixtures', 'config-automemory-in-repo.json') }, /trỏ vào CÂY REPO/],
  ['observe.mjs', { hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', error: 'exit 1' }, OK, 'PostToolUseFailure: ghi và IM LẶNG'],
  ['observe.mjs', { hook_event_name: 'Notification', notification_type: 'idle_prompt', message: 'waiting' }, OK, 'Notification: ghi và IM LẶNG'],
  ['observe.mjs', { hook_event_name: 'UserPromptExpansion', command_name: 'claim' }, OK, 'UserPromptExpansion: ghi và KHÔNG chặn expansion (vendor cho exit 2 chặn — ta không dùng)'],
  ['observe.mjs', { hook_event_name: 'SubagentStart', agent_type: 'evaluator', agent_id: 'a1' }, OK, 'SubagentStart: ghi và IM LẶNG'],
  ['observe.mjs', { hook_event_name: 'PermissionDenied', tool_name: 'Bash', reason: 'classifier' }, OK, 'PermissionDenied: ghi và IM LẶNG'],
  ['observe.mjs', { hook_event_name: 'PreCompact', trigger: 'auto' }, OK, 'PreCompact: ghi mốc và KHÔNG in gì (stdout ở đây thành CHỈ THỊ compaction)'],
  ['observe.mjs', { hook_event_name: 'SessionEnd', reason: 'clear' }, OK, 'SessionEnd: ghi mốc và IM LẶNG'],
  ['observe.mjs', { hook_event_name: 'TaskCompleted', task_id: 't1', task_subject: 'xong roi' }, OK, 'TaskCompleted: GHI SỐ, chưa lên đạn — vendor cho exit 2 chặn, ta cố ý không dùng'],
  ['observe.mjs', { hook_event_name: 'SuKienVendorMoiThem' }, OK, 'sự kiện KHÔNG nhận ra vẫn exit 0 — không bao giờ chặn'],
  ['observe.mjs', {}, OK, 'input rác không làm crash'],

  // Mọi hook phải sống sót với input rác — agent/harness có thể gửi bất cứ thứ gì
  ['dcg.mjs', { tool_input: null }, OK, 'input rác không làm crash'],
  ['block-secrets.mjs', { tool_input: { file_path: null } }, OK, 'input rác không làm crash'],
  ['block-generated-edit.mjs', {}, OK, 'input rỗng không làm crash'],
  ['protect-harness.mjs', { tool_input: {} }, OK, 'input rỗng không làm crash'],
  // ── protect-integration-branch — BẮN THEO HÀNH ĐỘNG, không đoán ý định ─────
  // "Ghi file đầu tiên trên nhánh tích hợp" là sự kiện TẤT ĐỊNH. Ba trạng thái, và cả ba
  // đều phải khoá: chặn khi đúng nhánh · im khi khác nhánh · cửa thoát mở được VÀ ghi sổ.
  // `HARNESS_INTEGRATION_BRANCH` trỏ vào chính nhánh đang chạy — cùng cửa mà
  // `protect-migrations` đã mở, vì cùng nhu cầu: test cần một ref tất định.
  // HAI ca dưới cần một NHÁNH ĐANG ĐỨNG. Trên CI, `actions/checkout` ở `pull_request` để HEAD
  // ở trạng thái DETACHED, nên `git branch --show-current` rỗng và hook `pass()` ngay ở dòng
  // đầu — đúng hành vi, nhưng ca không dựng được. Chúng chỉ nằm trong bảng khi CÓ nhánh; khi
  // không, khối n/a ngay dưới bảng NÓI RA điều đó thay vì im lặng bỏ qua.
  ...(CUR_BRANCH ? [
    ['protect-integration-branch.mjs', { tool_input: { file_path: 'tooling/x.mjs' } }, BLOCK,
      'sửa file khi đang ở nhánh tích hợp bị chặn', { HARNESS_INTEGRATION_BRANCH: () => CUR_BRANCH }, /nhánh tích hợp/],
    ['protect-integration-branch.mjs', { tool_input: { file_path: 'docs/x.md' } }, OK,
      'cửa thoát HARNESS_ALLOW_MAIN_EDIT mở được, và NÓI RA',
      { HARNESS_INTEGRATION_BRANCH: () => CUR_BRANCH, HARNESS_ALLOW_MAIN_EDIT: '1' }, /với cửa thoát/],
  ] : []),
  ['protect-integration-branch.mjs', { tool_input: { file_path: 'tooling/x.mjs' } }, OK,
    'ở nhánh KHÁC thì im lặng', { HARNESS_INTEGRATION_BRANCH: 'khong-phai-nhanh-nay' }],
  // File NGOÀI repo: auto-memory (`~/.claude/projects/*/memory/`) là ca thật, và chính guard
  // này chặn nó vài phút sau khi ship v2.37.0. Nhánh git không nói được gì về một file ngoài
  // repo, nên chặn nó là chặn đúng thứ guard không có thẩm quyền.
  ...(CUR_BRANCH ? [
    ['protect-integration-branch.mjs',
      { tool_input: { file_path: '/nha-cua-ai-do/.claude/projects/x/memory/ghi-chu.md' } }, OK,
      'file NGOÀI repo không bị gác, kể cả khi đang ở nhánh tích hợp',
      { HARNESS_INTEGRATION_BRANCH: () => CUR_BRANCH }],
  ] : []),
  ['protect-integration-branch.mjs', { tool_input: {} }, OK, 'không có file_path → bỏ qua'],

  ['protect-feature-files.mjs', { tool_input: { file_path: '' } }, OK, 'path rỗng không làm crash'],
  ['protect-tests.mjs', { tool_input: null }, OK, 'input rác không làm crash'],
];

const ok = [], fail = [];

// KHÔNG ĐO ĐƯỢC ≠ ĐÃ ĐO VÀ ĐẠT. Hai ca của `protect-integration-branch` cần một nhánh đang
// đứng; trên CI thì HEAD detached (`actions/checkout` ở `pull_request`) và chúng không dựng
// được. Đẩy chúng vào `ok` là biến một khoảng trống thành một dấu tick — đúng L0005, ở chiều
// PASS. Đẩy vào `fail` cũng sai: hành vi của hook ở detached HEAD là ĐÚNG (không có nhánh thì
// không có gì để chặn). Nên: một rổ thứ ba, in ra, và trừ khỏi mẫu số của sàn.
// Một DÒNG n/a có thể nói về NHIỀU ca ("3 ca cần một nhánh đang đứng"), nên số dòng không phải
// số ca — sàn cần số ca.
//
// Trước v2.42.1 hai con số đó nằm rời nhau và được cộng bằng BA cơ chế khác nhau: một hằng số
// `3` ở cuối file, một biến đếm tăng tay, và — ở chỗ thứ ba — KHÔNG GÌ CẢ. Ca thứ ba rơi khỏi
// tổng. Đó là `knowledge/lessons/L0005` nguyên bản, **bộ đếm đổ về phía dễ chịu**: thiếu một ca
// thì tổng NHỎ đi, mà tổng nhỏ chỉ đỏ khi chạm sàn — nên khe hở tự giấu mình đúng chừng nào sàn
// còn lỏng. Nó sống từ đó tới lúc sàn được siết lên đúng tổng thật, và khi đó CI đỏ cả ba OS.
//
// Cách chữa KHÔNG phải thêm một check canh `na.push()` trần — thử rồi, và check đó tự khớp với
// chú thích của chính nó. Cách chữa là bỏ hẳn con đường sai: thông điệp và SỐ CA đi chung một
// object, nên "khai n/a mà quên cộng vào sàn" không viết ra được nữa. Cùng lý do `block()` tự
// ghi sổ — chặn ở dạng cấu trúc rẻ hơn và bền hơn chặn ở dạng lời nhắc.
const naEntries = [];
const declareNa = (count, msg) => naEntries.push({ count, msg });

/**
 * CÂY ĐÃ BỊ GỠ LỚP HARNESS CÓ CHỦ Ý — và nó tự khai điều đó.
 *
 * `evals/run.mjs --bare` đổi tên `.claude/settings.json` → `.claude/settings.json.bare-disabled`
 * để đo `eval − eval --bare`. Trên cây đó, mọi check đọc `settings.json` hoặc `.claude/rules/`
 * đều đỏ — và thông điệp của chúng nói *"neo của check này đã trôi, sửa neo thay vì xoá check"*.
 * Câu đó ĐÚNG trong repo thật (ai đó vừa đổi tên một thứ) và **SAI** ở đây (không ai đổi tên gì;
 * file bị gỡ theo yêu cầu). Cùng lớp lỗi mà #155 và v2.54.0 đã dọn ở lớp eval: một thông điệp
 * đúng cho ca này gửi người đọc đi sai hướng ở ca kia.
 *
 * Hậu quả ĐO ĐƯỢC (`node evals/run.mjs --denominators`, 2026-08-11): `test-hooks` đỏ trên cây
 * trần ⇒ assertion `node tooling/test-hooks.mjs` bị chấm `n/a` ở chiều trần ⇒ **`0005`, `0006`,
 * `0007` lệch mẫu số** ⇒ ba task rơi khỏi phép trừ. Một dòng, ba task.
 *
 * `?` chứ không `PASS`: các check này KHÔNG chạy, và biến một khoảng trống thành dấu tick là
 * đúng L0005. `?` chứ không `FAIL`: chúng cũng không phát hiện ra điều gì.
 *
 * ĐIỀU KIỆN LÀ **BẰNG CHỨNG**, KHÔNG PHẢI SUY ĐOÁN. Neo vào hậu tố `.bare-disabled` — thứ chỉ
 * `evalTree()` tạo ra — chứ KHÔNG neo vào `!exists(settings.json)`. Khác biệt đó là toàn bộ giá
 * trị của bản vá: một `settings.json` **biến mất** trong repo thật vẫn phải ĐỎ TO, vì đó là repo
 * hỏng. Chỉ khi cái xác `.bare-disabled` nằm ngay cạnh thì sự vắng mặt mới là **cố ý**.
 */
const BARE_TREE = harnessStripped();

// NEO CỦA `BARE_TREE` LÀ THỨ DUY NHẤT GIỮ BẢN VÁ NÀY KHỎI THÀNH MỘT CỬA THOÁT.
//
// Neo vào `.bare-disabled` = "sự vắng mặt này CÓ NGƯỜI KHAI". Neo vào `!exists(settings.json)`
// = "thiếu file thì thôi bỏ qua" — tức mọi repo áp template mà mất `settings.json` sẽ được
// suite chấm XANH, đúng chiều SỬA QUÁ TAY của L0007, và không có triệu chứng nào.
//
// `codeOnly()` chứ không regex trần: khối chú thích ngay trên có chứa đúng chuỗi
// `!exists(settings.json)` như một phản ví dụ, và một phép quét đọc cả chú thích sẽ báo oan.
// Đây là lần thứ tư của lớp lỗi đó trong repo — xem `configCoverage` / `lib-import`.
//
// KHÔNG `blankStrings`: ở đây neo cần kiểm CHÍNH LÀ một string literal (`'…bare-disabled'`).
// Xoá chuỗi đi thì khai báo còn `exists(repoPath('', ''))` và ca này đỏ oan — đã xảy ra thật
// khi viết nó. `blankStrings` đúng cho ca đi tìm TÊN HÀM; sai cho ca đi tìm HẰNG CHUỖI.
{
  const libCode = codeOnly(readFileSync(repoPath('tooling', 'lib', 'harness.mjs'), 'utf8'));
  const body = libCode.match(/export function harnessStripped\(\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
  const suffix = libCode.match(/export const BARE_SUFFIX = '([^']*)'/)?.[1] ?? '';
  if (!body || !suffix) {
    fail.push(`harnessStripped${' '.repeat(13)} không tìm thấy \`harnessStripped()\`/\`BARE_SUFFIX\` trong lib — neo của ca này đã trôi, sửa neo thay vì xoá check`);
  } else if (suffix !== '.bare-disabled') {
    fail.push(`harnessStripped${' '.repeat(13)} \`BARE_SUFFIX\` = \`${suffix}\` — không còn khớp hậu tố \`evalTree()\` đóng lên file nó gỡ, phép dò cây trần thành vô hiệu im lặng`);
  } else if (!body.includes('BARE_SUFFIX') || !body.includes('exists(')) {
    fail.push(`harnessStripped${' '.repeat(13)} thân hàm KHÔNG còn hỏi \`exists(…BARE_SUFFIX)\`: \`${body.trim().slice(0, 70)}\` — `
      + 'nếu nó chuyển sang hỏi sự VẮNG MẶT thì đây là cửa thoát: repo mất `settings.json` được mọi suite chấm XANH, không triệu chứng');
  } else {
    ok.push(`harnessStripped${' '.repeat(13)} neo vào BẰNG CHỨNG (\`${suffix}\`), không vào sự vắng mặt — repo mất settings.json vẫn ĐỎ`);
  }
}
const naIfBare = (count, what) => {
  if (!BARE_TREE) return false;
  declareNa(count, `${what} — cây này bị GỠ lớp harness có chủ ý (\`.bare-disabled\` nằm cạnh). `
    + 'Check đọc `settings.json`/`.claude/rules` không chạy được ở đây: `?`, không phải PASS và không phải FAIL. '
    + 'Trong repo THẬT, cùng sự vắng mặt đó vẫn ĐỎ.');
  return true;
};

if (!CUR_BRANCH) {
  declareNa(3, 'protect-integration-branch: 3 ca cần một NHÁNH đang đứng — HEAD đang detached '
    + '(bình thường ở CI `pull_request`). Chạy suite ở máy để phủ chúng.');
}

// Setup hỏng = KHÔNG chạy được case "đã merge". Báo ĐỎ, không im lặng bỏ qua —
// một test bị skip âm thầm đọc y hệt một test đang xanh.
if (!MERGED_REF) fail.push(`SETUP: không dựng được commit fixture cho protect-migrations — ${setupErr || 'không rõ lý do'}`);

// SỰ KIỆN CỦA MỖI HOOK — đọc từ `.claude/settings.json`, KHÔNG chép tay.
//
// Hợp đồng output ở ② bên dưới đòi câu từ chối khác nhau theo sự kiện, nên nó cần biết hook
// nào chạy ở đâu. Một bản sao viết tay ở đây sẽ lệch im lặng ngay lần ai đó chuyển một hook
// sang sự kiện khác — và chuyển sự kiện là đúng thứ migration 008 tồn tại để phân phối.
//
// `ConfigChange` xếp cùng nhóm `PreToolUse`: nó cũng chặn TRƯỚC khi thay đổi có hiệu lực,
// nên "BỊ CHẶN" là câu đúng ở đó.
const preToolUseHooks = (() => {
  const hooks = readJson(repoPath('.claude', 'settings.json'))?.hooks ?? {};
  const out = new Set();
  for (const [event, groups] of Object.entries(hooks)) {
    if (event !== 'PreToolUse' && event !== 'ConfigChange') continue;
    for (const g of groups || []) for (const h of g.hooks || []) {
      const m = String(h.command || '').match(/hooks[/\\]([A-Za-z0-9_.-]+\.mjs)/);
      if (m) out.add(m[1]);
    }
  }
  return out;
})();
if (!preToolUseHooks.size && !naIfBare(1, 'settings.json: không bóc được hook PreToolUse nào')) {
  fail.push('settings.json: không bóc được hook nào của PreToolUse — neo của hợp đồng output đã trôi, sửa neo thay vì xoá check');
}

// Case: [hook, input, expect, label, env?, msg?]
//   msg   — RegExp khẳng định LÝ DO cụ thể. Bắt buộc ở những chỗ hai nhánh từ chối
//           khác nhau dễ bị nhầm lẫn cho nhau.
//   noisy — đánh dấu case OK được phép in ra (cửa thoát DRI phải hét lên).
for (const [hook, input, expect, label, env, msg] of cases) {
  const path = repoPath('.claude', 'hooks', hook);
  if (!exists(path)) { fail.push(`${hook}: KHÔNG TỒN TẠI`); continue; }

  // Giá trị env có thể là hàm — lười tính, vì fixture chỉ có sau bước setup.
  const extra = Object.fromEntries(
    Object.entries(env || {}).map(([k, v]) => [k, String(typeof v === 'function' ? v() : v)]),
  );

  const r = spawnSync(process.execPath, [path], {
    input: JSON.stringify(input), encoding: 'utf8', cwd: repoPath(''),
    env: { ...process.env, ...TEST_ENV, ...extra },
  });
  const status = r.status ?? -1;
  const err = (r.stderr ?? '').trim();
  const out = (r.stdout ?? '').trim();

  if (status !== expect) {
    fail.push(`${hook.padEnd(28)} ${label}  →  exit=${status}, mong đợi ${expect}${err ? `\n         stderr: ${err.split('\n')[0]}` : ''}`);
    continue;
  }

  // ② ĐƯỜNG HÀNH ĐỘNG — hợp đồng cho mọi nhánh từ chối.
  //    Kiểm CẢ phần TỪ CHỐI (nói sai ở đâu) LẪN phần GỢI Ý (làm gì bây giờ).
  //    Không có check này thì xoá dòng gợi ý của một hook đi mà cả suite vẫn xanh —
  //    và dòng gợi ý CHÍNH LÀ thứ agent đọc để biết phải làm gì, tức là toàn bộ
  //    giá trị của hook. Một hook chỉ nói "không" là một hook đẩy agent đi đoán.
  //
  //    HỢP ĐỒNG BIẾT SỰ KIỆN, không mã hoá một sự kiện thành một chuỗi ký tự.
  //    `PreToolUse` chặn TRƯỚC khi hành động xảy ra ⇒ "BỊ CHẶN" là câu đúng.
  //    `PostToolUse` chạy SAU khi file đã ghi ⇒ "BỊ CHẶN" là câu SAI SỰ THẬT; nó phải nói
  //    được rằng việc TIẾP THEO dừng, và `⛔` là dấu đó.
  //    Phần KHÔNG đổi theo sự kiện: dòng gợi ý `→ `. Mọi hook từ chối đều phải có nó.
  if (expect === BLOCK) {
    const pre = preToolUseHooks.has(hook);
    const mark = pre ? /BỊ CHẶN/ : /⛔/;
    if (!mark.test(err)) {
      fail.push(`${hook.padEnd(28)} ${label}  →  exit đúng nhưng KHÔNG mang dấu từ chối ${pre ? '`BỊ CHẶN`' : '`⛔`'} của sự kiện ${pre ? 'PreToolUse' : 'PostToolUse'}. Exit code đúng không phải bằng chứng nổ đúng lý do.`);
      continue;
    }
    if (!/\n\s*→ /.test(err)) {
      fail.push(`${hook.padEnd(28)} ${label}  →  từ chối mà KHÔNG có dòng gợi ý "→ ". Agent bị dừng mà không biết làm gì tiếp là agent sẽ đoán.`);
      continue;
    }
  }

  // ① ĐƯỜNG IM LẶNG — với input nó phải bỏ qua: exit 0 VÀ KHÔNG IN GÌ.
  //    Một cái gác bình luận về mọi thứ sẽ bị tắt tiếng, và sau đó nó không gác gì.
  //
  //    KHÔNG có cờ "được phép ồn". Một case OK muốn in thì phải KHAI `msg` và khớp.
  //    Lý do chọn thế: cửa thoát DRI *bắt buộc* phải hét lên — nếu chỉ cho phép nó
  //    ồn thì một cửa thoát im lặng vẫn xanh, và một cửa thoát im lặng là một
  //    cửa thoát không audit được. Khai `msg` biến "được phép in" thành "phải in
  //    ĐÚNG cái này".
  if (expect === OK && !msg && (err || out)) {
    fail.push(`${hook.padEnd(28)} ${label}  →  cho qua nhưng VẪN IN (mà không khai \`msg\`): ${(err || out).split('\n')[0].slice(0, 70)}`);
    continue;
  }

  if (msg && !msg.test(err + '\n' + out)) {
    fail.push(`${hook.padEnd(28)} ${label}  →  thông điệp không khớp ${msg}\n         nhận: ${(err || out).split('\n')[0]}`);
    continue;
  }

  ok.push(`${hook.padEnd(28)} ${label}`);
}

// Đếm ca gate bỏ qua theo VAI. Khai ở đây vì `skipped` được `let` ở gần cuối file: cộng vào nó
// từ trong khối bên dưới là ReferenceError (temporal dead zone), và nó chỉ nổ ở repo TIÊU THỤ.
let gateCaseSkipped = 0;

// ─── gates.mjs — cùng luật: code có quyền exit 2 thì phải có test ────────────
// Nó không nằm trong .claude/hooks/ nhưng nó CHẶN được lượt, nên nó chịu cùng
// hợp đồng. Ba nhánh dưới đây là toàn bộ hành vi fail-đóng của nó.
// PHẠM VI CỦA GÁC ĐỔI Ở 2.50.0 (#145), nên bảng này chạy trên HAI CÂY.
//
// Ở repo TEMPLATE, `commands` rỗng là trạng thái ĐÚNG và VĨNH VIỄN: `setup.mjs` TỪ CHỐI
// `--apply` ở đây với đúng lý do (*"ghi cấu hình thật vào đây sẽ biến placeholder của template
// thành cấu hình của MỘT project"*). Nên lời khuyên của gác — *"khai đủ lệnh"* — là **bất khả
// thi**, và một gác chỉ còn đường đi vòng là gác dạy người ta đi vòng.
//
// Cái giá đo được: `claude -p` ⇒ `unattended()` ⇒ MỌI lượt Stop exit 2 ⇒ Claude Code re-invoke
// ⇒ Stop lại đỏ, **không hội tụ**. Prompt tầm thường cũng chạm `max turns`.
//
// CA SỐ ④ LÀ CA QUAN TRỌNG NHẤT CỦA BẢNG: nó chứng minh bản vá **không làm yếu** gác — repo
// TIÊU THỤ (có `.claude/harness-manifest.json`) vẫn bị chặn y như cũ. Không có nó, một bản
// "đơn giản hoá" bỏ điều kiện `repoRole()` sẽ xanh, và cả lớp fail-đóng biến mất im lặng.
const UNCONF = () => repoPath('tooling', 'fixtures', 'config-unconfigured.json');
{
  // Cây TIÊU THỤ giả: `REPO_ROOT` suy từ vị trí `lib/harness.mjs`, nên copy `tooling/` sang
  // thư mục tạm là đủ để `gates.mjs` ở đó coi thư mục tạm là repo. Thêm `harness-manifest.json`
  // ⇒ `repoRole()` trả `consumer`. Cùng kỹ thuật khối `gen-clean` ngay dưới đây dùng.
  const consumer = join(tmpdir(), `harness-gate-consumer-${process.pid}`);
  try {
    rmSync(consumer, { recursive: true, force: true });
    cpSync(repoPath('tooling'), join(consumer, 'tooling'), { recursive: true });
    mkdirSync(join(consumer, '.claude'), { recursive: true });
    writeFileSync(join(consumer, '.claude', 'harness-manifest.json'),
      JSON.stringify({ $comment: 'FIXTURE của test gates trong tooling/test-hooks.mjs', templateVersion: '0.0.0-fixture' }, null, 2) + '\n', 'utf8');

    // Config cho ca ⑥: template ĐÃ khai đúng một lệnh, và `gates.stop` còn một gate không có
    // lệnh ⇒ `skipped = 1`. `node -e ""` cố ý vô hại và tất định trên cả ba OS.
    const oneCmd = join(tmpdir(), `harness-gate-onecmd-${process.pid}.json`);
    writeFileSync(oneCmd, JSON.stringify({
      $comment: 'FIXTURE của test gates trong tooling/test-hooks.mjs — TEMPLATE đã khai 1 lệnh',
      project: { id: 'fixture-gate-onecmd' },
      commands: { typecheck: 'node -e ""' },
      paths: {}, limits: {}, gates: { stop: ['typecheck', 'test'] },
      budget: {}, knowledge: {}, evals: { command: '' },
    }, null, 2) + '\n', 'utf8');

    // `root: null` nghĩa là CHÍNH repo đang chạy suite — nên vai của nó là biến, không phải hằng.
    // Ca ② khẳng định một kết quả CHỈ ĐÚNG khi vai đó là `template`: ở repo tiêu thụ, `gates.mjs`
    // fail-đóng (exit 2) đúng như thiết kế, nên ca này đỏ VĨNH VIỄN ở mọi project đã áp template —
    // đo được 2026-08-13 khi một repo tiêu thụ bắt kịp từ 2.13.0. Đây đúng là `knowledge/lessons/0003`
    // (self-test của template khẳng định thứ chỉ đúng trong template), lớp lỗi mà chính dòng RATCHET
    // ở cuối file này trích dẫn.
    //
    // Ba ca `root: null` còn lại KHÔNG có vấn đề đó, và lý do đáng ghi ra kẻo lần sau có người
    // "dọn cho đồng bộ": ① và ③ mong đợi OK ở CẢ HAI vai (cảnh báo, và cửa thoát chủ ý), ⑥ mong đợi
    // BLOCK ở cả hai. Chỉ ② phân biệt vai.
    // Cộng vào `gateCaseSkipped`, KHÔNG vào `skipped`: `skipped` được `let` ở gần cuối file, nên
    // chạm nó từ đây là ReferenceError (temporal dead zone) — và nó chỉ nổ ở repo TIÊU THỤ, vì ở
    // template nhánh này không chạy. Đúng lớp lỗi mà chính bản vá này đang sửa, chỉ ngược chiều.
    const templateOnly = repoRole() === 'template';
    if (!templateOnly) gateCaseSkipped += 1;

    const GATE_CASES = [
      // ① · ③ — repo NÀY, kết quả giống nhau ở cả hai vai.
      [null, { HARNESS_CONFIG: UNCONF() }, OK, 'phiên CÓ người + gate bỏ qua → cảnh báo, KHÔNG chặn', /BỎ QUA/],
      // ② — CHỈ ở template: repo tiêu thụ phải fail-đóng ở đây, và có ca ④ khẳng định đúng điều đó.
      ...(templateOnly
        ? [[null, { HARNESS_CONFIG: UNCONF(), CI: '1' }, OK, 'TEMPLATE + phiên không người → CHO QUA, và NÓI RA là không kiểm gì', /REPO TEMPLATE/]]
        : []),
      [null, { HARNESS_CONFIG: UNCONF(), CI: '1', HARNESS_ALLOW_SKIPPED_GATES: '1' }, OK, 'cửa thoát chủ ý mở được ở phiên không người', /BỎ QUA/],
      // ④ · ⑤ — cây TIÊU THỤ. Gác giữ nguyên sức mạnh ở đây.
      [consumer, { HARNESS_CONFIG: UNCONF(), CI: '1' }, BLOCK, 'TIÊU THỤ + phiên không người + gate bỏ qua → VẪN FAIL ĐÓNG', /KHÔNG có người ngồi xem/],
      [consumer, { HARNESS_CONFIG: UNCONF(), CI: '1', HARNESS_ALLOW_SKIPPED_GATES: '1' }, OK, 'cửa thoát vẫn mở được ở repo tiêu thụ', /BỎ QUA/],
      // ⑥ Template mà ĐÃ khai được một lệnh ⇒ nó khai được thêm ⇒ đây là THIẾU SÓT, không
      //    phải cấu trúc ⇒ VẪN CHẶN. Không có ca này, mutant bỏ điều kiện
      //    `declaredCommands().length === 0` sống sót và MỌI template thành miễn nhiễm — kể
      //    cả template cố tình bỏ gate. `gates.stop` ở đây KHÔNG có `gen-clean`: nó so
      //    `git diff` nên cây đang sửa dở sẽ làm ca này đỏ vì một lý do không liên quan.
      [null, { HARNESS_CONFIG: oneCmd, CI: '1' }, BLOCK, 'TEMPLATE đã khai 1 lệnh + còn gate bỏ qua → VẪN FAIL ĐÓNG', /KHÔNG có người ngồi xem/],
    ];
    for (const [root, env, expect, label, msg] of GATE_CASES) {
      const dir = root ?? repoPath('');
      const r = spawnSync(process.execPath, [join(dir, 'tooling', 'gates.mjs'), '--stage', 'stop'], {
        encoding: 'utf8', cwd: dir, env: { ...process.env, ...TEST_ENV, CI: '', ...env },
      });
      const status = r.status ?? -1;
      const both = (r.stdout ?? '') + '\n' + (r.stderr ?? '');
      if (status !== expect) fail.push(`gates.mjs ${label}  →  exit=${status}, mong đợi ${expect}`);
      else if (!msg.test(both)) fail.push(`gates.mjs ${label}  →  thông điệp không khớp ${msg}`);
      else ok.push(`gates.mjs${' '.repeat(19)} ${label}`);
    }
  } finally { rmSync(consumer, { recursive: true, force: true }); }
}

// ─── gen-clean: CHẨN ĐOÁN phải đúng, không chỉ MÀU phải đúng ─────────────────
//
// Gate này exit 2 được, nên theo luật của repo nó phải có test. Nhưng thứ đáng test không
// phải màu — mà là CÂU nó nói. Đo ở `sakubun`, HAI lần độc lập (fixlog 08-04, lên qua
// `upstream`): cây bẩn vì một đợt nâng harness nằm dở, rồi vì một session song song đang áp
// template. Cả hai lần gate nói *"bạn quên chạy gen"*, và cả hai lần người dùng đi tìm ở
// generator — chỗ không có gì sai. Một chẩn đoán sai đắt hơn không chẩn đoán.
//
// HỘP ĐEN trên một cây TỐI THIỂU, không phải trên repo này: `REPO_ROOT` suy ra từ vị trí của
// `lib/harness.mjs`, nên chỉ cần copy `tooling/` sang thư mục tạm là gates.mjs ở đó coi thư
// mục tạm là repo. Cách này còn cho phép làm cây BẨN thật mà không chạm repo thật.
{
  const work = join(tmpdir(), `harness-genclean-${process.pid}`);
  const gsh = (...a) => spawnSync('git', a, { cwd: work, encoding: 'utf8' });
  try {
    rmSync(work, { recursive: true, force: true });
    cpSync(repoPath('tooling'), join(work, 'tooling'), { recursive: true });
    writeFileSync(join(work, 'nguon.txt'), 'nguồn\n', 'utf8');
    writeFileSync(join(work, 'sinh-ra.txt'), 'output cũ\n', 'utf8');
    gsh('init', '-q', '.');
    gsh('config', 'user.email', 'test@harness'); gsh('config', 'user.name', 'harness test');
    gsh('add', '-A'); gsh('commit', '-q', '-m', 'nền');

    const cfg = (gen) => {
      const p = join(work, `cfg-${gen.length}.json`);
      writeFileSync(p, JSON.stringify({
        $comment: 'FIXTURE của test gen-clean trong tooling/test-hooks.mjs',
        project: { id: 'fixture-genclean', dri: '@fixture', integrationBranch: 'origin/main', issuePrefixes: ['FIX'], platforms: ['core'] },
        commands: { gen }, paths: { generated: ['sinh-ra.txt'], harness: ['tooling/**'] },
        limits: {}, gates: { stop: ['gen-clean'] }, budget: {}, knowledge: {}, evals: { command: '' },
      }, null, 2) + '\n', 'utf8');
      return p;
    };
    const runStop = (gen, extraEnv = {}) => {
      const r = spawnSync(process.execPath, [join(work, 'tooling', 'gates.mjs'), '--stage', 'stop'], {
        encoding: 'utf8', cwd: work,
        env: { ...process.env, ...TEST_ENV, CI: '', HARNESS_CONFIG: cfg(gen), ...extraEnv },
      });
      return { status: r.status ?? -1, out: (r.stdout ?? '') + '\n' + (r.stderr ?? '') };
    };

    // ① Cây bẩn TỪ TRƯỚC, `gen` không đổi gì ⇒ mục đích của gate ĐẠT.
    writeFileSync(join(work, 'nguon.txt'), 'nguồn đã sửa\n', 'utf8');
    const a = runStop('node -e "process.exit(0)"');
    if (a.status !== OK) {
      fail.push(`gates.mjs gen-clean         cây bẩn từ trước mà gen không đổi gì → exit=${a.status}, mong đợi 0`);
    // Neo vào câu KHẲNG ĐỊNH SAI (`bạn quên chạy gen`), không vào cụm từ `quên chạy gen`:
    // chính dòng `note` mới có chứa cụm đó dưới dạng PHỦ ĐỊNH (`KHÔNG phải "quên chạy gen"`),
    // nên neo vào cụm từ làm test bắt đúng bản sửa của mình. Bắt được ngay khi viết, và nó là
    // ví dụ nhỏ của cùng bài học đã có trong repo: neo vào CODE/khẳng định, đừng neo vào chữ.
    } else if (/bạn quên chạy gen/.test(a.out)) {
      fail.push('gates.mjs gen-clean         VẪN khẳng định "bạn quên chạy gen" khi gen không đổi gì — chẩn đoán bịa ra, đúng ca sakubun gặp 2 lần');
    } else if (!/bẩn TỪ TRƯỚC/.test(a.out)) {
      fail.push('gates.mjs gen-clean         không nói cây đã bẩn từ trước — im lặng ở đây là mời một chẩn đoán sai lần sau');
    } else {
      ok.push(`gates.mjs${' '.repeat(19)} cây bẩn TỪ TRƯỚC + gen không đổi gì → PASS và nói ĐÚNG nguyên nhân`);
    }

    // ② `gen` LÀM BẨN thêm một file khác ⇒ đây mới là "quên chạy gen", và phải ĐỎ.
    // Cây vẫn còn `nguon.txt` bẩn từ ① — nên case này chứng minh phép so là DELTA, không
    // phải phép đếm: nếu đếm thì ① cũng đã đỏ.
    const b = runStop('node -e "require(\'fs\').writeFileSync(\'sinh-ra.txt\',\'output mới\\n\')"');
    if (b.status !== BLOCK) {
      fail.push(`gates.mjs gen-clean         gen LÀM ĐỔI file sinh ra → exit=${b.status}, mong đợi 2 (đây đúng là "quên chạy gen")`);
    } else if (!/quên chạy gen/.test(b.out) || !/sinh-ra\.txt/.test(b.out)) {
      fail.push('gates.mjs gen-clean         đỏ nhưng KHÔNG nêu tên file mà gen đã đổi — agent bị chặn mà phải đoán');
    } else {
      ok.push(`gates.mjs${' '.repeat(19)} gen ĐỔI file sinh ra → ĐỎ, nêu tên file (phép so là DELTA, không phải đếm)`);
    }

    // ③ Phiên KHÔNG người, 0 gate bị bỏ qua, chỉ có cảnh báo ⇒ KHÔNG được fail-đóng.
    // Nhánh fail-đóng khoá vào "gate bị BỎ QUA". Bản trước kiểm `warn.length`, nên một
    // phiên không người chỉ CHẬM (hoặc chỉ có `note` của ①) vẫn exit 2 kèm thông báo nói
    // rằng gate bị bỏ qua — fail-đóng bắn nhầm, và nó dạy người ta đặt
    // HARNESS_ALLOW_SKIPPED_GATES=1 vì một lý do không liên quan.
    writeFileSync(join(work, 'nguon.txt'), 'bẩn lần nữa\n', 'utf8');
    const c = runStop('node -e "process.exit(0)"', { CI: '1' });
    if (c.status !== OK) {
      fail.push(`gates.mjs fail-đóng         phiên không người + 0 gate bỏ qua + chỉ cảnh báo → exit=${c.status}, mong đợi 0`);
    } else if (/gate bị BỎ QUA/.test(c.out)) {
      fail.push('gates.mjs fail-đóng         nói "gate bị BỎ QUA" trong khi mọi gate đều CHẠY — fail-đóng khoá vào warn thay vì vào số gate bỏ qua');
    } else {
      ok.push(`gates.mjs${' '.repeat(19)} phiên không người + cảnh báo mà 0 gate bỏ qua → KHÔNG fail-đóng`);
    }
  } finally {
    try { rmSync(work, { recursive: true, force: true }); } catch {}
  }
}

// ─── gates --list --timing PHẢI đo cả `PreToolUse` ───────────────────────────
// `PreToolUse` là ô kích hoạt DÀY nhất của harness (7 hook, mỗi lần sửa file), và nó KHÔNG
// nằm trong `config().gates` — nên vòng lặp của `--timing` không bao giờ chạm tới nó. Đúng
// lớp khoảng-mù mà v2.81.0 vừa vá ở chỗ khác: một phép đo hiện hữu, đọc như thể nó phủ hết,
// mà thật ra bỏ trống đúng phần dày nhất.
{
  const settings = readJson(repoPath('.claude', 'settings.json')) ?? {};
  const groups = (settings.hooks?.PreToolUse ?? []).filter(g => (g.hooks ?? []).some(h => h.command));
  // `HARNESS_CONFIG: UNCONF()` là BẮT BUỘC, và một guard trong chính file này cưỡng chế nó:
  // `--timing` chạy THẬT mọi gate của config, nên ở repo tiêu thụ nó dựng dev server + trình
  // duyệt cho `e2e`. Phần ta cần đo — `PreToolUse` — đọc `settings.json`, không đọc config,
  // nên nó vẫn được đo đầy đủ với config rỗng. (`lessons/0003`: self-test giả định repo của nó.)
  const r = spawnSync(process.execPath, [repoPath('tooling', 'gates.mjs'), '--list', '--timing'],
    { encoding: 'utf8', env: { ...process.env, ...TEST_ENV, HARNESS_CONFIG: UNCONF() } });
  const out = (r.stdout || '') + (r.stderr || '');

  // ① PHỦ: mọi ô đã đăng ký đều có một dòng. Một ô rơi ra là một lớp gác không ai đo.
  const missing = groups.map(g => String(g.matcher ?? '*'))
    .filter(m => !out.includes(`PreToolUse ${m}:`));
  if (!groups.length) fail.push(`gates --timing${' '.repeat(14)} settings.json KHÔNG có hook PreToolUse nào — neo này không còn đo được gì, sửa neo`);
  else if (missing.length) fail.push(`gates --timing${' '.repeat(14)} không đo ô ${missing.join(' · ')} — ${missing.length}/${groups.length} ô PreToolUse nằm ngoài phép đo`);
  else ok.push(`gates --timing${' '.repeat(14)} đo đủ ${groups.length}/${groups.length} ô PreToolUse đã đăng ký`);

  // ② SỐ ĐỌC ĐƯỢC: `tường` phải nằm giữa "hook đắt nhất" và "tổng nối tiếp".
  //
  //    CHỈ có nghĩa ở ô ≥2 hook. Ô một hook thì song song = nối tiếp = chính hook đó, nên ba
  //    con số là BA LẦN ĐO CÙNG MỘT THỨ và chúng lệch nhau vài ms vì nhiễu — bản đầu của ca
  //    này khẳng định `wall ≥ max(per)` cho mọi ô và đỏ ngay ở ô `Bash|PowerShell`
  //    (tường 23ms < hook 25ms). Đó không phải bug của phép đo, đó là ca test đòi một bất
  //    biến mà ở N=1 nó không có quyền đòi — và nới bằng một hằng số dung sai thì chỉ làm ca
  //    test yếu đi ở CẢ N≥2. Nên: khoanh đúng chỗ nó có sức, và nói ra chỗ nó không có.
  let scored = 0;
  for (const m of out.split('\n').filter(l => l.includes('PreToolUse ') && l.includes('tường'))) {
    const wall = Number(/tường (\d+)ms/.exec(m)?.[1]);
    const serial = Number(/nối tiếp (\d+)ms/.exec(m)?.[1]);
    const per = [...m.matchAll(/([\w-]+\.mjs) (\d+)ms/g)].map(x => Number(x[2]));
    const label = /PreToolUse ([^:]+):/.exec(m)?.[1] ?? '?';
    if (!per.length || !Number.isFinite(wall) || !Number.isFinite(serial)) {
      fail.push(`gates --timing${' '.repeat(14)} ô ${label}: không đọc được tường/nối tiếp/chi tiết từ dòng in ra`);
    } else if (per.length < 2) {
      declareNa(1, `gates --timing: ô ${label} chỉ có 1 hook — song song = nối tiếp = chính hook đó, nên bất biến "tường ≥ hook đắt nhất" không có sức phân biệt ở đây`);
    } else if (wall > serial) {
      fail.push(`gates --timing${' '.repeat(14)} ô ${label}: tường ${wall}ms > nối tiếp ${serial}ms — không thể, song song không chậm hơn nối tiếp`);
    } else if (wall < Math.max(...per)) {
      fail.push(`gates --timing${' '.repeat(14)} ô ${label}: tường ${wall}ms < hook đắt nhất ${Math.max(...per)}ms — ${per.length} tiến trình Node không thể xong trước khi tiến trình chậm nhất xong`);
    } else {
      scored++;
      ok.push(`gates --timing${' '.repeat(14)} ô ${label} (${per.length} hook): tường ${wall}ms nằm giữa hook đắt nhất ${Math.max(...per)}ms và tổng nối tiếp ${serial}ms`);
    }
  }
  if (!scored) fail.push(`gates --timing${' '.repeat(14)} KHÔNG ô nào có ≥2 hook — ca ② không chấm được gì, sửa neo hoặc bỏ nó`);

  // ③ ĐẤU NỐI: ngân sách phải so với `wall`, KHÔNG phải `serial`. Đây là ca quan trọng nhất
  //    trong ba ca: nếu ngân sách so nhầm với tổng nối tiếp thì nó báo đỏ ở 170ms trong khi
  //    người dùng chỉ trả 43ms — và câu trả lời "hiển nhiên" cho màu đỏ đó là gộp 7 guard
  //    thành một dispatcher, tức bán 7 chế độ hỏng độc lập để mua một con số không có thật.
  const src = readFileSync(repoPath('tooling', 'gates.mjs'), 'utf8');
  const wallFromParallel = /rounds\.push[\s\S]{0,200}?wall: rounds/.test(src)
    || /await Promise\.all\(cmds[\s\S]{0,300}?rounds\.push/.test(src);
  if (!/g\.wall > PRETOOL_BUDGET_MS/.test(src)) {
    fail.push(`gates --timing${' '.repeat(14)} ngân sách PreToolUse KHÔNG so với \`g.wall\` — so với tổng nối tiếp là đo một chi phí không ai trả`);
  } else if (!wallFromParallel) {
    fail.push(`gates --timing${' '.repeat(14)} \`wall\` không đến từ một lượt \`Promise.all\` — nó đang được TÍNH từ per-hook, và phép tính đó báo thấp hơn thực tế`);
  } else {
    ok.push(`gates --timing${' '.repeat(14)} ngân sách so với tường ĐO ĐƯỢC (Promise.all), không phải tổng nối tiếp`);
  }
}

// ─── LỚP KINH TẾ: mẩu bánh mì StopFailure ────────────────────────────────────
// Vendor BỎ QUA output và exit code của StopFailure, nên nhánh đó không thể assert
// bằng bộ ba (stdout, stderr, exit). Thứ phải assert là HIỆU QUẢ của nó: cảnh báo về
// TIỀN có tới được mắt người ở phiên sau hay không. Không có test này thì lớp kinh tế
// có thể đứt im lặng và mọi thứ khác vẫn xanh.
{
  const stateDir = testRunPath('harness-test-state-crumb');
  const crumb = join(stateDir, 'last-stop-failure.json');
  const env = { ...process.env, ...TEST_ENV, HARNESS_STATE_DIR: stateDir };
  const fire = (input) => spawnSync(process.execPath, [repoPath('.claude', 'hooks', 'observe.mjs')], {
    input: JSON.stringify(input), encoding: 'utf8', cwd: repoPath(''), env,
  });
  try { rmSync(crumb, { force: true }); } catch {}

  fire({ hook_event_name: 'StopFailure', error: 'billing_error' });
  if (!exists(crumb)) fail.push('lớp kinh tế: StopFailure(tiền) KHÔNG ghi mẩu bánh mì — cảnh báo sẽ không tới được ai');
  else ok.push(`observe.mjs${' '.repeat(17)} StopFailure(tiền) ghi mẩu bánh mì`);

  const ss = spawnSync(process.execPath, [repoPath('.claude', 'hooks', 'session-start.mjs')], {
    input: '{}', encoding: 'utf8', cwd: repoPath(''), env,
  });
  const out = (ss.stdout ?? '') + (ss.stderr ?? '');
  if (!/💸 PHIÊN TRƯỚC DỪNG VÌ: billing_error/.test(out)) fail.push('lớp kinh tế: session-start KHÔNG in mẩu bánh mì — nhánh StopFailure thành chữ chết');
  else if (exists(crumb)) fail.push('lớp kinh tế: đã in nhưng KHÔNG xoá mẩu bánh mì — cảnh báo lặp mãi sẽ bị lọc bỏ đúng lúc nó kêu thật');
  else ok.push(`session-start.mjs${' '.repeat(11)} in cảnh báo tiền MỘT LẦN rồi xoá`);

  // Nhánh kỹ thuật KHÔNG được tạo mẩu bánh mì: một cảnh báo hay kêu oan sẽ bị phớt lờ.
  fire({ hook_event_name: 'StopFailure', error: 'server_error' });
  if (exists(crumb)) fail.push('lớp kinh tế: server_error (không phải lỗi tiền) cũng tạo cảnh báo — đây là cách cảnh báo bị phớt lờ');
  else ok.push(`observe.mjs${' '.repeat(17)} lỗi kỹ thuật KHÔNG làm giật mình phiên sau`);

  // ── #132 ĐẦU-CUỐI: hai ô CAPTURE mới có THẬT SỰ ghi ra thứ bên đọc đọc được không ───────
  //
  // Ca này neo vào ĐỊNH DẠNG DÒNG, không chỉ vào "có file". `frictionReading` đọc cột 2 làm
  // khoá và cột 3 làm phân loại (qua `tallyLines`); một bản vá đảo hai cột đó vẫn ghi đủ dữ
  // liệu, vẫn tạo file, và bên đọc sẽ đếm ra 0 — im lặng hoàn toàn.
  const telDir = testRunPath('harness-test-friction');
  const fireT = (input) => spawnSync(process.execPath, [repoPath('.claude', 'hooks', 'observe.mjs')], {
    input: JSON.stringify(input), encoding: 'utf8', cwd: repoPath(''),
    env: { ...process.env, ...TEST_ENV, HARNESS_TELEMETRY_DIR: telDir },
  });
  const bad132 = [];
  const r1 = fireT({ hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', error: 'exit 1', duration_ms: 1234 });
  const r2 = fireT({ hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', error: 'da dung', is_interrupt: true });
  const r3 = fireT({ hook_event_name: 'Notification', notification_type: 'idle_prompt', message: 'Claude is waiting for your input' });
  if ([r1, r2, r3].some(r => r.status !== 0)) bad132.push('observe CHẶN ở ô mới — nó phải exit 0 với MỌI sự kiện');
  const readT = (k) => { try { return readFileSync(join(telDir, `${k}.log`), 'utf8'); } catch { return null; } };
  const fr = frictionReading({ failures: readT('tool-failures'), notifications: readT('notifications'), wired: true });
  if (fr.mode !== 'measured') bad132.push(`hai ô ghi xong mà bên đọc vẫn \`${fr.mode}\` — cắm mà không đọc được`);
  else {
    // NGƯỜI BẤM DỪNG ≠ CÔNG CỤ HỎNG. Đây là ca chịu lực: gộp hai thứ cho ra `errors: 2`, và
    // con số đó nói sai về công cụ theo đúng chiều dễ chịu (`L0005`).
    if (fr.errors !== 1) bad132.push(`\`errors\` = ${fr.errors}, phải là 1 — lần NGƯỜI bấm dừng đang bị đếm là công cụ hỏng`);
    if (fr.interrupts !== 1) bad132.push(`\`interrupts\` = ${fr.interrupts}, phải là 1 — \`is_interrupt\` không tới được bên đọc`);
    if (fr.idle !== 1) bad132.push(`\`idle\` = ${fr.idle}, phải là 1 — \`notification_type\` không tới được bên đọc`);
    if (fr.top?.[0]?.tool !== 'Bash') bad132.push(`cột KHOÁ không phải tên công cụ (được \`${fr.top?.[0]?.tool}\`) — bảng "hay hỏng nhất" sẽ vô nghĩa`);
  }
  // Chưa cắm ⇒ `n/a`, KHÔNG phải 0. "Chưa hỏi" không được đọc thành "không có gì".
  if (frictionReading({ failures: '', notifications: '', wired: false }).mode !== 'not-wired') {
    bad132.push('ô chưa cắm mà bên đọc vẫn kết luận — "chưa hỏi" đang bị đọc thành "không có gì"');
  }
  if (frictionReading({ failures: null, notifications: '', wired: true }).mode !== 'unmeasured') {
    bad132.push('sổ KHÔNG ĐỌC ĐƯỢC bị đọc thành 0');
  }
  try { rmSync(telDir, { recursive: true, force: true }); } catch {}
  if (bad132.length) fail.push(`observe #132${' '.repeat(16)} ${bad132.length} ca sai: ${bad132.join(' | ')}`);
  else ok.push(`observe #132${' '.repeat(16)} PostToolUseFailure + Notification ghi ra đúng thứ bên đọc đọc được — `
    + `NGƯỜI dừng tách khỏi công cụ HỎNG, và chưa-cắm ≠ 0`);

  // ── #135 · #136 · #137: BA BỘ ĐẾM, và hai chỗ một con số sẽ nói dối ────────
  {
    const T0 = Date.parse('2026-08-12T00:00:00.000Z');
    const at = (min) => new Date(T0 - min * 60000).toISOString();
    const badSC = [];

    // ① "ĐỒNG THỜI" ≠ TỔNG. Ba lần khởi động rải rác, mỗi lần kết thúc trước lần sau ⇒ đỉnh 1.
    //    Một bản vá đếm `starts` rồi gọi nó là "đồng thời" cho ra 3 — và con số đó dùng để cãi
    //    về trần <5 giây ở SubagentStop, tức nó sai ở chỗ đắt nhất.
    const seq = [[60, 'a', 'start'], [55, 'a', 'stop'], [50, 'b', 'start'], [45, 'b', 'stop'], [40, 'c', 'start'], [35, 'c', 'stop']]
      .map(([m, t, k]) => `${at(m)}|p|${t}|${k}|id`).join('\n');
    const s1 = slotCounters({ agents: seq, now: T0 }).agents;
    if (s1.starts !== 3 || s1.peak !== 1) badSC.push(`rải rác: starts=${s1.starts} peak=${s1.peak}, phải là 3/1 — "đồng thời" đang bị tính bằng TỔNG`);

    // Và chiều ngược: ba cái CHỒNG nhau ⇒ đỉnh 3. Không có ca này thì `peak = 1` cứng cũng xanh.
    const overlap = [[60, 'a', 'start'], [59, 'b', 'start'], [58, 'c', 'start'], [50, 'a', 'stop'], [49, 'b', 'stop'], [48, 'c', 'stop']]
      .map(([m, t, k]) => `${at(m)}|p|${t}|${k}|id`).join('\n');
    const s2 = slotCounters({ agents: overlap, now: T0 }).agents;
    if (s2.peak !== 3) badSC.push(`chồng nhau: peak=${s2.peak}, phải là 3`);
    // Thiếu mốc kết thúc ⇒ đỉnh chỉ có thể CAO HƠN sự thật, và phải NÓI RA.
    const s3 = slotCounters({ agents: `${at(60)}|p|a|start|id\n${at(59)}|p|b|start|id`, now: T0 }).agents;
    if (s3.unpaired !== 2) badSC.push(`thiếu mốc stop mà \`unpaired\` = ${s3.unpaired} — chỗ in sẽ khẳng định một đỉnh nó không biết`);

    // ② `reason: hook` là LẦN CHẶN CỦA CHÍNH TA, không phải vendor chặn. Gộp = tự đếm hai lần.
    const den = [`${at(30)}|p|Bash|classifier`, `${at(29)}|p|Bash|hook`, `${at(28)}|p|Edit|safetyCheck`].join('\n');
    const d = slotCounters({ denied: den, now: T0 }).denied;
    if (d.vendor !== 2 || d.ours !== 1) badSC.push(`từ chối: vendor=${d.vendor} ours=${d.ours}, phải là 2/1 — guard của TA đang bị tính là vendor chặn`);

    // ③ `null` (chưa cắm / không đọc được) ≠ 0. Không có ô nào thì KHÔNG có kết luận nào.
    const none = slotCounters({ now: T0 });
    if (none.skills !== null || none.agents !== null || none.denied !== null) badSC.push('không có sổ nào mà vẫn kết luận — "chưa nhìn" bị đọc thành 0');
    const sk = slotCounters({ skills: `${at(10)}|p|claim|slash_command|proj`, now: T0 }).skills;
    if (sk.total !== 1 || sk.top[0]?.name !== 'claim') badSC.push('cột KHOÁ của skill-calls không phải tên lệnh');
    // Ngoài cửa sổ ⇒ không đếm. Không có ca này thì `sinceMs` rơi ra lúc nào cũng được.
    if (slotCounters({ skills: `${at(60 * 24 * 30)}|p|claim|slash_command|proj`, now: T0 }).skills.total !== 0) {
      badSC.push('mục 30 ngày trước vẫn lọt vào cửa sổ 7 ngày');
    }

    // ④ CON SỐ PHẢI MANG THEO ĐIỂM MÙ CỦA NÓ. Sổ `skill-calls` do ô `UserPromptExpansion` ghi,
    //    và ô đó chỉ bắn khi NGƯỜI GÕ lệnh gạch chéo — đo trực tiếp 2026-08-13: gọi skill bằng
    //    công cụ `Skill` không tạo mục nào. Nên `total: 0` KHÔNG phân biệt được "skill chết"
    //    với "skill chỉ được model gọi", trong khi `/entropy-sweep` đọc đúng con số này để
    //    **đề xuất BỎ** skill. Một điểm mù đo lường nuôi một quyết định XOÁ.
    //
    //    `blindTo` đi kèm MỌI lần đọc, kể cả khi `total` khác 0 — vì bản trước chỉ cảnh báo ở
    //    nhánh `total === 0`, nên ở mọi con số khác 0 phạm vi bị giấu hoàn toàn.
    for (const [log, label] of [[`${at(10)}|p|claim|slash_command|proj`, 'có dữ liệu'], ['', 'sổ rỗng']]) {
      const b = slotCounters({ skills: log, now: T0 }).skills?.blindTo;
      if (!b) badSC.push(`(${label}) phép đọc skill KHÔNG mang theo điểm mù — mọi bên tiêu thụ sẽ đọc nó như sự thật về việc dùng skill`);
      else if (!/model/i.test(b)) badSC.push(`(${label}) \`blindTo\` không nêu ĐÚNG thứ nó không thấy: "${b}"`);
    }

    if (badSC.length) fail.push(`slotCounters${' '.repeat(16)} ${badSC.length} ca sai: ${badSC.join(' | ')}`);
    else ok.push(`slotCounters${' '.repeat(16)} "đồng thời" tính theo ĐƯỜNG CONG chứ không theo tổng · \`reason: hook\` tách khỏi vendor · chưa-cắm ≠ 0`);
  }

  // ── #130: mốc mất context, và nó phải TỚI ĐƯỢC `/handoff` ─────────────────
  {
    const bad130 = [];
    const T = (h) => new Date(Date.parse('2026-08-12T12:00:00.000Z') - h * 3600000).toISOString();
    const now = Date.parse(T(0));
    // Mốc mất context SAU nhật ký ⇒ có một quãng làm việc không ai ghi lại.
    const p1 = contextLossPending(T(2), T(5), now);
    if (!p1?.pending || p1.ageHours !== 2) bad130.push(`nén SAU nhật ký: pending=${p1?.pending} age=${p1?.ageHours}, phải là true/2`);
    // Chiều ngược — không có nó thì `pending: true` cứng cũng xanh.
    if (contextLossPending(T(5), T(2), now)?.pending !== false) bad130.push('nhật ký MỚI HƠN lần nén mà vẫn đòi /handoff — mục sẽ đỏ vĩnh viễn sau lần nén đầu tiên');
    // Chưa thấy lần nén nào ⇒ `null` (không đo được), KHÔNG phải `false`.
    if (contextLossPending(null, T(2), now) !== null) bad130.push('chưa có mốc nén mà vẫn kết luận — "chưa nhìn" bị đọc thành "không có gì"');
    // Chưa có nhật ký ⇒ mốc nén không thể cũ hơn nó ⇒ ĐANG TREO. Đây là ca thường gặp nhất.
    if (contextLossPending(T(2), null, now)?.pending !== true) bad130.push('chưa có nhật ký mà mốc nén bị coi là đã xử — bỏ sót đúng nhóm cần nhắc');

    // ĐẦU-CUỐI: hook có ghi ra thứ `rituals` đọc được không, và ở ĐÚNG đường dẫn không.
    const st130 = testRunPath('harness-test-ctxloss');
    const r130 = spawnSync(process.execPath, [repoPath('.claude', 'hooks', 'observe.mjs')], {
      input: JSON.stringify({ hook_event_name: 'PreCompact', trigger: 'auto' }), encoding: 'utf8',
      cwd: repoPath(''), env: { ...process.env, ...TEST_ENV, HARNESS_STATE_DIR: st130 },
    });
    if (r130.status !== 0) bad130.push(`PreCompact làm observe exit ${r130.status} — ô này CHẶN được compaction bằng exit 2`);
    // stdout ở `PreCompact` được vendor NỐI VÀO chỉ thị compaction. Một dòng debug lọt ra đây
    // là một chỉ thị gửi thẳng cho phép nén, và không ca nào khác trong suite nhìn thấy nó.
    if ((r130.stdout || '').trim()) bad130.push(`PreCompact IN ra stdout ("${(r130.stdout || '').trim().slice(0, 40)}") — vendor nối nó vào chỉ thị compaction`);
    const crumb130 = readJson(join(st130, 'last-context-loss.json'), null);
    if (!crumb130?.at || crumb130.event !== 'PreCompact') bad130.push(`mốc không được ghi đúng chỗ/đúng hình (${JSON.stringify(crumb130)?.slice(0, 60)})`);
    try { rmSync(st130, { recursive: true, force: true }); } catch {}

    if (bad130.length) fail.push(`contextLoss${' '.repeat(17)} ${bad130.length} ca sai: ${bad130.join(' | ')}`);
    else ok.push(`contextLoss${' '.repeat(17)} mốc nén SAU nhật ký ⇒ /handoff tới hạn · nhật ký mới hơn ⇒ im · chưa nén ≠ đã xử · PreCompact KHÔNG in gì`);
  }

  // ── #131: "tự khen" — MỘT định nghĩa, hai bên đọc, và gate CHƯA lên đạn ────
  {
    const bad131 = [];
    const P = (o) => selfPraiseClaims(o);
    if (P({ platforms: { web: { passes: true, evidence: '' } } }).join() !== 'web') bad131.push('passes=true + evidence rỗng KHÔNG bị bắt');
    if (P({ platforms: { web: { passes: true, evidence: 'docs/x.png' } } }).length) bad131.push('có evidence mà vẫn bị bắt — bắn nhầm');
    if (P({ platforms: { web: { passes: false, evidence: '' } } }).length) bad131.push('passes=false bị bắt — chưa khai ĐẠT thì không phải tự khen');
    if (P({ platforms: { web: { passes: 'n/a', evidence: '' } } }).length) bad131.push('`n/a` bị bắt — ngoài scope không phải tự khen');
    // `a11y`/`perf` là ANH EM của `platforms`, không nằm trong nó — lỗ đã có thật trước 2.3.0.
    if (P({ a11y: { passes: true, evidence: '' } }).join() !== 'a11y') bad131.push('`a11y` ngoài `platforms` bị bỏ sót — đúng lỗ của 2.3.0');
    if (P({ platforms: { web: { passes: true, evidence: '   ' } } }).join() !== 'web') bad131.push('evidence toàn khoảng trắng đi qua');
    if (P(null).length || P('rác').length) bad131.push('đầu vào rác làm hàm kết luận thay vì im');

    // MỘT ĐỊNH NGHĨA: `check-feature-integrity` phải GỌI hàm này, không chép lại luật.
    const cfi = codeOnly(readFileSync(repoPath('tooling', 'check-feature-integrity.mjs'), 'utf8'));
    if (!/selfPraiseClaims\s*\(/.test(cfi)) bad131.push('check-feature-integrity tự kiểm evidence rỗng thay vì GỌI selfPraiseClaims() — hai bản chép sẽ bất đồng về "đã xong chưa"');

    // GATE CHƯA LÊN ĐẠN, và đó là một khẳng định chứ không phải một sự vắng mặt: `observe.mjs`
    // không được có đường exit khác 0 ở nhánh này. Vendor cho `exit 2 - prevent task completion`.
    const obs = codeOnly(readFileSync(repoPath('.claude', 'hooks', 'observe.mjs'), 'utf8'));
    if (/\bblock\s*\(/.test(obs)) bad131.push('observe.mjs GỌI block() — file này khai "không bao giờ chặn", và gate #131 chưa có số liệu để lên đạn');

    if (bad131.length) fail.push(`selfPraise${' '.repeat(18)} ${bad131.length} ca sai: ${bad131.join(' | ')}`);
    else ok.push(`selfPraise${' '.repeat(18)} 7 ca — evidence rỗng bị bắt, có evidence thì không · \`a11y\`/\`perf\` không bị bỏ sót · MỘT định nghĩa, hai bên đọc · gate chưa lên đạn`);
  }

  // HỢP ĐỒNG: ô đã CẮM phải có BÊN ĐỌC. Không có nó thì cơ chế chạy, tốn một process mỗi lần
  // nổ, và không tới ai — đúng thứ vừa bị cắt ở #177 (cảnh báo mềm `package.json`).
  {
    const wired = (() => { try { return Object.keys(readJson(repoPath('.claude', 'settings.json'))?.hooks ?? {}); } catch { return []; } })();
    const docSrc = readFileSync(repoPath('tooling', 'harness-doctor.mjs'), 'utf8');
    const CAPTURE = [['PostToolUseFailure', 'tool-failures'], ['Notification', 'notifications'],
      ['UserPromptExpansion', 'skill-calls'], ['SubagentStart', 'subagent-runs'], ['PermissionDenied', 'permission-denied'], ['TaskCompleted', 'task-completed']];
    // #130 đọc bởi rituals (/handoff), KHÔNG bởi doctor — nên nó có hợp đồng RIÊNG ngay dưới.
    const orphan = CAPTURE.filter(([ev, log]) => wired.includes(ev) && !docSrc.includes(log));
    if (orphan.length) fail.push(`ô CAPTURE mồ côi${' '.repeat(12)} ${orphan.map(([e]) => e).join(' · ')} đã cắm mà harness-doctor KHÔNG đọc sổ của nó — `
      + 'một cơ chế ghi mà không ai đọc là mục tiếp theo của danh sách cắt bỏ');
    else ok.push(`ô CAPTURE mồ côi${' '.repeat(12)} ${CAPTURE.length} ô đã cắm đều có bên đọc trong harness-doctor`);
  }

  // ── MUTANT của lớp kinh tế ────────────────────────────────────────────────
  //
  // `mutate()` ở dưới KHÔNG dùng được cho `observe.mjs`: nó giết mutant bằng "không còn
  // CHẶN nữa", mà observe là advisory — nó exit 0 trong mọi trường hợp, vendor còn bỏ qua
  // cả output. Nên tiêu chí giết ở đây phải là HIỆU QUẢ: mẩu bánh mì có được ghi không.
  //
  // Vì sao phải có: đây là lớp DUY NHẤT gây thiệt hại tài chính trực tiếp (docs/ECONOMICS.md),
  // và cho tới 2.8.1 nó là hook có `paths.harness` bảo vệ nhưng KHÔNG có mutant nào — tức
  // ba khẳng định phía trên chưa từng được chứng minh là có hiệu lực. Nếu bảng `MONEY` bị
  // rỗng hoá, cả ba vẫn xanh? Đó chính là câu hỏi này trả lời.
  const src = repoPath('.claude', 'hooks', 'observe.mjs');
  const orig = readFileSync(src, 'utf8');
  // Rỗng hoá BẢNG PHÂN LOẠI, không phải `if (false)`: sau nó còn code dùng `MONEY`, và một
  // mutant chỉ crash thì không chứng minh gì (xem note trong `mutate()`).
  const mutated = orig.replace(/^const MONEY = \/[^\n]*\/i;/m, 'const MONEY = { test: () => false };');
  if (mutated === orig) {
    fail.push('MUTANT observe.mjs         neo sai chuỗi `const MONEY = /…/i;` — lỗi của TEST, không phải của hook');
  } else {
    const tmp = repoPath('.claude', 'hooks', hookTempName('mutant-observe', TEST_RUN_ID));
    try {
      writeFileSync(tmp, mutated, 'utf8');
      try { rmSync(crumb, { force: true }); } catch {}
      spawnSync(process.execPath, [tmp], {
        input: JSON.stringify({ hook_event_name: 'StopFailure', error: 'rate_limit' }),
        encoding: 'utf8', cwd: repoPath(''), env,
      });
      if (exists(crumb)) {
        fail.push('MUTANT observe.mjs         bảng MONEY bị vô hiệu mà VẪN ghi mẩu bánh mì — nghĩa là mẩu bánh mì '
          + 'không phụ thuộc phân loại, và ba khẳng định lớp kinh tế phía trên không kiểm gì');
      } else {
        ok.push(`MUTANT observe.mjs${' '.repeat(10)} bảng MONEY rỗng ⇒ rate_limit KHÔNG còn cảnh báo — lớp kinh tế thật sự tra bảng`);
      }
    } finally {
      try { rmSync(tmp, { force: true }); } catch {}
      try { rmSync(crumb, { force: true }); } catch {}
    }
  }
}

// ─── MỘT nguồn cho SECRET_PATTERNS ───────────────────────────────────────────
// Test CẤU TRÚC, không test hành vi — vì chế độ hỏng ở đây không phải "pattern sai" mà
// là "hai bản lệch nhau". Chúng không lệch vào ngày viết; chúng lệch vào ngày có người
// thêm một pattern và chỉ thấy một chỗ. Đo 2026-08-04: bản ở pre-commit thiếu Slack token
// và JWT, và pre-commit là tầng DUY NHẤT thấy thứ NGƯỜI gõ tay.
//
// Regex tìm `const SECRET_PATTERNS =` (KHAI), không tìm chữ `SECRET_PATTERNS` (NHẮC) —
// hai file đó đều có comment nhắc tới nó, và văn xuôi nhắc một key không phải khai nó.
{
  for (const rel of [['.claude', 'hooks', 'block-secrets.mjs'], ['tooling', 'precommit-scan.mjs']]) {
    const label = rel.join('/');
    const txt = readFileSync(repoPath(...rel), 'utf8');
    if (/\bconst\s+SECRET_PATTERNS\s*=/.test(txt)) {
      fail.push(`${label} KHAI LẠI SECRET_PATTERNS — phải import từ lib, nếu không hai bản sẽ lệch`);
    } else if (!/SECRET_PATTERNS/.test(txt)) {
      fail.push(`${label} không dùng SECRET_PATTERNS — tầng này đang không quét nội dung`);
    } else {
      ok.push(`${label.padEnd(28).slice(0, 28)} dùng SECRET_PATTERNS dùng chung, không khai lại`);
    }
  }
}

// ─── precommit-scan --all: lưới an toàn CUỐI ở CI ────────────────────────────
// Bản chỉ-`staged` `exit 0` NGAY khi không có gì staged — và ở CI thì không bao giờ có.
// Nên thứ phải assert KHÔNG phải "nó exit 0" (nó luôn exit 0), mà là **nó đã xem một số
// file khác 0**. Không có khẳng định đó thì một ngày `git ls-files` trả về ít hơn (sparse
// checkout, submodule, đổi cwd) và lưới an toàn cuối lặng lẽ quay về làm `echo` — trong
// khi job `security` vẫn xanh. So với SỐ THẬT, không so với một hằng số: một ngưỡng gõ
// tay ở đây chính là con số viết tay mà `harness-doctor` vừa được dạy để không tin.
{
  const tracked = git(['ls-files']).stdout.split('\n').filter(Boolean).length;
  const r = spawnSync(process.execPath, [repoPath('tooling', 'precommit-scan.mjs'), '--all'], {
    encoding: 'utf8', cwd: repoPath(''), env: { ...process.env, ...TEST_ENV },
  });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  const m = out.match(/(\d+) file được track/);
  if (r.status !== 0) {
    fail.push(`precommit-scan --all  →  exit=${r.status}, mong đợi 0\n         ${out.split('\n').find(Boolean) ?? ''}`);
  } else if (!m) {
    fail.push('precommit-scan --all  →  KHÔNG báo số file đã xem: không phân biệt được "sạch" với "chưa xem gì"');
  } else if (Number(m[1]) !== tracked) {
    fail.push(`precommit-scan --all  →  xem ${m[1]} file nhưng git ls-files có ${tracked}`);
  } else {
    ok.push(`precommit-scan.mjs${' '.repeat(10)} --all xem đủ ${tracked} file được track (không phải 0)`);
  }
}

// ─── NUL trong file nguồn: kênh REVIEW là kênh không máy nào đo ──────────────
//
// 2026-08-05 một byte NUL đi vào `tooling/harness-doctor.mjs`, qua PR, qua 7 job CI trên 3 OS,
// ra tag v2.9.0, rồi sang cả ba repo tiêu thụ. `node --check` xanh (NUL nằm trong template
// literal), mọi suite xanh, `apply-to --audit` xanh. Thứ nó phá: `git diff` in "Binary files
// differ" ⇒ file KHÔNG REVIEW ĐƯỢC, và `grep`/`rg` bỏ qua nó ⇒ file VÔ HÌNH với mọi lần tìm
// code. Phát hiện được chỉ vì `rg` trả rỗng bất thường trên một file 650 dòng.
//
// Test này khẳng định `precommit-scan --all` — lưới cuối ở CI — CÓ bắt ca đó. Dùng file TẠM
// được `git add -N` (intent-to-add) thì không cần: `--all` đọc `git ls-files`, nên ta khẳng
// định trực tiếp trên cây hiện tại VÀ trên một mutant.
{
  const r = spawnSync(process.execPath, [repoPath('tooling', 'precommit-scan.mjs'), '--all'], {
    encoding: 'utf8', cwd: repoPath(''), env: { ...process.env, ...TEST_ENV },
  });
  const clean = (r.status ?? 1) === 0;
  // MUTANT: chèn NUL thật vào một bản sao rồi kiểm bằng CHÍNH biểu thức mà guard dùng.
  // Không ghi vào cây thật — `--all` đọc `git ls-files`, nên một file tạm sẽ không được xem;
  // thứ cần chứng minh là ĐIỀU KIỆN, và điều kiện đó phải đỏ được.
  const SOURCE_EXT = /\.(mjs|cjs|js|jsx|ts|tsx|md|json|ya?ml|toml|css|scss|html|sql|sh|ps1|txt)$/i;
  // NUL xay dung bang String.fromCharCode(0), KHONG viet escape truc tiep vao nguon:
  // chinh cach viet do la nguyen nhan cua ca bug nay (mot cong cu ghi file co the
  // chuyen `\u0000` thanh BYTE that, va no da lam dung vay hai lan trong mot gio).
  const NUL_CHAR = String.fromCharCode(0);
  const mutantCaught = Boolean('x.mjs'.match(SOURCE_EXT)) && ('a' + NUL_CHAR + 'b').includes(NUL_CHAR);
  const binaryIgnored = !'logo.png'.match(SOURCE_EXT);
  if (!clean) fail.push(`precommit-scan --all  →  cây hiện tại có file nguồn chứa NUL: ${(r.stdout || '').split('\n').find(l => /NUL/.test(l)) ?? 'xem output'}`);
  else if (!mutantCaught) fail.push('precommit-scan         điều kiện bắt NUL KHÔNG đỏ được với một file .mjs chứa NUL — guard là trang trí');
  else if (!binaryIgnored) fail.push('precommit-scan         guard NUL bắt cả file BINARY THẬT (.png) — nó sẽ đỏ ở mọi repo có ảnh');
  else ok.push(`precommit-scan.mjs${' '.repeat(10)} 0 file nguồn chứa NUL; điều kiện đỏ được với .mjs và KHÔNG bắt .png`);
}

// ─── Migration DUY NHẤT XOÁ FILE: cả hai nhánh phải được khẳng định ──────────
//
// `harness-migrations/010` là migration đầu tiên và duy nhất XOÁ file ở repo người khác. Hợp
// đồng của `test-migrations` (không throw · JSON còn đọc được · idempotent · không mất
// `$comment` · `expect`) không nói được điều quan trọng nhất ở đây: **nó xoá ĐÚNG cái gì, và
// nó DỪNG TAY khi nào**. `expect` chỉ khẳng định được nội dung MỘT file còn tồn tại — nó
// không khẳng định được sự VẮNG MẶT, mà vắng mặt mới là hành vi của migration này.
//
// Hai nhánh, và nhánh thứ hai là nhánh giữ niềm tin: một migration xoá đè lên chỉnh sửa của
// người dùng làm cả cơ chế nâng cấp mất tín nhiệm, và mất tín nhiệm thì lần sau không ai nâng.
{
  const work = join(tmpdir(), `harness-mig010-${process.pid}`);
  const run010 = async (mutateFile) => {
    rmSync(work, { recursive: true, force: true });
    cpSync(repoPath('tooling', 'fixtures', 'migration-2.11.0'), work, { recursive: true });
    if (mutateFile) writeFileSync(join(work, mutateFile), 'người dùng đã sửa file này\n', 'utf8');
    const logs = [];
    const mod = await import(pathToFileURL(repoPath('harness-migrations', '010-bo-thu-template-da-bo.mjs')).href);
    await mod.up({
      repoPath: (...p) => join(work, ...p),
      readJson: (p, fb = null) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fb; } },
      readFileSync, writeFileSync, existsSync: exists,
      log: m => logs.push(String(m)),
    });
    return { logs, has: (rel) => exists(join(work, rel)) };
  };

  try {
    // ① Còn nguyên như harness đặt ⇒ XOÁ. Và chỉ xoá thứ có tên trong bia mộ.
    const a = await run010(null);
    if (a.has('.claude/skills/whats-new/SKILL.md')) {
      fail.push('migration 010              skill template đã BỎ vẫn còn sau up() — lớp phân phối vẫn không biết xoá');
    } else if (!a.has('.claude/skills/cua-project/SKILL.md')) {
      fail.push('migration 010              XOÁ NHẦM skill của project — bia mộ phải là danh sách TƯỜNG MINH, không phải suy luận "có ở đích mà không có ở template"');
    } else if (!a.logs.some(l => l.startsWith('✓'))) {
      fail.push('migration 010              xoá mà KHÔNG nói ra — một migration xoá file im lặng là thứ không ai truy được');
    } else {
      ok.push(`migration 010${' '.repeat(15)} xoá thứ template đã bỏ, GIỮ skill của project, và nói ra`);
    }

    // ② Người dùng đã sửa ⇒ GIỮ LẠI và cảnh báo. Đây là nhánh giữ niềm tin vào nâng cấp.
    const b = await run010('.claude/skills/whats-new/SKILL.md');
    if (!b.has('.claude/skills/whats-new/SKILL.md')) {
      fail.push('migration 010              XOÁ ĐÈ lên chỉnh sửa của người dùng — điều kiện an toàn số 2 (so sha với manifest) không có hiệu lực');
    } else if (!b.logs.some(l => l.includes('⚠'))) {
      fail.push('migration 010              giữ lại nhưng KHÔNG cảnh báo — người dùng không biết mình đang giữ một thứ template đã bỏ');
    } else {
      ok.push(`migration 010${' '.repeat(15)} file đã bị người dùng SỬA ⇒ GIỮ LẠI kèm cảnh báo (sha khác manifest)`);
    }
  } catch (e) {
    fail.push(`migration 010              THROW khi chạy trực tiếp: ${String(e.message || e).slice(0, 100)}`);
  } finally {
    try { rmSync(work, { recursive: true, force: true }); } catch {}
  }

  // ③ BIA MỘ THẬT, không phải bản nhúng. Hai ca ở trên gọi `up()` KHÔNG có `tplPath`, nên
  //    migration dùng danh sách NHÚNG (`[whats-new]`) — tức mọi bia mộ thêm sau đó **không có
  //    dòng test nào**. Đo được khi thêm hai bia mộ ở 2.14.0: suite vẫn xanh mà chưa từng
  //    chạy chúng. Ca này truyền `tplPath` để migration đọc `REMOVED_PATHS` THẬT ở lib.
  //
  //    Và nó khẳng định ba hình dạng khác nhau, vì đây là migration DUY NHẤT xoá file:
  //      · `HARNESS-CHANGELOG.md`  — một FILE ở gốc repo
  //      · `harness-migrations/`   — một THƯ MỤC nhiều file
  //      · `docs/cua-project.md`   — file của PROJECT, không có trong manifest ⇒ phải SỐNG
  const work14 = join(tmpdir(), `harness-mig010-real-${process.pid}`);
  try {
    rmSync(work14, { recursive: true, force: true });
    cpSync(repoPath('tooling', 'fixtures', 'migration-2.14.0'), work14, { recursive: true });
    const logs = [];
    const mod = await import(pathToFileURL(repoPath('harness-migrations', '010-bo-thu-template-da-bo.mjs')).href);
    await mod.up({
      repoPath: (...p) => join(work14, ...p),
      tplPath: (...p) => repoPath(...p),          // ⇒ migration đọc REMOVED_PATHS thật
      readJson: (p, fb = null) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fb; } },
      readFileSync, writeFileSync, existsSync: exists,
      log: m => logs.push(String(m)),
    });
    const has = rel => exists(join(work14, rel));
    const bad = [];
    if (has('HARNESS-CHANGELOG.md')) bad.push('HARNESS-CHANGELOG.md (file ở gốc) KHÔNG bị xoá');
    if (has('harness-migrations')) bad.push('harness-migrations/ (cả thư mục) KHÔNG bị xoá');
    if (!has('docs/cua-project.md')) bad.push('XOÁ NHẦM docs/cua-project.md — file của project, không có trong manifest');
    if (!logs.some(l => l.startsWith('✓'))) bad.push('xoá mà KHÔNG nói ra');
    if (bad.length) fail.push(`migration 010              bia mộ THẬT: ${bad.join(' · ')}`);
    else ok.push(`migration 010${' '.repeat(15)} bia mộ THẬT (tplPath): xoá được file lẻ ở gốc VÀ cả thư mục, giữ file của project`);
  } catch (e) {
    fail.push(`migration 010              THROW với bia mộ thật: ${String(e.message || e).slice(0, 100)}`);
  } finally {
    try { rmSync(work14, { recursive: true, force: true }); } catch {}
  }
}

// ─── HAI TẦNG: cái gác nào ĐANG THẬT SỰ cưỡng chế? ───────────────────────────
//
// `dcg.mjs` khớp regex trên CHUỖI lệnh. Đo 2026-08-06 (issue #43): 5/5 biến thể nguỵ trang
// bằng cú pháp nháy của shell đều LỌT, trong khi dạng thẳng thì chặn đúng. Hook không hỏng —
// nó làm đúng thứ nó được viết để làm, và regex thì không thắng được ngữ pháp shell.
//
// Nên câu hỏi đáng hỏi KHÔNG phải "regex đã kín chưa" (không bao giờ kín) mà là:
// **mỗi điều cấm có một TẦNG MỘT do vendor cưỡng chế đứng sau không?** `permissions.deny`
// được chính Claude Code kiểm, và 2.1.223 vừa cứng hoá nó đúng lớp lỗi này.
//
// Bảng dưới đây là HỢP ĐỒNG giữa hai tầng, và nó có ba tác dụng đo được:
//   ① Thêm một mục `DENY` mới mà không khai tầng một ⇒ ĐỎ. Buộc phải trả lời "ai cưỡng chế".
//   ② Số mục CHƯA có tầng một là một RATCHET — được giảm, không được tăng.
//   ③ Khai một pattern tầng một không có thật trong settings.json ⇒ ĐỎ. Bảng không nói dối được.
//
// KHÔNG đặt bảng này trong `dcg.mjs`: file đó thuộc `paths.harness`. Đặt ở đây là cố ý —
// nó cho phép đóng phần đo được của issue #43 mà không cần agent chạm vùng cấm.
{
  const dcgSrc = readFileSync(repoPath('.claude', 'hooks', 'dcg.mjs'), 'utf8');
  const whys = [...dcgSrc.matchAll(/why:\s*'([^']+)'/g)].map(m => m[1]);
  const deny = new Set((readJson(repoPath('.claude', 'settings.json'))?.permissions?.deny) || []);

  // BA giá trị, không phải hai — và giá trị thứ ba ra đời vì ratchet đang ép về một chỗ KHÔNG
  // TỚI ĐƯỢC (#177):
  //
  //   '<pattern>'         ĐÃ có tầng một, và pattern đó phải THẬT SỰ nằm trong settings.json
  //   null                CHƯA có — đếm vào ratchet, và ratchet chỉ được giảm
  //   { why: '<lý do>' }  KHÔNG THỂ có — không đếm vào ratchet, nhưng PHẢI viết ra vì sao
  //
  // Gộp hai ca cuối là đúng lỗi mà cả repo này nói về: `permissions.deny` khớp theo TIỀN TỐ
  // lệnh, nên có những điều cấm nó không bao giờ biểu diễn được (một ký tự ở giữa đối số).
  // Ép chúng vào `null` thì ratchet đòi một thứ không tồn tại, và cách duy nhất đi tiếp là
  // NỚI ratchet — tức phá đúng cái nó bảo vệ. `L0005` gọi tên chuyện này: một bộ đếm không
  // phân biệt được hai trạng thái sẽ đổ về phía dễ chịu.
  //
  // Cái giữ nó trung thực: lý do là BẮT BUỘC và được IN RA ở dòng xanh mỗi lần chạy, nên
  // "không thể có" là một lời khai review được trong PR, không phải một cửa thoát im lặng.
  const LAYER1 = new Map([
    ['ghi lại lịch sử chung',                        'Bash(git push --force:*)'],
    ['phá thay đổi chưa commit',                     'Bash(git reset --hard:*)'],
    ['xoá không hồi phục ở gốc hoặc thư mục hiện tại', 'Bash(rm -rf /:*)'],
    ['apply hạ tầng không review plan',              'Bash(terraform apply *-auto-approve:*)'],
    ['xoá file untracked, không đường cứu',          null],
    ['bỏ TOÀN BỘ thay đổi working tree',             null],
    ['xoá nhánh chung',                              null],
    ['viết lại nhánh chung',                         null],
    ['phá dữ liệu',                                  null],
    ['chạm production',                              null],
    ['lệnh cấp hệ thống',                            null],
    ['fork bomb',                                    null],
    ['backtick trong đối số văn bản: bash THAY nó bằng output của lệnh',
      { why: '`permissions.deny` khớp theo TIỀN TỐ lệnh (`Bash(node -e:*)`), nên nó chỉ chặn được CẢ `node -e` '
        + 'chứ không chặn được "một backtick nằm ngoài nháy đơn ở giữa đối số". Chặn cả `node -e` là bắn nhầm mọi lệnh một dòng hợp lệ' }],
  ]);

  // Ratchet: đo 2026-08-06. GIẢM thì sửa số này xuống; TĂNG là đỏ, và đó là mục đích.
  const UNCOVERED_RATCHET = 8;

  const IMPOSSIBLE = (v) => Boolean(v) && typeof v === 'object';
  const missing = whys.filter(w => !LAYER1.has(w));
  const stale = [...LAYER1.keys()].filter(w => !whys.includes(w));
  const lying = [...LAYER1].filter(([, p]) => typeof p === 'string' && !deny.has(p)).map(([w]) => w);
  const uncovered = whys.filter(w => LAYER1.get(w) === null);
  const impossible = whys.filter(w => IMPOSSIBLE(LAYER1.get(w)));
  // "Không thể có" mà KHÔNG viết lý do thì không phân biệt được với "tôi lười" — và nó sẽ
  // thành đường thoát mặc định cho mọi rule sau. Lý do là điều kiện để dùng ô thứ ba.
  const mute = [...LAYER1].filter(([, p]) => IMPOSSIBLE(p) && !String(p.why || '').trim()).map(([w]) => w);

  if (naIfBare(1, 'dcg ↔ permissions.deny: không đối chiếu được hai tầng')) {
    // `LAYER1` đọc `permissions.deny` từ `settings.json` — không có file thì mọi mục đều
    // trông như "khai một pattern tầng một KHÔNG có trong settings.json", tức lời buộc tội
    // nặng nhất của check này, dựa trên một bảng rỗng.
  } else if (!whys.length) {
    fail.push(`dcg ↔ permissions.deny${' '.repeat(6)} không rút được mục \`why\` nào từ dcg.mjs — neo của check này đã trôi, sửa neo thay vì xoá check`);
  } else if (missing.length) {
    fail.push(`dcg ↔ permissions.deny${' '.repeat(6)} ${missing.length} điều cấm trong dcg KHÔNG khai tầng một: ${missing.join(' · ')}`
      + ` — thêm vào bảng LAYER1 kèm pattern \`permissions.deny\`, hoặc \`null\` nếu thật sự chưa có tầng nào cưỡng chế. Câu hỏi phải được TRẢ LỜI, không được bỏ trống`);
  } else if (stale.length) {
    fail.push(`dcg ↔ permissions.deny${' '.repeat(6)} ${stale.length} mục trong bảng không còn trong dcg.DENY: ${stale.join(' · ')} — bảng đang mô tả một cái gác không tồn tại`);
  } else if (lying.length) {
    fail.push(`dcg ↔ permissions.deny${' '.repeat(6)} ${lying.length} mục khai một pattern tầng một KHÔNG có trong settings.json: ${lying.join(' · ')}`
      + ` — bảng nói có phòng thủ hai lớp trong khi chỉ có một.`
      + `\n         Ở REPO CON: \`settings.json\` là lớp SEED và bạn ĐƯỢC PHÉP sửa \`permissions.deny\` — nhưng bỏ một dòng ở đó`
      + ` nghĩa là điều cấm tương ứng chỉ còn \`dcg\` đứng sau, mà \`dcg\` né được bằng cú pháp nháy của shell (issue #43).`
      + ` Thêm lại dòng deny, hoặc chấp nhận một lớp và ghi lý do. Đây KHÔNG phải test của template hỏng ở repo bạn —`
      + ` nó là phòng thủ của bạn vừa mỏng đi, và đó là thứ chỉ bạn biết.`);
  } else if (mute.length) {
    fail.push(`dcg ↔ permissions.deny${' '.repeat(6)} ${mute.length} mục khai "tầng một KHÔNG THỂ có" mà không viết vì sao: ${mute.join(' · ')}`
      + ` — ô thứ ba là một LỜI KHAI review được, không phải cửa thoát. Không viết được lý do nghĩa là nó thuộc \`null\`.`);
  } else if (uncovered.length > UNCOVERED_RATCHET) {
    fail.push(`dcg ↔ permissions.deny${' '.repeat(6)} ${uncovered.length} điều cấm CHỈ có dcg đứng sau (ratchet ${UNCOVERED_RATCHET}) — `
      + `dcg né được bằng cú pháp nháy (issue #43), nên mỗi mục ở đây là một điều cấm KHÔNG có tầng nào cưỡng chế thật. Thêm dòng vào permissions.deny, đừng nới ratchet`);
  } else {
    ok.push(`dcg ↔ permissions.deny${' '.repeat(6)} ${whys.length} điều cấm đều khai tầng một; `
      + `${whys.length - uncovered.length - impossible.length} có, ${uncovered.length} chưa (ratchet ${UNCOVERED_RATCHET}, chỉ được giảm)`
      + (impossible.length ? `, ${impossible.length} KHÔNG THỂ có: ${impossible.map(w => `${w} — ${LAYER1.get(w).why}`).join(' | ')}` : ''));
  }
}

// ── KHÔNG CÒN CÁCH NÀO VIẾT RA MỘT GÁC CÂM ──────────────────────────────────
//
// Một cái gác CHẶN mà không để lại dòng nào tệ hơn một cái gác không chạy, và tệ theo hướng khó
// thấy: nó chặn đúng, không ai phàn nàn, còn `harness-doctor` đọc là `? chưa đo` và
// `/harness-retro` bước 4 — chỗ BẮT BUỘC đề xuất cắt bỏ — đọc là gác chưa bắt được gì.
// **Gác càng đúng mà càng im thì càng dễ bị cắt.** Chọn lọc ngược.
//
// Quét 2026-08-06: 9 lời gọi `block()`, **8 tự ghi sổ, 1 quên** — `protect-feature-files.mjs`
// nhánh `features/_index.json`, gác single-writer của DRI. Nhánh còn lại của CHÍNH file đó thì
// nhớ. Quy ước có tồn tại; nó trượt đúng một chỗ.
//
// Bản vá KHÔNG phải một ratchet đếm chỗ trượt — mà là `block()` tự ghi (2.17.0). Nên test ở đây
// khẳng định HÀNH VI, không quét văn bản: quét văn bản chỉ đo được "ai nhớ gọi", mà sau bản vá
// thì không còn ai cần nhớ nữa.
{
  const probe = (body) => {
    const f = join(tmpdir(), `harness-block-probe-${process.pid}-${Math.random().toString(36).slice(2)}.mjs`);
    const logFile = join(TEST_TELEMETRY_DIR, 'gate-fails.log');
    const before = exists(logFile) ? readFileSync(logFile, 'utf8').split('\n').filter(Boolean).length : 0;
    writeFileSync(f, body, 'utf8');
    const r = spawnSync(process.execPath, [f], {
      encoding: 'utf8', input: '{}',
      env: { ...process.env, HARNESS_TELEMETRY_DIR: TEST_TELEMETRY_DIR },
    });
    const lines = exists(logFile) ? readFileSync(logFile, 'utf8').split('\n').filter(Boolean) : [];
    rmSync(f, { force: true });
    return { status: r.status, added: lines.slice(before) };
  };
  const libUrl = JSON.stringify(pathToFileURL(repoPath('tooling', 'lib', 'harness.mjs')).href);

  // ① `block()` một mình PHẢI để lại dấu, và dấu đó phải mang TÊN gác — một dòng vô danh
  //    không nói được gác nào đã chặn, tức không dùng được cho quyết định cắt/giữ.
  const solo = probe(`import { block } from ${libUrl};\nblock('probe chan mot minh', 'khong sao');\n`);
  if (solo.status !== 2) fail.push(`lib/harness.mjs${' '.repeat(13)} block() không exit 2 (được ${solo.status}) — hợp đồng chặn đã vỡ`);
  else if (solo.added.length !== 1) fail.push(`lib/harness.mjs${' '.repeat(13)} block() không tự ghi \`gate-fails\` (${solo.added.length} dòng mới) — gác câm vẫn viết ra được`);
  else if (!/harness-block-probe/.test(solo.added[0])) fail.push(`lib/harness.mjs${' '.repeat(13)} block() ghi sổ nhưng KHÔNG kèm tên gác: ${solo.added[0].slice(0, 90)}`);
  else ok.push(`lib/harness.mjs${' '.repeat(13)} block() TỰ ghi \`gate-fails\` kèm tên gác — không còn cách nào viết ra một gác câm`);

  // ② Và KHÔNG đếm hai lần. 8/9 hook đã tự ghi kèm chi tiết mà chỉ chúng biết (issue nào, nhánh
  //    nào); nếu `block()` ghi thêm một dòng nữa thì mọi con số "n lần chặn" tăng gấp đôi —
  //    bản vá sinh ra để cứu bộ đếm lại làm hỏng đúng bộ đếm đó.
  const dbl = probe(`import { block, telemetry } from ${libUrl};\ntelemetry('gate-fails', ['ten-that', 'chi tiet rieng']);\nblock('probe da tu ghi', 'khong sao');\n`);
  if (dbl.added.length !== 1) fail.push(`lib/harness.mjs${' '.repeat(13)} chỗ gọi đã tự ghi mà block() ghi thêm ⇒ ${dbl.added.length} dòng cho MỘT lần chặn — mọi bộ đếm "n lần chặn" sai gấp đôi`);
  else if (!/ten-that/.test(dbl.added[0])) fail.push(`lib/harness.mjs${' '.repeat(13)} dòng còn lại không phải dòng của chỗ gọi — chi tiết riêng của hook đã mất`);
  else ok.push(`lib/harness.mjs${' '.repeat(13)} chỗ gọi đã tự ghi ⇒ block() im, giữ ĐÚNG một dòng và giữ chi tiết riêng của hook`);

  // ③ Ca thật đã sinh ra tất cả những dòng trên: `features/_index.json`. Trước 2.17.0 nhánh này
  //    chặn mà không để lại gì — hook duy nhất trong repo bị `harness-doctor` đọc là `? chưa đo`.
  const real = (() => {
    const logFile = join(TEST_TELEMETRY_DIR, 'gate-fails.log');
    const before = exists(logFile) ? readFileSync(logFile, 'utf8').split('\n').filter(Boolean).length : 0;
    const r = spawnSync(process.execPath, [repoPath('.claude', 'hooks', 'protect-feature-files.mjs')], {
      encoding: 'utf8',
      input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: 'features/_index.json' } }),
      env: { ...process.env, HARNESS_TELEMETRY_DIR: TEST_TELEMETRY_DIR },
    });
    const lines = exists(logFile) ? readFileSync(logFile, 'utf8').split('\n').filter(Boolean) : [];
    return { status: r.status, added: lines.slice(before) };
  })();
  if (real.status !== 2) fail.push(`protect-feature-files.mjs${' '.repeat(3)} _index.json KHÔNG còn bị chặn (exit ${real.status}) — gác single-writer của DRI đã mất`);
  else if (!real.added.some(l => /protect-feature-files/.test(l))) fail.push(`protect-feature-files.mjs${' '.repeat(3)} chặn _index.json mà KHÔNG để lại dòng nào mang tên nó — doctor sẽ đọc "? chưa đo" và /harness-retro sẽ đọc là gác vô dụng`);
  else ok.push(`protect-feature-files.mjs${' '.repeat(3)} chặn _index.json VÀ ghi sổ kèm tên — ca thật của lớp lỗi "gác câm" đã đóng`);
}

// ─── overlap-scan: CỐ VẤN, không phải gác ─────────────────────────────────────
//
// Đây là phần MÁY LÀM ĐƯỢC của `/claim` bước 3, tách ra để agent chạy được phần đi TÌM còn
// người giữ phần QUYẾT ĐỊNH. Hai bất biến, và cái đầu quan trọng hơn:
//
//   ① NÓ KHÔNG BAO GIỜ ĐƯỢC CHẶN. Exit khác 0 ở một công cụ cố vấn là một quả mìn: nó
//      không nằm trong `gates`, nên nếu một ngày ai đó cắm nó vào pre-commit hay CI, một
//      "cảnh báo" sẽ thành một lần chặn — và cách sửa nhanh nhất lúc đó là gỡ nó ra.
//   ② Nó phải ĐỎ ĐƯỢC. Một cái dò chưa từng tìm thấy gì thì không phân biệt được với một
//      cái dò hỏng. Ca dưới đây đưa vào đúng một đường dẫn thuộc `paths.hot`.
{
  const scan = (args, extraEnv = {}) => spawnSync(process.execPath, [repoPath('tooling', 'overlap-scan.mjs'), ...args], {
    encoding: 'utf8', cwd: repoPath(''), env: { ...process.env, ...TEST_ENV, ...extraEnv },
  });

  const hotGlobs = (readJson(repoPath('harness.config.json'))?.paths?.hot) || [];
  if (!hotGlobs.length) {
    fail.push(`overlap-scan.mjs${' '.repeat(12)} \`paths.hot\` rỗng ⇒ ca "đỏ được" MẤT PHẠM VI. Sửa neo, đừng xoá test`);
  } else {
    // `package.json` khớp `paths.hot` ở template. Lấy từ config chứ không gõ tay, để test
    // không mục khi ai đó đổi vùng nóng.
    const probe = hotGlobs.find(g => !g.includes('*')) || 'package.json';
    const hit = scan([probe, '--json']);
    let parsed = null; try { parsed = JSON.parse(hit.stdout || 'null'); } catch { /* dưới bắt */ }
    if (hit.status !== 0) fail.push(`overlap-scan.mjs${' '.repeat(12)} exit=${hit.status} với đầu vào CHẠM VÙNG NÓNG — công cụ cố vấn không được chặn`);
    else if (!parsed) fail.push(`overlap-scan.mjs${' '.repeat(12)} --json không cho ra JSON đọc được`);
    else if (!parsed.hot?.length) fail.push(`overlap-scan.mjs${' '.repeat(12)} đưa "${probe}" (thuộc paths.hot) mà KHÔNG báo vùng nóng — phép đối chiếu là trang trí`);
    else ok.push(`overlap-scan.mjs${' '.repeat(12)} phát hiện vùng nóng, và exit 0 (cố vấn, không chặn)`);
  }

  // Đường im lặng: không đối số, không chồng lấn ⇒ vẫn exit 0 và vẫn nói ra phạm vi đã đối chiếu.
  const quiet = scan([]);
  if (quiet.status !== 0) fail.push(`overlap-scan.mjs${' '.repeat(12)} exit=${quiet.status} ở đường KHÔNG có chồng lấn — cố vấn mà chặn là mìn`);
  else if (!/Phạm vi đối chiếu/.test(quiet.stdout)) fail.push(`overlap-scan.mjs${' '.repeat(12)} không nói ra ĐÃ ĐỐI CHIẾU CÁI GÌ — "không tìm thấy" mà không nêu phạm vi thì không đọc được`);
  else ok.push(`overlap-scan.mjs${' '.repeat(12)} đường im lặng: exit 0 và vẫn nêu phạm vi đã đối chiếu`);
}

// ─── rituals.mjs: BA GIÁ TRỊ, và "tới hạn" phải kèm SỐ ĐO ────────────────────
//
// Khẳng định vào `evaluate()` — hàm THUẦN — bằng trạng thái DỰNG SẴN. Không dựng repo giả:
// trạng thái git ở project đích là của HỌ, và một suite đọc nó sẽ đỏ theo cách không ai sửa
// được (knowledge/lessons/0003). Đây cũng là lý do `rituals.mjs` tách `collect()` khỏi
// `evaluate()` ngay từ đầu.
{
  const { evaluate } = await import('./rituals.mjs');
  const base = {
    issue: '', progressExists: false, commitsSinceProgress: 0, ahead: 0, integrationBranch: 'origin/main',
    // "Trạng thái ĐỦ" cho `/handoff` trên nhánh KHÔNG mang số issue = đã đo được cây làm việc.
    // `undefined` ở đây là "chưa nhìn" và phải ra `?` — ca ③ bên dưới khoá cả hai chiều.
    branch: 'fix/1-x', dirtyFiles: 0, unpushed: 0,
    fixlogTotal: 0, fixlogRepeated: 0, learningsNewerThanLessons: 0, learningsDeclined: 0,
    skillCount: 5, maxSkills: 12, worktrees: 1, maxWorktrees: 4, pendingPacks: 0, harnessBlocks: 0,
    // "Trạng thái ĐỦ" cho guard nhánh tích hợp = đã gặp ít nhất một ca. 0/0 là `?` (mẫu số
    // rỗng, L0005), và ca ③ bên dưới khoá đúng điều đó.
    mainEditEscapes: 0, mainEditBlocks: 1,
    claudeCodeVersion: '2.1.221', reviewedClaudeCode: '2.1.221', reviewedClaudeCodeAt: '2026-08-05T00:00:00.000Z',
    // "Trạng thái ĐỦ" cho `claude-code-drift` giờ gồm cả PHÉP TRỪ TẬP HỢP, không chỉ phép so
    // version: tập sự kiện hook phải đã được đo ở đúng version đang chạy (issue #85).
    nativeEventsVersion: '2.1.221', nativeEventsCount: 31,
    // "Trạng thái ĐỦ" cho ngân sách = đã khai trần VÀ đã đo. Chỉ khai trần thôi là `?` —
    // ca ③ bên dưới khoá đúng điều đó.
    budget: { mode: 'ok', percent: 14, ageDays: 3, advice: null },
    // "Trạng thái ĐỦ" cho sổ ô native = MỌI ô để trống đã được xét. `unexamined: []` là điều
    // kiện duy nhất làm mục này xanh; ô `co-viec` KHÔNG giữ nó đỏ (xem chú thích của nghi thức
    // `native-slot-review`: nó theo dõi "đã HỎI chưa", không phải "đã LÀM chưa").
    nativeSlots: { empty: ['A', 'B'], hasWork: ['A'], noWork: ['B'], unexamined: [], stale: [], wiredJudged: [], issues: ['#130'] },
  };
  const get = (state, id) => evaluate({ ...base, ...state }).find(r => r.id === id);

  // ① Trạng thái sạch ⇒ không có gì tới hạn. Một bảng lúc nào cũng đỏ thì bị tắt tiếng.
  const clean = evaluate(base);
  if (clean.some(r => r.state === 'due')) {
    fail.push(`rituals.mjs${' '.repeat(17)} trạng thái sạch mà vẫn có ${clean.filter(r => r.state === 'due').length} mục tới hạn: ${clean.filter(r => r.state === 'due').map(r => r.id).join(' · ')}`);
  } else if (clean.some(r => r.state === '?')) {
    fail.push('rituals.mjs                 trạng thái ĐỦ mà vẫn có mục `?` — `?` phải dành cho KHÔNG ĐO ĐƯỢC');
  } else {
    ok.push(`rituals.mjs${' '.repeat(17)} trạng thái sạch ⇒ 0 mục tới hạn, 0 mục \`?\` (${clean.length} nghi thức)`);
  }

  // ② `null` là KHÔNG ĐO ĐƯỢC ⇒ `?`, KHÔNG được thành `ok`. Đây là chỗ một bảng điều khiển
  //    hay nói dối theo hướng dễ chịu: chưa nhìn thì báo ổn.
  const nulls = [['ahead', 'pre-merge'], ['fixlogTotal', 'harness-retro'], ['skillCount', 'entropy-sweep'],
    ['worktrees', 'wt'], ['pendingPacks', 'accept-packs'], ['learningsNewerThanLessons', 'knowledge-promote'],
    // `features/` không đọc được ⇒ `?`. KHÔNG được thành "không có gì để chụp" — đó là câu
    // trả lời DỄ CHỊU, và nó xoá đúng cái nghi thức vừa được thêm để chống việc bỏ quên UI.
    ['ui', 'verify-ui'],
    // Không đọc được version Claude Code ⇒ `?`. KHÔNG được thành `due`: cách cài không đặt
    // `CLAUDE_CODE_EXECPATH` là chuyện bình thường, và một mục đỏ vĩnh viễn không sửa được
    // dạy đúng cái thói bỏ qua màu đỏ mà cả tầng nghi thức tồn tại để chống.
    ['claudeCodeVersion', 'claude-code-drift'],
    // `gate-fails.log` không đọc được ⇒ `?`. KHÔNG được thành "chưa lần nào bị chặn": đó là
    // gộp "chưa nhìn" vào "ổn" ở đúng nghi thức canh con đường HỢP PHÁP DUY NHẤT vào vùng cấm.
    ['harnessBlocks', 'harness-propose']];
  const wrong = nulls.filter(([k, id]) => get({ [k]: null }, id)?.state !== '?');
  if (wrong.length) fail.push(`rituals.mjs${' '.repeat(17)} ${wrong.length} nghi thức coi \`null\` (không đo được) là trạng thái BÌNH THƯỜNG: ${wrong.map(w => w[1]).join(' · ')}`);
  else ok.push(`rituals.mjs${' '.repeat(17)} \`null\` ⇒ \`?\` ở cả ${nulls.length} nghi thức đo bằng số (không gộp "chưa nhìn" vào "ổn")`);

  // ③ Nhánh không mang số issue: KHÔNG CÓ CHỦ NGỮ ⇒ `n/a`, và tuyệt đối KHÔNG `ok`.
  //
  //    Tới 2.52.0 ca này là `?`, và chú thích ở `session-start.mjs` ghi thẳng cái giá: BA
  //    nghi thức cùng ra `?` mỗi phiên vì cùng một lý do, trên một tình huống chỉ sửa được
  //    bằng cách đổi tên nhánh. Cái phải giữ không phải chữ `?` — mà là "không được thành
  //    `ok`", vì `ok` khẳng định nghi thức đã chạy và sạch.
  //
  //    Bảng dưới khoá CẢ HAI CHIỀU trên cả ba mục, nên một lần sửa quá tay theo hướng dễ
  //    chịu (`n/a` → `ok`) chết ở đây, chứ không chỉ chiều `?` → `n/a` mà bản vá này nhắm tới.
  {
    const NOISSUE = [
      ['claim', /không mang số issue/],
      ['verify-ui', /không mang số issue/],
    ];
    const bad = [];
    for (const [id, re] of NOISSUE) {
      const r = get({ issue: null }, id);
      if (r?.state !== 'n/a') bad.push(`${id} ra \`${r?.state}\` thay vì \`n/a\``);
      else if (!re.test(r.why)) bad.push(`${id} là \`n/a\` nhưng \`why\` không nói vì sao không áp dụng`);
    }
    // `/handoff` là NGOẠI LỆ CỐ Ý và nó phải được khẳng định riêng, không gộp vào bảng trên:
    // chủ ngữ của nó là CÔNG VIỆC SẼ MẤT, thứ tồn tại độc lập với tên nhánh. Cây bẩn ⇒ vẫn ĐỎ.
    const dirty = get({ issue: null, dirtyFiles: 3, ahead: 0, unpushed: 0 }, 'handoff');
    if (dirty?.state !== 'due') bad.push(`handoff: nhánh không số issue + 3 file bẩn ⇒ \`${dirty?.state}\`, phải là \`due\` (đây là ca đã làm mất việc thật, nhật ký W32)`);
    else if (!/\d/.test(dirty.why)) bad.push('handoff: mục đỏ không kèm số đo');

    // ── ĐO MỘT ĐẠI LƯỢNG, GIẢI THÍCH BẰNG MỘT ĐẠI LƯỢNG KHÁC ───────────────────────────
    //
    // `ahead` (chưa vào nhánh tích hợp) và `unpushed` (chưa ở remote NÀO) là hai đại lượng
    // khác nhau, và chỉ cái thứ hai mới "biến mất khi bạn đổi máy". Bản trước đo `ahead` rồi
    // in đúng câu đó — đo 2026-08-13, ngay sau khi push nhánh và mở PR #198: mục đỏ nói 2
    // commit sắp mất, trong khi cả 2 đang nằm trên remote.
    //
    // Hai ca dưới có CÙNG `ahead: 2` và khác nhau đúng ở `unpushed`. Đó là điều kiện để
    // mutant "quay lại đọc `ahead`" bị giết: một ca thôi thì nó sống.
    const notPushed = get({ issue: null, dirtyFiles: 0, ahead: 2, unpushed: 2 }, 'handoff');
    if (notPushed?.state !== 'due') bad.push(`handoff: 2 commit CHƯA đẩy ⇒ \`${notPushed?.state}\`, phải là \`due\``);
    else if (!/biến mất/.test(notPushed.why)) bad.push('handoff: commit chưa đẩy mà KHÔNG nói nó sẽ mất — đó là cả lý do mục này tồn tại');

    const pushedNotMerged = get({ issue: null, dirtyFiles: 0, ahead: 2, unpushed: 0 }, 'handoff');
    if (pushedNotMerged?.state !== 'due') bad.push(`handoff: 2 commit ĐÃ đẩy mà chưa merge ⇒ \`${pushedNotMerged?.state}\`, phải là \`due\` (phiên sau vẫn cần biết nó chờ gì)`);
    else if (/biến mất/.test(pushedNotMerged.why)) bad.push('handoff: commit ĐÃ ở trên remote mà vẫn bảo "biến mất khi đổi máy" — đo `ahead`, giải thích bằng `unpushed`');
    else if (!/KHÔNG mất/.test(pushedNotMerged.why)) bad.push('handoff: không nói rõ phần đã đẩy thì KHÔNG mất — người đọc vẫn phải tự đoán đại lượng nào đang được nói');

    // Và chỉ khi CẢ BA tín hiệu đã đo và đều bằng 0 thì mới được im.
    const quiet = get({ issue: null, dirtyFiles: 0, ahead: 0, unpushed: 0 }, 'handoff');
    if (quiet?.state !== 'n/a') bad.push(`handoff: cây sạch + 0 commit đi trước ⇒ \`${quiet?.state}\`, phải là \`n/a\``);
    // MUTANT: một tín hiệu KHÔNG ĐO ĐƯỢC mà các tín hiệu kia bằng 0 ⇒ `?`. Đây là chỗ dễ trượt
    // nhất của bản vá này — `null > 0` là `false`, nên một `null` lặng lẽ đi thẳng vào nhánh
    // "không có gì để giao lại" nếu thiếu đúng phép kiểm `== null`.
    for (const k of ['dirtyFiles', 'ahead', 'unpushed']) {
      const zeros = { dirtyFiles: 0, ahead: 0, unpushed: 0 };
      const r = get({ issue: null, ...zeros, [k]: null }, 'handoff');
      if (r?.state !== '?') bad.push(`handoff: \`${k}\` không đọc được (kia = 0) ⇒ \`${r?.state}\`, phải là \`?\` — "chưa nhìn" KHÔNG được thành "không có gì để giao lại"`);
    }
    // Nhưng một tín hiệu DƯƠNG thắng một tín hiệu hỏng: biết chắc có việc dở thì không cần
    // phép đo còn lại. Ngược lại là để một `null` nuốt mất một mục đỏ đúng.
    const half = get({ issue: null, dirtyFiles: null, ahead: 4, unpushed: 4 }, 'handoff');
    if (half?.state !== 'due') bad.push(`handoff: 4 commit chưa đẩy + cây không đọc được ⇒ \`${half?.state}\`, phải là \`due\``);

    if (bad.length) fail.push(`rituals.mjs${' '.repeat(17)} nhánh không mang số issue: ${bad.join(' · ')}`);
    else ok.push(`rituals.mjs${' '.repeat(17)} nhánh không mang số issue ⇒ /claim + /verify-ui là \`n/a\` (không \`ok\`), /handoff phân biệt CHƯA ĐẨY (sẽ mất) với ĐÃ ĐẨY CHƯA MERGE (không mất)`);
  }

  // ④ Mọi mục TỚI HẠN phải kèm SỐ ĐO. Một dòng "nên chạy X" không có số là lời khuyên, và
  //    lời khuyên chung chính là thứ dòng nhắc tĩnh cũ đã làm — trong 100% số phiên, vô hiệu.
  const dues = evaluate({ ...base, issue: 'SKB-1', ahead: 3, fixlogRepeated: 2, fixlogTotal: 7,
    learningsNewerThanLessons: 1, skillCount: 13, worktrees: 9, pendingPacks: 3 }).filter(r => r.state === 'due');
  const noNumber = dues.filter(r => !/\d/.test(r.why));
  if (dues.length < 6) fail.push(`rituals.mjs${' '.repeat(17)} trạng thái đầy vi phạm mà chỉ ${dues.length} mục tới hạn — có nghi thức không phản ứng`);
  else if (noNumber.length) fail.push(`rituals.mjs${' '.repeat(17)} ${noNumber.length} mục tới hạn KHÔNG có số đo trong \`why\`: ${noNumber.map(r => r.id).join(' · ')}`);
  else ok.push(`rituals.mjs${' '.repeat(17)} ${dues.length} mục tới hạn, mục nào cũng kèm SỐ ĐO trong \`why\``);

  // ④d `/verify-ui` — nghi thức cuối cùng của 9 skill chỉ-người-gõ chưa có gì nhắc (2.15.0 ghi
  //     thẳng điều đó). Bảng dưới khoá cả năm trạng thái, và cái quan trọng nhất là ca `n/a`:
  //     một project không làm web mà bị nhắc chụp ảnh mỗi phiên sẽ tắt nghi thức, và lúc đó
  //     mất luôn ca `owed` — mục đỏ sai làm hỏng mục đỏ đúng nằm cạnh nó.
  const UI = [
    [{ issue: '' }, 'ok', 'nhánh tích hợp ⇒ không có gì để chụp'],
    [{ issue: 'SKB-1', ui: undefined }, 'ok', 'issue không có file feature ⇒ im, không đoán'],
    [{ issue: 'SKB-1', ui: { id: 'f', state: 'n/a', why: 'CLI thuần' } }, 'ok', 'web ngoài scope ⇒ im (nếu không, project không-web sẽ tắt nghi thức)'],
    [{ issue: 'SKB-1', ui: { id: 'f', state: 'no-web' } }, 'ok', 'feature không khai nền web ⇒ im'],
    [{ issue: 'SKB-1', ui: { id: 'f', state: 'done', evidence: 'docs/evidence/SKB-1/web-desktop-1440x900.png' } }, 'ok', 'đã có bằng chứng ⇒ im'],
    [{ issue: 'SKB-1', ui: { id: 'f', state: 'owed' } }, 'due', 'web trong scope mà chưa pass ⇒ TỚI HẠN'],
  ];
  const badUI = UI.filter(([state, want]) => get(state, 'verify-ui')?.state !== want);
  if (badUI.length) fail.push(`rituals.mjs${' '.repeat(17)} verify-ui sai ở ${badUI.length}/${UI.length} ca: ${badUI.map(([, , l]) => l).join(' · ')}`);
  else ok.push(`rituals.mjs${' '.repeat(17)} verify-ui: ${UI.length} trạng thái phân biệt được, chỉ ca "còn nợ ảnh" mới đỏ`);

  // ④e Mục `?` phải NÊU TÊN ở bản ngắn (bản SessionStart gọi), không chỉ đếm. Gặp thật
  //     2026-08-06: một mục `?` hiện ở SessionStart rồi biến mất trước khi kịp chạy `--all`,
  //     nên lời khuyên "chạy --all để xem" không trả lời được cho chính ca nó phục vụ.
  const ritCli = readFileSync(repoPath('tooling', 'rituals.mjs'), 'utf8');
  const shortForm = ritCli.slice(ritCli.indexOf('if (!ALL)'), ritCli.indexOf('report(') > 0 ? ritCli.indexOf('report(', ritCli.indexOf('if (!ALL)')) : undefined);
  if (!/for \(const r of unknown\)/.test(shortForm)) {
    fail.push(`rituals.mjs${' '.repeat(17)} bản ngắn không duyệt \`unknown\` để nêu TÊN — một mục \`?\` chập chờn sẽ không bao giờ tra được`);
  } else ok.push(`rituals.mjs${' '.repeat(17)} bản ngắn NÊU TÊN mục \`?\`, không chỉ đếm — \`?\` chập chờn vẫn tra được sau khi đã qua`);

  // ④b `claude-code-drift`: ba trạng thái phải PHÂN BIỆT ĐƯỢC, và hai cái `null` khác nghĩa.
  //     `claudeCodeVersion: null` = không đo được (`?`, đã kiểm ở ②).
  //     `reviewedClaudeCode: null` = ĐO ĐƯỢC mà chưa ai rà (`due`).
  //     Gộp hai cái đó là cách một việc tới hạn thật biến thành một dòng im lặng.
  //
  //     Và DRIFT CÓ HAI CHIỀU. `reviewedVersion` là sự thật CỦA REPO (được commit, máy khác có
  //     thể đã ghi); version đang chạy là sự thật CỦA MÁY NÀY — hai đại lượng khác chủ ngữ thì
  //     lệch được cả hai chiều. Bản trước dùng `!==`, một phép so KHÔNG CÓ CHIỀU, nên chiều lùi
  //     in *"đã đổi 2.1.228 → 2.1.222: đọc changelog bản mới"* về một bản CŨ HƠN (đo 2026-08-13).
  //     Ca chiều lùi ở đây là ca mà mutant "quay lại `!==`" phải giết.
  const DRIFT = [
    [{ reviewedClaudeCode: null }, 'due', /CHƯA có bản rà/, 'chưa có baseline ⇒ tới hạn (không phải `?`)'],
    [{ reviewedClaudeCode: '2.1.200' }, 'due', /2\.1\.200 → 2\.1\.221/, 'chiều TIẾN: version đổi ⇒ tới hạn, và nêu CẢ HAI số'],
    [{ reviewedClaudeCode: '2.1.228' }, 'ok', /CŨ HƠN/, 'chiều LÙI: sổ đã rà bản mới hơn máy này ⇒ KHÔNG có việc'],
    [{ reviewedClaudeCode: '2.1.228' }, 'ok', /ĐỪNG chạy/, 'chiều LÙI còn phải CẢN lệnh rà — chạy nó ở đây hạ mốc đã rà của đội (L0008)'],
    [{ reviewedClaudeCode: 'ban-nao-do' }, '?', /không so được/, 'không đọc được dạng x.y.z ⇒ `?`, KHÔNG im lặng coi như bằng nhau'],
    [{}, 'ok', /2\.1\.221/, 'đã rà đúng version đang chạy ⇒ im lặng'],
  ];
  for (const [state, want, msg, label] of DRIFT) {
    const r = get(state, 'claude-code-drift');
    if (r?.state !== want) fail.push(`rituals.mjs${' '.repeat(17)} claude-code-drift: ${label} → state=${r?.state}, mong đợi ${want}`);
    else if (!msg.test(r.why)) fail.push(`rituals.mjs${' '.repeat(17)} claude-code-drift: ${label} → \`why\` không khớp ${msg}`);
    else ok.push(`rituals.mjs${' '.repeat(17)} claude-code-drift: ${label}`);
  }

  // ④c `/knowledge-promote` phải ĐẾM ỨNG VIÊN, không đếm FILE.
  //
  //     `/harness-retro` BẮT BUỘC ghi một file vào `.claude/learnings/`, và mục này đếm file ở
  //     đó mới hơn bài học mới nhất. Nên chạy đúng hai nghi thức theo đúng thứ tự kết thúc bằng
  //     đèn đỏ y như lúc bắt đầu — kể cả khi kết luận của retro là "không có gì đáng promote".
  //     Ghi sổ 2026-08-05, còn nguyên tới 2026-08-13. Một tín hiệu mà hành động ĐÚNG không tắt
  //     được là tín hiệu sẽ bị bỏ qua (`L0008`).
  const KP = [
    [{ learningsNewerThanLessons: 2, learningsDeclined: 0 }, 'due', /2 file/, 'có ứng viên thật ⇒ vẫn tới hạn'],
    [{ learningsNewerThanLessons: 2, learningsDeclined: 0 }, 'due', /promote:/, 'mục đỏ phải CHỈ RA cửa thoát, nếu không nó là mục đỏ không tắt được'],
    [{ learningsNewerThanLessons: 0, learningsDeclined: 3 }, 'ok', /3 file/, 'đã khai KHÔNG promote ⇒ xanh, và số file khai HIỆN RA'],
    [{ learningsNewerThanLessons: 0, learningsDeclined: 0 }, 'ok', /không có/, 'không có gì mới ⇒ xanh, không nhắc cơ chế'],
  ];
  for (const [state, want, msg, label] of KP) {
    const r = get(state, 'knowledge-promote');
    if (r?.state !== want) fail.push(`rituals.mjs${' '.repeat(17)} knowledge-promote: ${label} → state=${r?.state}, mong đợi ${want}`);
    else if (!msg.test(r.why)) fail.push(`rituals.mjs${' '.repeat(17)} knowledge-promote: ${label} → \`why\` không khớp ${msg}: "${String(r.why).slice(0, 80)}"`);
    else ok.push(`rituals.mjs${' '.repeat(17)} knowledge-promote: ${label}`);
  }

  // ④d Vị ngữ THUẦN đứng sau cửa thoát đó. Mặc định VẮNG = vẫn là ứng viên: 17 file learnings
  //     đang có không đổi hành vi, nên cửa này chỉ mở khi có người chủ động khai.
  {
    const PD = [
      ['---\npromote: chưa đủ 2 lần — mới 1 ca\n---\n# x', 'chưa đủ 2 lần — mới 1 ca', 'khai LÝ DO ⇒ trả về chính lý do đó'],
      ['---\npromote: candidate\n---\n# x', null, '`candidate` = khai RÕ là vẫn chờ ⇒ vẫn đếm'],
      ['---\npromote:\n---\n# x', null, 'trường bỏ TRỐNG là chưa quyết, không phải đã quyết là không'],
      ['---\nowner: lan\n---\n# x', null, 'có frontmatter mà không có trường ⇒ vẫn là ứng viên'],
      ['# x', null, 'không frontmatter ⇒ vẫn là ứng viên (mọi file cũ giữ nguyên hành vi)'],
      ['', null, 'file rỗng không được ném'],
    ];
    const badPD = PD.filter(([src, want]) => promoteDeclined(src) !== want);
    if (badPD.length) fail.push(`promoteDeclined${' '.repeat(14)} sai ${badPD.length}/${PD.length} ca: ${badPD.map(([, , l]) => l).join(' · ')}`);
    else ok.push(`promoteDeclined${' '.repeat(14)} trả LÝ DO khi đã khai, \`null\` khi vắng/rỗng/candidate — ${PD.length} ca`);
  }

  // ④c Phép rút version từ đường dẫn thực thi. Đo được: `…/versions/2.1.221`. Thứ gì KHÔNG
  //     phải version thì trả `null` — không đoán. Một chuỗi đoán sai làm nghi thức so hai
  //     version bịa và đỏ mãi.
  const { claudeCodeVersion } = await import('./rituals.mjs');
  const VER = [
    ['/home/x/.local/share/claude/versions/2.1.221', '2.1.221'],
    ['C:\\Users\\x\\AppData\\claude\\versions\\2.1.221', '2.1.221'],   // Parity Contract: Windows
    ['/usr/local/bin/claude', null],
    ['', null],
  ];
  const badVer = VER.filter(([inp, want]) => claudeCodeVersion(inp) !== want);
  if (badVer.length) fail.push(`rituals.mjs${' '.repeat(17)} claudeCodeVersion() sai ở ${badVer.length}/${VER.length} ca: ${badVer.map(([i]) => JSON.stringify(i)).join(' · ')}`);
  else ok.push(`rituals.mjs${' '.repeat(17)} claudeCodeVersion(): ${VER.length} ca kể cả đường dẫn Windows, không đoán khi không phải version`);

  // ④b-bis `/harness-propose`: ngưỡng phải là 2, và "0 lần" phải im lặng.
  //     Tới 2.14.0 đây là skill người-gọi DUY NHẤT không có cơ chế nào nhắc tới — con đường
  //     hợp pháp duy nhất vào vùng cấm chỉ chạy khi ai đó tình cờ nhớ ra nó tồn tại. Ngưỡng 2
  //     khớp ngưỡng của chính skill ("một lần là ngẫu nhiên"); hạ xuống 1 là biến nó thành
  //     tiếng ồn ở mỗi lần guard làm đúng việc của guard.
  const HP = [
    [{ harnessBlocks: 0 }, 'ok', /chưa lần nào/, '0 lần ⇒ im lặng'],
    [{ harnessBlocks: 1 }, 'ok', /chưa đạt ngưỡng 2/, '1 lần ⇒ vẫn im, nhưng NÓI RA con số'],
    [{ harnessBlocks: 2 }, 'due', /2 lần bị .*protect-harness.* chặn/, '2 lần ⇒ tới hạn, kèm số đo'],
  ];
  for (const [state, want, msg, label] of HP) {
    const r = get(state, 'harness-propose');
    if (r?.state !== want) fail.push(`rituals.mjs${' '.repeat(17)} harness-propose: ${label} → state=${r?.state}, mong đợi ${want}`);
    else if (!msg.test(r.why)) fail.push(`rituals.mjs${' '.repeat(17)} harness-propose: ${label} → \`why\` không khớp ${msg}`);
    else ok.push(`rituals.mjs${' '.repeat(17)} harness-propose: ${label}`);
  }

  // ④b-quinquies `claude-code-drift`: phép so VERSION là chưa đủ, còn một PHÉP TRỪ TẬP HỢP.
  //     Đo 2026-08-07 (#85): bản rà `2.1.222` ghi "13 tên"; binary `2.1.224` có **31**; bản rà
  //     `2.1.224` — viết cùng ngày — không nhắc tập nào. Nghi thức kích hoạt bằng MÁY nhưng
  //     trả lời bằng NGƯỜI, nên con số duy nhất kiểm được bằng máy trong cả bề mặt đó đi từ
  //     13 lên 31 mà không cơ chế nào tính.
  //
  //     Ba ca: chưa đo lần nào · đo ở version CŨ · đo đúng version. Hai ca đầu phải `due`
  //     KỂ CẢ khi changelog đã được rà — rà changelog và đo tập sự kiện là hai việc khác nhau.
  const DRIFT_SET = [
    [{ nativeEventsVersion: null }, 'due', /CHƯA đo tập sự kiện/, 'chưa đo lần nào ⇒ tới hạn, dù changelog đã rà'],
    [{ nativeEventsVersion: '2.1.200' }, 'due', /mới đo ở 2\.1\.200/, 'đo ở version CŨ ⇒ tới hạn'],
    [{}, 'ok', /31 sự kiện/, 'đo đúng version ⇒ im, và NÓI RA con số'],
  ];
  for (const [state, want, msg, label] of DRIFT_SET) {
    const r = get(state, 'claude-code-drift');
    if (r?.state !== want) fail.push(`rituals.mjs${' '.repeat(17)} claude-code-drift/tập sự kiện: ${label} → state=${r?.state}, mong đợi ${want}`);
    else if (!msg.test(r.why)) fail.push(`rituals.mjs${' '.repeat(17)} claude-code-drift/tập sự kiện: ${label} → \`why\` không khớp ${msg}: "${r.why}"`);
    else ok.push(`rituals.mjs${' '.repeat(17)} claude-code-drift/tập sự kiện: ${label}`);
  }

  // ④b-quinquies PHẦN TRÍCH XUẤT của `native-surface` — issue #88.
  //
  //     Ba ca trên khoá TRẠNG THÁI NGHI THỨC (đã đo chưa, đo ở version nào). Chúng không
  //     chạm `nativeHookEvents()` — chỗ thật sự rút dữ liệu ra khỏi binary, và là chỗ duy
  //     nhất có logic đáng sai. Khẳng định vào hàm THUẦN `pickEventArray`, cùng lý do bảng
  //     `dangerousCommand`: một binary 285 MB không dựng được trong CI ba OS.
  {
    const L = ' '.repeat(11);
    const big = JSON.stringify(['PreToolUse', 'PostToolUse', 'Stop', 'SessionEnd', 'Setup', 'PreCompact', 'ConfigChange', 'TaskCompleted']);
    const small = JSON.stringify(['PreToolUse', 'PostToolUse', 'Stop', 'SessionEnd', 'Setup', 'PreCompact', 'ConfigChange']);

    const PICK = [
      [`a=${small};b=${big};`, 8, 'nhiều ứng viên ⇒ lấy mảng DÀI NHẤT, không lấy cái ĐẦU TIÊN'],
      [`z=${big};y=${small};`, 8, 'dài nhất thắng kể cả khi nó đứng TRƯỚC'],
      [`v=['PreToolUse','PostToolUse','Stop','SessionEnd','Setup','PreCompact','ConfigChange']`, 7, 'nháy đơn vẫn parse được'],
      [`w=["Alpha","Beta","Gamma","Delta","Epsilon","Zeta","Eta"]`, null, 'mảng đủ dài nhưng KHÔNG chứa PreToolUse ⇒ bỏ'],
      [`u=["PreToolUse","PostToolUse","Stop"]`, null, 'mảng quá ngắn ⇒ bỏ (ngưỡng ≥7)'],
      [`không có mảng nào`, null, 'không có ứng viên ⇒ null, KHÔNG phải mảng rỗng'],
    ];
    const badPick = PICK.filter(([txt, want]) => (pickEventArray(txt)?.length ?? null) !== want);
    if (badPick.length) fail.push(`native-surface${L} pickEventArray sai ${badPick.length}/${PICK.length} ca: ${badPick.map(c => c[2]).join(' · ')}`);
    else ok.push(`native-surface${L} pickEventArray ${PICK.length} ca — "lấy mảng ĐẦU TIÊN" bị giết; tập CON đọc y hệt "vendor bỏ N sự kiện"`);

    // Ca vắt qua ranh giới khối: chỗ DUY NHẤT phép quét sai IM LẶNG — nó trả `null`, và
    // `null` đọc y hệt "bundle đổi hình dạng". Fixture vài trăm byte + khối nhỏ, nên nó
    // chạy được ở cả ba OS thay vì đòi một binary 285 MB.
    const fx = join(tmpdir(), `native-surface-${process.pid}.bin`);
    const CH = 128, OV = 64;
    writeFileSync(fx, 'x'.repeat(CH - 20) + big + 'y'.repeat(300), 'latin1');
    let straddle;
    try { straddle = nativeHookEvents(fx, { chunk: CH, overlap: OV }); }
    finally { try { unlinkSync(fx); } catch { /* dọn được thì tốt */ } }
    if (big.length <= CH - OV) {
      fail.push(`native-surface${L} fixture thôi vắt qua ranh giới khối (mảng ${big.length}B ≤ bước nhảy ${CH - OV}B) — ca này đã ngừng kiểm thứ nó sinh ra để kiểm`);
    } else if (straddle?.length !== 8) {
      fail.push(`native-surface${L} mảng vắt qua ranh giới khối bị BỎ SÓT (được ${straddle?.length ?? 'null'}/8) — chồng lấn không cứu được, và phép đo im lặng trả null`);
    } else {
      ok.push(`native-surface${L} mảng vắt qua ranh giới khối vẫn bắt được — chồng lấn ${OV}B làm đúng việc của nó`);
    }

    // Chồng lấn phải LỚN HƠN mảng thật, và ca này đỏ TRƯỚC khi nó thôi đúng. `OVERLAP = 8192`
    // an toàn hôm nay vì mảng ~700 B; nó thôi an toàn khi vendor thêm sự kiện tới lúc mảng
    // vượt 8 KB — lúc đó phép đo trả `null`, đọc y hệt "bundle đổi hình dạng".
    const real = nativeHookEvents();
    if (!real) {
      declareNa(1, `native-surface${L} không đo được binary ở máy này (CLAUDE_CODE_EXECPATH?) — biên chồng lấn KHÔNG kiểm được, và đây không phải "đạt"`);
    } else {
      const realBytes = JSON.stringify(real).length;
      if (realBytes >= SCAN.overlap) {
        fail.push(`native-surface${L} mảng thật ${realBytes}B ĐÃ VƯỢT chồng lấn ${SCAN.overlap}B — một mảng rơi đúng ranh giới khối sẽ bị bỏ sót IM LẶNG. Nâng \`SCAN.overlap\``);
      } else {
        ok.push(`native-surface${L} mảng thật ${realBytes}B < chồng lấn ${SCAN.overlap}B — còn ${SCAN.overlap - realBytes}B biên trước khi phép quét hỏng im lặng`);
      }
    }

    // ── Bảng key frontmatter (#94) ────────────────────────────────────────────
    //
    // Cùng phép chọn "mảng dài nhất", neo khác. Ca đáng giá nhất là ca CHỮ HOA: bản đầu của
    // regex này chỉ nhận `[a-z]`, và bảng thật chứa `mcpServers` · `disallowedTools` ·
    // `permissionMode` ⇒ nó khớp **0 mảng**, im lặng. Một `null` ở đây đọc y hệt "vendor đổi
    // hình dạng bundle", nên bug đó tự nguỵ trang thành một phát hiện.
    const FM20 = (extra = []) => JSON.stringify([
      'name', 'description', 'model', 'allowed-tools', 'argument-hint', 'arguments',
      'disable-model-invocation', 'user-invocable', 'effort', 'shell', 'version',
      'when_to_use', 'paths', 'hooks', 'context', 'agent', 'created_by', 'improved_by',
      'metadata', 'license', ...extra,
    ]);
    const FM = [
      [`x=${FM20()};`, 20, 'bảng tối thiểu 20 key có neo disable-model-invocation'],
      [`a=${FM20()};b=${FM20(['mcpServers', 'disallowedTools', 'permissionMode'])};`, 23,
        'MUTANT chữ hoa: bảng có mcpServers/disallowedTools vẫn khớp, và bản DÀI HƠN thắng'],
      [`y=${JSON.stringify(['alpha', 'beta', 'gamma'])}`, null, 'mảng quá ngắn ⇒ bỏ'],
      [`z=${JSON.stringify(Array.from({ length: 25 }, (_, i) => `key${i}`))}`, null,
        'đủ dài nhưng KHÔNG có neo disable-model-invocation ⇒ bỏ'],
    ];
    const badFM = FM.filter(([txt, want]) => (pickFrontmatterKeys(txt)?.length ?? null) !== want);
    if (badFM.length) fail.push(`native-surface${L} pickFrontmatterKeys sai ${badFM.length}/${FM.length} ca: ${badFM.map(c => c[2]).join(' · ')}`);
    else ok.push(`native-surface${L} pickFrontmatterKeys ${FM.length} ca — lớp ký tự nhận CHỮ HOA (mcpServers…), thiếu nó thì khớp 0 mảng và im`);

    // Chuẩn hoá: vendor đọc key qua replace(/[-_]/g,'').toLowerCase(). Không chuẩn hoá thì
    // doctor báo một key ĐANG CHẠY là lạ — đúng lớp lỗi dcg sửa ở v2.36.0.
    const NORM = [
      ['disallowed-tools', 'disallowedTools'], ['when_to_use', 'whenToUse'],
      ['argument-hint', 'ArgumentHint'], ['keep-coding-instructions', 'keepCodingInstructions'],
    ];
    const badNorm = NORM.filter(([a, b]) => normKey(a) !== normKey(b));
    if (badNorm.length) fail.push(`native-surface${L} normKey không gộp ${badNorm.length}/${NORM.length} cặp: ${badNorm.map(p => p.join('≠')).join(' · ')}`);
    else ok.push(`native-surface${L} normKey gộp ${NORM.length} cặp hyphen/underscore/camelCase — như vendor`);
  }

  // ④b-quater `guard-nhanh-tich-hop`: một cửa thoát không ai đếm là cửa thoát mở vĩnh viễn.
  //     Ba trạng thái, và cái đáng khoá nhất là 0/0 — guard vừa cắm thì MẪU SỐ BẰNG 0, và
  //     một tỉ lệ trên mẫu số 0 là câu trả lời dễ chịu chứ không phải câu trả lời đúng (L0005).
  const GUARD = [
    // 0/0 = KHÔNG CÓ MẪU SỐ ⇒ `n/a` (bằng không do cấu trúc), không phải `?` và không phải
    // `ok`. L0005 giữ nguyên hiệu lực: điều nó cấm là trả lời "guard ổn" trên mẫu số rỗng, và
    // `n/a` không nói thế — regex dưới khoá đúng câu đó ở lại trong `why`.
    [{ mainEditEscapes: 0, mainEditBlocks: 0 }, 'n/a', /chưa gặp ca nào.*KHÔNG đọc là "guard ổn"/s, '0 chặn 0 thoát ⇒ `n/a` (chưa có mẫu số), KHÔNG phải "ổn"'],
    [{ mainEditEscapes: 5, mainEditBlocks: 1 }, 'due', /GUARD SAI/, 'cửa thoát thắng ⇒ đề xuất CẮT, không nới'],
    [{ mainEditEscapes: 1, mainEditBlocks: 4 }, 'ok', /chặn 4 lần, cửa thoát 1 lần/, 'chặn thắng ⇒ im, nhưng NÓI RA cả hai số'],
    [{ mainEditEscapes: null, mainEditBlocks: 2 }, '?', /không đo được/, 'không đọc được telemetry ⇒ `?`'],
  ];
  for (const [state, want, msg, label] of GUARD) {
    const r = get(state, 'guard-nhanh-tich-hop');
    if (r?.state !== want) fail.push(`rituals.mjs${' '.repeat(17)} guard-nhánh: ${label} → state=${r?.state}, mong đợi ${want}`);
    else if (!msg.test(r.why)) fail.push(`rituals.mjs${' '.repeat(17)} guard-nhánh: ${label} → \`why\` không khớp ${msg}: "${r.why}"`);
    else ok.push(`rituals.mjs${' '.repeat(17)} guard-nhánh: ${label}`);
  }

  // ④b-ter `capo-report`: BA cách một trần chi tiêu nói dối, và không cách nào được thành `ok`.
  //     `off` (chưa khai) ⇒ `?`, không phải "ổn" — đây là ca mặc định của mọi repo mới.
  //     `unmeasured` (khai rồi, chưa đo) ⇒ `due` — nguy hiểm nhất: con số trong config làm
  //     người ta TIN là có lớp bảo vệ, trong khi nó chưa so với gì.
  const CAPO = [
    [{ mode: 'off' }, '?', /chưa khai trần/, 'chưa khai trần ⇒ `?`, KHÔNG phải ổn'],
    [{ mode: 'unmeasured', advice: 'cap $50 đã khai nhưng CHƯA LẦN NÀO đo' }, 'due', /CHƯA LẦN NÀO đo/, 'khai rồi chưa đo ⇒ tới hạn'],
    [{ mode: 'stale', advice: 'số đo chi tiêu gần nhất đã 90 ngày' }, 'due', /90 ngày/, 'số đo quá cũ ⇒ tới hạn'],
    [{ mode: 'alert', advice: 'run-rate $171/tháng = 86% trần $200' }, 'due', /86%/, 'chạm ngưỡng cảnh báo ⇒ tới hạn'],
    [{ mode: 'ok', percent: 14, ageDays: 3 }, 'ok', /14%.*3 ngày/, 'dưới ngưỡng ⇒ im, nhưng NÓI RA số và tuổi số đo'],
    // GÓI PHẲNG + 0 lần chạm ⇒ `ok`, và `measured: false` KHÔNG được kéo nó về `due`. Người gói
    // phẳng không cần `--usd` (v2.61.0), nên sổ USD của họ mãi rỗng — treo mục này vào `measured`
    // là một nghi thức không bao giờ tắt được dù họ làm đúng mọi thứ (L0002).
    [{ mode: 'flat-ok', measured: false }, 'ok', /KHÔNG cần dashboard/, 'gói phẳng 0 lần chạm + sổ USD rỗng ⇒ ổn, KHÔNG đòi một con số vô nghĩa với gói đó'],
  ];
  for (const [budget, want, msg, label] of CAPO) {
    const r = get({ budget }, 'capo-report');
    if (r?.state !== want) fail.push(`rituals.mjs${' '.repeat(17)} capo-report: ${label} → state=${r?.state}, mong đợi ${want}`);
    else if (!msg.test(r.why)) fail.push(`rituals.mjs${' '.repeat(17)} capo-report: ${label} → \`why\` không khớp ${msg}: "${r.why}"`);
    else ok.push(`rituals.mjs${' '.repeat(17)} capo-report: ${label}`);
  }

  // ④c-bis `/pre-merge` phải ĐO, không được khẳng định suông. Bản trước in "chưa thấy dấu gate
  //     preMerge chạy ở phiên này" trong khi `collect()` KHÔNG đi tìm dấu nào — `gates.mjs` chỉ
  //     ghi telemetry khi HỎNG, nên dấu đó chưa từng tồn tại. Nghi thức đỏ theo `ahead > 0` và ở
  //     đỏ mãi: chạy gate bao nhiêu lần cũng không đổi được gì. Bốn ca dưới đây khoá đúng chỗ đó.
  const T = Date.parse('2026-08-06T10:00:00.000Z');
  const PM = [
    [{ ahead: 2, preMergeRanAt: null, lastCommitAt: T }, 'due', /CHƯA có lần chạy gate preMerge nào/, 'chưa chạy bao giờ ⇒ tới hạn, và nói rõ là CHƯA CHẠY'],
    [{ ahead: 2, preMergeRanAt: T - 600_000, lastCommitAt: T }, 'due', /10 phút TRƯỚC commit mới nhất/, 'chạy TRƯỚC commit cuối ⇒ vẫn tới hạn, kèm số phút'],
    [{ ahead: 2, preMergeRanAt: T + 1000, lastCommitAt: T }, 'ok', /đã chạy sau commit cuối/, 'chạy SAU commit cuối ⇒ im lặng'],
    [{ ahead: 2, preMergeRanAt: T, lastCommitAt: null }, '?', /không đọc được thời điểm commit cuối/, 'thiếu một trong hai mốc ⇒ `?`, KHÔNG phải `ok`'],
  ];
  for (const [state, want, msg, label] of PM) {
    const r = get(state, 'pre-merge');
    if (r?.state !== want) fail.push(`rituals.mjs${' '.repeat(17)} pre-merge: ${label} → state=${r?.state}, mong đợi ${want}`);
    else if (!msg.test(r.why)) fail.push(`rituals.mjs${' '.repeat(17)} pre-merge: ${label} → \`why\` không khớp ${msg}`);
    else ok.push(`rituals.mjs${' '.repeat(17)} pre-merge: ${label}`);
  }

  // ④c-ter Và đầu KIA của phép đo: `gates.mjs` phải GHI cả lần chạy XANH. Không có dòng đó thì
  //     nghi thức trên vĩnh viễn ở ca một, và ba trạng thái "gate luôn xanh · gate chưa từng
  //     chạy · gate chạy hỏng" lại gộp làm một — đúng phép gộp mà `hookRan()` đã tách cho hook.
  const gatesSrc = readFileSync(repoPath('tooling', 'gates.mjs'), 'utf8');
  if (!/telemetry\('gate-runs'/.test(gatesSrc)) {
    fail.push(`gates.mjs${' '.repeat(19)} không ghi \`gate-runs\` — /pre-merge sẽ không bao giờ xanh được dù gate chạy bao nhiêu lần`);
  } else ok.push(`gates.mjs${' '.repeat(19)} ghi \`gate-runs\` cả khi XANH — /pre-merge có cái để đo`);

  // ④d NGUỒN THỨ HAI. Ca `/usr/local/bin/claude → null` ở trên KHÔNG phải "không có version" —
  //     nó là "version không nằm trong đường dẫn". Cách cài bằng npm cho ra đúng hình dạng đó
  //     (`…/node_modules/@anthropic-ai/claude-code/bin/claude.exe`), và trước 2.13.0 nghi thức
  //     `claude-code-drift` đứng `?` VĨNH VIỄN trên mọi máy cài kiểu này — kèm một lý do sai sự
  //     thật ("cách cài không đặt biến này", trong khi biến CÓ được đặt).
  //
  //     Đây vẫn KHÔNG phải đoán: nó đọc `version` trong package.json của đúng gói đó. Nên test
  //     phải khẳng định CẢ HAI chiều — đọc được gói THẬT, và KHÔNG đọc bừa gói tên khác.
  const { claudeCodeVersionFromPackage } = await import('./rituals.mjs');
  const pkgRoot = join(tmpdir(), `harness-test-ccver-${process.pid}`);
  const cases = [
    ['claude-code', { name: '@anthropic-ai/claude-code', version: '2.1.222' }, '2.1.222'],
    ['imposter', { name: 'claude-code', version: '9.9.9' }, null],          // tên khác ⇒ KHÔNG nhận
    ['no-version', { name: '@anthropic-ai/claude-code', version: 'dev' }, null], // version không phải số ⇒ KHÔNG đoán
  ];
  const badPkg = [];
  for (const [dir, pkg, want] of cases) {
    const binDir = join(pkgRoot, dir, 'bin');
    mkdirSync(binDir, { recursive: true });
    writeFileSync(join(pkgRoot, dir, 'package.json'), JSON.stringify(pkg), 'utf8');
    const got = claudeCodeVersionFromPackage(join(binDir, 'claude.exe'));
    if (got !== want) badPkg.push(`${dir}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
  if (claudeCodeVersionFromPackage('') !== null) badPkg.push('execPath rỗng phải trả null');
  rmSync(pkgRoot, { recursive: true, force: true });
  if (badPkg.length) fail.push(`rituals.mjs${' '.repeat(17)} claudeCodeVersionFromPackage() sai: ${badPkg.join(' · ')}`);
  else ok.push(`rituals.mjs${' '.repeat(17)} claudeCodeVersionFromPackage(): đọc được layout npm, KHÔNG nhận gói tên khác/version không phải số`);

  // ⑤ MUTANT: một `check` throw thì phải thành `?`, KHÔNG được làm sập cả bảng. `rituals` được
  //    gọi từ SessionStart — một exception ở đó làm mất TOÀN BỘ định hướng đầu phiên.
  const broken = evaluate(null);
  if (!Array.isArray(broken) || broken.length !== clean.length || !broken.every(r => r.state === '?')) {
    fail.push('rituals.mjs                 trạng thái RỖNG làm bảng sập hoặc cho ra trạng thái khác `?` — SessionStart sẽ mất toàn bộ định hướng');
  } else ok.push(`rituals.mjs${' '.repeat(17)} MUTANT: state rỗng ⇒ ${broken.length} mục \`?\`, bảng KHÔNG sập`);

  // ⑤b MUTANT nguy hiểm hơn ⑤: state là một OBJECT THIẾU KHOÁ, không phải `null`.
  //     `evaluate(null)` ném lỗi ⇒ bị bắt ⇒ `?`. Nhưng `evaluate({})` KHÔNG ném: mọi `s.x` là
  //     `undefined`, và một phép so `=== null` cho nó đi thẳng xuống nhánh DỄ CHỊU. Đo
  //     2026-08-07: 10/12 mục ra `ok`, kèm những dòng như *"undefined/undefined skill"*.
  //
  //     Ca này giống thực tế HƠN ca `null`: nó là hình dạng của một `collect()` bị refactor
  //     làm rơi mất một khoá. Đó đúng là L0005 — bộ đếm đổ về phía dễ chịu — sống trong
  //     chính file đo bộ đếm.
  const partial = evaluate({});
  const notQ = partial.filter(r => r.state !== '?');
  if (notQ.length) {
    fail.push(`rituals.mjs${' '.repeat(17)} state THIẾU KHOÁ (không phải null) ⇒ ${notQ.length} mục vẫn ra \`${notQ[0].state}\`: `
      + `${notQ.map(r => r.id).join(' · ')} — dùng \`== null\` để \`undefined\` cũng là KHÔNG ĐO ĐƯỢC`);
  } else ok.push(`rituals.mjs${' '.repeat(17)} state THIẾU KHOÁ ⇒ cả ${partial.length} mục \`?\` (undefined KHÔNG lọt thành \`ok\`)`);
}

// ─── PHÉP ĐẾM mà HAI công cụ cùng hỏi ────────────────────────────────────────
//
// Hai check dưới đây bảo vệ hai lời nói dối ĐÃ XẢY RA, không phải hai giả thuyết.
//
// LƯU Ý CHO NGƯỜI SỬA FILE NÀY: đừng viết tên skill dạng slash-trong-backtick ở đây.
// `harness-doctor` quét đúng cú pháp đó trong mọi .md/.mjs không phải hồ sơ lịch sử, và
// file này không phải hồ sơ lịch sử — một test VỀ tham chiếu chết mà tự tạo ra tham chiếu
// chết thì làm đỏ chính cái nó vừa chứng minh là xanh. Dùng chuỗi trong nháy đơn.
{
  // ① `declaredCommands`: `$comment_*` KHÔNG phải lệnh.
  //    Trước 2.13.0, `harness.config.json` của template có ĐÚNG một key trong `commands` mang
  //    giá trị khác rỗng — và nó là một dòng chú thích. Nên `!length` không bao giờ đúng, và
  //    dòng cảnh báo to nhất của cả hệ ("GATE KHÔNG TỒN TẠI ... BẠN là verification loop")
  //    im lặng ở MỌI repo áp template kể từ phút đầu. Ca hồi quy quan trọng nhất là cấu hình
  //    THẬT của repo này, không phải một object bịa.
  //    Bảng dưới đây THUẦN — nó đúng ở mọi repo. Ca hồi quy trên `harness.config.json` THẬT
  //    (template không khai lệnh nào) chỉ đúng ở template và nằm ở khối cuối file, cạnh chỗ
  //    đếm `skipped`: một self-test của template khẳng định thứ chỉ đúng trong template là
  //    ĐÚNG lớp lỗi `knowledge/lessons/0003`, và nó đã một lần đỏ ở cả ba repo tiêu thụ.
  const CMD = [
    [{ commands: { $comment_x: 'giải thích dài', test: '' } }, 0, 'chỉ có chú thích ⇒ 0 lệnh'],
    [{ commands: { $comment_x: 'giải thích dài', test: 'vitest run' } }, 1, 'chú thích + 1 lệnh thật ⇒ 1'],
    [{ commands: {} }, 0, 'rỗng ⇒ 0'],
    [{}, 0, 'không có `commands` ⇒ 0, không ném'],
  ];
  const badCmd = CMD.filter(([cfg, want]) => declaredCommands(cfg).length !== want);
  if (badCmd.length) fail.push(`lib/harness.mjs${' '.repeat(13)} declaredCommands() sai ở ${badCmd.length}/${CMD.length} ca: ${badCmd.map(([, , l]) => l).join(' · ')}`);
  else ok.push(`lib/harness.mjs${' '.repeat(13)} declaredCommands(): key \`$comment_*\` KHÔNG bị đếm là lệnh — cảnh báo "gate không tồn tại" nói được`);

  // ①b DẤU HIỆU NHẬN VAI KHÔNG ĐƯỢC LÀ THỨ SHIP XUỐNG REPO CON.
  //
  //    Tới 2.13.0, `repoRole()` nhận ra template bằng `HARNESS-CHANGELOG.md` + `apply-to.mjs`
  //    — và CẢ HAI đều nằm trong `MECHANISM_PATHS`, tức mọi repo tiêu thụ đều mang đủ giấy tờ
  //    để bị nhận nhầm. Thứ duy nhất ngăn điều đó là manifest được xét TRƯỚC; mất manifest
  //    (trạng thái mà migration 010 có hẳn một nhánh cho nó) là repo con thành "template",
  //    và mọi dòng CHẶN hạ cấp theo vai template sẽ im — kể cả "commands rỗng ⇒ GATE KHÔNG
  //    TỒN TẠI". Check này khoá tính chất đó bằng máy thay vì bằng trí nhớ.
  const shipped = new Set([...MECHANISM_PATHS]);
  const roleSrc = readFileSync(repoPath('tooling', 'lib', 'harness.mjs'), 'utf8');
  const roleFn = roleSrc.slice(roleSrc.indexOf('export function repoRole()'));
  const roleBody = roleFn.slice(0, roleFn.indexOf('\n}'));
  const marks = [...roleBody.matchAll(/repoPath\(([^)]*)\)/g)]
    .map(m => m[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).join('/'))
    .filter(p => !p.includes('harness-manifest'));   // manifest là dấu của CONSUMER, ship là đúng
  const leaked = marks.filter(p => shipped.has(p));
  if (!marks.length) fail.push(`lib/harness.mjs${' '.repeat(13)} không đọc được dấu hiệu nào trong repoRole() — neo của check này đã trôi, sửa neo thay vì xoá check`);
  else if (leaked.length) fail.push(`lib/harness.mjs${' '.repeat(13)} repoRole() nhận vai "template" bằng ${leaked.join(' · ')} — thứ ĐƯỢC SHIP xuống repo con. Repo con mất manifest sẽ tự nhận là template và mọi dòng CHẶN im theo`);
  else ok.push(`lib/harness.mjs${' '.repeat(13)} repoRole(): ${marks.length} dấu hiệu nhận vai, KHÔNG cái nào nằm trong MECHANISM_PATHS`);

  // ①c Và chiều ngược: thứ đã tuyên bố "không cho repo con" thì không được lọt lại vào
  //    danh sách ship. Hai hằng số ở hai chỗ khác nhau, nên chúng phải được đối chiếu.
  const contradiction = NOT_FOR_CONSUMER.filter(p => shipped.has(p));
  if (contradiction.length) fail.push(`lib/harness.mjs${' '.repeat(13)} ${contradiction.join(' · ')} vừa ở NOT_FOR_CONSUMER vừa ở MECHANISM_PATHS — hai danh sách nói ngược nhau, và MECHANISM_PATHS là cái thắng`);
  else ok.push(`lib/harness.mjs${' '.repeat(13)} NOT_FOR_CONSUMER (${NOT_FOR_CONSUMER.length}) không mục nào lọt lại vào MECHANISM_PATHS`);

  // ①d MECHANISM_PATHS không phải danh sách ship duy nhất — `SEED` ở `apply-to.mjs` là cái
  //    kia, và nó là cái ĐÃ ship namespace ADR của harness suốt 76 version. Check ①c ở trên chỉ đối
  //    chiếu với MECHANISM_PATHS, nên một mục vừa ở NOT_FOR_CONSUMER vừa ở SEED đi lọt cả hai.
  //    Đọc SEED từ NGUỒN (không import được: apply-to.mjs chạy việc lúc nạp).
  {
    const src = readFileSync(repoPath('tooling', 'apply-to.mjs'), 'utf8');
    const i = src.indexOf('const SEED = ['), j = src.indexOf('];', i);
    const seed = i < 0 ? [] : [...src.slice(i, j).matchAll(/'([^']+)'/g)].map(m => m[1]);
    const both = NOT_FOR_CONSUMER.filter(p => seed.includes(p));
    if (!seed.length) fail.push(`apply-to ↔ NOT_FOR_CONSUMER  không đọc được SEED từ apply-to.mjs — neo của check này đã trôi, sửa neo thay vì bỏ check`);
    else if (both.length) fail.push(`apply-to ↔ NOT_FOR_CONSUMER  ${both.join(' · ')} vừa khai KHÔNG-ship vừa nằm trong SEED — SEED là cái thắng, nên nó vẫn ship`);
    else ok.push(`apply-to ↔ NOT_FOR_CONSUMER  ${seed.length} mục SEED, không mục nào trùng NOT_FOR_CONSUMER (${NOT_FOR_CONSUMER.length})`);
  }

  // ①e Thứ migration XOÁ ở repo con mà template VẪN CÒN, thì phải được khai không-ship.
  //    Thiếu chiều này, `upgrade` xoá nó rồi `apply-to --update` chép lại ngay — người dùng
  //    thấy một file trở về sau mỗi lần nâng cấp và không có cách nào đọc ra vì sao.
  //    Chiều NGƯỢC LẠI cố ý KHÔNG khẳng định: `test-lib.mjs` ở NOT_FOR_CONSUMER mà
  //    không ở REMOVED_PATHS là ĐÚNG — nó chưa bao giờ ship, nên không repo nào có gì để xoá.
  {
    const alive = REMOVED_PATHS.filter(r => exists(repoPath(...r.path.split('/'))));
    const unsealed = alive.filter(r => !NOT_FOR_CONSUMER.includes(r.path));
    if (!alive.length) fail.push(`REMOVED_PATHS${' '.repeat(16)} không mục nào còn tồn tại ở template — check này không còn đo được gì, sửa neo`);
    else if (unsealed.length) fail.push(`REMOVED_PATHS${' '.repeat(16)} ${unsealed.map(r => r.path).join(' · ')} bị migration XOÁ ở repo con nhưng vẫn nằm trong danh sách ship — nâng cấp xong nó quay lại`);
    else ok.push(`REMOVED_PATHS${' '.repeat(16)} ${alive.length}/${REMOVED_PATHS.length} mục còn ở template đều được khai NOT_FOR_CONSUMER — xoá rồi không chép lại`);
  }

  // ② `isRecordedRemoval`: bia mộ được nhắc tên ở ĐÚNG nơi ghi việc xoá, và chỉ ở đó.
  //    Cả hai chiều đều là hồi quy: bỏ điều kiện "file" thì docs nhắc skill đã xoá cũng lọt
  //    (đúng ca check tham chiếu chết sinh ra để bắt); bỏ điều kiện "tên" thì migration nhắc
  //    tên bịa nào cũng lọt.
  const removed = [...removedSkillNames()];
  const REM = [
    [removed[0], 'harness-migrations/010-bo-thu-template-da-bo.mjs', true, 'migration thi hành việc xoá ⇒ hợp lệ'],
    [removed[0], 'tooling/lib/harness.mjs', true, 'chính danh sách bia mộ ⇒ hợp lệ'],
    [removed[0], 'docs/TEAM.md', false, 'tài liệu thường nhắc skill đã xoá ⇒ VẪN là tham chiếu chết'],
    ['khong-co-thuc', 'harness-migrations/010-bo-thu-template-da-bo.mjs', false, 'tên không trong bia mộ ⇒ VẪN chết, dù ở đúng file'],
  ];
  const badRem = REM.filter(([n, f, want]) => isRecordedRemoval(n, f) !== want);
  if (!removed.length) ok.push(`lib/harness.mjs${' '.repeat(13)} bia mộ rỗng — không có gì để kiểm (n/a, KHÔNG phải pass)`);
  else if (badRem.length) fail.push(`lib/harness.mjs${' '.repeat(13)} isRecordedRemoval() sai ở ${badRem.length}/${REM.length} ca: ${badRem.map(([, , , l]) => l).join(' · ')}`);
  else ok.push(`lib/harness.mjs${' '.repeat(13)} isRecordedRemoval(): loại trừ theo CẢ tên LẪN file, ${REM.length} ca`);

  // ②b `HISTORICAL`: miễn trừ theo BẢN CHẤT, không theo tiện lợi.
  //
  //    Hồ sơ lịch sử — changelog, bia mộ, ADR, learnings, nhật ký `docs/progress/` — PHẢI
  //    được phép gọi tên một skill đã bị xoá: chúng ghi lại việc xoá đó. Mọi file khác thì
  //    không, và đó là toàn bộ giá trị của check tham chiếu chết.
  //
  //    Bảng này khoá CẢ HAI CHIỀU vì cả hai đều là hồi quy có thật:
  //      · thiếu một loại hồ sơ ⇒ advice đỏ VĨNH VIỄN về một việc không được làm (lớp #56),
  //        và một mục advice không bao giờ tắt dạy người đọc bỏ qua CẢ những mục đúng.
  //      · nới ra tới `docs/` ⇒ check mất nghĩa, vì gần như mọi tham chiếu chết đều ở docs
  //        (đo 2026-08-04: xoá một skill để lại 5 tham chiếu, 3 trong số đó ở `docs/`).
  const HIST = [
    ['HARNESS-CHANGELOG.md', true, 'changelog'],
    ['.claude/whats-new.md', true, 'thông báo thay đổi'],
    ['docs/adr/0002-x.md', true, 'ADR'],
    ['.claude/learnings/2026-W32-x.md', true, 'bài học'],
    ['docs/progress/vong-hoc-2026-W32.md', true, 'nhật ký — ghi lại chính quyết định KHÔNG cắt'],
    ['docs/TEAM.md', false, 'tài liệu thường ⇒ KHÔNG được miễn'],
    ['docs/ANTI-PATTERNS.md', false, 'docs/ khác ⇒ KHÔNG được miễn (nới tới docs/ là xoá check)'],
    ['AGENTS.md', false, 'hợp đồng làm việc ⇒ KHÔNG được miễn'],
    ['tooling/harness-doctor.mjs', false, 'mã nguồn ⇒ KHÔNG được miễn'],
  ];
  // Bóc regex từ MÃ NGUỒN thay vì chép lại nó: một bản sao trong test sẽ xanh mãi trong khi
  // bản thật đã trôi đi đâu đó — đúng lớp lỗi mà ca ③ ngay dưới đây tồn tại để chống.
  const histLit = readFileSync(repoPath('tooling', 'harness-doctor.mjs'), 'utf8')
    .match(/^const HISTORICAL = \/(.+)\/;$/m);
  const histRe = histLit ? new RegExp(histLit[1]) : null;
  if (!histRe) {
    fail.push(`harness-doctor.mjs${' '.repeat(10)} không bóc được HISTORICAL từ mã nguồn — neo của check này đã trôi, sửa neo thay vì xoá check`);
  } else {
    const badHist = HIST.filter(([p, want]) => histRe.test(p) !== want);
    if (badHist.length) fail.push(`harness-doctor.mjs${' '.repeat(10)} HISTORICAL sai ${badHist.length}/${HIST.length} ca: ${badHist.map(([, , l]) => l).join(' · ')}`);
    else ok.push(`harness-doctor.mjs${' '.repeat(10)} HISTORICAL: ${HIST.length} ca — 5 loại hồ sơ được miễn, docs/ thường thì KHÔNG`);
  }

  // ③ CHỐNG LỆCH: doctor phải đọc telemetry của suite qua HẰNG SỐ CHUNG, không phải chuỗi
  //    viết tay. Đây là check RẺ cho một lỗi ĐẮT: nếu hai bên trỏ khác thư mục, doctor đọc
  //    chỗ rỗng rồi kết luận "chưa có bằng chứng" về những cái gác vừa chạy xong trong chính
  //    lần chạy của nó — sai lặng lẽ, không đỏ ở đâu cả.
  const docSrc = readFileSync(repoPath('tooling', 'harness-doctor.mjs'), 'utf8');
  if (!/TEST_TELEMETRY_DIR/.test(docSrc)) {
    fail.push(`harness-doctor.mjs${' '.repeat(10)} không dùng TEST_TELEMETRY_DIR — nguồn bằng chứng thứ hai đã mất, mọi hook chưa gặp ca thật quay lại "? chưa đo"`);
  } else if (/harness-test-telemetry/.test(docSrc)) {
    fail.push(`harness-doctor.mjs${' '.repeat(10)} viết tay chuỗi 'harness-test-telemetry' — dùng hằng số TEST_TELEMETRY_DIR ở lib, hai bản sao sẽ lệch`);
  } else ok.push(`harness-doctor.mjs${' '.repeat(10)} đọc telemetry của suite qua hằng số chung, không phải chuỗi viết tay`);

  // ④ BẰNG CHỨNG CŨ KHÔNG PHẢI BẰNG CHỨNG. `TEST_TELEMETRY_DIR` nằm ở `tmpdir()` và sống dai
  //    hơn một lần chạy. Không lọc theo thời gian thì một lần chạy suite HÔM QUA vẫn đọc là
  //    "suite ✓" hôm nay — kể cả khi hôm nay suite crash hoặc bị gỡ khỏi danh sách check. Cái
  //    gác im lặng lúc đó được báo là ổn, đúng lớp lỗi mà cả cơ chế này sinh ra để diệt.
  const T0 = Date.parse('2026-08-06T10:00:00.000Z');
  const LOG = [
    '2026-08-05T09:00:00.000Z|p|cu-rich|pass|',        // trước mốc ⇒ KHÔNG tính
    '2026-08-06T10:00:01.000Z|p|moi-chay|pass|',       // sau mốc  ⇒ tính
    'khong-phai-ngay|p|mo-ho|pass|',                    // không đọc được ngày ⇒ KHÔNG tính
    '',                                                 // dòng rỗng ⇒ bỏ qua, không ném
  ].join('\n');
  const fresh = tallyLines(LOG, { sinceMs: T0 });
  const allTime = tallyLines(LOG, {});
  const badT = [];
  if (fresh.has('cu-rich')) badT.push('dòng CŨ hơn mốc vẫn được đếm là bằng chứng');
  if (!fresh.has('moi-chay')) badT.push('dòng MỚI hơn mốc bị bỏ');
  if (fresh.has('mo-ho')) badT.push('dấu thời gian không đọc được vẫn được đếm — `?` bị cộng vào một con số');
  if (!allTime.has('cu-rich') || allTime.size !== 3) badT.push('không có `sinceMs` thì phải đếm TOÀN BỘ lịch sử (telemetry thật dùng đường này)');
  if (badT.length) fail.push(`lib/harness.mjs${' '.repeat(13)} tallyLines() sai: ${badT.join(' · ')}`);
  else ok.push(`lib/harness.mjs${' '.repeat(13)} tallyLines(): bằng chứng CŨ hơn lần chạy hiện tại KHÔNG được tính, dấu thời gian hỏng cũng không`);

  // ⑤ Và mốc đó phải được chụp TRƯỚC khi doctor chạy các suite — nếu chụp sau, mọi dòng của
  //    chính lần chạy này đều "cũ hơn mốc" và cột bằng chứng im vĩnh viễn.
  // ⑥ CÔ LẬP LẦN CHẠY (#100). Suite chạy trên repo THẬT và để lại trạng thái ở `tmpdir()` lẫn
  //    `.claude/hooks/`. Trước bản vá, MỌI đường ghi đó mang tên cố định toàn máy. Đo
  //    2026-08-08: tuần tự 6 lần ⇒ 6 lần xanh; hai suite song song ⇒ CẢ HAI đỏ ngay lần đầu.
  //
  //    Cơ chế phải thoả HAI mệnh đề NGƯỢC NHAU, nên hai khẳng định (a)/(b) dưới đây là mutant
  //    của nhau: hardcode đường dẫn ⇒ (a) đỏ; bỏ hỗ trợ env ⇒ (b) đỏ. Không có cách nào làm
  //    xanh cả hai mà không thật sự cô lập theo lần chạy.
  {
    const libUrl = JSON.stringify(pathToFileURL(repoPath('tooling', 'lib', 'harness.mjs')).href);
    const probeSrc = `import { TEST_TELEMETRY_DIR, TEST_STATE_DIR } from ${libUrl};`
      + ` console.log(TEST_TELEMETRY_DIR + '|' + TEST_STATE_DIR);`;
    // `HARNESS_TEST_RUN_ID: ''` để probe KHÔNG thừa hưởng ghim của người đang chạy suite —
    // nếu thừa hưởng, (a) sẽ xanh-giả đúng lúc doctor là người chạy.
    const probe = (env) => spawnSync(process.execPath, ['--input-type=module', '-e', probeSrc], {
      encoding: 'utf8', env: { ...process.env, HARNESS_TEST_RUN_ID: '', ...env },
    });
    const A = probe({}), B = probe({});
    if (A.status !== 0 || B.status !== 0) {
      fail.push(`lib/harness.mjs${' '.repeat(13)} probe cô lập KHÔNG CHẠY được (exit ${A.status}/${B.status}) — `
        + `không kết luận được gì về #100: ${(A.stderr || B.stderr || '').split('\n')[0]}`);
    } else if (A.stdout.trim() === B.stdout.trim()) {
      fail.push(`lib/harness.mjs${' '.repeat(13)} hai lần chạy KHÔNG ghim vẫn dùng chung thư mục trạng thái — `
        + `đây đúng là #100: hai session cùng máy (AGENTS.md cho phép) sẽ làm nhau đỏ ngẫu nhiên`);
    } else {
      ok.push(`lib/harness.mjs${' '.repeat(13)} hai lần chạy độc lập ⇒ hai thư mục trạng thái khác nhau (cô lập mặc định)`);
    }

    const P1 = probe({ HARNESS_TEST_RUN_ID: 'ghim-thu' });
    const P2 = probe({ HARNESS_TEST_RUN_ID: 'ghim-thu' });
    if (P1.status !== 0 || P2.status !== 0) {
      fail.push(`lib/harness.mjs${' '.repeat(13)} probe ghim KHÔNG CHẠY được (exit ${P1.status}/${P2.status}) — không kết luận được`);
    } else if (P1.stdout.trim() !== P2.stdout.trim() || !P1.stdout.includes('ghim-thu')) {
      fail.push(`lib/harness.mjs${' '.repeat(13)} ghim \`HARNESS_TEST_RUN_ID\` KHÔNG làm hai tiến trình thoả thuận được `
        + `đường dẫn — doctor sẽ đọc thư mục RỖNG và báo "chưa có bằng chứng" về chính các hook nó vừa chạy`);
    } else {
      ok.push(`lib/harness.mjs${' '.repeat(13)} ghim \`HARNESS_TEST_RUN_ID\` ⇒ cha/con thoả thuận cùng một thư mục`);
    }

    // (c) Và doctor phải THẬT SỰ ghim. Neo nguồn, cùng lý do với ③ — chạy cả doctor ở đây thì
    //     đệ quy, vì doctor chạy chính suite này.
    //
    //     Neo vào ĐÚNG LỜI GỌI, không grep cả file. Bản đầu grep cả file và mutant "gỡ ghim ở
    //     doctor" SỐNG SÓT: chú thích ngay phía trên lời gọi cũng chứa chuỗi đó, nên check tự
    //     khớp với lời giải thích của chính mình. Đo được 2026-08-08, và nó đúng là cái bẫy
    //     khối chế-độ-hỏng đã ghi: đo sự CÓ MẶT của một dòng chữ, không phải HÀNH VI.
    const spawnCall = docSrc.match(/const r = run\('node'[\s\S]*?\);/);
    if (!spawnCall) {
      fail.push(`harness-doctor.mjs${' '.repeat(10)} không tìm thấy lời gọi \`run('node', …)\` chạy suite — neo của check này `
        + `đã trôi. Sửa neo, đừng xoá check.`);
    } else if (!/HARNESS_TEST_RUN_ID/.test(spawnCall[0])) {
      fail.push(`harness-doctor.mjs${' '.repeat(10)} không ghim \`HARNESS_TEST_RUN_ID\` TRONG lời gọi spawn suite — con ghi theo `
        + `pid của chính nó, doctor đọc chỗ khác, và nguồn bằng chứng thứ hai chết LẶNG (không ai đỏ)`);
    } else ok.push(`harness-doctor.mjs${' '.repeat(10)} ghim \`HARNESS_TEST_RUN_ID\` ngay trong lời gọi spawn suite con`);

    // (d) Bản sửa của hook phải ghi TRONG `.claude/hooks/` (nó cần giải import tương đối của
    //     hook gốc), nên chỉ CÁI TÊN tách được. Hai chiều, vì hỏng được theo cả hai:
    if (hookTempName('m', 'x') === hookTempName('m', 'y')) {
      fail.push(`test-hooks.mjs${' '.repeat(14)} \`hookTempName()\` không phụ thuộc lần chạy — hai suite song song ghi đè `
        + `file tạm của nhau, và ca "chạy nhầm bản sửa" đọc y hệt một cái hook có bug`);
    } else if (hookTempName('a', 'x') === hookTempName('b', 'x')) {
      fail.push(`test-hooks.mjs${' '.repeat(14)} \`hookTempName()\` bỏ qua \`kind\` — hai khối trong CÙNG một lần chạy dùng chung `
        + `một file tạm, tức tự tạo lại #100 bên trong một tiến trình`);
    } else ok.push(`test-hooks.mjs${' '.repeat(14)} tên file hook tạm mang cả \`kind\` lẫn id lần chạy`);

    // (e) Và không còn chỗ nào VIẾT TAY tên đó. Đây là check rẻ cho lỗi đã thật sự xảy ra:
    //     bản vá #100 lần một vẫn đỏ khi chạy song song, vì mới sửa 1 trong 3 chỗ. Đếm được
    //     thì không phải nhớ — mà "nhớ sửa hết" đúng là thứ người đang gấp bỏ qua.
    const selfSrc = readFileSync(repoPath('tooling', 'test-hooks.mjs'), 'utf8');
    const hardcoded = [...selfSrc.matchAll(/repoPath\('\.claude', 'hooks', '\.[^']*'\)/g)].map((m) => m[0]);
    if (hardcoded.length) {
      fail.push(`test-hooks.mjs${' '.repeat(14)} ${hardcoded.length} file tạm còn tên VIẾT TAY trong \`.claude/hooks/\` `
        + `(${hardcoded[0]}) — dùng \`hookTempName(kind, TEST_RUN_ID)\`, nếu không #100 quay lại ở đúng chỗ chưa sửa`);
    } else ok.push(`test-hooks.mjs${' '.repeat(14)} không còn tên file tạm viết tay nào trong \`.claude/hooks/\``);

    // (f) Một thư mục cho MỖI lần chạy ⇒ phải có ai đó dọn. Bộ dọn phải đúng cả HAI chiều, và
    //     chiều "giữ lại" quan trọng hơn: xoá nhầm thư mục của một suite ĐANG chạy sẽ tạo ra
    //     đúng loại đỏ ngẫu nhiên mà #100 vừa dập. Tên fixture mang id lần chạy, nếu không
    //     chính ca này lại là một tài nguyên dùng chung.
    {
      const OLD = join(tmpdir(), `harness-test-run-cu-${TEST_RUN_ID}`);
      const NEW = join(tmpdir(), `harness-test-run-moi-${TEST_RUN_ID}`);
      mkdirSync(OLD, { recursive: true });
      mkdirSync(NEW, { recursive: true });
      const longAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
      utimesSync(OLD, longAgo, longAgo);
      sweepStaleTestRuns();
      const goneOld = !exists(OLD), keptNew = exists(NEW);
      for (const d of [OLD, NEW]) { try { rmSync(d, { recursive: true, force: true }); } catch {} }
      if (!goneOld) {
        fail.push(`lib/harness.mjs${' '.repeat(13)} \`sweepStaleTestRuns()\` KHÔNG dọn thư mục 48h tuổi — `
          + `mỗi lần chạy suite để lại một thư mục, và trên máy này đĩa đã từng đầy thật`);
      } else if (!keptNew) {
        fail.push(`lib/harness.mjs${' '.repeat(13)} \`sweepStaleTestRuns()\` xoá cả thư mục VỪA TẠO — nó sẽ giật `
          + `trạng thái dưới chân một suite đang chạy, tức tái tạo #100 bằng chính bản vá của #100`);
      } else ok.push(`lib/harness.mjs${' '.repeat(13)} \`sweepStaleTestRuns()\` dọn thư mục cũ, GIỮ thư mục đang dùng`);
    }
  }

  const iRun = docSrc.indexOf('const RUN_STARTED');
  const iSuite = docSrc.indexOf('for (const c of checks)');
  if (iRun < 0 || iSuite < 0) fail.push(`harness-doctor.mjs${' '.repeat(10)} không tìm thấy \`RUN_STARTED\` hoặc vòng chạy suite — neo của check này đã trôi, sửa neo thay vì xoá check`);
  else if (iRun > iSuite) fail.push(`harness-doctor.mjs${' '.repeat(10)} \`RUN_STARTED\` bị chụp SAU khi chạy suite ⇒ mọi dòng của lần chạy này đều bị coi là cũ, cột bằng chứng im vĩnh viễn`);
  else ok.push(`harness-doctor.mjs${' '.repeat(10)} \`RUN_STARTED\` chụp trước khi chạy suite`);

  // ⑥ `fixlogKey` + luật gom nhóm do NGƯỜI khai.
  //
  //    VÌ SAO CÓ: phép nhóm mặc định là 6 từ đầu của văn bản TỰ DO. Đo 2026-08-06 trên repo này:
  //    5 mục ⇒ 5 nhóm đơn lẻ, 0 nhóm ≥2, trong khi 3/5 mục là cùng một gác (`dcg` chặn nhầm).
  //    `/harness-retro` vì thế đọc "chưa nhóm nào đạt ngưỡng" — CÂU TRẢ LỜI DỄ CHỊU — và cả
  //    vòng học đứng im. Luật thủ công sửa chiều đó mà không cho máy đoán.
  const KEY = [
    // `dcg` `lan` `nam` đều ≤3 ký tự nên bị phép từ vựng LOẠI — chỉ còn `chan nham`. Chính chỗ
    // này cho thấy phép từ vựng mỏng đến mức nào trên tiếng Việt không dấu: nó vứt gần hết câu.
    [['dcg chan nham lan nam', []], 'chan nham', 'không luật ⇒ phép TỪ VỰNG cũ, y nguyên'],
    [['dcg chan nham lan nam', [{ key: 'g', needle: 'dcg' }]], 'g', 'luật khớp ⇒ thắng phép từ vựng'],
    [['DCG viet HOA', [{ key: 'g', needle: 'dcg' }]], 'g', 'khớp KHÔNG phân biệt hoa thường'],
    [['chuyen khac han', [{ key: 'g', needle: 'dcg' }]], 'chuyen khac', 'không luật nào khớp ⇒ rơi về từ vựng'],
    [['dcg gi do', [{ key: 'A', needle: 'dcg' }, { key: 'B', needle: 'dcg' }]], 'A', 'hai luật cùng khớp ⇒ luật ĐẦU thắng (tất định)'],
    // `''.includes('')` là TRUE. Một needle rỗng lọt qua sẽ nuốt MỌI dòng vào một nhóm và bịa ra
    // một nhóm ≥2 khổng lồ — đúng chiều nguy hiểm mà cả cơ chế này tránh.
    [['dcg gi do', [{ key: 'X', needle: '' }]], '', 'needle RỖNG bị bỏ qua, không nuốt mọi dòng'],
    [['dcg gi do', [{ key: 'X', needle: '   ' }]], '', 'needle toàn khoảng trắng cũng vậy'],
    // LUẬT CỤ THỂ HƠN THẮNG. Đo 2026-08-11: sổ thật có `dcg` (khai 08-06, ĐÃ ĐÓNG 08-07) và
    // `buoc DON DEP cua mutation` (khai 08-10, đang mở). Mục 08-10 khớp cả hai; luật rộng tới
    // trước nên nó thắng, và mục đó thừa hưởng dấu ✔ của một nhóm đóng TRƯỚC KHI nó tồn tại.
    [['dcg chan buoc DON DEP cua mutation', [{ key: 'rong', needle: 'dcg' }, { key: 'hep', needle: 'buoc don dep cua mutation' }]], 'hep',
      'luật CỤ THỂ HƠN thắng luật RỘNG hơn khai TRƯỚC'],
    // CHIỀU NGƯỢC — bắt buộc. Nếu bản vá chỉ đổi "đầu thắng" thành "cuối thắng" thì ca trên vẫn
    // xanh, mà kết quả lại phụ thuộc thứ tự khai. Độ dài là thuộc tính của CHÍNH luật.
    [['dcg chan buoc DON DEP cua mutation', [{ key: 'hep', needle: 'buoc don dep cua mutation' }, { key: 'rong', needle: 'dcg' }]], 'hep',
      'đảo thứ tự khai KHÔNG đổi kết quả'],
  ];
  const badK = KEY.filter(([[t, r], want]) => fixlogKey(t, r) !== want);
  if (badK.length) fail.push(`lib/harness.mjs${' '.repeat(13)} fixlogKey() sai ở ${badK.length}/${KEY.length} ca: ${badK.map(([, , l]) => l).join(' · ')}`);
  else ok.push(`lib/harness.mjs${' '.repeat(13)} fixlogKey(): luật người-khai thắng từ vựng, luật CỤ THỂ HƠN thắng luật rộng, needle rỗng bị bỏ — ${KEY.length} ca`);

  // ⑥b `--close` KHÔNG PHẢI VĨNH VIỄN. Một mục ghi SAU ngày đóng là TÁI PHÁT, và dấu ✔ khi đó
  //     là lời khai sai theo chiều IM LẶNG của `L0006`: việc chưa xong đọc y hệt việc đã xong.
  //     Ca thứ nhất là chiều SỬA QUÁ TAY — "chưa từng đóng" KHÔNG được đọc thành "tái phát".
  const GSC = [
    [[null, ['2026-08-10']], [false, 0], 'chưa từng đóng ⇒ không đóng, và KHÔNG phải tái phát'],
    [['2026-08-07', ['2026-08-05', '2026-08-06']], [true, 0], 'mọi mục CŨ hơn ngày đóng ⇒ vẫn đóng'],
    [['2026-08-07', ['2026-08-05', '2026-08-10']], [false, 1], 'có mục MỚI hơn ⇒ TÁI PHÁT, nhóm mở lại'],
    [['2026-08-07', []], [true, 0], 'nhóm rỗng ⇒ vẫn đóng, không bịa ra tái phát'],
  ];
  const badG = GSC.filter(([[ts, rows], [wantClosed, wantN]]) => {
    const r = groupStillClosed(ts, rows);
    return r.closed !== wantClosed || r.recurred.length !== wantN;
  });
  if (badG.length) fail.push(`lib/harness.mjs${' '.repeat(13)} groupStillClosed() sai ở ${badG.length}/${GSC.length} ca: ${badG.map(([, , l]) => l).join(' · ')}`);
  else ok.push(`lib/harness.mjs${' '.repeat(13)} groupStillClosed(): mục ghi SAU ngày đóng ⇒ nhóm mở lại; chưa đóng ≠ tái phát — ${GSC.length} ca`);

  // ⑥c TRẠNG THÁI THỨ TƯ (#182). `groupTracked` và `groupStillClosed` tính CÙNG một thứ
  //     (`rowsAfter`) nhưng KẾT LUẬN NGƯỢC NHAU, và đó là chỗ dễ chép nhầm nhất của bản vá:
  //
  //       `--close` khai "lỗi này không xảy ra nữa"  ⇒ mục mới BÁC BỎ  ⇒ nhóm mở lại (`↻`)
  //       `--track` khai "tôi biết, nó ở #177"       ⇒ mục mới XÁC NHẬN ⇒ nhóm VẪN đang chờ
  //
  //     Chép `closed: recurred.length === 0` sang đây là biến `--track` thành một nút tắt
  //     dùng một lần: ghi địa chỉ xong, mọi lần tái phát tự động bị xoá khỏi bảng.
  const TRK = [
    [[null, ['2026-08-10']], [false, 0], 'chưa ghi địa chỉ ⇒ không tracked, không tái phát'],
    [['2026-08-07', ['2026-08-05']], [true, 0], 'mục CŨ hơn ngày ghi ⇒ tracked, chưa tái phát'],
    [['2026-08-07', ['2026-08-09', '2026-08-11']], [true, 2], 'mục MỚI hơn ⇒ VẪN tracked, và ĐẾM được 2 lần tái phát'],
    [['2026-08-07', []], [true, 0], 'nhóm rỗng ⇒ tracked, không bịa tái phát'],
  ];
  const badTrk = TRK.filter(([[ts, rows], [wantTracked, wantN]]) => {
    const r = groupTracked(ts, rows);
    return r.tracked !== wantTracked || r.recurred.length !== wantN;
  });
  // Và chiều NGƯỢC, ở mức hành vi: cùng đầu vào, hai hàm phải KHÁC KẾT LUẬN. Không có ca này
  // thì một bản vá `groupTracked = groupStillClosed` (đổi tên field) xanh cả 4 ca trên.
  const same = ['2026-08-07', ['2026-08-09']];
  if (groupStillClosed(...same).closed === groupTracked(...same).tracked) {
    badTrk.push([, , 'mục ghi SAU mốc: `closed` và `tracked` cho CÙNG kết luận — `--track` đã thành nút tắt một lần']);
  }
  if (badTrk.length) fail.push(`lib/harness.mjs${' '.repeat(13)} groupTracked() sai ở ${badTrk.length}/${TRK.length + 1} ca: ${badTrk.map(([, , l]) => l).join(' · ')}`);
  else ok.push(`lib/harness.mjs${' '.repeat(13)} groupTracked(): tái phát ĐẾM được nhưng KHÔNG mở lại nhóm — ngược hẳn \`--close\` — ${TRK.length + 1} ca`);

  // ⑥d PHÉP TRỪ "nhóm đã xử" là MỘT (#185). `rituals.fixlogState()` và `fixlog --list` hỏi
  //     cùng câu hỏi; trước lô này chỉ bên thứ nhất trừ, nên `--list` bật cảnh báo ≥10/tuần
  //     với 11 mục trong khi 9 mục thuộc nhóm đã đóng hoặc đã có địa chỉ.
  //
  //     Ca 3 là ca CHỊU LỰC: nó ép `handledGroups` phải hỏi HAI câu khác nhau. Một bản vá
  //     `handled = nhóm nào còn đóng` (bỏ vế `tracked`) xanh cả bốn ca còn lại.
  const HG = [
    [['g1', ['2026-08-05']], { closed: ['g1', '2026-08-07'] }, true, 'đã đóng, không tái phát ⇒ ĐÃ XỬ'],
    [['g2', ['2026-08-09']], { closed: ['g2', '2026-08-07'] }, false, 'đã đóng NHƯNG tái phát ⇒ mở lại, CHƯA xử'],
    [['g3', ['2026-08-09']], { tracked: ['g3', '2026-08-07'] }, true, 'đã có địa chỉ, VẪN tái phát ⇒ vẫn ĐÃ XỬ (ngược `--close`)'],
    [['g4', ['2026-08-09']], {}, false, 'không dấu nào ⇒ CHƯA xử'],
    [['g5', ['2026-08-09']], { closed: ['g5', '2026-08-07'], tracked: ['g5', '2026-08-08'] }, true, 'đóng rồi tái phát rồi có địa chỉ ⇒ ĐÃ XỬ'],
  ];
  const badHG = HG.filter(([[k, tss], marks, want]) => {
    const mk = (p) => new Map(p ? [[p[0], { ts: p[1], note: '' }]] : []);
    return handledGroups(new Map([[k, tss]]), mk(marks.closed), mk(marks.tracked)).has(k) !== want;
  });
  if (badHG.length) fail.push(`lib/harness.mjs${' '.repeat(13)} handledGroups() sai ở ${badHG.length}/${HG.length} ca: ${badHG.map(([, , , l]) => l).join(' · ')}`);
  else ok.push(`lib/harness.mjs${' '.repeat(13)} handledGroups(): MỘT phép trừ cho cả \`rituals\` lẫn \`fixlog --list\` — ${HG.length} ca`);

  // ⑦ CHỐNG LỆCH HAI BẢNG. `fixlog.mjs --top` và `rituals.mjs` trả lời CÙNG một câu hỏi
  //    ("nhóm nào đã ≥2 lần"). Nếu chỉ một bên đọc luật gom nhóm, người dùng thấy "★ đủ điều
  //    kiện promote" ở một chỗ và "chưa nhóm nào đạt ngưỡng" ở chỗ kia — hai sự thật, không
  //    gì báo. Đây đúng là lỗi mà comment ở `lib/harness.mjs` đã tiên đoán cho bản sao thứ ba.
  const ritSrc = readFileSync(repoPath('tooling', 'rituals.mjs'), 'utf8');
  const fixSrc = readFileSync(repoPath('tooling', 'fixlog.mjs'), 'utf8');
  const drift = [];
  if (!/fixlogGroupRules/.test(ritSrc)) drift.push('rituals.mjs không đọc luật gom nhóm');
  if (!/fixlogGroupRules/.test(fixSrc)) drift.push('fixlog.mjs không đọc luật gom nhóm');
  // Phép "nhóm này còn đóng không" cũng phải là MỘT. `rituals` từng chỉ đọc KHOÁ trong
  // `fixlog-closed.log` và vứt cột thời gian, nên nó KHÔNG THỂ thấy tái phát dù có muốn —
  // và `--top` thì thấy. Đó đúng là hai câu trả lời cho một câu hỏi mà ca ⑦ này canh.
  //
  // NEO VÀO LỜI GỌI (`tên(`), không vào SỰ CÓ MẶT của cái tên. Bản đầu dùng `.includes(tên)` và
  // mutant "thôi gọi, tự quyết bằng `closedAt.has(k)`" SỐNG SÓT — vì dòng `import` vẫn còn cái
  // tên đó. Đúng `L0006` §"Ba cách một MUTANT SỐNG SÓT" ③: ca neo RỘNG HƠN thứ nó khoá, nên nó
  // xanh cả khi code sai. Lần thứ ba trong tuần (2026-08-11).
  for (const [name, src] of [['rituals.mjs', ritSrc], ['fixlog.mjs', fixSrc]]) {
    if (!/groupStillClosed\s*\(/.test(codeOnly(src))) drift.push(`${name} tự quyết "nhóm còn đóng không" thay vì GỌI groupStillClosed()`);
    // #182: cùng lý do, cho trạng thái thứ tư. Và `groupMarks()` — bản trước mỗi bên tự parse
    // TSV của `fixlog-closed.log`, và bản `rituals` vứt cột thời gian đi (#176).
    if (!/groupTracked\s*\(/.test(codeOnly(src))) drift.push(`${name} tự quyết "nhóm đã có địa chỉ chưa" thay vì GỌI groupTracked()`);
    if (!/groupMarks\s*\(/.test(codeOnly(src))) drift.push(`${name} tự parse sổ đánh dấu thay vì GỌI groupMarks() — bản trước lệch nhau đúng ở đó (#176)`);
    // #185: và phép TRỪ "nhóm nào đã xử" — `rituals` trừ từ #182, `fixlog --list` thì không,
    // nên cảnh báo ≥10/tuần bật với 11 mục trong khi 9 mục đã đóng hoặc đã có địa chỉ.
    if (!/handledGroups\s*\(/.test(codeOnly(src))) drift.push(`${name} tự quyết "nhóm nào đã xử" thay vì GỌI handledGroups() — hai ngưỡng, hai mẫu số (#185)`);
  }
  // Gọi `fixlogKey(x)` một tham số = bỏ qua luật. Bắt tại nguồn, vì hậu quả của nó là im lặng.
  for (const [name, src] of [['rituals.mjs', ritSrc], ['fixlog.mjs', fixSrc]]) {
    const bare = src.match(/fixlogKey\([^),]*\)/g)?.filter(s => !/^fixlogKey\(\s*\)$/.test(s)) || [];
    if (bare.length) drift.push(`${name} còn ${bare.length} chỗ gọi fixlogKey() KHÔNG truyền luật: ${bare.join(' · ')}`);
  }
  if (drift.length) fail.push(`fixlog ↔ rituals${' '.repeat(12)} ${drift.join(' · ')}`);
  else ok.push(`fixlog ↔ rituals${' '.repeat(12)} cả hai bảng đọc CÙNG luật gom nhóm — không có đường cho hai câu trả lời khác nhau`);

  // ⑧ `--group` với từ khoá không khớp dòng nào phải TỪ CHỐI, không ghi luật. Gõ nhầm mà ghi
  //    im lặng thì luật nằm đó vô hiệu và người ta tưởng đã gom xong — một nút bấm không có
  //    tác dụng và không báo, cùng lớp với lỗi `--close` đã phòng từ 2.11.0.
  const g = spawnSync(process.execPath, [repoPath('tooling', 'fixlog.mjs'), '--group', 'x', 'khong-the-nao-co-chuoi-nay-trong-fixlog'],
    { encoding: 'utf8', cwd: repoPath() });
  if (g.status === 0) fail.push(`fixlog.mjs${' '.repeat(18)} --group với từ khoá khớp 0 dòng vẫn exit 0 — luật vô hiệu được ghi im lặng`);
  else if (!/Không dòng fixlog nào/.test(g.stderr || '')) fail.push(`fixlog.mjs${' '.repeat(18)} --group từ chối nhưng không nói vì sao`);
  else ok.push(`fixlog.mjs${' '.repeat(18)} --group từ chối từ khoá khớp 0 dòng và nói rõ — không ghi luật chết`);

  // ⑨ TRẠNG THÁI THỨ TƯ, đầu-cuối (#182). Sổ RIÊNG trong `tmpdir` — chạy trên sổ thật thì
  //    test ghi vào backlog của người dùng, đúng thứ `fixture-phai-an-toan` cấm.
  const t9 = mkdtempSync(join(tmpdir(), 'harness-track-'));
  const runFix = (...a) => spawnSync(process.execPath, [repoPath('tooling', 'fixlog.mjs'), ...a],
    { encoding: 'utf8', cwd: repoPath(), env: { ...process.env, HARNESS_TELEMETRY_DIR: t9 } });
  const line = (d, txt) => `${d}|fixture|main|${txt}\n`;
  const badT9 = [];
  writeFileSync(join(t9, 'manual-fixes.log'),
    line('2026-08-01T00:00:00.000Z', 'agent quen chay gen sau khi sua contract abcdef') +
    line('2026-08-02T00:00:00.000Z', 'agent quen chay gen sau khi sua contract abcdef'), 'utf8');

  // ĐỊA CHỈ bắt buộc: "đang chờ" mà không nói chờ ở đâu thì không khác gì im lặng bỏ qua.
  const noRef = runFix('--track', 'quen chay gen');
  if (noRef.status === 0) badT9.push('--track KHÔNG có địa chỉ vẫn exit 0 — một nút tắt không ghi lý do');

  const before = runFix('--top');
  if (!/^★\s+2×/m.test(before.stdout || '')) badT9.push(`trước khi track, nhóm 2× phải là ★ (được: ${(before.stdout || '').split('\n')[1]?.slice(0, 40)})`);

  const tr = runFix('--track', 'quen chay gen', '#177 — chờ DRI');
  if (tr.status !== 0) badT9.push(`--track hợp lệ exit ${tr.status} ≠ 0: ${(tr.stderr || '').slice(0, 90)}`);
  const after = runFix('--top');
  if (!/^⇢\s+2×/m.test(after.stdout || '')) badT9.push('sau khi track, nhóm vẫn không mang dấu ⇢');
  if (!/#177/.test(after.stdout || '')) badT9.push('--top KHÔNG in địa chỉ — "đang chờ" mà không nói chờ đâu thì vô dụng');
  if (!/2×/.test(after.stdout || '')) badT9.push('--top giấu số đếm của nhóm đã track — `--track` không được là nút giấu');

  // TÁI PHÁT sau khi track: VẪN `⇢`, nhưng số lần phải HIỆN RA. Đây là ca phân biệt `--track`
  // với `--close`; nếu bản vá chép `groupStillClosed` thì dòng này thành `↻` hoặc mất hẳn.
  appendFileSync(join(t9, 'manual-fixes.log'), line(new Date(Date.now() + 86400_000).toISOString(), 'agent quen chay gen sau khi sua contract abcdef'), 'utf8');
  const recur = runFix('--top');
  if (!/^⇢\s+3×/m.test(recur.stdout || '')) badT9.push('tái phát sau khi track làm ĐỔI dấu — `--track` bị chép nhầm thành `--close`');
  if (!/TÁI PHÁT 1 lần/.test(recur.stdout || '')) badT9.push('tái phát sau khi track KHÔNG được đếm ra — mất đúng tín hiệu thay cho màu đỏ');

  // Và `rituals` phải thấy CÙNG một sự thật: nhóm đã có địa chỉ thôi là "ứng viên chờ distill".
  const retroState = () => {
    // `HARNESS_STATE_DIR` cũng phải chuyển: từ #185 `collect()` GHI sổ trạng thái nghi thức, nên
    // thiếu dòng này thì mỗi lần chạy suite bơm một lượt đo của FIXTURE vào sổ thật.
    const r = spawnSync(process.execPath, [repoPath('tooling', 'rituals.mjs'), '--json'],
      { encoding: 'utf8', cwd: repoPath(), env: { ...process.env, HARNESS_TELEMETRY_DIR: t9, HARNESS_STATE_DIR: t9 } });
    try { return (JSON.parse(r.stdout || '[]').find(x => x.id === 'harness-retro')) || {}; } catch { return {}; }
  };
  const st9 = retroState();
  if (/ứng viên bài học ĐANG chờ/.test(st9.why || '')) badT9.push(`rituals vẫn đòi distill một nhóm ĐÃ có địa chỉ: ${String(st9.why).slice(0, 90)}`);
  if (!/#177/.test(st9.why || '')) badT9.push('rituals im về việc ĐANG CHỜ — mục xanh phải nói ra nó, nếu không `--track` là một nút giấu');

  // NGƯỠNG ĐẶT TRÊN SỐ CHƯA XỬ, KHÔNG trên số ĐỜI. Ca này cần `fixlogTotal ≥ 10` mà
  // `fixlogOpen < 10` — tức phải có ĐỦ mục và chúng phải ĐÃ ĐƯỢC XỬ. Không dựng được tình
  // huống đó thì nhánh ngưỡng không bao giờ chạy, và mutant "quay lại đếm `fixlogTotal`" SỐNG
  // SÓT: đúng thế, đo 2026-08-12, nguyên nhân ① — lỗ hổng độ phủ thật, không phải neo rộng.
  for (let i = 0; i < 12; i++) {
    appendFileSync(join(t9, 'manual-fixes.log'), line(`2026-07-${String(i + 10).padStart(2, '0')}T00:00:00.000Z`, 'mot loai loi hoan toan khac de gom nhom rieng'), 'utf8');
  }
  runFix('--track', 'mot loai loi hoan toan khac', '#999 — chờ upstream');
  const big = retroState();
  if (big.state !== 'ok') badT9.push(`${'15'} mục mà chỉ 0 mục chưa xử ⇒ phải \`ok\`, được \`${big.state}\`: ${String(big.why).slice(0, 110)}`);
  rmSync(t9, { recursive: true, force: true });

  if (badT9.length) fail.push(`fixlog --track${' '.repeat(15)} ${badT9.length} ca sai: ${badT9.join(' | ')}`);
  else ok.push(`fixlog --track${' '.repeat(15)} ★ → ⇢ · địa chỉ BẮT BUỘC và được in · số đếm không bị giấu · tái phát ĐẾM mà KHÔNG đổi dấu · rituals đồng ý`);

  // ⑩ MỘT CỜ KHÔNG PHẢI LÀ NỘI DUNG. Nhánh mặc định nhận mọi đối số không khớp cờ nào làm nội
  //    dung, nên `--help` ghi một dòng rác vào chính cái sổ mà công cụ này tồn tại để giữ sạch,
  //    rồi in `✓ đã ghi` như thể vừa làm đúng. Ghi sổ 2026-08-05 (mục 12/16), tái hiện Y NGUYÊN
  //    2026-08-13 trên v2.71.0 — 59 minor version ở giữa và không lần nào có triệu chứng nào
  //    ngoài một dòng rác không ai đọc lại.
  //
  //    Bốn chiều, và chiều ④ KHÔNG phải cho đủ lệ: ba chiều đầu mà thiếu nó thì bản vá thành
  //    guard bắn nhầm (L0002), vì sổ này đầy dòng nói về `--force` / `--auto-approve` và mục
  //    mô tả chính bug này mở đầu bằng `--help`.
  const t10 = mkdtempSync(join(tmpdir(), 'harness-flag-'));
  const fx10 = (...a) => spawnSync(process.execPath, [repoPath('tooling', 'fixlog.mjs'), ...a],
    { encoding: 'utf8', cwd: repoPath(), env: { ...process.env, HARNESS_TELEMETRY_DIR: t10 } });
  const log10 = () => { try { return readFileSync(join(t10, 'manual-fixes.log'), 'utf8').split('\n').filter(Boolean); } catch { return []; } };
  const bad10 = [];

  // ① `--help` — cờ quy ước nhất của mọi CLI — không ghi gì, và exit 0: hỏi cách dùng không phải lỗi.
  const h10 = fx10('--help');
  if (log10().length) bad10.push('`--help` GHI vào sổ — sổ tự bẩn bằng đúng cái lệnh hỏi cách dùng nó');
  if (h10.status !== 0) bad10.push(`\`--help\` exit ${h10.status} ≠ 0 — hỏi cách dùng không phải một lỗi`);

  // ② Và không chỉ chữ "help". Thứ làm bẩn sổ là NHÁNH MẶC ĐỊNH, nên phải chặn theo HÌNH DẠNG:
  //    `--to` là cách gõ hụt `--top`, và im lặng hoá thành một dòng dữ liệu là kiểu hỏng tệ nhất
  //    có thể xảy ra cho một cái SỔ.
  const typo10 = fx10('--to');
  if (log10().length) bad10.push('cờ gõ sai `--to` bị ghi thành NỘI DUNG — chặn theo TÊN cờ chứ không theo hình dạng, cả lớp vẫn hở');
  if (typo10.status === 0) bad10.push('cờ không nhận ra vẫn exit 0 — gõ sai không để lại triệu chứng nào');
  if (!/cờ không nhận ra/.test(typo10.stderr || '')) bad10.push('từ chối cờ lạ mà KHÔNG nói ở stderr — hỏng im lặng qua ống dẫn');

  // ③ Cửa thoát POSIX `--`: nội dung THẬT mở đầu bằng dấu gạch vẫn ghi được, và nguyên văn.
  const esc10 = fx10('--', '--force bị dcg chặn oan');
  if (esc10.status !== 0) bad10.push(`\`-- "<nội dung>"\` exit ${esc10.status} ≠ 0 — chặn không có đường thoả là guard bắn nhầm (L0002)`);
  const got10 = log10();
  if (got10.length !== 1) bad10.push(`sau \`--\` phải có ĐÚNG 1 mục, đếm được ${got10.length}`);
  else if (!/\|--force bị dcg chặn oan$/.test(got10[0])) bad10.push(`\`--\` làm méo nội dung: "${got10[0].split('|').slice(3).join('|')}"`);

  // ④ Đường thường vẫn ghi được — ca bắt bản vá chặn quá tay.
  fx10('mot muc binh thuong');
  if (log10().length !== 2) bad10.push('nội dung thường KHÔNG còn ghi được — bản vá chặn quá tay');
  rmSync(t10, { recursive: true, force: true });

  if (bad10.length) fail.push(`fixlog cờ lạ${' '.repeat(17)} ${bad10.length} ca sai: ${bad10.join(' | ')}`);
  else ok.push(`fixlog cờ lạ${' '.repeat(17)} \`--help\` im · cờ gõ sai KÊU ở stderr và không ghi · \`--\` cứu nội dung mở đầu bằng gạch · đường thường không hỏng`);

  // ⑪ TRẦN CỦA `--top` KHÔNG ĐƯỢC GIẤU VIỆC. Trần 15 nhóm + sắp theo tần suất là một phép cắt
  //    im lặng, và trên sổ thật nó cắt SAI ĐẦU: đo 2026-08-13, sổ 17 nhóm mà 14 đã đóng, mọi
  //    nhóm đều `1×` nên thứ tự rơi về thứ tự chèn — hai nhóm bị rơi là hai nhóm MỚI NHẤT, tức
  //    đúng hai mục chưa ai xử. `rituals` nói "2/17 chưa xử"; `--top`, cái lệnh bảng nghi thức
  //    chỉ bạn tới để XEM chúng, hiện đúng 1. Hai công cụ hai con số cho cùng câu hỏi.
  //
  //    Ca này dựng đúng hình dạng đó: nhiều nhóm hơn trần, và nhóm CHƯA XỬ chèn SAU cùng — tức
  //    vị trí mà bản cũ đánh rơi. Không dựng đủ số nhóm thì nhánh trần không bao giờ chạy và
  //    mutant "quay lại sort theo tần suất" SỐNG SÓT.
  const t11 = mkdtempSync(join(tmpdir(), 'harness-cap-'));
  const fx11 = (...a) => spawnSync(process.execPath, [repoPath('tooling', 'fixlog.mjs'), ...a],
    { encoding: 'utf8', cwd: repoPath(), env: { ...process.env, HARNESS_TELEMETRY_DIR: t11 } });
  const bad11 = [];
  const CLOSED_N = 16, OPEN_N = 4;          // 20 nhóm > trần 15
  // Tên KHÔNG được lồng tiền tố nhau: `--close` khớp theo chuỗi con, nên `nhomdadong1` cũng
  // khớp `nhomdadong10..15` ⇒ mơ hồ ⇒ bị từ chối ⇒ fixture dựng ra KHÔNG phải hình dạng cần
  // đo, và ca test đỏ vì lý do không liên quan. Hậu tố `zz` chốt đuôi mỗi tên lại.
  const CLOSED = (i) => `nhomdadong${String(i).padStart(2, '0')}zz`;
  const OPEN = (i) => `nhomconmo${String(i).padStart(2, '0')}zz`;
  let body11 = '';
  for (let i = 0; i < CLOSED_N; i++) body11 += `2026-07-01T00:00:0${i % 10}.000Z|fixture|main|${CLOSED(i)} mot loi da duoc xu ly xong roi\n`;
  for (let i = 0; i < OPEN_N; i++) body11 += `2026-08-13T00:00:0${i}.000Z|fixture|main|${OPEN(i)} mot loi VAN CHUA AI XU LY\n`;
  writeFileSync(join(t11, 'manual-fixes.log'), body11, 'utf8');
  // Khẳng định FIXTURE dựng đúng. Không có dòng này thì một `--close` bị từ chối làm ca test
  // đỏ ở một khẳng định KHÁC, và người đọc đi sửa nhầm chỗ — đã xảy ra khi viết chính ca này.
  const failedClose = [];
  for (let i = 0; i < CLOSED_N; i++) {
    if (fx11('--close', CLOSED(i), `đã xử ở ca thử ${i}`).status !== 0) failedClose.push(CLOSED(i));
  }
  if (failedClose.length) bad11.push(`fixture hỏng: ${failedClose.length}/${CLOSED_N} lệnh --close bị từ chối (${failedClose.slice(0, 3).join(' ')}) — ca này KHÔNG đo được thứ nó định đo`);

  const top11 = fx11('--top').stdout || '';
  // ① Mọi nhóm CHƯA XỬ phải in ra, kể cả khi số nhóm đã đóng một mình đã vượt trần.
  const missing11 = [];
  for (let i = 0; i < OPEN_N; i++) if (!top11.includes(OPEN(i))) missing11.push(OPEN(i));
  if (missing11.length) bad11.push(`trần của --top GIẤU ${missing11.length}/${OPEN_N} nhóm CHƯA XỬ (${missing11.join(' ')}) — rituals đếm chúng, --top không in chúng`);
  // ② Và chúng phải đứng TRƯỚC nhóm đã đóng: một nhóm hết là việc không được chiếm suất.
  const firstClosed = top11.search(/nhomdadong\d/);
  const lastOpen = top11.lastIndexOf('nhomconmo');
  if (firstClosed >= 0 && lastOpen >= 0 && lastOpen > firstClosed) bad11.push('nhóm ĐÃ ĐÓNG in trước nhóm CHƯA XỬ — trần sẽ lại cắt đúng phần đang là việc');
  // ③ Phần bị cắt phải TỰ KHAI. Một cái trần im lặng đọc y hệt "đã in hết".
  if (!/nhóm nữa KHÔNG in/.test(top11)) bad11.push('trần cắt bớt mà KHÔNG khai — "đã in hết" và "in 15/20" đọc giống hệt nhau');
  else if (!/\d+ trong số đó CHƯA XỬ/.test(top11)) bad11.push('dòng khai phần bị cắt không nói bao nhiêu trong đó CHƯA XỬ — đó là con số duy nhất đáng đọc');
  rmSync(t11, { recursive: true, force: true });

  if (bad11.length) fail.push(`fixlog --top trần${' '.repeat(13)} ${bad11.length} ca sai: ${bad11.join(' | ')}`);
  else ok.push(`fixlog --top trần${' '.repeat(13)} nhóm CHƯA XỬ không bị trần giấu và đứng trước nhóm đã đóng · phần bị cắt tự khai kèm số chưa xử`);
}

// ─── configCoverage: HAI CHIỀU, và chúng KHÔNG đối xứng ──────────────────────
//
// Lớp lỗi "field khai mà không ai đọc" đã bị sửa BẰNG TAY ba lần (2.0.0 · 2.28.0 · 2.35.0),
// mỗi lần một bia mộ, không lần nào dựng máy dò. Ba field khác sống sót vì không ai tìm.
//
// Bảng này khoá BỐN ca mà một bản "đơn giản hoá" sau này chắc chắn sẽ phá:
//
//   ⓵ `blankStrings: false`. Tên field sống TRONG chuỗi — `limit('staleLockMinutes', 5)`.
//      Bản đầu của phép quét dùng `true` (sao chép từ check `lib-import`) và báo nhầm SÁU
//      field. Ca `đọc qua chuỗi` ở dưới là ca DUY NHẤT phân biệt hai cờ đó.
//   ⓶ Chiều A nhận MARKDOWN. Một skill bảo agent đọc `limits.reservationTtlHours` LÀ một
//      người tiêu thụ — chỉ là inferential thay vì computational.
//   ⓷ Chiều B KHÔNG nhận markdown. README của `harness-migrations` có một ví dụ migration
//      GIẢ ĐỊNH dùng `cfg.paths.hotspots`; nhận nó vào chiều B là một dương tính giả ngay
//      ngày đầu, và một cái gác đỏ ngày đầu là một cái gác sẽ bị tắt.
//   ⓸ Ca đòi kết quả KHÔNG RỖNG. Không có nó, mutant `unread = []` sống sót — và đó là
//      chiều hỏng IM LẶNG của L0007: mẫu số co về 0 thì không có gì đỏ.
{
  const L = ' '.repeat(9);
  const CFG = {
    $comment: 'bỏ qua',
    $comment_teamSize: 'cố ý vắng ở template',
    limits: { doDoc: 1, doDot: 2, doStr: 3, chiMd: 4 },
    paths:  { hot: ['a'] },
    commands: { build: 'x' },
    // `project` PHẢI tồn tại mà THIẾU `teamSize`: đó là hình dạng thật của ca cố-ý-vắng.
    // Bỏ cả section đi thì `cfg[section]` là undefined và lời gọi bị loại ở bước TRƯỚC —
    // fixture khi đó xanh vì lý do sai. Chính bảng này bắt được ca đó khi tôi viết nó lần đầu.
    project: { id: 'fixture' },
  };
  //  Chiều A đọc CẢ HAI; chiều B chỉ đọc srcCode.
  const SRC_CODE = `
    const a = cfg.limits.doDot;              // đọc qua .field
    const b = limit('doStr', 9);             // đọc qua CHUỖI  ← ca ⓵
    const c = cfg.limits.thieuTrongConfig;   // chiều B: code đọc, config không khai
    const d = cfg.project.teamSize;          // có $comment_ ⇒ cố ý vắng
    const e = khac.limits.khongPhaiConfig;   // section không thuộc config ⇒ bỏ qua
  `;
  const SRC_MD = `
    Skill bảo agent: lấy TTL từ \`limits.chiMd\`.
    Ví dụ migration giả định: cfg.paths.hotspots = cfg.paths.hot;   ← ca ⓷
  `;
  const r = configCoverageOf({ cfg: CFG, srcAll: SRC_CODE + SRC_MD, srcCode: SRC_CODE });
  const bad = [];
  const want = (cond, why) => { if (!cond) bad.push(why); };

  want(r.unread.includes('limits.doDoc'), 'field không ai đọc KHÔNG bị bắt (chiều A câm)');
  want(!r.unread.includes('limits.doDot'), 'đọc qua `.field` mà vẫn báo chết');
  want(!r.unread.includes('limits.doStr'), 'đọc qua CHUỖI mà vẫn báo chết — hàm thuần phải khớp được chuỗi');
  want(!r.unread.includes('limits.chiMd'), 'chỉ nhắc trong markdown mà báo chết ⇒ chiều A đang bỏ md (ca ⓶)');
  want(r.undeclared.includes('limits.thieuTrongConfig'), 'code đọc field chưa khai mà KHÔNG bắt (chiều B câm)');
  want(!r.undeclared.some(k => k.includes('hotspots')), 'ví dụ trong markdown lọt vào chiều B (ca ⓷)');
  want(r.excused.includes('project.teamSize'), '$comment_ không được nhận là cố-ý-vắng');
  want(!r.undeclared.includes('project.teamSize'), 'field có $comment_ vẫn bị báo thiếu');
  want(!r.undeclared.some(k => k.includes('khongPhaiConfig')), 'section ngoài config lọt vào chiều B');
  // ca ⓸ — chiều "sửa quá tay": một phép quét trả rỗng thoả mãn MỌI ca phủ định ở trên.
  want(r.unread.length > 0 && r.undeclared.length > 0, 'CẢ HAI chiều đều rỗng ⇒ phép quét không đo gì (ca ⓸)');
  want(r.leaves >= 6, `đếm sai số field: ${r.leaves} — $comment_* phải bị loại, field thật thì không`);

  if (bad.length) fail.push(`configCoverage${L} ${bad.length} ca sai: ${bad.join(' | ')}`);
  else ok.push(`configCoverage${L} 11 ca — hai chiều KHÔNG đối xứng (A đọc md, B thì không), và chuỗi giữ ruột`);

  // ── ca ⓵ phải chạy trên ĐƯỜNG THẬT, không trên hàm thuần ───────────────────
  //
  // Bảng trên truyền `srcAll`/`srcCode` thẳng vào hàm thuần, nên nó KHÔNG BAO GIỜ đi qua
  // `codeOnly` — tức là nó không thể khoá cờ `blankStrings`. Bản đầu của khối này tự nhận
  // là có khoá; mutant `blankStrings: true` sống sót và chứng minh lời khai đó sai.
  //
  // ── Cờ `blankStrings`: neo vào LỜI GỌI, không neo vào field ────────────────
  //
  // Bản đầu neo vào 5 field "chỉ đọc qua chuỗi", đo bằng cách chạy phép quét hai lần rồi lấy
  // hiệu. Mutant `blankStrings: true` VẪN SỐNG SÓT, và lý do là bài học cũ của repo bắn vào
  // chính bảng này: `tooling/test-hooks.mjs` nằm TRONG phạm vi quét, và nó chứa
  // `pathsFor\('lintable'\)` bên trong một REGEX LITERAL của khối MUTANTS. `codeOnly` không
  // hiểu regex literal — nó thấy hai dấu nháy đơn và xử lý như chuỗi — nên tên field sống sót
  // qua cả chế độ blank. Neo dựng trên dữ liệu bị chính file test làm bẩn.
  //
  // Đây là hở ĐÃ GHI SẴN trong chú thích của `codeOnly` (*"regex literal … vẫn đánh lừa được
  // nó"*), chỉ khác chiều: ở đó là `//`, ở đây là dấu nháy. Luật của chú thích đó là thêm ca
  // test trước khi thêm nhánh — ca đó là khối này.
  //
  // Nên neo vào ĐÚNG LỜI GỌI trong ĐÚNG HÀM, không grep cả file. Có nhánh riêng báo "neo đã
  // trôi" để người sau sửa neo thay vì xoá check.
  {
    const libSrc = readFileSync(repoPath('tooling', 'lib', 'harness.mjs'), 'utf8');
    const at = libSrc.indexOf('export function configCoverage(');
    const block = at < 0 ? '' : libSrc.slice(at, at + 2000);
    if (!block) fail.push(`configCoverage${L} không tìm thấy \`export function configCoverage(\` — NEO ĐÃ TRÔI, sửa neo đừng xoá check`);
    else if (!/codeOnly\(raw, \{ blankStrings: false \}\)/.test(block))
      fail.push(`configCoverage${L} lời gọi \`codeOnly\` trong configCoverage KHÔNG còn \`blankStrings: false\`. `
        + `Tên field sống TRONG chuỗi (\`limit('x', 5)\`); xoá ruột chuỗi là xoá đúng thứ đang tìm, và phép quét `
        + `sẽ báo hàng loạt field ĐANG ĐƯỢC ĐỌC là chết.`);
    else ok.push(`configCoverage${L} \`blankStrings: false\` được khoá tại đúng lời gọi trong configCoverage`);
  }

  {
    const real = configCoverage();
    if (real.unknown) ok.push(`configCoverage${L} không liệt kê được file (không phải git repo?) — CHƯA ĐO, không phải "sạch"`);
    // PHẠM VI, hai đầu. `scanned` khác 0 ⇒ không mù. `rejected` khác 0 ⇒ COV_ROOTS ĐANG lọc.
    // Đếm `rejected` RIÊNG là bắt buộc: mở toang phạm vi thì phép lọc ĐUÔI FILE vẫn giữ
    // `scanned < tracked`, nên so hai số đó không bắt được gì — mutant đầu tiên sống sót
    // đúng vì thế. Quét cả repo là quét cả changelog/docs/ADR, nơi mọi tên field đều được
    // nhắc như bia mộ, và khi đó MỌI field đọc thành "có người đọc": phép quét câm, im lặng.
    else if (real.scanned === 0) fail.push(`configCoverage${L} quét 0 file — phép quét MÙ, mọi field sẽ đọc thành "không ai đọc"`);
    else if (real.rejected === 0) fail.push(`configCoverage${L} 0 file bị PHẠM VI loại (quét ${real.scanned}/${real.tracked}) — `
      + `\`COV_ROOTS\` không còn lọc gì. Gộp changelog/docs vào làm phép quét CÂM vì chúng nhắc mọi tên field.`);
    else ok.push(`configCoverage${L} phạm vi ${real.scanned} quét · ${real.rejected} bị loại · ${real.tracked} tracked — lọc THẬT, và khác 0`);
  }

  // Hàm tồn tại mà không ai gọi thì nó là một field ma dạng khác. Neo vào lời gọi THẬT.
  const docSrc = codeOnly(readFileSync(repoPath('tooling', 'harness-doctor.mjs'), 'utf8'), { blankStrings: true });
  if (!/\bconfigCoverage\(/.test(docSrc)) fail.push(`configCoverage${L} harness-doctor KHÔNG gọi configCoverage() — phép quét tồn tại mà không ai chạy`);
  else ok.push(`configCoverage${L} harness-doctor có gọi — phép quét được nối vào bảng người đọc`);
}

// ─── sổ phiên phải DÙNG CHUNG cho mọi worktree ──────────────────────────────
//
// Đo 2026-08-07/08 (#108): ba phiên song song ~2 giờ trên cùng repo, ba worktree. Mỗi phiên ghi
// vào `<worktree>/.claude/state/sessions/` của RIÊNG nó ⇒ không phiên nào thấy phiên nào ⇒ 0
// cảnh báo. Người dùng phát hiện bằng cảm giác hoá đơn.
//
// Ca phải khoá chặt nhất là **worktree phụ**: ở đó `git rev-parse --git-common-dir` trả đường
// dẫn TUYỆT ĐỐI. Nối nó vào gốc worktree sẽ ra một đường dẫn vô nghĩa, và mỗi worktree lại có
// sổ riêng — tức bug quay lại y nguyên, với một cái tên hàm mới.
{
  const L = ' '.repeat(13);
  const bad = [];
  const MAIN = process.platform === 'win32' ? 'C:/repo' : '/repo';
  const WT = process.platform === 'win32' ? 'C:/repo-97' : '/repo-97';
  const ABS = process.platform === 'win32' ? 'C:/repo/.git' : '/repo/.git';

  const fromMain = resolveSharedState('.git', MAIN);          // cây chính: git trả TƯƠNG ĐỐI
  const fromWt = resolveSharedState(ABS, WT);                 // worktree phụ: git trả TUYỆT ĐỐI
  const norm = (p) => p.replace(/\\/g, '/');
  if (norm(fromMain) !== norm(fromWt)) {
    bad.push(`cây chính và worktree phụ ra HAI sổ khác nhau:\n      ${norm(fromMain)}\n      ${norm(fromWt)}`);
  }
  if (!norm(fromWt).startsWith(norm(MAIN))) bad.push(`worktree phụ trỏ ra ngoài repo chính: ${norm(fromWt)}`);
  // Git im lặng / không phải repo git ⇒ vẫn phải ra một đường dẫn dùng được, không phải crash.
  if (!resolveSharedState('', MAIN) || !resolveSharedState(null, MAIN)) bad.push('đầu vào rỗng làm hàm trả rỗng');
  // Nằm trong `.git` ⇒ không bao giờ bị commit, không cần thêm dòng .gitignore nào.
  if (!norm(fromMain).includes('/.git/')) bad.push(`sổ không nằm trong .git/: ${norm(fromMain)} — sẽ làm cây bẩn ở mọi phiên`);

  // HAI ĐẦU: `session-start.mjs` phải GỌI `sharedStateDir` cho sổ phiên. Còn dùng `stateDir()`
  // là bug #108 nguyên vẹn.
  const ss = codeOnly(readFileSync(repoPath('.claude', 'hooks', 'session-start.mjs'), 'utf8'));
  if (!/join\(\s*sharedStateDir\(\)\s*,\s*'sessions'\s*\)/.test(ss)) {
    bad.push('session-start.mjs không dựng thư mục sessions từ `sharedStateDir()` — mỗi worktree lại một sổ riêng');
  }

  if (bad.length) fail.push(`sổ phiên chung${L.slice(4)} ${bad.length} ca sai: ${bad.join(' | ')}`);
  else ok.push(`sổ phiên chung${L.slice(4)} 5 ca — cây chính và worktree phụ cùng MỘT sổ, và sổ nằm trong .git/`);
}

// ─── cờ THIẾU GIÁ TRỊ không được đọc thành CÓ GIÁ TRỊ ───────────────────────
//
// `node tooling/capo-report.mjs --days 7 --usd` (cờ đứng cuối) in `OK  CAPO = $NaN` và GHI
// một mục `usd: null` vào `capo-history.json` — sổ mà mọi run-rate về sau neo vào entry gần
// nhất (#107). Ba trạng thái của một cờ chỉ có chỗ cho hai.
//
// Ca phải khoá chặt nhất là **sổ**: in NaN ra màn hình thì người đọc thấy; ghi NaN vào sổ đo
// lường thì không ai thấy, và nó ở đó vĩnh viễn.
{
  const L = ' '.repeat(13);
  const st = mkdtempSync(join(tmpdir(), 'harness-capo-'));
  const runCapo = (args) => spawnSync(process.execPath, [repoPath('tooling', 'capo-report.mjs'), ...args],
    { encoding: 'utf8', cwd: repoPath(''), env: { ...process.env, HARNESS_STATE_DIR: st } });
  const bad = [];
  const CASES = [
    [['--days', '7', '--usd'], 1, 'cờ --usd đứng cuối, thiếu giá trị'],
    [['--days', '--usd', '43'], 1, 'cờ --days nuốt phải cờ kế tiếp'],
    [['--days', '7', '--usd', 'abc'], 1, 'giá trị không phải số'],
    [['--days', '7', '--usd', '-5'], 1, 'giá trị âm'],
    [['--days', '7'], 0, 'KHÔNG khai --usd là hợp lệ — báo cáo vẫn chạy, chỉ không tính CAPO'],
    [['--days', '7', '--usd', '43'], 0, 'đủ và hợp lệ'],
  ];
  let lastOut = '';
  for (const [args, wantExit, label] of CASES) {
    const r = runCapo(args);
    if (r.status !== wantExit) bad.push(`${label}: exit ${r.status} ≠ ${wantExit}`);
    lastOut = r.stdout || '';
  }
  // BÊN GHI phải tự từ chối. Dựa vào bên ĐỌC lọc `Number.isFinite` là hợp đồng chỉ đúng cho
  // tới khi có bên đọc thứ hai.
  //
  // KHÔNG ĐƯỢC đòi "đúng 1 entry". Bản đầu đòi đúng thế và **CI parity đỏ cả ba OS** trong khi
  // máy tôi xanh: checkout `pull_request` không có merge nào trong 7 ngày ⇒ `accepted = 0` ⇒
  // `capo === null` ⇒ không entry nào được ghi. Đó là `knowledge/lessons/0003` — *self-test
  // giả định repo của nó* — và nó có sẵn trong repo này trước khi tôi viết ca test đó.
  //
  // Bất biến THẬT không phụ thuộc lịch sử git: **≤ 1 entry, và mọi entry đều hữu hạn.**
  const hist = readJson(join(st, 'capo-history.json'), { entries: [] });
  const junk = hist.entries.filter(e => !Number.isFinite(e.usd) || !Number.isFinite(e.capo));
  if (junk.length) bad.push(`${junk.length} entry KHÔNG hữu hạn lọt vào sổ: ${JSON.stringify(junk[0])}`);
  if (hist.entries.length > 1) bad.push(`sổ có ${hist.entries.length} entry, tối đa 1 (chỉ ca hợp lệ được ghi) — bên GHI đang ghi rác`);
  // Ca "ghi đúng 1 entry" chỉ kiểm được khi repo CÓ merge trong cửa sổ. Không có thì `n/a`,
  // KHÔNG phải pass — nói ra để người đọc biết phần nào chưa được phủ ở môi trường này.
  const computable = /CAPO = \$/.test(lastOut);
  if (computable && hist.entries.length !== 1) bad.push(`CAPO tính được mà sổ có ${hist.entries.length} entry, phải đúng 1`);
  rmSync(st, { recursive: true, force: true });

  if (bad.length) fail.push(`cờ thiếu giá trị${L.slice(6)} ${bad.length} ca sai: ${bad.join(' | ')}`);
  else if (!computable) {
    declareNa(1, `cờ thiếu giá trị${L.slice(6)} 6 ca exit code + "không entry rác" ĐÃ kiểm; ca "ghi đúng 1 entry" `
      + 'KHÔNG kiểm được ở đây (0 merge trong cửa sổ 7 ngày — checkout nông ở CI). Chạy suite ở máy có lịch sử git để phủ nó.');
  } else ok.push(`cờ thiếu giá trị${L.slice(6)} 6 ca — cờ THIẾU GIÁ TRỊ dừng kèm chỉ dẫn, và sổ chỉ nhận entry hữu hạn`);
}

// ─── sổ ghi được thì phải ĐÓNG được ─────────────────────────────────────────
//
// `/harness-propose` đỏ VĨNH VIỄN vì `harnessBlocks` đếm mọi dòng từng có trong
// `gate-fails.log`. Ba lần chặn ngày 2026-08-07 đã xử lý xong qua PR #79–#101, và không lệnh
// nào làm mục đó xanh lại được (#105).
//
// Ca phải khoá chặt nhất KHÔNG phải "đóng thì về 0" — mà là **occurrence MỚI phải tự mở lại**.
// Nếu đóng một lần là im mãi mãi thì đây không phải cơ chế đóng, nó là nút tắt, và bản vá này
// còn tệ hơn bug: bug làm tín hiệu kêu oan, nút tắt làm nó câm khi có chuyện thật.
{
  const L = ' '.repeat(13);
  const dir = mkdtempSync(join(tmpdir(), 'harness-close-'));
  const log = join(dir, 'gate-fails.log');
  const line = (at, sel, detail) => `${at}|p|${sel}|${detail}\n`;
  const bad = [];

  writeFileSync(log,
    line('2026-08-07T12:00:44.000Z', 'protect-harness', '.claude/settings.json')
    + line('2026-08-07T12:26:00.000Z', 'protect-harness', '.claude/settings.json')
    + line('2026-08-07T12:30:00.000Z', 'dcg', 'git push --force'));

  const n = (sel) => openTelemetryEntries('gate-fails', sel, { dir })?.length;
  if (n('protect-harness') !== 2) bad.push(`trước khi đóng: ${n('protect-harness')} ≠ 2`);
  if (n('dcg') !== 1) bad.push(`selector lọc sai: dcg = ${n('dcg')} ≠ 1`);

  if (!closeTelemetry('gate-fails', 'protect-harness', 'đã đi qua PR #79-#101', { dir })) bad.push('closeTelemetry từ chối một lần đóng hợp lệ');
  if (n('protect-harness') !== 0) bad.push(`sau khi đóng: ${n('protect-harness')} ≠ 0`);
  // Đóng CÓ SELECTOR không được đụng selector khác — nếu không, đóng một mục là làm câm cả sổ.
  if (n('dcg') !== 1) bad.push(`đóng protect-harness làm mất luôn dcg: ${n('dcg')} ≠ 1`);

  // ĐÂY LÀ CA QUAN TRỌNG NHẤT CỦA CẢ KHỐI.
  appendFileSync(log, line('2026-12-01T00:00:00.000Z', 'protect-harness', '.claude/settings.json'));
  if (n('protect-harness') !== 1) bad.push(`occurrence MỚI sau khi đóng KHÔNG mở lại (${n('protect-harness')} ≠ 1) — đây là nút tắt, không phải cơ chế đóng`);

  // Lý do là BẮT BUỘC: đóng không lý do là tắt đèn, không phải xử lý.
  if (closeTelemetry('gate-fails', 'protect-harness', '', { dir })) bad.push('closeTelemetry cho đóng mà KHÔNG có lý do');
  if (closeTelemetry('gate-fails', '', 'có lý do nhưng thiếu selector', { dir })) bad.push('closeTelemetry cho đóng mà không có selector');

  // Log KHÔNG TỒN TẠI là 0 thật; log KHÔNG ĐỌC ĐƯỢC là `null` ⇒ `?` ở bên gọi. Gộp hai cái
  // là đúng lớp lỗi mà L0006 nói tới.
  if (openTelemetryEntries('khong-co-so-nay', null, { dir })?.length !== 0) bad.push('log chưa tồn tại phải là 0, không phải null');

  // Dòng ĐÓNG không được đếm như một lần hook chạy — nếu không, danh mục hook đẻ ra một
  // "hook" tên __CLOSED__ chưa từng tồn tại.
  const tallied = tallyLines(readFileSync(log, 'utf8'));
  if (tallied.has(TELEMETRY_CLOSED)) bad.push('tallyLines đếm dòng __CLOSED__ như một hook');

  if (bad.length) fail.push(`đóng sổ${L} ${bad.length} ca sai: ${bad.join(' | ')}`);
  else ok.push(`đóng sổ${L} 9 ca — đóng CÓ lý do, KHÔNG đụng selector khác, và occurrence MỚI TỰ MỞ LẠI`);

  // HAI ĐẦU: `rituals.mjs` không được tự `readFileSync` một `.log` nữa. Còn một chỗ đọc thô
  // là còn một bộ đếm không đóng được — và nó sẽ là bộ đếm không ai nhớ.
  // Chỉ soi các sổ do `telemetry()` GHI (định dạng `|`). `fixlog-closed.log` cố ý ngoài danh
  // sách: nó là cơ chế đóng CỦA RIÊNG fixlog, định dạng tab, và đã đóng được từ v2.11.0.
  const rit = codeOnly(readFileSync(repoPath('tooling', 'rituals.mjs'), 'utf8'));
  // HAI LẦN NEO SAI TRƯỚC KHI ĐÚNG, ghi lại cả hai vì mỗi lần sai theo một hướng khác nhau:
  //
  //   1. `['"\`]<tên>\.log` — khớp cả `\`gate-runs.log\`` trong một THÔNG BÁO cho người đọc.
  //      Cấm nhắc tên sổ, chứ không cấm đọc thô. BÁO OAN.
  //   2. `readFileSync\([^)]*<tên>` — `[^)]*` dừng ở dấu `)` ĐẦU TIÊN, nên lời gọi LỒNG NHAU
  //      `readFileSync(join(telemetryDir(), 'gate-fails.log'))` đi lọt. Mutant M4 sống sót.
  //      CHO QUA NHẦM — hướng tệ hơn.
  //
  // Neo đúng: **tên sổ trong nháy ĐƠN/KÉP** là một đường dẫn file trong code; thông báo cho
  // người đọc dùng backtick bên trong template literal. Đó là ranh giới có thật trong repo này,
  // không phải một mẹo regex.
  const rawRead = ['gate-fails', 'main-edits', 'gate-runs', 'hook-runs']
    .filter(k => new RegExp(`['"]${k}\\.log['"]`).test(rit));
  if (rawRead.length) {
    fail.push(`đóng sổ${L} rituals.mjs còn đọc THÔ sổ telemetry: ${rawRead.join(' · ')} — bộ đếm đó không đóng được`);
  } else ok.push(`đóng sổ${L} rituals.mjs đọc cả 4 sổ telemetry qua \`openTelemetryEntries\`, không \`readFileSync\` thô`);

  // Lối ra phải in ngay ở chỗ báo đỏ. Một cơ chế đóng người đọc không tìm thấy = không có.
  if (!/--close harness-propose/.test(rit)) {
    fail.push(`đóng sổ${L} dòng \`due\` của /harness-propose không in ra lệnh đóng — người đọc không có cách nào biết nó đóng được`);
  } else ok.push(`đóng sổ${L} dòng \`due\` tự in lệnh đóng nó (lối ra nằm ở chỗ báo đỏ)`);
}

// ─── Ba nơi hỏi "pack nào chờ?" phải gọi CÙNG một hàm ─────────────────────────
//
// Bảng thuần ở trên khoá phán đoán, nhưng không ngăn ai đó đếm lại bằng tay ở file thứ tư.
// Đây là phần ngăn nó: ba file phải import `packPending`, và không file nào được tự lặp qua
// `knowledge/incoming/` để đếm nữa.
{
  const L = ' '.repeat(6);
  const bad = [];
  for (const rel of [['tooling', 'harness-doctor.mjs'], ['tooling', 'rituals.mjs'], ['tooling', 'knowledge', 'accept.mjs']]) {
    const name = rel[rel.length - 1];
    const s = readFileSync(repoPath(...rel), 'utf8');
    // `packPending\(` chứ không phải `\bpackPending\b`: bản đầu chỉ đòi cái TÊN xuất hiện,
    // và một dòng `import { packPending }` bỏ không dùng thoả mãn nó. Đo bằng mutant
    // 2026-08-07: thay lời gọi trong doctor bằng `packs.length` mà test vẫn XANH.
    if (!/packPending\s*\(/.test(s)) bad.push(`${name} không GỌI packPending()`);
    // `readdirSync(...incoming...)` = đang tự đếm lại. `readPacks()` mới là đường đúng.
    if (/readdirSync\([^)]*incoming/i.test(s) || /'incoming'\s*\)[\s\S]{0,80}readdirSync/.test(s)) {
      bad.push(`${name} vẫn tự lặp qua knowledge/incoming/ — dùng readPacks()`);
    }
  }
  if (bad.length) fail.push(`một định nghĩa "chờ quyết"${L} ${bad.join(' · ')}`);
  else ok.push(`một định nghĩa "chờ quyết"${L} doctor · rituals · accept đều đi qua packPending()`);
}

// ─── /claim khi solo: cùng phép kiểm, khác NGƯỜI ĐỌC ─────────────────────────
//
// Solo KHÔNG tắt `/claim` — nhật ký vẫn cần, chỉ đổi người đọc. Nhưng lý do phải đổi theo:
// "phiên sau (và người sau) không có gì để đọc" là câu rỗng khi bạn là người duy nhất, và
// một lý do rỗng biến nghi thức thành thủ tục.
//
// Khẳng định vào `evaluate()` — THUẦN — qua `s.solo`. Đây cũng là lý do `collect()` đọc
// config chứ không phải `check()`: một lần đọc đĩa lén trong `check` làm ca này không lái được.
{
  const { evaluate } = await import('./rituals.mjs');
  const L = ' '.repeat(19);
  const st = {
    issue: 'SKB-1', progressExists: false, commitsSinceProgress: 0, ahead: 0, integrationBranch: 'origin/main',
    fixlogTotal: 0, fixlogRepeated: 0, learningsNewerThanLessons: 0, learningsDeclined: 0,
    skillCount: 5, maxSkills: 12, worktrees: 1, maxWorktrees: 4, pendingPacks: 0,
    claudeCodeVersion: '2.1.221', reviewedClaudeCode: '2.1.221', reviewedClaudeCodeAt: '2026-08-05T00:00:00.000Z',
    // "Trạng thái ĐỦ" cho `claude-code-drift` giờ gồm cả PHÉP TRỪ TẬP HỢP, không chỉ phép so
    // version: tập sự kiện hook phải đã được đo ở đúng version đang chạy (issue #85).
    nativeEventsVersion: '2.1.221', nativeEventsCount: 31,
  };
  const claimOf = (solo) => evaluate({ ...st, solo }).find(r => r.id === 'claim');
  const soloR = claimOf(true), teamR = claimOf(false);

  if (soloR?.state !== 'due' || teamR?.state !== 'due') {
    fail.push(`/claim solo${L} nhật ký thiếu mà không \`due\` (solo=${soloR?.state} · đội=${teamR?.state}) — solo KHÔNG được tắt /claim`);
  } else if (soloR.why === teamR.why) {
    fail.push(`/claim solo${L} lý do y hệt nhau ở solo và đội — "người sau" là câu rỗng khi chỉ có một người`);
  } else if (/người sau/.test(soloR.why)) {
    fail.push(`/claim solo${L} lý do solo vẫn nhắc "người sau": ${soloR.why}`);
  } else if (!/máy khác/.test(soloR.why)) {
    fail.push(`/claim solo${L} lý do solo không nêu người đọc thật (phiên sau · máy khác của bạn): ${soloR.why}`);
  } else ok.push(`/claim solo${L} vẫn \`due\` ở cả hai vai, nhưng nêu đúng người đọc (solo: phiên sau + máy khác của BẠN)`);
}

// ─── apply-to --audit: lưới IGNORE của nhật ký không được mã hoá quy ước ĐẶT TÊN ──
//
// Bản trước: `/^docs\/progress\/[A-Z]/`. Nó không lọc "nhật ký thật", nó lọc "nhật ký có
// tên bắt đầu bằng chữ HOA" — tức nó mã hoá giả định *mọi nhật ký đều tên theo mã issue*.
//
// Một phiên NGHI THỨC không có issue (nhánh `chore/…`), nên nhật ký của nó tên theo nhánh,
// chữ thường. Kết quả đo 2026-08-06: `--audit` đỏ với nhật ký vòng học tuần W32 (tên file chữ thường)
// — đúng file mà `/claim` bước 6 bảo tạo. Một gate chặn chính artefact do nghi thức của nó
// sinh ra thì người ta sẽ học cách đi vòng qua gate, không học cách bỏ artefact.
//
// Vì sao `--audit` KHÔNG tự khoá được chỗ này: nó chỉ đỏ khi trong cây ĐANG CÓ một nhật ký
// tên chữ thường. Xoá file đó thì audit xanh lại trong khi bug còn nguyên — cùng chế độ
// "phép kiểm mất phạm vi thì im lặng" mà ca GLOBAL_OK ngay dưới cũng phòng.
//
// Đọc pattern TỪ NGUỒN, không chép lại: chép lại là bản sao thứ hai sẽ trôi.
{
  const atSrc = readFileSync(repoPath('tooling', 'apply-to.mjs'), 'utf8');
  const lit = atSrc.match(/^\s*(\/\^docs\\\/progress\\\/.*?\/),/m)?.[1];
  const L = ' '.repeat(16);
  if (!lit) {
    fail.push(`apply-to.mjs${L} không rút được pattern IGNORE của docs/progress — neo của check này đã trôi, sửa neo thay vì xoá check`);
  } else {
    const re = new RegExp(lit.slice(1, -1));
    // Phải BỎ QUA (không mang sang project mới): nhật ký thật, cả hai kiểu tên.
    const ignored = ['docs/progress/vong-hoc-2026-W32.md', 'docs/progress/ABC-1.md'];
    // Phải GIỮ (nằm trong SEED): khuôn mẫu.
    const seeded = ['docs/progress/_TEMPLATE.md', 'docs/progress/_TEAM.md'];
    const missed = ignored.filter(f => !re.test(f));
    const eaten = seeded.filter(f => re.test(f));
    if (missed.length) fail.push(`apply-to.mjs${L} IGNORE bỏ sót nhật ký thật: ${missed.join(' · ')} — --audit sẽ đỏ với chính file nghi thức vừa tạo`);
    else if (eaten.length) fail.push(`apply-to.mjs${L} IGNORE nuốt luôn khuôn mẫu: ${eaten.join(' · ')} — chúng ở SEED, project mới sẽ không có khuôn nhật ký`);
    else ok.push(`apply-to.mjs${L} IGNORE nhật ký lọc theo "không phải khuôn mẫu", không theo quy ước đặt tên (2 kiểu tên bỏ qua, 2 khuôn giữ)`);
  }
}

// ─── PARITY: allowlist của entropy-scan phải khớp trên MỌI OS ────────────────
//
// `walk()` dựng đường dẫn bằng `join()` ⇒ dấu phân cách của hệ điều hành. Bản trước lấy tên
// file bằng `f.split('/').pop()`, nên TRÊN WINDOWS nó trả về nguyên đường dẫn và
// `GLOBAL_OK.includes(...)` không bao giờ đúng.
//
// Hậu quả đo được 2026-08-06 (Windows 11): 5 cảnh báo VĨNH VIỄN về `danger-zones.md` và
// `README.md` — hai file đã nằm trong allowlist từ đầu. Trên Linux/macOS: im lặng.
//
// Vì sao đáng một test riêng: đây là lớp lỗi mà Parity Contract sinh ra để bắt, và nó KHÔNG
// làm gì đỏ cả — nó chỉ thêm nhiễu, ở đúng một OS. Công cụ nói hai chuyện khác nhau tuỳ máy
// thì mất tin cậy, và cảnh báo THẬT nằm cạnh sẽ chết chung. `harness-doctor` đếm 1 rule
// không có `paths`; `entropy-scan` trên Windows kể như 2 — hai công cụ, hai sự thật.
//
// Test đọc allowlist TỪ NGUỒN, không chép lại: chép lại là bản sao thứ hai sẽ trôi.
{
  const esSrc = readFileSync(repoPath('tooling', 'entropy-scan.mjs'), 'utf8');
  const listed = (esSrc.match(/const GLOBAL_OK = \[([^\]]*)\]/)?.[1] || '')
    .split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  const present = listed.filter(n => exists(repoPath('.claude', 'rules', n)));
  const r = spawnSync(process.execPath, [repoPath('tooling', 'entropy-scan.mjs')], {
    encoding: 'utf8', cwd: repoPath(''), env: { ...process.env, ...TEST_ENV },
  });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  // So `.claude/rules/<tên>:` chứ KHÔNG so tên trần. Cảnh báo mà ca này canh luôn in dưới
  // dạng `rel(f) + ':'`, còn tên trần thì đụng mọi chỗ khác trong output — đo 2026-08-07:
  // §9b in file NGUỒN của một đường dẫn chết (`README.md`), và ca này đỏ vì một lý do không
  // liên quan gì tới allowlist. Một khẳng định so chuỗi quá rộng thì đo cả những thứ nó
  // không định đo, và nó sẽ đỏ mỗi lần ai đó thêm một dòng output ở chỗ khác.
  const leaked = present.filter(n => out.includes(`.claude/rules/${n}:`));

  if (!listed.length) {
    fail.push(`entropy-scan.mjs${' '.repeat(12)} không rút được \`GLOBAL_OK\` — neo của check này đã trôi, sửa neo thay vì xoá check`);
  } else if (!present.length && naIfBare(1, 'entropy-scan GLOBAL_OK: không file rule nào còn tồn tại')) {
    // `GLOBAL_OK` liệt kê file trong `.claude/rules/` — cả thư mục vừa bị đổi tên, nên
    // "MẤT PHẠM VI" ở đây là hệ quả của việc gỡ, không phải của một allowlist đã mục.
  } else if (!present.length) {
    fail.push(`entropy-scan.mjs${' '.repeat(12)} không file nào trong GLOBAL_OK còn tồn tại ⇒ ca này MẤT PHẠM VI, nó sẽ xanh mãi mà không kiểm gì`);
  } else if (leaked.length) {
    fail.push(`entropy-scan.mjs${' '.repeat(12)} ${leaked.length}/${present.length} file trong GLOBAL_OK VẪN bị cảnh báo: ${leaked.join(' · ')}`
      + ` — allowlist không khớp. Gần như luôn là so tên file bằng \`split('/')\` trên đường dẫn do \`join()\` dựng (Parity Contract)`);
  } else ok.push(`entropy-scan.mjs${' '.repeat(12)} allowlist GLOBAL_OK khớp thật trên OS này (${present.length} file được miễn, 0 rò)`);
}

// ─── dcg: KHỚP LỆNH, KHÔNG KHỚP CHUỖI (#43) ──────────────────────────────────
//
// Bảng này là mười ca ĐÃ ĐO trong issue #43 — năm lần chặn nhầm văn bản, năm biến thể nguỵ
// trang mà shell thực thi y hệt dạng bị chặn. Hai triệu chứng ngược nhau, một gốc: gác nhận
// một CHUỖI và xử lý nó như một LỆNH.
//
// Ca chặn-nhầm số 5 đáng gọi tên riêng: guard chặn chính lệnh `gh issue create` mở issue #43,
// vì thân issue trích tên lệnh. Một cái gác chặn được việc BÁO CÁO về chính nó là một cái gác
// tự bịt đường sửa nó.
//
// Bảng khẳng định vào `dangerousCommand` — hàm THUẦN — chứ không spawn hook: mười ca × một
// process mỗi ca là chi phí không cần trả, và phán đoán mới là thứ cần khoá.
{
  const L = ' '.repeat(15);
  const GIT = /^git$/;
  const RULES = [
    { program: GIT, re: /^git\s+push\s+[^|;&]*(-f\b|--force(?!-with-lease))/, why: 'force push' },
    { program: /^rm$/, re: /^rm\s+-[rRf]{1,2}\w*\s+([/~]\S*|\.\s*$|\*\s*$)/, why: 'rm gốc' },
    { re: /\b(DROP\s+(TABLE|DATABASE|SCHEMA)|TRUNCATE\s+TABLE)\b/i, why: 'SQL' },
    // KHÔNG chép regex — dùng ĐÚNG hằng mà `dcg.mjs` dùng. Ba rule trên là bản chép có chủ ý
    // (chúng chỉ minh hoạ ngữ nghĩa KHỚP), còn rule này có một ranh giới hẹp (`.` vs `./src`)
    // mà một bản chép sẽ trôi khỏi bản thật mà không ai thấy (#160).
    { program: GIT, re: GIT_DISCARD_WHOLE_TREE, why: 'checkout bỏ cả cây' },
    // `test:` — cần TRẠNG THÁI nháy, thứ `re` không thấy được vì nó khớp trên bản đã bỏ nháy.
    // `testWhole`, KHÔNG `test` — bảng dưới có ca NHIỀU DÒNG, và phép cắt mặc định (theo `\n`)
    // xé chúng thành mảnh không còn `program` là `node`. Bản đầu dùng `test` và xanh cả bảng
    // vì mọi ca đều một dòng; lỗ chỉ lộ khi guard để lọt một lệnh THẬT (#177, vá 2026-08-12).
    { testWhole: backtickEvalHazardIn, why: 'backtick' },
  ];
  const BLOCKED = true, ALLOWED = false;
  //                                                                        mong đợi
  const TABLE = [
    // ── CHẶN NHẦM VĂN BẢN — năm ca đã đo, tất cả phải ĐI QUA ────────────────
    [`cat > f.md <<'EOF'\ngit push --force là thứ bị cấm\nEOF`, ALLOWED, 'heredoc chứa tên lệnh (ca 1)'],
    [`git commit -m "phát hiện: git push --force đi lọt"`, ALLOWED, 'commit message trích tên lệnh (ca 2)'],
    [`cat > probe.mjs <<'JS'\nconst x = 'git push --force';\nJS`, ALLOWED, 'heredoc viết script đo chính dcg (ca 3)'],
    [`node tooling/rituals.mjs --reviewed-claude-code "vendor vá git push --force"`, ALLOWED, 'đối số chuỗi, KHÔNG heredoc (ca 4)'],
    [`gh issue create --body "dcg chặn nhầm git push --force"`, ALLOWED, 'gh issue create — guard từng chặn chính việc báo cáo về nó (ca 5)'],
    // ── NGUỴ TRANG BẰNG NHÁY — năm ca đã đo, tất cả phải BỊ CHẶN ────────────
    [`git "push" --force`, BLOCKED, 'bọc một token bằng nháy kép'],
    [`git push --fo""rce`, BLOCKED, 'cặp nháy rỗng giữa một cờ'],
    [`git push --f''orce`, BLOCKED, 'cặp nháy đơn rỗng giữa một token'],
    [`rm -rf "/"`, BLOCKED, 'bọc đường dẫn gốc bằng nháy kép'],
    [`sudo rm -rf /`, BLOCKED, 'bọc bằng sudo — chương trình thật là rm'],
    // ── MỐC HAI ĐẦU: phải giữ nguyên hành vi đúng ───────────────────────────
    [`git push --force-with-lease`, ALLOWED, 'biến thể an toàn vẫn được phép'],
    [`git status`, ALLOWED, 'lệnh thường'],
    [`git push --force`, BLOCKED, 'dạng thẳng vẫn chặn'],
    [`psql -c "DROP TABLE users"`, BLOCKED, 'SQL nằm trong đối số — rule không có `program` quét cả chuỗi'],
    [`echo hi && git push --force`, BLOCKED, 'lệnh thứ hai trong chuỗi && vẫn bị soi'],
    // ── #160: `git checkout --` — BỎ CẢ CÂY vs KHÔI PHỤC ĐÚNG MẤY FILE ─────
    //
    // Chiều CHO QUA là chiều bản vá sinh ra để mở. Chiều CHẶN là chiều KHÔNG được yếu đi, và
    // hai ca đầu của nó là hai lỗ mà rule CŨ để lọt (`--` trần · token đứng trước `--`).
    [`git checkout --`, BLOCKED, '#160 không pathspec = bỏ cả cây — rule CŨ để lọt vì nó đòi một dấu cách sau `--`'],
    [`git checkout HEAD -- .`, BLOCKED, '#160 có tree-ish đứng trước `--` — rule CŨ cũng để lọt'],
    [`git checkout -- .`, BLOCKED, '#160 bỏ cả cây'],
    [`git checkout -- ./`, BLOCKED, '#160 `./` cũng là cả cây'],
    [`git checkout -- :/`, BLOCKED, '#160 pathspec gốc repo = cả cây'],
    [`git checkout -- *`, BLOCKED, '#160 glob trần = mọi file trong thư mục hiện tại'],
    [`git checkout -- ..`, BLOCKED, '#160 thư mục cha'],
    [`git checkout -- . tooling/rituals.mjs`, BLOCKED, '#160 một token cả-cây nằm CẠNH file cụ thể vẫn là bỏ cả cây'],
    [`git checkout -- tooling/rituals.mjs .`, BLOCKED, '#160 …kể cả khi nó đứng CUỐI'],
    [`git checkout "--" "."`, BLOCKED, '#160 nguỵ trang bằng nháy — `simpleCommands` bỏ nháy trước khi khớp'],
    [`git checkout -- tooling/rituals.mjs`, ALLOWED, '#160 khôi phục ĐÚNG 1 file — bước dọn của mutation test, 3 lần bị chặn nhầm'],
    [`git checkout -- a.mjs b.mjs`, ALLOWED, '#160 nhiều file cụ thể vẫn là cụ thể'],
    [`git checkout -- ./src/x.ts`, ALLOWED, '#160 `./` MỞ ĐẦU một đường dẫn cụ thể ≠ `./` đứng một mình'],
    [`git checkout -- src/*`, ALLOWED, '#160 glob CÓ PHẠM VI thư mục — hẹp, không phải cả cây'],
    [`git checkout main`, ALLOWED, '#160 chuyển nhánh, không phải bỏ thay đổi'],
    [`git checkout -b feat/x`, ALLOWED, '#160 tạo nhánh'],
    // ── #177: backtick NGOÀI nháy đơn = command substitution ────────────────
    //
    // Chiều CHO QUA là chiều `L0002` đòi, và `dcg` chính là hook đã bắn nhầm 5 lần ở #43 —
    // nên nửa dưới của bảng này dài hơn nửa trên, cố ý.
    [`node -e "const s = \`xin chào\`"`, BLOCKED, '#177 backtick trong nháy KÉP — bash thay bằng output lệnh'],
    [`node --eval "x = \`a\`"`, BLOCKED, '#177 `--eval` cũng vậy'],
    [`gh issue create --title "sửa \`foo\`"`, BLOCKED, '#177 lần 7 đã đo: tiêu đề mất ký tự'],
    [`gh pr create --body "dùng \`npm ci\` nhé"`, BLOCKED, '#177 `--body` cùng gốc rễ'],
    [`node -e "console.log(\`a\`)" && echo xong`, BLOCKED, '#177 lệnh đầu trong chuỗi && vẫn bị soi'],
    [`node -e 'const s = \`xin chào\`'`, ALLOWED, '#177 backtick trong nháy ĐƠN — bash KHÔNG diễn giải, đây là cách đi đúng'],
    [`node -e "console.log('a')"`, ALLOWED, '#177 không có backtick'],
    [`node tooling/rituals.mjs --all`, ALLOWED, '#177 không phải `-e`'],
    [`echo "hôm nay là \`date\`"`, ALLOWED, '#177 substitution CỐ Ý ngoài node/gh — chặn nó là bắn nhầm (L0002)'],
    [`gh issue create --body-file spec.md`, ALLOWED, '#177 `--body-file` KHÔNG phải `--body`'],
    [`node -e "const s = \\\`a\\\`"`, ALLOWED, '#177 backtick ĐÃ escape là backtick literal, không phải substitution'],
    // FALSE NEGATIVE ĐÃ BIẾT, và ca này tồn tại để nó không im lặng: backtick trong đối số của
    // một script node THẬT cũng bị bash thay, nhưng rule khoá vào `-e|--eval|--title|--body` —
    // bảy lần đã đo đều nằm ở đó. Nới phạm vi ra "mọi đối số" là quay lại bắn nhầm (L0002).
    [`node scripts/x.mjs "ghi \`date\` vào log"`, ALLOWED, '#177 phạm vi HẸP có chủ ý — không phải cờ văn-bản-dài'],
    // CA PHÂN BIỆT cho gate CHƯƠNG TRÌNH, và nó cần cả ba thứ cùng lúc: chương trình NGOÀI
    // node/gh · một cờ TRÙNG TÊN (`grep -e`) · một backtick. Thiếu vế giữa thì mutant "bỏ gate
    // chương trình" SỐNG SÓT — gate cờ che mất nó. Đo 2026-08-12: đúng thế, mutant N3 sống lượt đầu.
    [`grep -e "tìm \`x\`" file.txt`, ALLOWED, '#177 `grep -e` cũng có cờ `-e` — gate CHƯƠNG TRÌNH mới là thứ loại nó'],
    // ── #177 VÁ: ĐỐI SỐ NHIỀU DÒNG — đúng nhóm đã đo 7 lần, và là nhóm bản đầu để LỌT ──
    //
    // Phép cắt mặc định tách theo `\n`, nên `node -e "` và dòng mang backtick thành hai mảnh
    // khác nhau; mảnh thứ hai có `program` là `const`, và gate chương trình loại nó. Cả bảng
    // ca ban đầu là lệnh MỘT DÒNG nên nó xanh suốt — lỗ chỉ lộ khi guard để lọt một lệnh THẬT
    // của tôi, một giờ sau khi merge.
    [`node -e "\nconst s = \`a\`;\nconsole.log(s);\n"`, BLOCKED, '#177 nhiều dòng — CA CHÍNH của rule, bản đầu để lọt'],
    [`cd /x && node -e "\nlet y = \`date\`;\n"`, BLOCKED, '#177 nhiều dòng SAU một `&&`'],
    [`node -e '\nconst s = \`a\`;\n'`, ALLOWED, '#177 nhiều dòng nhưng nháy ĐƠN — vẫn phải cho qua'],
    [`cd /x && grep -e "tìm \`y\`" f\nnode -e 'an toan'`, ALLOWED, '#177 hai lệnh rời: backtick ở lệnh KHÔNG phải node/gh ⇒ không bắc cầu'],
  ];
  const bad = [];
  for (const [cmd, want, label] of TABLE) {
    const got = Boolean(dangerousCommand(cmd, RULES));
    if (got !== want) bad.push(`${label}: ${got ? 'CHẶN' : 'qua'}, mong đợi ${want ? 'CHẶN' : 'qua'}`);
  }
  if (bad.length) fail.push(`dcg khớp lệnh${L} ${bad.length}/${TABLE.length} ca sai: ${bad.join(' | ')}`);
  else ok.push(`dcg khớp lệnh${L} ${TABLE.length} ca — 5 lần chặn nhầm ĐÃ ĐO đều đi qua, 5 biến thể nguỵ trang đều bị chặn, `
    + `\`git checkout --\` phân biệt BỎ CẢ CÂY với KHÔI PHỤC MẤY FILE (#160), backtick phân biệt nháy ĐƠN với nháy KÉP (#177)`);

  // Máy đọc nháy, tách riêng khỏi bảng trên: bảng kia đo RULE (có gate `node|gh`), khối này đo
  // PHÉP ĐỌC. Một mutant làm hỏng phép đọc mà rule vẫn đúng ở 11 ca kia là chuyện có thật —
  // gate chương trình che mất phần lớn đầu vào.
  const QUOTE = [
    ['x = `a`', true, 'không nháy — bash VẪN thay'],
    ['"x = `a`"', true, 'nháy kép'],
    ["'x = `a`'", false, 'nháy ĐƠN — an toàn'],
    ['"a" `b`', true, 'ra khỏi nháy kép rồi mới tới backtick'],
    ['\'a\' "`b`"', true, 'nháy đơn ĐÓNG rồi, backtick sau đó nằm trong nháy kép'],
    ['"\\`a\\`"', false, 'đã escape ⇒ backtick literal'],
    ["'\\`a\\`'", false, 'trong nháy đơn thì `\\` cũng chỉ là ký tự — vẫn an toàn'],
    ['x = 1', false, 'không có backtick'],
    ['', false, 'chuỗi rỗng'],
  ];
  const badQ = QUOTE.filter(([s, want]) => backtickSubstitution(s) !== want);
  if (badQ.length) fail.push(`backtickSubstitution${' '.repeat(7)} ${badQ.length}/${QUOTE.length} ca sai: ${badQ.map(([, , l]) => l).join(' · ')}`);
  else ok.push(`backtickSubstitution${' '.repeat(7)} ${QUOTE.length} ca — nháy ĐƠN an toàn, nháy kép và KHÔNG nháy thì không`);

  // GIỚI HẠN PHẢI ĐƯỢC NÓI RA, không được để người đọc tự suy là đã kín. Biến shell cần
  // THỰC THI mới biết giá trị — regex không bao giờ với tới. Ca này khẳng định đúng điều đó:
  // nếu một ngày nó bị chặn thật thì hoặc ai đó đã dựng lớp mạnh hơn (tốt, cập nhật ca này),
  // hoặc regex vừa phình ra theo hướng sẽ đẻ dương tính giả (xấu, và ca này bắt được).
  const varIndirect = Boolean(dangerousCommand(`F=--force; git push $F`, RULES));
  if (varIndirect) {
    ok.push(`dcg giới hạn${' '.repeat(15)} biến shell GIỜ bị bắt — mạnh hơn tài liệu đang khai, cập nhật danger-zones.md`);
  } else {
    ok.push(`dcg giới hạn${' '.repeat(15)} biến shell (\`git push $F\`) KHÔNG bị bắt — đúng như danger-zones.md khai; tầng MỘT là permissions.deny`);
  }
}

// ─── Mọi khoá trong `budget` phải có BÊN ĐỌC, hoặc tự khai là đã cắt ─────────
//
// Cùng khuôn với `PACK_SCHEMA`: một danh sách, hai đầu. Khác chỗ đầu kia không phải một bảng
// tôi viết ra mà là CẢ REPO — nên phép kiểm là "tìm được ít nhất một chỗ đọc nó".
//
// Ca này ra đời từ một lỗi ĐO của chính tôi. Ở v2.28.0 tôi kết luận cả ba field còn lại của
// `budget` là field ma, và viết điều đó vào `docs/ECONOMICS.md` dưới dạng ba dấu ❌. Đo lại
// 2026-08-07 cho đủ repo: HAI trong ba CÓ bên đọc (`evals/run.mjs:177-178`). Tôi đã grep
// `tooling/` + `.claude/hooks/` + `docs/` và quên `evals/`.
//
// Đó là lớp lỗi tệ hơn field ma: một tài liệu nói SAI về chính cơ chế của mình, và nói sai
// theo hướng "chỗ này rỗng" — tức mời người sau đi cắt một thứ đang chạy.
//
// Phép kiểm này chạy trên CẢ REPO nên nó không bỏ sót được thư mục nào. Cả hai chiều đều bị
// khoá: field không ai đọc phải bị cắt, và field ĐANG có người đọc thì không được lẳng lặng
// biến mất khỏi config.
{
  const L = ' '.repeat(9);
  const budget = readJson(repoPath('harness.config.json'))?.budget ?? {};
  const keys = Object.keys(budget).filter(k => !k.startsWith('$comment'));
  // Đọc nguồn MỘT LẦN cho mọi key: `git ls-files` để không quét `node_modules`, và bỏ chính
  // config (nơi khai) cùng changelog (hồ sơ lịch sử, được phép nhắc field đã cắt).
  const src = git(['ls-files']).stdout.split('\n').filter(Boolean)
    .filter(f => /\.(mjs|yml|yaml)$/.test(f) && f !== 'harness.config.json' && !f.includes('/fixtures/'))
    .map(f => { try { return readFileSync(repoPath(f), 'utf8'); } catch { return ''; } })
    .join('\n');
  const orphan = keys.filter(k => !new RegExp(`budget\\?\\.${k}\\b|budget\\.${k}\\b`).test(src));
  // CHIỀU NGƯỢC: mã nguồn đọc một khoá mà config không khai. `evals/run.mjs` dùng
  // `?? 25` nên khoá biến mất KHÔNG gây lỗi — nó lặng lẽ rơi về mặc định, và người sửa
  // config không biết mình vừa tắt một cái cap. Bỏ chiều này thì ca trên chỉ khoá được một
  // nửa, và tôi đã viết nhầm là "cả hai chiều" cho tới khi mutant thứ hai KHÔNG đỏ.
  // Đòi `budget` phải là một TRUY CẬP THUỘC TÍNH thật — có dấu chấm hoặc ký tự từ ngay trước.
  // Bản đầu khớp tên `budget` trần và bắt nhầm hai thứ: một tên FILE có đuôi `-budget.mjs`
  // (dấu `-` đứng trước) và một tên khoá đã cắt được nhắc trong một comment (backtick đứng
  // trước). Một phép kiểm bắt nhầm văn xuôi và tên file là đúng khuyết tật của `dcg` ở #43.
  //
  // Và comment NÀY cố ý không viết ví dụ dưới dạng truy cập thuộc tính: check quét cả file
  // này, nên một ví dụ đúng cú pháp sẽ tự tố giác mình. Đã xảy ra ở lần viết đầu.
  // `\??` TRƯỚC `.budget` — không phải trang trí. Bản trước đòi ký tự liền trước là `)` hoặc
  // chữ, nên `cfg.budget?.plan` khớp còn `cfg?.budget?.plan` THÌ KHÔNG. Đo 2026-08-08 (#111):
  // tôi thêm một khoá đọc mới, gác kêu đúng; tôi chuyển phép đọc vào một helper ở `lib` và gõ
  // optional chaining ở cả hai bậc — gác im, và tôi suýt đọc sự im lặng đó là "đã sửa xong".
  // Lách được bằng một dấu `?` thì không phải một cái gác.
  const referenced = [...src.matchAll(/[)\w]\??\.budget\??\.([A-Za-z][A-Za-z0-9_]*)/g)].map(m => m[1]);
  const ghost = [...new Set(referenced)].filter(k => !keys.includes(k));
  if (!keys.length) {
    fail.push(`budget ↔ bên đọc${L} không đọc được khoá nào trong \`budget\` — neo của ca này đã trôi`);
  } else if (orphan.length || ghost.length) {
    const parts = [];
    if (orphan.length) parts.push(`${orphan.join(' · ')} — KHÔNG cơ chế nào đọc. Cắt nó, hoặc nối vào một chỗ đọc thật; một con số trong config mà không ai đọc làm người ta TIN là có lớp bảo vệ`);
    if (ghost.length) parts.push(`${ghost.join(' · ')} — mã nguồn ĐỌC mà config KHÔNG khai. Với \`?? mặc-định\` thì nó rơi về mặc định LẶNG LẼ, và người sửa config không biết mình vừa tắt một cái cap`);
    fail.push(`budget ↔ bên đọc${L} ${parts.join(' | ')}`);
  } else ok.push(`budget ↔ bên đọc${L} ${keys.length} khoá — không khoá nào thừa, không khoá nào bị đọc mà chưa khai`);
}

// ─── Banner đầu phiên: cảnh báo dựa trên PLACEHOLDER phải biết VAI (#56) ─────
//
// `harness.config.json` khai mọi lệnh là `""` và `project.id` là `CHANGEME-…` — placeholder
// ĐÚNG theo thiết kế ở repo template. Một cảnh báo gác trên chính những giá trị đó, mà không
// hỏi `repoRole()`, là dương tính giả 100% ở mọi phiên của template.
//
// Đo trước khi sửa: 7/7 lần `session-start` chạy đều thoả điều kiện, từ commit ĐẦU TIÊN của
// repo, và `grep -c repoRole session-start.mjs` = 0. Agent đọc dòng đó cũng KHÔNG CÓ QUYỀN
// làm theo — `harness.config.json` ∈ `paths.harness`.
//
// Ca này KHÔNG cấm mọi cảnh báo: bốn cảnh báo còn lại (index.lock treo, worktree tích tụ,
// phiên khác cùng nhánh, evaluate crash) mô tả điều kiện LÚC CHẠY và đúng ở cả hai vai.
// Nó chỉ cấm đúng một hình dạng: gác trên placeholder mà không hỏi vai.
{
  const L = ' '.repeat(4);
  const src = readFileSync(repoPath('.claude', 'hooks', 'session-start.mjs'), 'utf8').split('\n');
  const PLACEHOLDER_COND = /c\.commands|commands\?\.|project\?\.id|CHANGEME/;
  const bad = [];
  let warns = 0;
  for (let i = 0; i < src.length; i++) {
    if (!/lines\.push\(/.test(src[i]) || !src[i].includes('⚠️')) continue;
    warns++;
    // Điều kiện bao quanh: `if (` gần nhất phía trên, bỏ qua dòng comment.
    let cond = '';
    for (let j = i - 1; j >= 0 && j > i - 14; j--) {
      const t = src[j].trim();
      if (t.startsWith('//') || t.startsWith('*') || !t) continue;
      if (/^\}?\s*(else\s+)?if\s*\(/.test(t) || /\bif\s*\(/.test(t)) { cond = t; break; }
    }
    if (PLACEHOLDER_COND.test(cond) && !/repoRole/.test(cond)) {
      bad.push(`dòng ${i + 1} gác trên placeholder mà KHÔNG hỏi repoRole(): \`${cond.slice(0, 70)}\``);
    }
  }
  if (!warns) bad.push('không tìm thấy `lines.push` nào mang ⚠️ — neo của ca này đã trôi, sửa neo thay vì xoá check');
  if (bad.length) fail.push(`session-start ⚠️ ↔ vai${L} ${bad.join(' · ')}`);
  else ok.push(`session-start ⚠️ ↔ vai${L} ${warns} cảnh báo, không cái nào gác trên placeholder của template mà quên hỏi repoRole()`);
}

// ─── Banner đầu phiên NÊU TÊN mục `?`, không đếm (#51) ───────────────────────
//
// `?` phần lớn sinh ra từ phép đo CHẬP CHỜN, tức tự khỏi. Nên lời khuyên "chạy `--all` để
// xem" không bao giờ trả lời được cho chính ca nó phục vụ — gặp thật 2026-08-06: banner in
// `? 1 mục KHÔNG đo được`, chạy `--all` ngay sau đó ra 0 mục `?`.
//
// Ca này so banner với `rituals.mjs --json` — nguồn sự thật — thay vì so với một chuỗi chép
// tay. Và nó NÓI RA khi không có mục `?` nào: đó là `n/a`, KHÔNG phải pass.
{
  const L = ' '.repeat(6);
  const j = spawnSync(process.execPath, [repoPath('tooling', 'rituals.mjs'), '--json'], {
    encoding: 'utf8', cwd: repoPath(''), env: { ...process.env, ...TEST_ENV },
  });
  let items = [];
  try { items = JSON.parse(j.stdout).filter(r => r.state === '?'); } catch {}
  const b = spawnSync(process.execPath, [repoPath('.claude', 'hooks', 'session-start.mjs')], {
    encoding: 'utf8', input: '{}', cwd: repoPath(''), env: { ...process.env, ...TEST_ENV },
  });
  const out = `${b.stdout || ''}${b.stderr || ''}`;
  const bad = [];

  if (/\d+ mục KHÔNG đo được — chúng không phải/.test(out)) {
    bad.push('banner vẫn ĐẾM thay vì nêu tên — mục `?` chập chờn sẽ biến mất trước khi người dùng kịp tra');
  }
  // HAI CHẾ ĐỘ, luôn có một khẳng định thật — không có nhánh nào chỉ ghi "n/a" rồi thôi.
  // Số mục `?` phụ thuộc trạng thái repo lúc chạy, nên ca hành vi có thể không có mẫu; khi đó
  // rơi về đọc mã nguồn. Nói rõ chế độ nào đã chạy, để một dòng xanh không đọc quá lên.
  let mode;
  if (items.length) {
    mode = `${items.length} mục \`?\` đều được gọi tên (đối chiếu với rituals --json)`;
    const missing = items.filter(r => !out.includes(r.cmd));
    if (missing.length) bad.push(`${missing.length}/${items.length} mục \`?\` KHÔNG được nêu tên: ${missing.map(r => r.cmd).join(' · ')}`);
  } else {
    mode = 'hiện 0 mục `?` nên không có mẫu hành vi — đối chiếu bằng mã nguồn';
    const hookSrc = readFileSync(repoPath('.claude', 'hooks', 'session-start.mjs'), 'utf8');
    if (!/r\.cause \|\| r\.id/.test(hookSrc)) bad.push('banner không còn gộp mục `?` theo KHOÁ nguyên nhân — gộp theo văn xuôi `why` không gộp được gì');
    if (!/for \(const \{ cmds, why \} of byCause/.test(hookSrc)) bad.push('banner không còn in tên từng mục `?`');
  }
  if (bad.length) fail.push(`banner nêu tên mục \`?\`${L} ${bad.join(' · ')}`);
  else ok.push(`banner nêu tên mục \`?\`${L} ${mode}`);
}

// ─── Sàn runner ở stage KHÔNG gate nào có lệnh: ĐO ĐƯỢC, không phải `?` ──────
//
// Ra từ nghi thức `--reviewed-claude-code` cho Claude Code 2.1.224, mục *"Removed
// 200-subagent-per-session spawn cap"*. Trần của vendor từng che cho ta; giờ không còn.
//
// `gates.mjs --list --timing` từng gọi cả cụm này là "KHÔNG đo được độ trễ". Đúng về phần
// VIỆC của gate, sai về CHI PHÍ: chính runner chạy — một tiến trình Node + nạp config + ghi
// telemetry, đo được 100ms trên máy này, trả đủ mỗi lần hook kích hoạt. Ở `subagent` con số
// đó nhân với số agent song song.
//
// Hai vế, và ca này khoá cả hai — bỏ vế nào cũng là một nửa sự thật:
//   · sàn phải HIỆN RA bằng số;
//   · phần việc thật vẫn phải nói rõ là CHƯA đo được.
//
// ── VÌ SAO CẢ HAI LỜI GỌI DƯỚI ĐÂY ĐI QUA `UNCONF`, KHÔNG QUA CONFIG THẬT (#141)
//
// `--list --timing` đo độ trễ bằng cách CHẠY THẬT từng gate. Ở template điều đó miễn phí vì
// `commands.*` rỗng — và đó chính là chỗ nó lừa được ta. Ở repo TIÊU THỤ, cùng dòng lệnh này
// là toàn bộ `preMerge`, gồm `e2e`. Đo ở canary `eval-sandbox` (2026-08-09):
//
//   upgrade.mjs --apply → test-hooks.mjs → gates.mjs --list --timing → npx playwright test
//                                                                   → next dev -p 3799
//   test-hooks ở template: 26 giây.   test-hooks ở eval-sandbox: > 20 phút, phải giết.
//
// Ba cái giá, và cái thứ ba đắt nhất: (1) `upgrade.mjs` gọi ĐỒNG BỘ nên người dùng đọc nó y
// hệt TREO; (2) nó mở một dev server + một trình duyệt trên máy người khác, không báo trước;
// (3) e2e của project đỏ vì lý do không liên quan ⇒ `upgrade.mjs` in *"hook test ĐỎ sau khi
// nâng cấp"* — đổ lỗi cho bản nâng cấp về thứ không thuộc bản nâng cấp. Đúng lớp lỗi chẩn
// đoán-bịa-ra mà `gen-clean` ngay trên kia đã phải sửa một lần.
//
// Còn một cái giá thứ tư mà ca này gánh trực tiếp: ở repo có `commands` thật, stage `subagent`
// sẽ `ran > 0` ⇒ KHÔNG in dòng sàn ⇒ ca này ĐỎ ở mọi repo tiêu thụ, vì một lý do không liên
// quan gì tới thứ nó khẳng định. Nó chỉ xanh nhờ template vô tình rỗng.
//
// `--list --timing` do NGƯỜI gõ thì chạy gate thật là ĐÚNG — đó là việc của nó (AGENTS.md gọi
// nó là chỉ số "harness đang cản" duy nhất đo trực tiếp được). Sai là ở chỗ một self-test gọi
// nó trên config của project. Khối `check --list --timing` ở cuối file giữ ranh giới đó.
{
  const L = ' '.repeat(9);
  const r = spawnSync(process.execPath, [repoPath('tooling', 'gates.mjs'), '--list', '--timing'], {
    encoding: 'utf8', cwd: repoPath(''), env: { ...process.env, ...TEST_ENV, HARNESS_CONFIG: UNCONF() },
  });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const line = out.split('\n').find(l => /\bsubagent:/.test(l)) || '';
  const bad = [];
  const ms = Number(line.match(/sàn runner (\d+)ms/)?.[1] ?? NaN);

  if (!line) bad.push('không thấy dòng tổng kết cho stage `subagent` — neo của ca này đã trôi');
  else if (!Number.isFinite(ms)) bad.push(`stage không gate nào có lệnh vẫn KHÔNG báo sàn bằng số: "${line.trim().slice(0, 80)}"`);
  else if (ms <= 0) bad.push(`sàn runner đo ra ${ms}ms — một tiến trình Node không tốn 0ms, phép đo hỏng`);
  // Vế thứ hai: sàn KHÔNG được đọc thành "đã đo xong". Việc thật vẫn chưa đo.
  if (line && !/CHƯA đo được/.test(line)) bad.push('dòng sàn không còn nói phần VIỆC của gate là CHƯA đo được — một nửa sự thật đọc như cả sự thật');

  // Phép đo chạy runner 5 lần. Nếu nó ghi vào sổ THẬT thì công cụ đo tự làm nhiễu số của
  // chính nó — đúng issue #66.
  //
  // CHẠY KHÔNG CÓ `TEST_ENV`, cố ý. Bản đầu của ca này chạy VỚI `TEST_ENV` — mà `TEST_ENV`
  // đã đặt sẵn `HARNESS_TELEMETRY_DIR`, nên sổ thật KHÔNG THỂ mọc dù `floorMs` có chuyển
  // hướng hay không. Một khẳng định luôn xanh là một khẳng định không tồn tại; nó chỉ khẳng
  // định rằng chính nó đã được viết. Đúng lớp lỗi false-green ở `test-evals` ca ⑩ (v2.24.0).
  //
  // Ở đây chỉ `floorMs` mới ghi telemetry: `--list` gọi thẳng `runGate()`, không đi qua
  // đường `--stage`. Nên nếu `floorMs` thôi chuyển hướng, sổ thật mọc đúng 5 dòng.
  //
  // `env` khai TƯỜNG MINH `{ ...process.env }` chứ không bỏ trắng khoá `env`: hai cách đó
  // giống hệt nhau về môi trường con nhận được, nhưng chỉ cách thứ nhất chèn thêm được
  // `HARNESS_CONFIG` (#141) mà không kéo `TEST_ENV` vào — và việc KHÔNG có `TEST_ENV` ở đây
  // là điều kiện sống của phép khẳng định ngay dưới, xem đoạn trên.
  const realLog = repoPath('.claude', 'telemetry', 'gate-runs.log');
  const lines = () => (exists(realLog) ? readFileSync(realLog, 'utf8').split('\n').length : 0);
  const before = lines();
  spawnSync(process.execPath, [repoPath('tooling', 'gates.mjs'), '--list', '--timing'], {
    encoding: 'utf8', cwd: repoPath(''), env: { ...process.env, HARNESS_CONFIG: UNCONF() },
  });
  const after = lines();
  if (after !== before) bad.push(`phép đo sàn ghi ${after - before} dòng vào gate-runs.log THẬT — công cụ đo đang làm nhiễu số của chính nó (#66)`);

  if (bad.length) fail.push(`gates sàn runner${L} ${bad.join(' · ')}`);
  else ok.push(`gates sàn runner${L} stage rỗng báo sàn ${ms}ms bằng SỐ, vẫn nói rõ việc thật chưa đo, và không ghi vào sổ thật`);
}

// ─── Self-test KHÔNG được chạy SẢN PHẨM của project (#141) ──────────────────
//
// Hai ca, và chúng gác hai chiều khác nhau của cùng một bản vá:
//
//   ⓐ ĐO — `--list --timing` CÓ chạy thật lệnh trong config. Đây là tiền đề của ⓑ. Nếu một
//     ngày nó thôi chạy thật, ⓑ trở thành trang trí và không gì báo; ⓐ đỏ trước.
//   ⓑ QUÉT NGUỒN — không lời gọi TỰ ĐỘNG nào trong repo được đưa `--list` cho `gates.mjs`
//     mà không kèm `HARNESS_CONFIG`.
//
// Vì sao cần ⓑ chứ không chỉ sửa hai lời gọi: bug này sống **19 minor** ở template mà không ai
// thấy, vì ở template `commands.*` rỗng nên nó miễn phí. Chỗ nó hiện ra là máy người khác, sau
// khi `upgrade.mjs` đã chạy. Một lời gọi thứ ba mọc lên sẽ tái lập đúng chuỗi đó, và cũng
// đúng như lần này, template sẽ vẫn xanh. Lần thứ **tư** của
// "template là mẫu vật không điển hình".
//
// ⓑ là BEST-EFFORT, đọc đúng như vậy — nó neo vào `spawnSync(` rồi nhìn tới trước 500 ký tự.
// Lệnh lắp từ biến (`const a = ['--list']; spawnSync(node, [g, ...a])`) đi lọt. Neo vào lời gọi
// spawn chứ không neo vào chuỗi `gates.mjs` là chủ ý: `setup.mjs` IN RA câu
// `node tooling/gates.mjs --list --timing` cho người dùng gõ — đó là cách dùng ĐÚNG, và một
// phép quét bắn vào nó sẽ bị tắt trong tuần.
{
  const L = ' '.repeat(4);
  const bad = [];

  // ⓐ Lệnh trong config THẬT SỰ chạy. Tripwire tự ghi cạnh chính nó: không cần biến môi
  //   trường, không cần nháy lồng nhau — hai thứ hỏng khác nhau trên cmd.exe và trên sh.
  const tw = join(tmpdir(), `harness-141-tripwire-${process.pid}.mjs`);
  const hit = `${tw}.hit`;
  try {
    rmSync(hit, { force: true });
    writeFileSync(tw, "import { writeFileSync } from 'node:fs';\n"
      + "import { fileURLToPath } from 'node:url';\n"
      + "writeFileSync(fileURLToPath(import.meta.url) + '.hit', 'BUM');\n", 'utf8');
    const cfg = join(tmpdir(), `harness-141-config-${process.pid}.json`);
    writeFileSync(cfg, JSON.stringify({
      $comment: 'FIXTURE của test #141 trong tooling/test-hooks.mjs — một project CÓ khai lệnh thật',
      project: { id: 'fixture-141' },
      commands: { typecheck: `node "${tw}"` },
      paths: {}, limits: {}, gates: { subagent: ['typecheck'] }, budget: {}, knowledge: {},
    }, null, 2) + '\n', 'utf8');

    spawnSync(process.execPath, [repoPath('tooling', 'gates.mjs'), '--list', '--timing'], {
      encoding: 'utf8', cwd: repoPath(''), env: { ...process.env, ...TEST_ENV, HARNESS_CONFIG: cfg },
    });
    if (!exists(hit)) {
      bad.push('`--list --timing` KHÔNG còn chạy lệnh khai trong config — tiền đề của #141 đã đổi, '
        + 'phép quét nguồn ngay dưới nay là trang trí. Đọc lại cả khối trước khi xoá nó');
    }
    rmSync(cfg, { force: true });
  } finally {
    rmSync(tw, { force: true });
    rmSync(hit, { force: true });
  }

  // ⓑ Không lời gọi tự động nào bỏ trống `HARNESS_CONFIG`.
  const SPAWN = /\b(?:spawnSync|spawn|execFileSync|execSync)\s*\(/g;
  const offenders = [];
  for (const d of [['tooling'], ['tooling', 'knowledge'], ['.claude', 'hooks']]) {
    let names = []; try { names = readdirSync(repoPath(...d)); } catch { continue; }
    for (const n of names.filter(x => x.endsWith('.mjs'))) {
      if (d.length === 1 && n === 'gates.mjs') continue; // nó ĐỊNH NGHĨA cờ này, không gọi nó
      const s = codeOnly(readFileSync(repoPath(...d, n), 'utf8'));
      for (const m of s.matchAll(SPAWN)) {
        const win = s.slice(m.index, m.index + 500);
        if (!/gates\.mjs/.test(win) || !/--list/.test(win)) continue;
        if (/HARNESS_CONFIG/.test(win)) continue;
        offenders.push(`${[...d, n].join('/')} → ${win.slice(0, 70).replace(/\s+/g, ' ')}…`);
      }
    }
  }
  if (offenders.length) {
    bad.push(`${offenders.length} lời gọi tự động đo độ trễ trên config THẬT: ${offenders.join(' · ')}. `
      + 'Ở repo tiêu thụ, đó là chạy cả `preMerge` gồm `e2e` — dev server, trình duyệt, và một lời '
      + 'đổ lỗi sai chỗ. Dùng `HARNESS_CONFIG: UNCONF()`');
  }

  if (bad.length) fail.push(`gates --list --timing${L} ${bad.join(' · ')}`);
  else ok.push(`gates --list --timing${L} lệnh trong config CÓ chạy thật (tripwire nổ), và 0 lời gọi tự động nào đo trên config thật`);
}

// ─── File ĐƯỢC SHIP không được trích đường dẫn KHÔNG được ship ───────────────
//
// Hợp đồng hai đầu, cùng khuôn với `PACK_SCHEMA`: `apply-to.mjs` quyết cái gì xuống repo con,
// và mọi file đi cùng phải tôn trọng quyết định đó.
//
// Đo 2026-08-07 ở `sakubun`: §9b báo nhật ký vòng học tuần W32 là đường dẫn chết,
// bị `tooling/apply-to.mjs` và `tooling/harness-doctor.mjs` trỏ tới. Hai file đó ĐƯỢC ship;
// nhật ký thì KHÔNG (`apply-to` IGNORE `^docs/progress/(?!_)`). Nên một comment trích dẫn
// dạng đường dẫn ở đó thành con trỏ chết ở **mọi repo tiêu thụ**, mãi mãi — trong khi ở
// template nó xanh, vì ở template file đó có thật.
//
// Đây là ca không công cụ nào ở phía template thấy được: nó chỉ hiện ra SAU KHI phân phối.
// Bắt nó ở đây rẻ hơn bắt nó ở repo người khác.
//
// ── v2.81.0: BẢN VIẾT TAY Ở ĐÂY ĐÃ BỊ THAY, và lý do là nó bỏ lọt ────────────
// Bản cũ quét đúng ba thư mục (`tooling` · `.claude/hooks` · `.claude/skills`) và tìm đúng
// hai mẫu viết tay (nhật ký, learnings). Đo 2026-08-14: **8 con trỏ chết đang ship** mà nó
// không thấy — nằm ngoài ba thư mục đó (`docs/`, `evals/`, `knowledge/lessons/`), hoặc trỏ
// vào thứ không nằm trong hai mẫu đó. Nó còn tự loại `tooling/test-*`, tức bỏ qua một file
// CÓ ship. Một allowlist viết tay chỉ đúng với trạng thái lúc người viết nó nhìn.
//
// Giờ logic là `unshippedRefs` ở lib — hỏi TẬP SHIP THẬT + `git ls-files`, có ca đơn vị ở
// `test-lib.mjs`, và `apply-to --audit` là chỗ chạy nó trên cây thật (nơi DUY NHẤT biết
// `SEED`). Ca dưới đây kiểm ĐẤU NỐI: không có nó, hàm đúng mà không ai gọi.
{
  const L = ' '.repeat(6);
  const src = codeOnly(readFileSync(repoPath('tooling', 'apply-to.mjs'), 'utf8'));
  const calls = /unshippedRefs\(/.test(src);
  // Neo hẹp: đúng dòng thoát, không phải "có chữ exit(1) đâu đó trong file".
  const blocks = /if \(dangling\.length\) \{[\s\S]{0,600}?process\.exit\(1\);/.test(src);
  if (!calls) fail.push(`ship ↔ trích dẫn${L} apply-to.mjs KHÔNG gọi unshippedRefs — hàm đúng mà không ai chạy nó trên cây thật`);
  else if (!blocks) fail.push(`ship ↔ trích dẫn${L} apply-to.mjs gọi unshippedRefs nhưng kết quả KHÔNG dẫn tới exit khác 0 — một phép đo không phán quyết gì`);
  else ok.push(`ship ↔ trích dẫn${L} apply-to --audit gọi unshippedRefs trên tập ship thật, và con trỏ chết làm nó exit 1`);
}

// ─── §9b đường dẫn chết: KHÔNG có, và phép kiểm CÒN PHẠM VI ──────────────────
//
// Nhận từ pack `sakubun` @0655730. Ca nguy hiểm không phải "có đường dẫn chết" — mà là phép
// kiểm mất phạm vi rồi xanh mãi. Hai loại trừ cấu trúc của nó (`harness-manifest.json`,
// `evals/tasks/**`) đều đúng, nhưng mỗi loại trừ là một chỗ để phạm vi rò ra ngoài.
{
  const L = ' '.repeat(12);
  const esSrc = readFileSync(repoPath('tooling', 'entropy-scan.mjs'), 'utf8');
  const r = spawnSync(process.execPath, [repoPath('tooling', 'entropy-scan.mjs')], {
    encoding: 'utf8', cwd: repoPath(''), env: { ...process.env, ...TEST_ENV },
  });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const bad = [];

  if (!/9b\. Đường dẫn trỏ vào hư không/.test(esSrc)) bad.push('phép kiểm §9b đã biến mất khỏi entropy-scan');
  // PHẠM VI: nó phải quét qua `git ls-files`, không phải một danh sách thư mục cứng. Bản của
  // `sakubun` dùng `['app','components','lib','e2e','tooling']` — đúng ở đó, mục ở đây.
  if (!/git\(\['ls-files'\]\)/.test(esSrc)) bad.push('§9b không còn quét theo `git ls-files` — danh sách thư mục cứng sẽ mục');
  // Đường dẫn chết CHỈ có nghĩa khi cây còn nguyên. Trên cây trần, `knowledge/lessons/0002`
  // trỏ `artifacts: .claude/rules/danger-zones.md` — file vừa bị đổi tên theo yêu cầu, nên
  // "repo có đường dẫn chết" là mô tả cây, không phải phát hiện về repo.
  if (/KHÔNG TỒN TẠI/.test(out) && !naIfBare(1, '§9b đường dẫn chết: bài học trỏ vào `.claude/rules/` vừa bị gỡ')) {
    bad.push(`repo có đường dẫn chết: ${out.split('\n').find(l => l.includes('KHÔNG TỒN TẠI'))?.trim().slice(0, 90)}`);
  }

  // Mỗi loại trừ phải CÒN LÝ DO tồn tại. Loại trừ không còn ca nào là loại trừ đã thành
  // cửa thoát trống — nó không miễn gì cả, nhưng nó vẫn nới phạm vi cho ca tương lai.
  const tracked = git(['ls-files']).stdout.split('\n').filter(Boolean);
  const manifestRef = tracked.some(f => f.endsWith('.md') && (() => {
    try { return readFileSync(repoPath(f), 'utf8').includes('`.claude/harness-manifest.json`'); } catch { return false; }
  })());
  if (!manifestRef) bad.push('không tài liệu nào còn nhắc `.claude/harness-manifest.json` ⇒ loại trừ đó thành cửa thoát trống, bỏ nó đi');
  if (!tracked.some(f => f.startsWith('evals/tasks/'))) bad.push('không còn `evals/tasks/**` ⇒ loại trừ đó thành cửa thoát trống');

  // GITIGNORE LÀ NGUỒN, KHÔNG PHẢI DANH SÁCH VIẾT TAY. Bản đầu liệt tay 4 tiền tố và vẫn
  // thiếu `.claude/settings.local.json` — nó XANH trên máy tôi (file có thật ở đó) và ĐỎ trên
  // cả ba OS của CI. Một allowlist viết tay chỉ đúng với trạng thái cục bộ của người viết nó.
  //
  // Ca này khẳng định vào chính cơ chế thay thế: `git check-ignore --stdin` phải PHÂN BIỆT
  // được hai loại trên OS đang chạy. Nếu nó không phân biệt (git quá cũ, `--stdin` đổi hành
  // vi), §9b sẽ im lặng bỏ qua mọi thứ hoặc không bỏ qua gì — cả hai đều hỏng không tiếng động.
  if (!/check-ignore/.test(esSrc)) {
    bad.push('§9b không còn hỏi `git check-ignore` — quay lại danh sách viết tay là quay lại lỗi chỉ CI thấy');
  } else {
    const probe = git(['check-ignore', '--stdin'], { input: '.claude/telemetry/x.log\nAGENTS.md\n' });
    const said = probe.stdout.split('\n').map(s => s.trim()).filter(Boolean);
    if (!said.includes('.claude/telemetry/x.log')) bad.push('`git check-ignore` KHÔNG nhận ra file gitignore trên OS này — §9b sẽ báo nhầm mọi artifact lúc chạy');
    if (said.includes('AGENTS.md')) bad.push('`git check-ignore` nhận nhầm file ĐƯỢC TRACK là ignore — §9b sẽ im lặng bỏ qua đường dẫn chết thật');

    // THƯ MỤC IGNORE CHƯA TỒN TẠI — ca duy nhất chỉ CI thấy, và nó đã thấy thật.
    // Pattern thư mục trong `.gitignore` có `/` cuối; `check-ignore` trên một đường dẫn KHÔNG
    // tồn tại không biết nó là thư mục ⇒ dạng KHÔNG có `/` không khớp. Trên máy có thư mục đó
    // thì cả hai dạng khớp, nên bug này vô hình ở local và đỏ ở cả ba OS của CI.
    if (!/cand\.map\(p => p \+ '\/'\)/.test(esSrc)) {
      bad.push("§9b không còn hỏi check-ignore ở CẢ HAI dạng (`p` và `p + '/'`) — thư mục ignore chưa tồn tại sẽ bị báo là đường dẫn chết, chỉ trên máy sạch");
    }
    const dirPat = readFileSync(repoPath('.gitignore'), 'utf8').split('\n')
      .map(s => s.trim()).filter(s => s.endsWith('/') && !s.startsWith('#') && !s.startsWith('!'))
      .find(s => !exists(repoPath(s.replace(/\/$/, ''))));
    if (dirPat) {
      const noSlash = git(['check-ignore', '--stdin'], { input: dirPat.replace(/\/$/, '') + '\n' }).stdout.trim();
      const withSlash = git(['check-ignore', '--stdin'], { input: dirPat + '\n' }).stdout.trim();
      if (!withSlash) bad.push(`\`check-ignore\` không nhận ra thư mục ignore CHƯA TỒN TẠI (${dirPat}) kể cả khi có dấu / — §9b sẽ báo nhầm nó`);
      else if (noSlash) bad.push(`\`check-ignore\` khớp cả dạng không có / cho ${dirPat} — ca này MẤT PHẠM VI trên OS này, nó không còn kiểm gì`);
    }
  }

  // ĐƯỜNG DẪN TƯƠNG ĐỐI VỚI FILE ĐANG NHẮC. Một README trong thư mục con viết đường dẫn
  // tương đối với CHÍNH NÓ — cách đọc đúng cho người mở file đó. Template có cấu trúc phẳng
  // nên ca này không xuất hiện tự nhiên; fixture dựng nó, và fixture PHẢI còn nguyên vẹn,
  // nếu không ca này xanh mà không kiểm gì.
  const FIX = 'tooling/fixtures/relative-ref';
  if (!exists(repoPath(FIX, 'README.md')) || !exists(repoPath(FIX, 'docs', 'ghi-chu.md'))) {
    bad.push(`fixture ${FIX} không còn đủ ⇒ nhánh giải-tương-đối MẤT PHẠM VI, nó sẽ xanh mãi`);
  } else if (!/whereDir && existsSync\(repoPath\(whereDir, clean\)\)/.test(esSrc)) {
    bad.push('§9b không còn giải đường dẫn tương đối với thư mục của file nhắc nó — mọi README trong thư mục con sẽ bị báo nhầm');
  }

  if (bad.length) fail.push(`entropy-scan §9b${L} ${bad.join(' · ')}`);
  else ok.push(`entropy-scan §9b${L} 0 đường dẫn chết · quét theo git ls-files · 2 loại trừ còn lý do · giải cả đường dẫn tương đối`);
}

// ─── _index.json: cổng KHÔNG được im khi danh sách feature nói dối ────────────
//
// Nhận từ pack `sakubun` @0655730 — ca thứ BẢY của L0005, từ một repo ĐỘC LẬP.
// Đo ở đó: `features/` chỉ có `_index.json` + `_TEMPLATE.json`, phần dưới của gate cố ý bỏ
// qua file `_`-prefix ⇒ in "(không có gì để báo cáo)" rồi exit 0 — đọc như một cổng đang
// canh, thực ra là cổng không canh gì, trong khi `_index.json` liệt một entry trỏ vào hư không.
{
  const L = ' '.repeat(6);
  const r = spawnSync(process.execPath, [repoPath('tooling', 'check-feature-integrity.mjs')], {
    encoding: 'utf8', cwd: repoPath(''), env: { ...process.env, ...TEST_ENV },
  });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const bad = [];
  if (!exists(repoPath('features', '_index.json'))) {
    bad.push('không có features/_index.json ⇒ ca này MẤT PHẠM VI, nó sẽ xanh mãi mà không kiểm gì');
  } else {
    if (!/_index\.json/.test(out)) bad.push('gate KHÔNG nói gì về `_index.json` dù file đó tồn tại — đúng ca im lặng mà `sakubun` bắt được');
    if (/không có gì để báo cáo/.test(out)) bad.push('gate in "(không có gì để báo cáo)" trong khi `_index.json` có mặt — mẫu số 0 lại thành 100%');
  }
  if (bad.length) fail.push(`check-feature-integrity${L} ${bad.join(' · ')}`);
  else ok.push(`check-feature-integrity${L} danh sách feature được đối chiếu với ĐĨA, gate không im khi index nói dối`);
}

// ─── ③④ MUTANT ───────────────────────────────────────────────────────────────
// Mỗi mutant tiêu vào PHẠM VI của check trước, không phải logic của nó.
const MUTANTS = [
  ['dcg.mjs',
    // Phạm vi: rỗng hoá bảng pattern. Dùng `.slice(0,0)` chứ không `if(false)` —
    // sau nó còn code dereference chính cái bảng này, và một mutant chỉ crash
    // thì không chứng minh gì.
    s => s.replace(/^const DENY = \[/m, 'const DENY = [].concat([').replace(/^\];/m, '].slice(0, 0));'),
    { tool_input: { command: 'git push --force origin main' } },
    'bảng DENY rỗng ⇒ force push LỌT — bảng đó không phải trang trí'],
  ['block-secrets.mjs',
    // Phạm vi: cho matchAny luôn trả false ⇒ danh sách paths.secrets thành trang trí.
    s => s.replace(/matchAny\(/g, '(() => false)('),
    { tool_input: { file_path: '.env' } },
    'matchAny bị vô hiệu ⇒ .env LỌT — paths.secrets thật sự được tra cứu'],
  ['protect-harness.mjs',
    s => s.replace(/matchAny\(rel, pathsFor\('harness'\)\)/, 'false'),
    { tool_input: { file_path: '.claude/settings.json' } },
    'paths.harness bị vô hiệu ⇒ settings.json LỌT — phạm vi được cưỡng chế thật'],
  // Phạm vi của guard này là PHÉP SO NHÁNH. Đảo nó thành so ngược: hook vẫn chạy, vẫn có
  // đủ nhánh code, chỉ là nó chặn nhầm chỗ — và ca "đang ở nhánh tích hợp" phải LỌT.
  // Neo vào phép so chứ không vào `pass()`: một mutant chỉ làm hook crash thì không chứng
  // minh gì, nó chỉ chứng minh hook có tồn tại.
  ['protect-integration-branch.mjs',
    s => s.replace('branch !== integration', 'branch === integration'),
    { tool_input: { file_path: 'tooling/x.mjs' } },
    'đảo phép so nhánh ⇒ sửa trên nhánh tích hợp LỌT — phép so đó là thật, không phải trang trí',
    { HARNESS_INTEGRATION_BRANCH: () => CUR_BRANCH }],
  // Neo vào nhánh `_index.json`, KHÔNG vào nhánh so-issue. Lý do là đo được, không phải
  // tiện tay: `issueFromBranch('main')` trả về null nên hook `pass()` NGAY, và nhánh so-issue
  // không tới được từ `main` — đó cũng là lý do `harness-doctor` báo hook này "chưa có BẰNG
  // CHỨNG nó chạy". Nhánh `_index.json` thì chặn độc lập với tên nhánh, nên nó là phần phạm
  // vi kiểm được ở MỌI nhánh. Phần so-issue vẫn là khoảng trống, và nói ra thì hơn là neo
  // vào một ca không bao giờ chạy rồi tưởng đã phủ.
  ['protect-feature-files.mjs',
    s => s.replace(/rel\.endsWith\('_index\.json'\)/, 'false'),
    { tool_input: { file_path: 'features/_index.json' } },
    '_index.json không còn do DRI giữ ⇒ LỌT — guard chống single-writer là thật'],

  // Phạm vi của `protect-tests` KHÔNG phải `IS_TEST` — đó chỉ là bộ lọc file. Phạm vi thật
  // là hai bảng regex đếm: nếu chúng không khớp gì, mọi phép đếm đều ra 0, `0 < 0` là false,
  // và hook CHẠY BÌNH THƯỜNG mà không bao giờ chặn nữa. Đó là chế độ hỏng nguy hiểm nhất của
  // nó — cùng hình dạng với `DENY` rỗng ở dcg — vì `hookRan()` vẫn ghi "pass" đều đặn và
  // `harness-doctor` vẫn hiện `✓`. Một cái gác đếm bằng bảng rỗng trông y hệt một cái gác
  // không có gì để bắt.
  ['protect-tests.mjs',
    s => s.replace(/^const ASSERT = .*$/m, 'const ASSERT = /(?!)/g;')
      .replace(/^const BLOCK = .*$/m, 'const BLOCK = /(?!)/g;'),
    { tool_name: 'Write', tool_input: { file_path: 'tooling/fixtures/example.test.js', content: '// khong con test nao\n' } },
    'hai bảng regex đếm rỗng ⇒ xoá sạch test vẫn LỌT — phép đếm không phải trang trí'],

  // Phạm vi: `paths.migrations`. Vô hiệu nó thì hook cho qua MỌI file — kể cả migration đã
  // merge. Cần `MERGED_REF` (commit fixture dựng ở bước setup) nên env phải lười tính.
  ['protect-migrations.mjs',
    s => s.replace(/matchAny\(rel, patterns\)/, 'false'),
    { tool_input: { file_path: 'db/migrations/0001_init.sql' } },
    'paths.migrations bị vô hiệu ⇒ migration ĐÃ MERGE lọt — danh sách đó được tra thật',
    { ...GUARD_CFG, HARNESS_INTEGRATION_BRANCH: () => MERGED_REF }],

  ['block-generated-edit.mjs',
    s => s.replace(/matchAny\(rel, pathsFor\('generated'\)\)/, 'false'),
    { tool_name: 'Write', tool_input: { file_path: 'src/api.gen.ts' } },
    'paths.generated bị vô hiệu ⇒ sửa file .gen.* LỌT — hook ROI cao nhất repo có codegen là thật',
    GUARD_CFG],

  // `post-edit-lint` cần một `lintFix` THẤT BẠI mới tới được nhánh chặn — không có nó, mọi
  // đường đều `pass()` và mutant nào cũng "sống sót" vì hook vốn đã không chặn.
  ['post-edit-lint.mjs',
    s => s.replace(/matchAny\(rel, pathsFor\('lintable'\)\)/, 'false'),
    { tool_name: 'Write', tool_input: { file_path: 'a.ts' } },
    'paths.lintable bị vô hiệu ⇒ lint hỏng KHÔNG còn chặn — phạm vi lint được tra thật',
    { HARNESS_CONFIG: () => repoPath('tooling', 'fixtures', 'config-lint-fails.json') }],
];
for (const [hook, apply, input, label, env] of MUTANTS) {
  const m = mutate(hook, apply, input, { env });
  if (m.note) fail.push(`MUTANT ${hook.padEnd(21)} ${label}\n         ${m.note}`);
  else if (!m.killed) fail.push(`MUTANT ${hook.padEnd(21)} ${label}\n         MUTANT SỐNG SÓT (exit=${m.status}) — nhìn PHẠM VI của check trước khi nhìn logic.`);
  else ok.push(`MUTANT ${hook.padEnd(21)} ${label}`);
}

// ─── Mọi sự kiện hook phải có ĐƯỜNG PHÂN PHỐI tới repo đã áp template ────────
//
// `.claude/settings.json` là SEED: `upgrade.mjs` không bao giờ ghi đè nó, vì project sửa
// `permissions`, `worktree`, hook riêng của họ. Hệ quả: thêm một sự kiện vào settings.json
// của TEMPLATE thì repo đã áp KHÔNG BAO GIỜ nhận được — hook nằm đó chết và bạn tưởng guard
// đang chạy. Chỉ có MIGRATION đi qua được lớp đó.
//
// README của `harness-migrations` đã ghi luật này từ đầu ("Thêm hook mới → CÓ, migration phải
// TỰ ĐĂNG KÝ") và `harness-doctor` đã in "N/5 điểm mở rộng native còn TRỐNG". Cả hai đúng, cả
// hai bị bỏ qua: đo 2026-08-05, cả BA repo tiêu thụ thiếu ĐÚNG 5 sự kiện — kể cả repo chỉ
// đứng sau template một version. Trong đó có `StopFailure`, tức LỚP KINH TẾ chưa từng được
// cắm ở bất cứ đâu ngoài template.
//
// Nên luật rời khỏi văn xuôi và thành check tất định. Chỉ chạy ở REPO TEMPLATE: ở project
// đích, `settings.json` là của HỌ và thêm sự kiện riêng là quyền của họ.
//
// `skipped` KHÔNG phải chi tiết kế toán. Một case bỏ qua CÓ CHỦ Ý và một case NGỪNG CHẠY đọc
// giống nhau nếu chỉ nhìn tổng — và sàn bên dưới tồn tại chính để phân biệt hai thứ đó. Đếm
// tường minh thì sàn giữ được một con số cho MỌI vai, thay vì mỗi vai một hằng số phải nhớ
// nâng. Đây là ba giá trị `0 / n/a / ?` mà repo này đòi ở mọi nơi khác, áp cho chính suite.
let skipped = gateCaseSkipped;
if (repoRole() === 'template') {
  // Bốn sự kiện có mặt từ bản đầu ⇒ mọi repo đã áp template đều có sẵn, không cần migration.
  const BASELINE = ['SessionStart', 'PreToolUse', 'PostToolUse', 'Stop'];
  const events = Object.keys(readJson(repoPath('.claude', 'settings.json'))?.hooks ?? {});
  const migText = (exists(repoPath('harness-migrations'))
    ? readdirSync(repoPath('harness-migrations')).filter(f => f.endsWith('.mjs'))
    : []).map(f => readFileSync(repoPath('harness-migrations', f), 'utf8')).join('\n');
  // Sự kiện được coi là CÓ đường phân phối khi tên nó xuất hiện trong một migration — kể cả
  // gián tiếp, vì 008 duyệt `Object.keys(tpl.hooks)` chứ không liệt kê tên. Nên điều kiện
  // thật là: có migration nào đọc `hooks` của template không.
  const generic = /Object\.keys\(\s*tpl\.hooks\s*\)/.test(migText);
  const orphan = events.filter(ev => !BASELINE.includes(ev) && !generic && !migText.includes(ev));
  if (!events.length && naIfBare(1, 'sự kiện hook → migration: settings.json không khai sự kiện nào')) { /* `?` */ }
  else if (!events.length) fail.push('settings.json không khai sự kiện hook nào — không có gì để kiểm');
  else if (orphan.length) {
    fail.push(`${orphan.length} sự kiện hook KHÔNG có đường tới repo đã áp template: ${orphan.join(' · ')}`
      + '\n         settings.json là SEED, upgrade.mjs không ghi đè nó. Viết migration cắm chúng vào'
      + '\n         (khuôn: harness-migrations/008-su-kien-hook-moi-toi-duoc-repo-cu.mjs).');
  } else {
    ok.push(`settings.json${' '.repeat(15)} ${events.length} sự kiện, mọi sự kiện ngoài baseline đều có migration phân phối`);
  }
} else {
  skipped++;
}

// ─── ① CHẾ ĐỘ HỎNG: một cái gác ném lỗi phải CHẶN, không được cho qua ────────
//
// Đây là ca test quan trọng nhất trong file này, vì nó khẳng định một thứ ĐÃ ĐO ĐƯỢC LÀ SAI
// và vừa được sửa. Đo 2026-08-05: tiêm lỗi vào `block-secrets`/`dcg`/`protect-harness` rồi
// đưa vào đúng payload chúng phải chặn ⇒ cả ba `exit=1`, và Claude Code đọc mọi mã khác 0/2
// là "lỗi không chặn" ⇒ **lệnh ghi đi lọt**.
//
// KHÔNG khẳng định bằng cách đọc mã nguồn (`declareFailMode` có xuất hiện không) — đó là đo
// sự CÓ MẶT của một dòng chữ, không phải HÀNH VI. Ở đây tiêm lỗi thật vào một BẢN SAO, cho
// chạy, và đọc exit code + thông điệp. Cùng lý do repo này bỏ phép quét `import` ở 2.10.3.
{
  const FAULT = '\nnull.x; // FAULT INJECTED bởi test-hooks\n';
  const inject = (src) => src.replace(/^(declareFailMode\([^\n]*\);)$/m, `$1${FAULT}`);
  const SECRET_PAY = { tool_name: 'Write', tool_input: { file_path: repoPath('cfg.ts'), content: 'const k = "sk-ant-api03-' + 'A'.repeat(80) + '";' } };
  const GEN_PAY = { tool_name: 'Write', tool_input: { file_path: repoPath('cfg.ts'), content: 'x' } };

  // [hook, payload, mã mong đợi khi ném lỗi, nhãn, regex thông điệp, env thêm]
  const FAILMODE = [
    ['block-secrets.mjs', SECRET_PAY, BLOCK, 'gác bất biến cứng ném lỗi → CHẶN', /FAIL-CLOSED/, {}],
    ['dcg.mjs', { tool_name: 'Bash', tool_input: { command: 'echo ok' } }, BLOCK, 'dcg ném lỗi → CHẶN (kể cả lệnh vô hại: không phân tích được thì không biết)', /FAIL-CLOSED/, {}],
    ['protect-tests.mjs', GEN_PAY, BLOCK, 'gác tầng xác minh ném lỗi → CHẶN', /FAIL-CLOSED/, {}],
    // Mong đợi là **1**, không phải 0 — và đó là toàn bộ ý của mode 1. Claude Code đọc mã
    // khác 0/2 là "lỗi không chặn": tool call ĐI QUA *và* lỗi HIỆN RA trong transcript. Ép
    // hook cố vấn về 0 sẽ giấu crash đi, và khi đó tầng đếm ghi một số 0 sạch sẽ cho một
    // hook đang hỏng — đúng chế độ hỏng mà `declareFailMode` ra đời để diệt.
    ['block-generated-edit.mjs', GEN_PAY, 1, 'hook cố vấn ném lỗi → CHO QUA nhưng CÓ BÁO (exit 1, không phải 0)', /fail-open, có báo/, {}],
    // Cửa thoát: mọi hook import cùng một lib, nên một lỗi trong lib làm MỌI hook fail-closed
    // cùng lúc. Không có đường thoát tường minh thì cách duy nhất đi tiếp là đọc mã nguồn
    // lúc đang gấp. Nó được ghi log, nên nó là cửa thoát AUDIT ĐƯỢC, không phải một lỗ hổng.
    ['block-secrets.mjs', SECRET_PAY, 1, 'HARNESS_FAIL_OPEN=1 hạ khoá cứng xuống fail-open (và được ghi log)', /fail-open/, { HARNESS_FAIL_OPEN: '1' }],
  ];
  for (const [hook, pay, expect, label, msg, extra] of FAILMODE) {
    const src = repoPath('.claude', 'hooks', hook);
    if (!exists(src)) { fail.push(`${hook}: KHÔNG TỒN TẠI (test chế độ hỏng)`); continue; }
    const original = readFileSync(src, 'utf8');
    const mutated = inject(original);
    if (mutated === original) {
      fail.push(`${hook.padEnd(28)} KHÔNG cắm được lỗi — hook thiếu dòng \`declareFailMode(...)\`, tức là nó ĐANG fail-open. Đây là lỗi của HOOK, không phải của test.`);
      continue;
    }
    const tmp = repoPath('.claude', 'hooks', hookTempName('failmode', TEST_RUN_ID));
    try {
      writeFileSync(tmp, mutated, 'utf8');
      const r = spawnSync(process.execPath, [tmp], {
        input: JSON.stringify(pay), encoding: 'utf8', cwd: repoPath(''),
        env: { ...process.env, ...TEST_ENV, ...extra },
      });
      const status = r.status ?? -1;
      const err = (r.stderr ?? '').trim();
      if (status !== expect) {
        fail.push(`${hook.padEnd(28)} ${label}  →  exit=${status}, mong đợi ${expect}${err ? `\n         stderr: ${err.split('\n')[0]}` : ''}`);
      } else if (!msg.test(err)) {
        // ② KHẲNG ĐỊNH CÂU CHỮ. Exit code là bảng chữ cái 3 giá trị: một crash và một cú chặn
        //    đúng dùng CHUNG một mã. Không assert thông điệp thì hai thứ đó không phân biệt được,
        //    và test này mất đúng cái nó tồn tại để phân biệt.
        fail.push(`${hook.padEnd(28)} ${label}  →  exit đúng nhưng thông điệp không nói CHẾ ĐỘ (${msg})`);
      } else {
        ok.push(`${hook.padEnd(28)} ${label}`);
      }
    } finally { try { rmSync(tmp, { force: true }); } catch {} }
  }
}

// ─── ④ LỆCH giữa điều CẤM viết ra và điều guard CƯỠNG CHẾ ────────────────────
//
// Khẳng định vào HÀM THUẦN `governanceDrift` / `prohibitionText` ở `lib/harness.mjs`, bằng dữ
// liệu dựng sẵn. KHÔNG spawn `harness-doctor`: bản đầu của khối này làm đúng thế và nó ĐỆ QUY
// LẪN NHAU — `harness-doctor` chạy chính `test-hooks.mjs` như một bước của nó, nên suite treo
// quá 120 giây. Ca đó là bằng chứng cho luật tách thuần/không-thuần, không phải một sự cố phụ.
{
  const { governanceDrift, prohibitionText } = await import("./lib/harness.mjs");
  const BAN = [
    "- **KHÔNG sửa**: \`.claude/settings.json\`, \`.claude/hooks/**\`, \`.mcp.json\`,",
    "  \`AGENTS.md\`, \`harness.config.json\`.",
    "  Dùng \`/harness-propose\`. (Hook chặn — cố ý.)",
    "- Mục khác không liên quan.",
  ].join("\n");
  const banText = prohibitionText(BAN);

  // ① GÓI DÒNG. Đây là ca đã làm bản đầu báo sai: `AGENTS.md` gói ở ~110 cột, nên bốn lớp ĐANG
  //    NẰM TRONG FILE bị báo thiếu. Một check trả lời "thiếu" cho thứ đang có thì tệ hơn không
  //    có check, vì output của nó ĐỌC như một phát hiện.
  const wrapped = governanceDrift({
    enforced: [".claude/settings.json", ".claude/hooks/**", ".mcp.json", "AGENTS.md", "harness.config.json"],
    banText, matched: () => true,
  });
  if (wrapped.unspoken.length) {
    fail.push(`governanceDrift${" ".repeat(10)} báo thiếu ${wrapped.unspoken.length} lớp ĐANG NẰM ở dòng TIẾP của điều cấm: ${wrapped.unspoken.join(" · ")} — phép gói dòng chưa được xử lý`);
  } else ok.push(`governanceDrift${" ".repeat(10)} điều cấm gói xuống nhiều dòng vẫn được đọc là MỘT mục`);

  // ② MUTANT: thêm một lớp bị cưỡng chế mà KHÔNG được nói ra ⇒ PHẢI đỏ và phải GỌI ĐÚNG TÊN.
  //    Lớp dùng làm mutant là `.claude/agents/**` — cố ý: đó chính là lớp `fleet` đo được là
  //    thiếu ở CẢ HAI phía (văn bản và gate) suốt thời gian thư mục đó tồn tại. Mutant lấy từ
  //    một ca có thật thì kiểm đúng thứ sẽ xảy ra.
  const m = governanceDrift({
    enforced: [".claude/settings.json", ".claude/agents/**"],
    banText, matched: () => true,
  });
  if (!m.unspoken.includes(".claude/agents/**")) {
    fail.push(`governanceDrift${" ".repeat(10)} MUTANT SỐNG SÓT: \`.claude/agents/**\` bị cưỡng chế mà không ai nói ra, check KHÔNG báo — check là trang trí`);
  } else ok.push(`governanceDrift${" ".repeat(10)} MUTANT: \`.claude/agents/**\` bị cưỡng chế-mà-không-nói-ra ⇒ bị bắt, đúng tên`);

  // ③ CHIỀU NGƯỢC + hai dương tính giả đã đo được. `/harness-propose` là TÊN SKILL;
  //    `paths.harness` là KHOÁ CONFIG. Cả hai từng bị báo là "đường dẫn không được cưỡng chế".
  const rev = governanceDrift({
    enforced: [], banText: prohibitionText("- **KHÔNG sửa**: \`/harness-propose\`, \`paths.harness\`, \`docs/x.md\`."),
    matched: (pth) => pth !== "docs/x.md",
  });
  if (rev.unenforced.includes("/harness-propose") || rev.unenforced.includes("paths.harness")) {
    fail.push(`governanceDrift${" ".repeat(10)} DƯƠNG TÍNH GIẢ: coi tên skill/khoá config là đường dẫn (${rev.unenforced.join(" · ")})`);
  } else if (!rev.unenforced.includes("docs/x.md")) {
    fail.push(`governanceDrift${" ".repeat(10)} chiều ngược KHÔNG bắt được đường dẫn thật bị cấm mà không gì chặn`);
  } else ok.push(`governanceDrift${" ".repeat(10)} chiều ngược: bắt đường dẫn thật, BỎ QUA tên skill và khoá config`);
}

// ─── Ca hồi quy CHỈ ĐÚNG Ở TEMPLATE: `commands` của template phải đếm ra 0 ───
//
// Ở project đích, `commands` ĐƯỢC khai — đó là mục đích của họ — nên assert "0 lệnh" ở đó là
// sai. Khối này vì thế phải đếm vào `skipped` khi không phải template, không được im lặng
// biến mất: một case ngừng chạy và một case bỏ qua có chủ ý đọc giống hệt nhau nếu chỉ nhìn tổng.
if (repoRole() === 'template') {
  const cfgReal = readJson(repoPath('harness.config.json'));
  const cmt = Object.keys(cfgReal?.commands || {}).filter(k => k.startsWith('$'));
  const real = declaredCommands(cfgReal);
  if (!cmt.length) {
    fail.push(`lib/harness.mjs${' '.repeat(13)} \`commands\` của template không còn key \`$comment_*\` nào — ca hồi quy này MẤT PHẠM VI. Xem lại vì sao, đừng xoá test`);
  } else if (real.length) {
    fail.push(`lib/harness.mjs${' '.repeat(13)} template đếm ra ${real.length} lệnh (${real.map(([k]) => k).join(', ')}) nhưng template KHÔNG khai lệnh nào — `
      + `chú thích lại bị đếm là lệnh, và cảnh báo "GATE KHÔNG TỒN TẠI" sẽ im ở mọi repo áp template`);
  } else ok.push(`lib/harness.mjs${' '.repeat(13)} template: ${cmt.length} chú thích trong \`commands\` ⇒ vẫn đếm ra 0 lệnh`);
} else skipped += 1;

// ── `harness.version` PHẢI KHỚP MỤC MỚI NHẤT CỦA CHANGELOG ──────────────────
//
// `harness.version` KHÔNG phải một dòng trang trí. Nó là con số `apply-to.mjs` ĐÓNG DẤU vào
// `.claude/harness-manifest.json` của repo con, là mốc `consumers.mjs` so để biết ai đang tụt
// lại, và là thứ `upstream.mjs` gắn vào mọi pack đi lên.
//
// GẶP THẬT 2026-08-06: hai bản phát hành liên tiếp (2.16.0, 2.17.0) bump changelog + tag mà
// QUÊN file này. Nó vẫn ghi `2.15.0`. Hậu quả không phải "một số hiển thị sai":
//   · repo con áp template hôm nay bị đóng dấu 2.15.0 trong khi nhận code 2.18.0,
//   · `consumers.mjs` báo độ lệch NHỎ HƠN sự thật — tức nó nói dối về đúng thứ nó tồn tại để đo,
//   · và cả hai đều im lặng, vì không có gì đối chiếu hai nguồn.
//
// Ba nguồn version (file · changelog · git tag) mà không có ràng buộc nào giữa chúng thì chúng
// SẼ trôi. `harness-doctor` đã đối chiếu file ↔ tag từ trước; đây là cạnh còn thiếu.
//
// TEMPLATE-ONLY: `HARNESS-CHANGELOG.md` nằm trong `NOT_FOR_CONSUMER` từ 2.14.0 — repo con
// không có file đó. Chạy check này ở repo con là đúng ca `knowledge/lessons/0003`
// (self-test của template giả định repo của nó).
if (repoRole() === 'template') {
  const verFile = exists(repoPath('harness.version'))
    ? readFileSync(repoPath('harness.version'), 'utf8').trim() : null;
  const chg = exists(repoPath('HARNESS-CHANGELOG.md'))
    ? readFileSync(repoPath('HARNESS-CHANGELOG.md'), 'utf8') : '';
  const newest = chg.match(/^##\s+(\d+\.\d+\.\d+)/m)?.[1] || null;

  if (!verFile || !newest) {
    fail.push(`harness.version${' '.repeat(13)} không đọc được ${!verFile ? '`harness.version`' : 'mục `## x.y.z` đầu tiên của HARNESS-CHANGELOG.md'} — neo của check này đã trôi, sửa neo thay vì xoá check`);
  } else if (verFile !== newest) {
    fail.push(`harness.version${' '.repeat(13)} = ${verFile} nhưng changelog mới nhất là ${newest} — repo con áp template sẽ bị ĐÓNG DẤU ${verFile} trong khi nhận code ${newest}, `
      + `và \`consumers.mjs\` sẽ báo độ lệch NHỎ HƠN sự thật. Sửa \`harness.version\` (và nhớ tag \`v${newest}\`)`);
  } else ok.push(`harness.version${' '.repeat(13)} = ${verFile}, khớp mục mới nhất của changelog — dấu đóng vào repo con nói đúng code họ nhận`);
} else skipped += 1;

// ─── Tên gọi từ `lib` mà KHÔNG được import — `catch` trần sẽ nuốt nó (#122) ──
//
// Lỗi ① ở trên sống được vì hai thứ cộng lại: một tên chưa import, và một `catch { return null }`
// bọc quanh nó. `ReferenceError` chỉ nổ lúc CHẠY, và nhánh đó chỉ chạy khi ai đó khai
// `plan: flat` — không repo nào khai, nên nó im lặng từ lúc merge tới lúc có người bật cờ.
//
// Phép kiểm này là phép trừ tập hợp, tất định, và rộng hơn một ca: mọi tên `lib` XUẤT ra mà
// một file GỌI thì phải có trong danh sách import của file đó.
//
// Quét trên mã nguồn ĐÃ BỎ CHÚ THÍCH — nếu không, chính đoạn chú thích nhắc tên hàm sẽ tự làm
// check đỏ. Đây là lần thứ tư trong repo này một phép kiểm quét chuỗi suýt tự khớp chính nó.
{
  // BỎ CHÚ THÍCH **VÀ RUỘT CHUỖI** — bằng `codeOnly()`, MÁY QUÉT TRẠNG THÁI có sẵn ở `lib`,
  // KHÔNG phải regex tự viết.
  //
  // Bỏ mỗi chú thích là không đủ: `test-migrations.mjs` có `"… config() fail-open"` trong một
  // chuỗi. Nhưng bản đầu của check này tự viết một `strip()` bằng 5 cái `replace`, và đo
  // 2026-08-08 (#125) nó nuốt **89% `rituals.mjs`** (46709 → 5016 ký tự): `budgetSnapshot(`
  // và `repoRole(` biến mất khỏi mã đã strip, nên check báo **XANH** trên một file nó gần như
  // không đọc được. Mutant tái hiện đúng lỗi #125 **sống sót**.
  //
  // Đây là chiều B của `L0007` xảy ra ngay trong cái lưới vừa dựng để bắt chiều A — và
  // `codeOnly()` tồn tại từ trước, với một chú thích kể đúng chuyện này đã xảy ra một lần rồi.
  const libSrc = readFileSync(repoPath('tooling', 'lib', 'harness.mjs'), 'utf8');
  const exported = new Set([...libSrc.matchAll(/^export (?:async )?(?:function|const|let|class)\s+(\w+)/gm)].map(m => m[1]));

  const files = [];
  for (const d of [['tooling'], ['tooling', 'knowledge'], ['.claude', 'hooks']]) {
    let names = []; try { names = readdirSync(repoPath(...d)); } catch { continue; }
    for (const n of names.filter(x => x.endsWith('.mjs'))) files.push(repoPath(...d, n));
  }

  const miss = [];
  let scanned = 0;
  for (const f of files) {
    const raw = readFileSync(f, 'utf8');
    // `[^}]*`, KHÔNG `[\s\S]*?`: bản lazy bắt đầu ở `import {` ĐẦU TIÊN của file (thường là
    // `node:fs`) rồi nuốt qua nhiều dòng import, nên tên ĐẦU TIÊN của danh sách `harness.mjs`
    // dính liền chuỗi `import {` và không bao giờ khớp. Triệu chứng: `repoPath` bị báo thiếu ở
    // 17 file đang import nó. Một check bắn nhầm 243 ca là một check sắp bị tắt (L0002).
    const imports = [...raw.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"][^'"]*harness\.mjs['"]/g)]
      // `const { a, b } = await import('…harness.mjs')` — test-hooks dùng dạng này để nạp
      // hàm mới mà không đụng danh sách import ở đầu file.
      .concat([...raw.matchAll(/\{([^}]*)\}\s*=\s*await\s+import\(\s*['"][^'"]*harness\.mjs['"]/g)]);
    if (!imports.length) continue;
    scanned++;
    const imported = new Set(imports.flatMap(m => m[1].split(',')
      .map(s => s.trim().split(/\s+as\s+/).pop().trim()).filter(Boolean)));
    const src = codeOnly(raw, { blankStrings: true });
    const local = new Set([...src.matchAll(/(?:function|const|let|var|class)\s+(\w+)/g)].map(m => m[1]));
    // Tên khai bằng PHÁ CẤU TRÚC (`const { a, b } = …`) cũng là tên cục bộ. Bỏ sót nhóm này
    // thì mọi hàm nạp động qua `await import()` đều bị báo thiếu.
    for (const m of src.matchAll(/(?:const|let|var)\s*\{([^}]*)\}/g)) {
      for (const n of m[1].split(',')) { const t = n.split(':').pop().trim(); if (t) local.add(t); }
    }
    for (const m of src.matchAll(/(?<![.\w])(\w+)\s*\(/g)) {
      const name = m[1];
      if (!exported.has(name) || imported.has(name) || local.has(name)) continue;
      miss.push(`${f.split(/[\\/]/).pop()}: gọi \`${name}()\` mà không import`);
    }
  }

  if (!scanned) {
    warn.push('lib-import                  KHÔNG file nào import từ `lib/harness.mjs` — check này chưa nói được gì (n/a)');
  } else if (miss.length) {
    fail.push(`lib-import${' '.repeat(18)} ${miss.length} lời gọi tới hàm của \`lib\` KHÔNG được import — `
      + `\`ReferenceError\` chỉ nổ lúc CHẠY, và một \`catch\` trần sẽ nuốt nó:\n`
      + [...new Set(miss)].map(s => `         · ${s}`).join('\n'));
  } else {
    ok.push(`lib-import${' '.repeat(18)} ${scanned} file — mọi tên của \`lib\` được gọi đều có trong danh sách import`);
  }
}

// ─── baseline có HAI người ghi — không ai được xoá đo của người kia (#120) ───
//
// `.claude/claude-code-baseline.json` nhận hai cây bút khác nhau:
//
//   rituals.mjs --reviewed-claude-code   → reviewedVersion · reviewedAt · history  (người đọc changelog)
//   native-surface.mjs --record          → nativeEvents                            (máy quét binary)
//
// Bản trước dựng lại object từ đầu với đúng bốn khoá, nên `nativeEvents` biến mất — IM LẶNG,
// và chỉ khi chạy `--record` TRƯỚC. Đo 2026-08-08: `git diff` ra `8 thêm · 40 XOÁ`, rồi nghi
// thức nói *"CHƯA đo tập sự kiện hook lần nào"* trong khi nó vừa được đo 30 giây trước.
//
// Khẳng định vào hàm THUẦN, không vào file: đường dẫn baseline cứng ở `repoPath('.claude', …)`
// và KHÔNG có env chuyển đích như `HARNESS_STATE_DIR`, nên một suite chạm file thật sẽ ăn mất
// bản rà của chính người đang chạy nó.
{
  const { mergeBaseline } = await import('./rituals.mjs');
  const NEW = { version: '9.9.9', at: '2026-08-08T00:00:00.000Z', found: 'ghi chú mới' };
  const cases = [
    // ① Ca của #120: khoá của cơ chế KHÁC phải sống sót.
    ['giữ `nativeEvents` của native-surface',
      { nativeEvents: { version: '2.1.226', events: ['PreToolUse'] } },
      (r) => r.nativeEvents?.events?.length === 1 && r.nativeEvents.version === '2.1.226'],
    // ② CHIỀU NGƯỢC — và nó là lý do ca ① không đủ một mình. `...prev` đặt SAU bốn khoá kia
    //    thì `history` cũ thắng bản ghi mới: cùng một lỗi, đổi nạn nhân. Không có ca này,
    //    một bản vá "giữ hết mọi thứ của prev" cũng xanh.
    ['bản rà MỚI thắng, không bị `...prev` ghi đè ngược',
      { reviewedVersion: '1.0.0', reviewedAt: 'cũ', history: [{ version: '1.0.0', at: 'cũ', found: 'cũ' }] },
      (r) => r.reviewedVersion === '9.9.9' && r.reviewedAt === NEW.at && r.history[0].found === 'ghi chú mới'],
    // ③ `history` cũ vẫn được NỐI, không bị thay thế.
    ['history cũ được nối sau mục mới',
      { history: [{ version: '1.0.0', at: 'cũ', found: 'cũ' }] },
      (r) => r.history.length === 2 && r.history[1].version === '1.0.0'],
    // ④ Trần 20 — và trần cắt ĐẦU NÀO. `history.length === 20` một mình KHÔNG đủ: đo được
    //    `.slice(-20)` cho ra ĐÚNG 20 mục trên cùng fixture này, chỉ khác là nó giữ 20 mục CŨ
    //    và vứt bản rà vừa viết. Đó lại đúng chế độ hỏng của #120 (bản đo mới biến mất im
    //    lặng), nên trần phải khẳng định VỊ TRÍ, không chỉ khẳng định số lượng.
    //    25 cũ + 1 mới ⇒ [MỚI, 0.0.0 … 0.0.18]; `0.0.19`…`0.0.24` là phần bị cắt.
    ['trần 20 mục lịch sử — cắt đuôi CŨ, không cắt mục MỚI',
      { history: Array.from({ length: 25 }, (_, i) => ({ version: `0.0.${i}`, at: 'x', found: 'x' })) },
      (r) => r.history.length === 20 && r.history[0].version === '9.9.9'
        && r.history[1].version === '0.0.0' && r.history[19].version === '0.0.18'],
    // ⑤ Biên của trần, chiều KHÔNG cắt. ④ bắt được `slice(0, 19)` nhờ đếm, nhưng chỉ ở
    //    phía tràn; ca này khoá phía dưới: vừa đủ 20 thì không mục nào được rụng.
    ['đúng 20 mục (19 cũ + 1 mới) ⇒ không cắt gì',
      { history: Array.from({ length: 19 }, (_, i) => ({ version: `0.0.${i}`, at: 'x', found: 'x' })) },
      (r) => r.history.length === 20 && r.history[19].version === '0.0.18'],
    // ⑥ Lần đầu: `prev` rỗng ⇒ không ném, và history có đúng một mục.
    ['prev rỗng (lần đầu) ⇒ không ném', {}, (r) => r.history.length === 1 && r.reviewedVersion === '9.9.9'],
    // ⑦ `prev.history` KHÔNG phải mảng ⇒ bỏ qua, không ném.
    ['history hỏng kiểu ⇒ bỏ qua, không ném', { history: 'hỏng' }, (r) => r.history.length === 1],
    // ⑧ `prev` không đọc được. Hôm nay ba người gọi đều chặn sẵn (`readJson(…, {}) ?? {}`,
    //    `let prev = {}` + try/catch), nên đây là ca khoá HỢP ĐỒNG của hàm thuần, không phải
    //    ca của người gọi: người ghi thứ tư không có nghĩa vụ đọc lại ba chỗ kia mới biết
    //    `null` có ném hay không.
    ['prev = null ⇒ không ném, ra baseline lần đầu', null,
      (r) => r.history.length === 1 && r.reviewedVersion === '9.9.9'],
    ['prev = undefined ⇒ không ném, ra baseline lần đầu', undefined,
      (r) => r.history.length === 1 && r.reviewedVersion === '9.9.9'],
    // ⑨ NGƯỜI GHI THỨ BA. Docstring ở `rituals.mjs` nói *"Ca test `mergeBaseline` khoá cả ba
    //    khoá đó"* — `slotReview` (sổ ô native, `rituals.mjs --slot`) là khoá thứ ba, và tới
    //    trước bảng này chỉ `nativeEvents` có ca. Một câu trong docstring không phải một ca.
    ['giữ `slotReview` của sổ ô native',
      { slotReview: { WorktreeCreate: { state: 'khong-co-viec', at: 'x', why: 'provisioner, không cắm advisory' } } },
      (r) => r.slotReview?.WorktreeCreate?.state === 'khong-co-viec'
        && r.slotReview.WorktreeCreate.why.includes('provisioner')],
    // ⑩ NGƯỜI GHI THỨ TƯ — người chưa tồn tại. ① và ⑨ khoá hai khoá có tên; bất biến thật
    //    thì rộng hơn: MỌI khoá của `prev` không thuộc bốn khoá của lần rà đều phải sống.
    //    Không có ca này, một bản vá liệt kê tay `nativeEvents` + `slotReview` vẫn xanh — và
    //    nó tái diễn đúng #120 cho cơ chế thêm vào sau.
    ['giữ khoá của cơ chế CHƯA TỒN TẠI (không liệt kê tay)',
      { $futureWriter: { đo: 'gì đó', n: 7 }, mộtKhoáPhẳng: 'giữ nguyên' },
      (r) => r.$futureWriter?.n === 7 && r.mộtKhoáPhẳng === 'giữ nguyên'],
    // ⑪ Chiều ngược của ⑩, cho `$comment`: nó nằm SAU `...prev` nên bản hiện tại phải thắng
    //    bản lỗi thời trong file. Ngược lại thì lời chỉ đường ("đừng sửa tay — dùng lệnh này")
    //    đóng băng ở lần ghi đầu tiên và không bao giờ theo kịp lệnh thật.
    ['`$comment` lỗi thời của prev KHÔNG thắng', { $comment: 'lời cũ từ 2026-01' },
      (r) => r.$comment !== 'lời cũ từ 2026-01' && r.$comment.includes('--reviewed-claude-code')],
    // ⑫ MỤC LỊCH SỬ CŨ ĐI QUA NGUYÊN VĂN. ③ đếm được `history.length === 2` và đọc `version`
    //    của mục cũ, nên một bản vá CHUẨN HOÁ lại sổ trên đường đi — `history.map(h => ({
    //    version: h.version, at: h.at, found: h.found }))` — qua sạch ③. Đó là cùng một phép
    //    "dựng lại object từ đúng các khoá mình biết" đã gây #120, chỉ hạ xuống một tầng: lần
    //    này nạn nhân là khoá mà người ghi SAU thêm vào mục sổ, và nó cũng mất im lặng.
    ['mục history cũ giữ cả khoá lạ, không bị dựng lại',
      { history: [{ version: '1.0.0', at: 'cũ', found: 'cũ', by: 'native-surface', n: 3 }] },
      (r) => r.history[1].by === 'native-surface' && r.history[1].n === 3],
    // ⑬ MỤC MỚI CÓ ĐÚNG BA KHOÁ — chiều ngược của ⑫. `...prev` nằm ngay trên nó, nên một bản
    //    vá "ghi thêm chút ngữ cảnh cho dễ tra" (`{ version, at, found, ...prev }`) chép cả
    //    baseline vào MỖI mục sổ và trần 20 mục thành 20 bản sao lồng nhau. Không ca nào ở
    //    trên nhìn thấy: chúng chỉ hỏi ba khoá đó có ĐÚNG không, không hỏi có khoá thứ tư không.
    ['mục rà mới có đúng ba khoá version·at·found', { nativeEvents: { events: ['PreToolUse'] } },
      (r) => Object.keys(r.history[0]).sort().join(',') === 'at,found,version'],
    // ⑭ MỘT SỰ THẬT GHI Ở HAI CHỖ THÌ PHẢI KHỚP. `reviewedVersion`/`reviewedAt` và
    //    `history[0]` cố ý nói cùng một điều (một chỗ để so drift, một chỗ để tra sổ) — và
    //    AGENTS.md gọi hai chỗ nói khác nhau là một LỖI. Khẳng định bắc cầu giữa hai chỗ,
    //    không so với hằng số viết tay: nó bắt được cả ca hai đầu cùng lệch theo một hướng.
    ['reviewedVersion·reviewedAt khớp mục đầu sổ', {},
      (r) => r.history[0].version === r.reviewedVersion && r.history[0].at === r.reviewedAt],
  ];
  const bad = [];
  for (const [name, prev, want] of cases) {
    // THUẦN nghĩa là không đụng `prev` — khẳng định cho MỌI ca, không phải một ca riêng.
    // Người gọi ở `rituals.mjs` đọc `prev`, hợp nhất, rồi `JSON.stringify` KẾT QUẢ; một bản
    // vá dùng `prev.history.unshift(...)` cho ra output đúng y hệt và qua sạch 11 ca trên.
    const snapshot = JSON.stringify(prev ?? null);
    let r; try { r = mergeBaseline(prev, NEW); } catch (e) { bad.push(`${name} (ném: ${e.message})`); continue; }
    if (!want(r)) bad.push(name);
    if (JSON.stringify(prev ?? null) !== snapshot) bad.push(`${name} (SỬA prev — hàm không thuần)`);
  }
  // ⑮ Hai lần rà liên tiếp, chạy qua chính phép hợp nhất — đây là cách file THẬT lớn lên.
  //    Các ca trên đều một-nhát trên `prev` viết tay; ca này bắt lỗi chỉ hiện ở lần thứ hai,
  //    khi `prev` là output của chính hàm (đã có đủ bốn khoá, `history` đã không rỗng).
  {
    const one = mergeBaseline({ nativeEvents: { events: ['PreToolUse'] } },
      { version: '1.0.0', at: 'T1', found: 'lần một' });
    const two = mergeBaseline(one, { version: '2.0.0', at: 'T2', found: 'lần hai' });
    if (!(two.reviewedVersion === '2.0.0' && two.reviewedAt === 'T2'
      && two.history.length === 2
      && two.history[0].found === 'lần hai' && two.history[1].found === 'lần một'
      && two.nativeEvents?.events?.length === 1)) {
      bad.push('hai lần rà liên tiếp (mới nhất đầu sổ, đo của cơ chế kia còn nguyên)');
    }
  }
  // ⑯ RÀ MỘT BẢN CŨ HƠN KHÔNG ĐƯỢC HẠ MỐC. `reviewedVersion` trả lời *"bản mới nhất đã có
  //    người rà là bản nào?"* — nó là một ĐỈNH, không phải "lần gần nhất". Hai máy chạy hai bản
  //    là chuyện thường (đo 2026-08-13: máy A rà 2.1.228 và commit, máy B chạy 2.1.222); ghi đè
  //    vô điều kiện làm mốc của đội TỤT, và 2.1.223–228 đọc thành "chưa ai rà" trong khi bản ghi
  //    của chúng vẫn nằm ngay trong `history`.
  //
  //    Đây là chiều LẶNG của cùng bản vá đã sửa `claude-code-drift` — chiều ồn là dòng chữ sai,
  //    chiều này là một con số âm thầm tụt lại, không triệu chứng (`L0007`).
  {
    const hi = mergeBaseline({ reviewedVersion: '2.1.228', reviewedAt: 'T-CU' },
      { version: '2.1.222', at: 'T-MOI', found: 'rà bản cũ hơn ở máy khác' });
    if (hi.reviewedVersion !== '2.1.228') bad.push(`rà bản CŨ hơn hạ mốc xuống ${hi.reviewedVersion} — mốc đã rà của đội bị vứt`);
    // Cặp version↔ngày đi CÙNG nhau: giữ version cũ mà nhận ngày mới là khai một bản rà chưa
    // từng xảy ra vào hôm nay.
    if (hi.reviewedAt !== 'T-CU') bad.push('giữ version cũ nhưng nhận `reviewedAt` mới — cặp version↔ngày nói dối');
    // Việc đã làm thật thì không được mất, kể cả khi nó không nâng mốc.
    if (hi.history?.[0]?.version !== '2.1.222') bad.push('lần rà bản cũ KHÔNG vào history — việc đã làm bị nuốt');
    // Chiều ngược, để bản vá không thành "không bao giờ cập nhật": bản MỚI hơn vẫn phải thắng.
    const up = mergeBaseline({ reviewedVersion: '2.1.222', reviewedAt: 'T-CU' },
      { version: '2.1.229', at: 'T-MOI', found: 'rà bản mới' });
    if (!(up.reviewedVersion === '2.1.229' && up.reviewedAt === 'T-MOI')) bad.push('bản MỚI hơn không nâng được mốc — bản vá chặn quá tay');
    // `prev` không đọc được dạng số ⇒ bản rà thật thay nó, đừng để một chuỗi rác khoá mốc mãi.
    const junk = mergeBaseline({ reviewedVersion: 'khong-phai-version' }, { version: '2.1.229', at: 'T', found: 'x' });
    if (junk.reviewedVersion !== '2.1.229') bad.push('mốc cũ là chuỗi rác vẫn khoá được mốc mới — không so được KHÔNG có nghĩa là lớn hơn');
  }
  const total = cases.length + 2;
  if (bad.length) fail.push(`mergeBaseline${' '.repeat(15)} sai ${bad.length}/${total} ca: ${bad.join(' · ')}`);
  else ok.push(`mergeBaseline${' '.repeat(15)} ${total} ca — cả BA người ghi sống sót, bản rà MỚI thắng, rà bản CŨ hơn KHÔNG hạ mốc, trần 20 cắt đúng đầu`);
}

// ─── mergeBaseline: thứ ra ĐĨA, không phải thứ trong bộ nhớ ──────────────────
//
// Cả 15 ca ở trên khẳng định trên object TRẢ VỀ. Không người gọi nào đọc object đó: cả hai
// đường ghi đều đi qua `JSON.stringify` (`rituals.mjs:926`, `writeJson` ở `native-surface`),
// và `JSON.stringify` **XOÁ mọi khoá có giá trị `undefined`** mà không báo gì. Nên có một lớp
// mất mát mà bảng trên không thể nhìn thấy về nguyên tắc — nó nằm giữa `return` và đĩa.
//
// Đó đúng hình dạng #120: một phép đo biến mất im lặng, và nghi thức ngay sau đó nói "chưa ai
// đo" về một file vừa được ghi 30 giây trước.
//
// HAI CA `undefined` DƯỚI ĐÂY KHÔNG ĐÒI HÀM PHẢI CHẶN — thứ đang chặn nằm ở CLI, không nằm
// trong hàm. Chúng khẳng định phép TUYỂN: hàm tự giữ, HOẶC CLI chặn trước khi gọi. Ít nhất
// một trong hai. Viết một chiều thôi thì hoặc là đóng băng lỗi (khoá hành vi hôm nay, chặn
// luôn bản vá thật sau này), hoặc là đỏ ngay hôm nay — cả hai đều không nói được điều cần nói:
// **bảo vệ này tồn tại ở đâu đó, và nó không được biến mất khỏi CẢ HAI chỗ.**
{
  const { mergeBaseline } = await import('./rituals.mjs');
  const onDisk = (o) => JSON.parse(JSON.stringify(o));
  // Đoạn CLI giữa chỗ đọc argv và chỗ gọi `mergeBaseline` — quét bằng `codeOnly()` (máy quét
  // trạng thái ở `lib`), KHÔNG bằng regex tự viết: docstring của `mergeBaseline` nhắc cả tên
  // cờ lẫn chữ `version`, nên một phép quét còn chú thích sẽ XANH nhờ chính lời văn giải thích
  // cái chặn — thay vì nhờ cái chặn. Đúng chiều đã đo ở #125 (bản `strip()` tự viết nuốt 89%
  // `rituals.mjs` và báo xanh trên file nó gần như không đọc được).
  const ritSrc = codeOnly(readFileSync(repoPath('tooling', 'rituals.mjs'), 'utf8'));
  const argvAt = ritSrc.indexOf("process.argv.indexOf('--reviewed-claude-code')");
  const callAt = ritSrc.indexOf('mergeBaseline(', argvAt);
  const cliGuard = (argvAt > -1 && callAt > argvAt) ? ritSrc.slice(argvAt, callAt) : '';
  const guards = (name) => new RegExp(`if\\s*\\(!\\s*${name}\\s*\\)`).test(cliGuard)
    && /process\.exit\(1\)/.test(cliGuard);
  const bad = [];
  let n = 0;

  // ⓐ VÒNG QUA JSON với `prev` có đủ ba người ghi + một người chưa tồn tại. Bất biến ⑩ nói về
  //    object trả về; ca này nói về thứ THẬT SỰ nằm trên đĩa sau đó.
  n++;
  {
    const disk = onDisk(mergeBaseline({
      nativeEvents: { version: '2.1.226', at: 'T0', events: ['PreToolUse'] },
      slotReview: { WorktreeCreate: { state: 'khong-co-viec', at: 'x', why: 'provisioner' } },
      $futureWriter: { đo: 'gì đó', n: 7 },
    }, { version: '9.9.9', at: 'T1', found: 'ghi chú' }));
    if (!(disk.nativeEvents?.events?.length === 1 && disk.slotReview?.WorktreeCreate?.state === 'khong-co-viec'
      && disk.$futureWriter?.n === 7 && disk.reviewedVersion === '9.9.9' && disk.history?.length === 1)) {
      bad.push('vòng qua JSON.stringify làm rơi khoá của người ghi khác');
    }
  }

  // ⓑ THIẾU HẲN THAM SỐ HAI ⇒ PHẢI NÉM, và sự BẤT ĐỐI XỨNG với ca ⑧ là cả hợp đồng: `prev`
  //    thiếu là chuyện thường (lần đầu, file chưa có) nên phải chịu được; còn một bản rà RỖNG
  //    thì vô nghĩa — ghi nó ra đĩa tạo mục sổ không phân biệt được với "chưa ai đọc changelog",
  //    tức tự tay dựng lại đúng cái mơ hồ mà cơ chế này tồn tại để phá. Ném là câu trả lời
  //    ĐÚNG ở đây, nên nó được KHOÁ, không phải được chịu đựng: một bản vá "cho tham số hai
  //    giá trị mặc định `{}` cho an toàn" là một bản lùi, và ca này gọi tên nó.
  n++;
  {
    let threw = false;
    try { mergeBaseline({}); } catch { threw = true; }
    if (!threw) bad.push('thiếu tham số hai mà KHÔNG ném — một bản rà rỗng đi được ra đĩa');
  }

  // ⓒ VERSION KHÔNG ĐO ĐƯỢC — ca đắt nhất khối này, vì cái mất không phải khoá vừa ghi mà là
  //    khoá ĐÃ CÓ. `...prev` đặt `reviewedVersion` cũ vào, `reviewedVersion: undefined` ghi đè
  //    lên, rồi `JSON.stringify` xoá hẳn khoá — bản rà cũ bốc hơi. Sau đó `collect()` đọc
  //    `b?.reviewedVersion || null` (rituals.mjs:820) và `claude-code-drift` trả
  //    `due — "CHƯA có bản rà nào được ghi"` (dòng 421-422), về đúng file vừa được ghi.
  //    Đo 2026-08-10: `mergeBaseline({reviewedVersion:'2.1.226'}, {version: undefined})` ⇒ sau
  //    JSON, khoá `reviewedVersion` KHÔNG CÒN TỒN TẠI.
  n++;
  {
    const disk = onDisk(mergeBaseline({ reviewedVersion: '2.1.226', reviewedAt: 'T0', history: [] },
      { version: undefined, at: undefined, found: 'có đọc, nhưng không đo được version' }));
    if (!(disk.reviewedVersion === '2.1.226') && !guards('version')) {
      bad.push('version không đo được ⇒ `reviewedVersion` bị xoá khỏi đĩa và KHÔNG chỗ nào chặn '
        + '(hàm không giữ giá trị cũ, CLI không còn `if (!version) … exit(1)` trước khi gọi) — '
        + '`claude-code-drift` sẽ nói "CHƯA có bản rà nào" về một file vừa được ghi: #120, đổi nạn nhân');
    }
  }

  // ⓓ LÝ DO KHÔNG ĐO ĐƯỢC. Cùng phép tuyển, khoá khác — và CLI gọi thẳng khoá này là BẮT BUỘC:
  //    *"một baseline bị bump lặng lẽ không phân biệt được với việc chưa ai đọc"* (dòng 920).
  //    Thiếu `found`, mục ra đĩa còn đúng hai khoá (đo 2026-08-10: `{"version":…,"at":…}`) —
  //    một dòng sổ không có nội dung, tức bump lặng lẽ, đúng thứ dòng 920 nói là không được có.
  n++;
  {
    const disk = onDisk(mergeBaseline({}, { version: '9.9.9', at: 'T1' }));
    if (!('found' in (disk.history?.[0] ?? {})) && !guards('found')) {
      bad.push('lý do rỗng ⇒ mục sổ ra đĩa không có `found` và KHÔNG chỗ nào chặn — '
        + 'một bump lặng lẽ đọc y hệt một lần chưa ai đọc changelog (rituals.mjs dòng 920)');
    }
  }

  // ⓔ CANH CHÍNH PHÉP QUÉT. Neo trượt (đổi tên cờ, đổi cách dispatch argv) ⇒ `cliGuard` rỗng ⇒
  //    `guards()` luôn `false`, và ⓒ/ⓓ mất hẳn nhánh CLI của phép tuyển.
  //
  //    HÔM NAY điều đó KHÔNG im lặng — đo được: neo trượt làm 3/5 ca đỏ, vì hàm không tự giữ
  //    nên nhánh còn lại cũng `false`. Ca này trả nợ cho NGÀY MAI: khi nào hàm tự giữ giá trị
  //    cũ (bản vá đúng, và nó nên xảy ra), ⓒ/ⓓ xanh nhờ nhánh hàm — và từ đúng lúc đó một cái
  //    neo mục sẽ không còn ai phát hiện. Sửa hàm là lúc mất phép kiểm, không phải lúc được thêm.
  n++;
  if (!cliGuard) {
    bad.push('không định vị được đoạn CLI giữa `process.argv.indexOf(\'--reviewed-claude-code\')` '
      + 'và chỗ gọi `mergeBaseline(` trong rituals.mjs — ⓒ/ⓓ đang quét một chuỗi RỖNG, phải sửa neo');
  }

  if (bad.length) fail.push(`mergeBaseline-đĩa${' '.repeat(11)} sai ${bad.length}/${n} ca: ${bad.join(' · ')}`);
  else ok.push(`mergeBaseline-đĩa${' '.repeat(11)} ${n} ca — thứ ra ĐĨA sau JSON.stringify: khoá người ghi khác còn nguyên, `
    + `bản rà rỗng bị NÉM, và \`undefined\` không xoá được bản rà cũ (hàm giữ HOẶC CLI chặn)`);
}

// ─── sổ ô native: phép trừ tập hợp, và chiều SỬA QUÁ TAY của nó (#129) ───────
//
// `nativeSlotState` trả lời câu hỏi CỘNG — *"vendor gọi cho ta ở bao nhiêu chỗ mà ta không
// nhấc máy?"* — bằng phần BÙ: `chua-xet = events − wired − ledger`. Bảng dưới khoá bốn ca mà
// một bản "đơn giản hoá" sau này chắc chắn phá:
//
//   ⓵ Sự kiện MỚI của vendor tự vào `chua-xet`. Đây là toàn bộ lý do cơ chế dùng phần BÙ chứ
//      không dùng danh sách. Không có ca này thì một bản đọc-danh-sách-viết-tay cũng xanh, và
//      nó sẽ mù với đúng thứ nghi thức sinh ra để bắt.
//   ⓶ CHIỀU SỬA QUÁ TAY (L0007): trạng thái gõ sai phải rơi vào `chua-xet`, KHÔNG vào "đã
//      xét". Chiều ồn ào (quên một ô ⇒ đỏ) thì ai cũng test; chiều này làm mẫu số teo về 0 và
//      nghi thức XANH trong khi chưa ai xét gì — im lặng, và không ca nào khác bắt được.
//   ⓷ BA GIÁ TRỊ: `events` chưa đo và `wired` không đọc được đều ⇒ `null` ⇒ `?`. Rơi xuống
//      `[]` ở vế `wired` thì MỌI sự kiện thành "ô trống": 31 cái tên vô nghĩa dựng trên một
//      file chưa đọc nổi.
//   ⓸ `issues` rút TỪ CHÍNH lý do và CHỈ từ `co-viec`. Một lý do `khong-co-viec` nhắc issue
//      khác không được đọc thành việc đang mở.
{
  const { nativeSlotState, evaluate: ev } = await import('./rituals.mjs');
  const L = ' '.repeat(13);
  const CASES = [
    ['sổ rỗng ⇒ mọi ô trống là chưa-xét',
      { events: ['A', 'B', 'C'], wired: ['A'], ledger: {} },
      r => r.empty.join() === 'B,C' && r.unexamined.join() === 'B,C' && !r.hasWork.length && !r.noWork.length],
    ['ô ĐANG CẮM bị trừ khỏi cả ba rổ',
      { events: ['A', 'B'], wired: ['A'], ledger: { A: { state: 'co-viec', why: '#1' } } },
      r => r.empty.join() === 'B' && !r.hasWork.length && r.wiredJudged.join() === 'A'],
    // ⓵
    ['sự kiện MỚI của vendor tự vào chưa-xét',
      { events: ['A', 'B', 'MoiToanh'], wired: ['A'], ledger: { B: { state: 'khong-co-viec', why: 'x' } } },
      r => r.unexamined.join() === 'MoiToanh' && r.noWork.join() === 'B'],
    ['phán đoán về sự kiện vendor ĐÃ BỎ ⇒ stale',
      { events: ['A'], wired: [], ledger: { DaBo: { state: 'khong-co-viec', why: 'x' } } },
      r => r.stale.join() === 'DaBo'],
    // ⓶ — ca quan trọng nhất bảng này.
    ['trạng thái gõ sai KHÔNG được tính là đã xét',
      { events: ['A'], wired: [], ledger: { A: { state: 'coviec', why: 'gõ thiếu gạch' } } },
      r => r.unexamined.join() === 'A' && !r.hasWork.length && !r.noWork.length],
    ['mục sổ không có `state` ⇒ chưa-xét',
      { events: ['A'], wired: [], ledger: { A: { why: 'quên khai state' } } },
      r => r.unexamined.join() === 'A'],
    // ⓷
    ['events chưa đo ⇒ null (KHÔNG phải "0 ô trống")', { events: null, wired: ['A'], ledger: {} }, r => r === null],
    ['events rỗng ⇒ null', { events: [], wired: [], ledger: {} }, r => r === null],
    ['wired không đọc được ⇒ null, KHÔNG phải "mọi ô đều trống"',
      { events: ['A', 'B'], wired: null, ledger: {} }, r => r === null],
    ['không đối số ⇒ null, không ném', undefined, r => r === null],
    // Sổ hỏng kiểu ⇒ coi như rỗng, KHÔNG ném: `rituals` chạy ở MỌI SessionStart.
    ['ledger là mảng ⇒ coi như rỗng, không ném', { events: ['A'], wired: [], ledger: ['A'] }, r => r.unexamined.join() === 'A'],
    ['ledger là chuỗi ⇒ coi như rỗng, không ném', { events: ['A'], wired: [], ledger: 'hỏng' }, r => r.unexamined.join() === 'A'],
    // ⓸
    ['issues: gộp trùng, sắp xếp, CHỈ từ co-viec',
      { events: ['A', 'B', 'C'], wired: [], ledger: {
        A: { state: 'co-viec', why: 'x #130' },
        B: { state: 'co-viec', why: 'y #130 #131' },
        C: { state: 'khong-co-viec', why: 'bác — xem #999' } } },
      r => r.issues.join(' ') === '#130 #131'],
  ];
  const badSlot = [];
  for (const [name, input, want] of CASES) {
    let r; try { r = nativeSlotState(input); } catch (e) { badSlot.push(`${name} (ném: ${e.message})`); continue; }
    try { if (!want(r)) badSlot.push(name); } catch { badSlot.push(`${name} (kết quả sai hình dạng)`); }
  }
  if (badSlot.length) fail.push(`nativeSlotState${L} sai ${badSlot.length}/${CASES.length} ca: ${badSlot.join(' · ')}`);
  else ok.push(`nativeSlotState${L} ${CASES.length} ca — sự kiện MỚI tự vào \`chua-xet\`, và trạng thái gõ sai KHÔNG lọt thành "đã xét"`);

  // Ở TẦNG NGHI THỨC: ba trạng thái phải đi đúng đường, và mục `due` phải kèm SỐ ĐO.
  const R = (nativeSlots) => ev({ nativeSlots }).find(r => r.id === 'native-slot-review');
  const RC = [
    ['nativeSlots null ⇒ `?`', null, r => r.state === '?'],
    ['còn ô chưa xét ⇒ due, kèm số',
      { empty: ['A', 'B'], hasWork: [], noWork: [], unexamined: ['B'], stale: [], wiredJudged: [], issues: [] },
      r => r.state === 'due' && /\d/.test(r.why)],
    ['xét hết nhưng còn stale ⇒ VẪN due',
      { empty: ['A'], hasWork: [], noWork: ['A'], unexamined: [], stale: ['DaBo'], wiredJudged: [], issues: [] },
      r => r.state === 'due' && r.why.includes('DaBo')],
    // Ô `co-viec` KHÔNG giữ mục này đỏ — nhưng số issue PHẢI in ra, nếu không thì việc vừa tìm
    // ra biến mất ngay lúc câu hỏi được trả lời.
    ['xét hết ⇒ ok, và IN số issue',
      { empty: ['A'], hasWork: ['A'], noWork: [], unexamined: [], stale: [], wiredJudged: [], issues: ['#130'] },
      r => r.state === 'ok' && r.why.includes('#130')],
  ];
  const badR = RC.filter(([, input, want]) => { try { return !want(R(input)); } catch { return true; } });
  if (badR.length) fail.push(`native-slot-review${' '.repeat(10)} sai ${badR.length}/${RC.length} ca: ${badR.map(c => c[0]).join(' · ')}`);
  else ok.push(`native-slot-review${' '.repeat(10)} ${RC.length} ca — \`?\` khi chưa đo, \`due\` khi còn ô chưa xét, \`ok\` vẫn in số issue`);

  // NEO CẤU TRÚC — `native-surface` phải đẩy ô CHƯA XÉT vào rổ `unknown`, KHÔNG vào `na`.
  //
  // Tới 2.46.0 nó đẩy CẢ 22 ô trống vào `na` kèm lời *"không phải thiếu sót"*, và theo đúng
  // định nghĩa ở `report()` rổ `na` nghĩa là **bằng không DO CẤU TRÚC**. Đó là bug đang được
  // vá ở đây, và nó KHÔNG chạy-để-test được: phần in nằm trong `runCli()`, sau một phép quét
  // binary 285 MB, mà CI ba OS không có `CLAUDE_CODE_EXECPATH`.
  //
  // Neo vào ĐÚNG câu lệnh, không grep cả file — và có nhánh riêng báo "neo đã trôi" để người
  // sau sửa neo thay vì xoá check (cùng khuôn với neo `blankStrings` của #127).
  {
    const nsSrc = readFileSync(repoPath('tooling', 'native-surface.mjs'), 'utf8');
    const m = nsSrc.match(/if\s*\(slots\.unexamined\.length\)\s*\{\s*(\w+)\.push/);
    if (!m) fail.push(`native-surface${L} không tìm thấy nhánh \`if (slots.unexamined.length) { …push\` — NEO ĐÃ TRÔI, sửa neo đừng xoá check`);
    else if (m[1] !== 'unknown') {
      fail.push(`native-surface${L} ô CHƯA XÉT đang vào rổ \`${m[1]}\`, phải vào \`unknown\`. `
        + `\`na\` nghĩa là bằng không DO CẤU TRÚC (định nghĩa ở report()); một ô chưa ai xét là câu hỏi CHƯA HỎI, không phải câu đã trả lời.`);
    } else ok.push(`native-surface${L} ô chưa xét vào rổ \`unknown\` — "chưa hỏi" không bị đọc thành "không áp dụng"`);
  }
}

// ── TRẦN CỦA `whats-new.md`, VÀ VÌ SAO NÓ LÀ MỘT CON SỐ ─────────────────────
//
// `session-start.mjs` in `.slice(0, 700)` ký tự của file này — đo được: chừng HAI mục. Mọi mục
// sau đó KHÔNG có đường nào tới người đọc, mà vẫn theo `apply-to.mjs` (SEED) xuống MỌI repo
// tiêu thụ. Đo 2026-08-14: **78 mục · 1 081 dòng**, tích trong 11 ngày (~100 dòng/ngày) — tức
// dấu chân này tăng tuyến tính theo thời gian mà giá trị đọc được thì đứng yên ở 700 ký tự.
//
// Trần là phép kiểm chứ không phải lời dặn, vì lời dặn ĐÃ CÓ và đã trôi: skill nói "giữ ngắn"
// từ đầu, và file vẫn lên 1 081 dòng. `.claude/rules/README.md` xếp lời dặn ở bậc rẻ nhất và
// mục nhanh nhất của thang biểu diễn — đây là lúc đẩy nó xuống bậc `test`.
//
// Hai chiều, và chiều thứ hai mới là chiều im lặng:
//   ① file chính vượt trần        ⇒ cần xoay vòng
//   ② lưu trữ LỌT vào SEED        ⇒ vừa dời 900 dòng sang chỗ khác rồi ship y nguyên
{
  const WN = repoPath('.claude', 'whats-new.md');
  const WN_ARC = repoPath('.claude', 'whats-new-archive.md');
  const CAP = 220;
  const badWn = [];

  if (!exists(WN)) badWn.push('.claude/whats-new.md không tồn tại — cơ chế thông báo đã mất');
  else {
    const body = readFileSync(WN, 'utf8');
    const n = body.split('\n').length;
    if (n > CAP) badWn.push(`whats-new.md ${n} dòng > trần ${CAP} — chuyển mục cũ sang .claude/whats-new-archive.md (ĐỪNG nới trần: session-start chỉ in 700 ký tự)`);
    // Cơ chế đọc version bằng regex. Xoay vòng làm hỏng dòng đó thì thông báo im LẶNG.
    if (!/<!--\s*version:\s*[^\s>]+\s*-->/.test(body)) badWn.push('whats-new.md mất dòng `<!-- version: … -->` — session-start sẽ không bao giờ in nữa');
    if (!/^## /m.test(body)) badWn.push('whats-new.md không còn mục `## ` nào');
  }

  // Chiều ②: lưu trữ KHÔNG được nằm trong SEED. Đối chiếu bằng MÃ NGUỒN của `apply-to.mjs`,
  // vì SEED là một mảng literal ở đó — không có API nào để hỏi.
  const applySrc = readFileSync(repoPath('tooling', 'apply-to.mjs'), 'utf8');
  const seedBlock = applySrc.slice(applySrc.indexOf('const SEED = ['), applySrc.indexOf('const MERGE = ['));
  if (!seedBlock) badWn.push('không định vị được SEED trong apply-to.mjs — mốc cắt đã trôi');
  else if (seedBlock.includes('whats-new-archive')) badWn.push('whats-new-archive.md NẰM TRONG SEED — nó sẽ ship xuống consumer, tức việc xoay vòng không giảm được dấu chân nào');
  // BÓC RỒI CHẠY THẬT cái regex, không so chuỗi trên cả file. Bản đầu của tôi so chuỗi, và
  // mutant "bỏ (-archive)? khỏi HISTORICAL" SỐNG — vì chính đoạn comment tôi vừa viết ở
  // harness-doctor có chứa chữ `whats-new-archive`. Neo rộng hơn thứ nó khoá, đúng `L0006`.
  if (exists(WN_ARC)) {
    const docSrc = readFileSync(repoPath('tooling', 'harness-doctor.mjs'), 'utf8');
    const m = docSrc.match(/^const HISTORICAL = \/(.+)\/;$/m);
    if (!m) badWn.push('không bóc được `HISTORICAL` từ harness-doctor.mjs — mốc đã trôi');
    else if (!new RegExp(m[1]).test('.claude/whats-new-archive.md')) {
      badWn.push('`HISTORICAL` ở harness-doctor KHÔNG khớp .claude/whats-new-archive.md — phép quét tham chiếu chết sẽ bắt cả một hồ sơ lịch sử');
    }
  }

  if (badWn.length) fail.push(`whats-new trần${' '.repeat(9)} ${badWn.length} lỗi: ${badWn.join(' | ')}`);
  else ok.push(`whats-new trần${' '.repeat(9)} file chính ≤ ${CAP} dòng · còn dòng version · lưu trữ KHÔNG trong SEED và ĐƯỢC xếp vào HISTORICAL`);
}

// ── GÁC KÍCH THƯỚC PR ĐO "DÒNG MỚI", KHÔNG ĐO "THÊM + XOÁ" ─────────────────
//
// Ca này ở suite SHIP (không phải `test-lib`) có lý do: `netNewLines` đỡ một gác trong
// `.github/workflows/ci.yml`, mà file đó nằm trong SEED — nó chạy ở CI của MỌI repo tiêu thụ.
// Hàm sai ⇒ gác của họ sai, và họ không sửa được `lib`.
//
// Chiều nguy hiểm là chiều ĐẾM THIẾU: một PR to đọc thành nhỏ và đi lọt. Nên ca đa tập
// (`dup`) là ca phải khoá chặt nhất — dùng `Set` thay vì đếm sẽ nuốt đúng những dòng đó.
{
  const D = (...ls) => ls.join('\n');
  const badNN = [];
  const NN = [
    ['rỗng',                         D(''),                                              0],
    ['chỉ header diff',              D('+++ b/a.mjs', '--- a/a.mjs'),                     0],
    ['thêm thuần',                   D('+alpha', '+beta'),                                2],
    ['xoá thuần',                    D('-alpha', '-beta'),                                0],
    ['CHUYỂN nguyên vẹn ⇒ 0 mới',    D('-alpha', '-beta', '+alpha', '+beta'),             0],
    ['chuyển + đổi thụt đầu dòng',   D('-alpha', '+  alpha'),                             0],
    ['chuyển kèm 1 dòng thật mới',   D('-alpha', '+alpha', '+gamma'),                     1],
    ['đa tập: xoá 1, thêm 3',        D('-alpha', '+alpha', '+alpha', '+alpha'),           2],
    ['đa tập: xoá 3, thêm 1',        D('-alpha', '-alpha', '-alpha', '+alpha'),           0],
    ['dòng trắng không tính',        D('+', '+   ', '-'),                                 0],
    ['null/undefined không ném',     null,                                                0],
  ];
  for (const [label, diff, want] of NN) {
    let got;
    try { got = netNewLines(diff); } catch (e) { got = `ném ${e.message}`; }
    if (got !== want) badNN.push(`${label} → ${got}, cần ${want}`);
  }
  if (badNN.length) fail.push(`netNewLines${' '.repeat(12)} ${badNN.length}/${NN.length} ca sai: ${badNN.join(' | ')}`);
  else ok.push(`netNewLines${' '.repeat(12)} ${NN.length} ca — chuyển nguyên vẹn ⇒ 0 dòng mới, và phép so là ĐA TẬP (xoá 1 + thêm 3 ⇒ 2, không phải 0)`);

  // Gác chỉ có giá trị nếu ci.yml THẬT SỰ gọi hàm này. Neo vào lời gọi, không vào chữ
  // `netNewLines` ở đâu đó trong file — chính comment ở trên đã chứa chữ đó.
  const ci = readFileSync(repoPath('.github', 'workflows', 'ci.yml'), 'utf8');
  if (!/m\.netNewLines\(d\)/.test(ci)) {
    fail.push(`netNewLines ↔ ci${' '.repeat(9)} ci.yml KHÔNG gọi \`m.netNewLines(d)\` — gác kích thước đang đo lại "thêm + xoá", và một phép CHUYỂN sẽ bị đếm hai lần`);
  // Neo vào ĐÚNG DÒNG so sánh, không phải "có chữ NEWLINES ở đâu đó rồi có -gt ở đâu đó":
  // regex `/s` quét cả file thì nó vẫn khớp sau khi ai đó đổi ngưỡng về \$LINES — mutant sống,
  // và đó là lần thứ ba của lớp lỗi này trong cùng một phiên.
  } else if (!/if \[ "\$NEWLINES" -gt "\$FAIL" \]/.test(ci)) {
    fail.push(`netNewLines ↔ ci${' '.repeat(9)} ci.yml tính \`NEWLINES\` nhưng ngưỡng fail KHÔNG so với nó`);
  } else {
    ok.push(`netNewLines ↔ ci${' '.repeat(9)} ci.yml gọi hàm thật và ngưỡng fail so trên dòng MỚI`);
  }
}

// ── TEMPLATE KHÔNG ĐƯỢC ÂM THẦM MẤT `test-lib.mjs` ──────────────────────────
//
// v2.80.0 chuyển 61 ca (test hàm thuần của lib) sang `test-lib.mjs`, và file đó KHÔNG
// ship (`NOT_FOR_CONSUMER`). Sàn của suite NÀY tụt 291 → 230 theo đúng phép chuyển — nên nếu
// file kia biến mất khỏi template, **không gì đỏ**: sàn 230 vẫn đạt, và 61 ca kia chỉ đơn giản
// không còn chạy ở đâu cả. Đó đúng là chế độ hỏng mà cả hai cái sàn sinh ra để chặn, chỉ là nó
// rơi vào KHE GIỮA hai suite.
//
// CI chạy `test-lib` sau một điều kiện `if [ -f … ]` — điều kiện đó đúng cho repo con và sẽ im
// lặng cho template. Ca này là thứ làm điều kiện đó an toàn.
if (repoRole() === 'template') {
  const tl = repoPath('tooling', 'test-lib.mjs');
  if (!exists(tl)) {
    fail.push(`test-lib ↔ template${' '.repeat(6)} tooling/test-lib.mjs KHÔNG còn — 61 ca hàm thuần của lib đang không chạy ở đâu cả, và không sàn nào thấy điều đó`);
  } else if (!NOT_FOR_CONSUMER.includes('tooling/test-lib.mjs')) {
    fail.push(`test-lib ↔ template${' '.repeat(6)} test-lib.mjs có mặt nhưng KHÔNG nằm trong NOT_FOR_CONSUMER — nó sẽ ship, tức việc tách không giảm được dấu chân nào`);
  } else {
    ok.push(`test-lib ↔ template${' '.repeat(6)} test-lib.mjs có mặt ở template và được khai NOT_FOR_CONSUMER — 61 ca kia có chỗ chạy, và không đi xuống repo con`);
  }
}

const RATCHET = 239;   // v2.82.0: +4 ca cho phép đo độ trễ `PreToolUse` (phủ đủ ô đã đăng ký · tường nằm giữa hook-đắt-nhất và tổng-nối-tiếp · ngân sách so với TƯỜNG chứ không phải tổng nối tiếp · +1 n/a cho ô 1-hook, nơi bất biến không có sức phân biệt). v2.81.0: +2 ca đối chiếu danh sách ship (SEED ↔ NOT_FOR_CONSUMER, REMOVED_PATHS ↔ NOT_FOR_CONSUMER). Ca `ship ↔ trích dẫn` KHÔNG mất — nó đổi từ regex viết tay sang kiểm đấu nối `unshippedRefs`, logic chuyển xuống lib và có 15 khẳng định đơn vị ở `test-lib.mjs`. v2.80.0: 291 → 230 KHÔNG phải 61 ca chết — 61 ca chuyển sang `test-lib.mjs` (test HÀM THUẦN của lib; repo con không sửa lib nên không mang theo). 230 + 61 = 291, đúng bằng tổng trước khi tách. +1 ca chống-mất-file (khe giữa hai suite) +2 ca `netNewLines` (v2.79.1) ⇒ 233. Lịch sử cộng dồn của con số cũ ở HARNESS-CHANGELOG 2.79.0 trở về trước.
const ran = ok.length + fail.length;
// `na` = ca KHÔNG DỰNG ĐƯỢC ở hình dạng checkout này (HEAD detached). Cộng vào tổng cùng lý
// do `skipped` được cộng: nếu không, một môi trường thiếu điều kiện đọc y hệt một case vừa
// NGỪNG CHẠY, và sàn — thứ tồn tại để phân biệt hai chuyện đó — sẽ báo nhầm.
const naCount = naEntries.reduce((s, e) => s + e.count, 0);
const total = ran + skipped + naCount;
if (total < RATCHET) {
  fail.push(`chỉ có ${total} khẳng định (${ran} chạy + ${skipped} bỏ qua + ${naCount} không dựng được), sàn là ${RATCHET} — một case đã `
    + `NGỪNG CHẠY (hook thiếu file? khối bị throw sớm?). Đây là chế độ hỏng mà một suite "xanh 100%" che kín nhất.`);
}
console.log(`\n=== HOOK TESTS (${ok.length}/${ran} pass`
  + `${skipped ? ` · ${skipped} n/a (chỉ chạy ở repo template)` : ''}`
  + `${naCount ? ` · ${naCount} n/a (không dựng được, hoặc không có sức phân biệt, ở hình dạng repo này)` : ''}, sàn ${RATCHET}) ===`);
for (const m of ok) console.log('  PASS  ' + m);
for (const e of naEntries) console.log('  n/a   ' + e.msg);
for (const m of fail) console.log('  FAIL  ' + m);
console.log('');

// Mọi dòng FAIL ở trên đi ra STDOUT, nên `node tooling/test-hooks.mjs | tail -5` xoá
// được chúng CÙNG với exit code (ống dẫn trả mã của tiến trình cuối). Dòng dưới ra
// stderr — nó là thứ duy nhất sống sót qua mọi bộ lọc người gọi đặt lên stdout.
emitVerdict('HOOK TESTS', { fail: fail.length, code: fail.length ? 1 : 0 });
process.exit(fail.length ? 1 : 0);
