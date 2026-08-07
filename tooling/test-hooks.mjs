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
import { readFileSync, writeFileSync, rmSync, readdirSync, cpSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { repoPath, report, exists, git, tmpdir, repoRole, readJson, TEST_TELEMETRY_DIR, TEST_STATE_DIR, isRecordedRemoval, removedSkillNames, declaredCommands, tallyLines, MECHANISM_PATHS, NOT_FOR_CONSUMER, fixlogKey, coordinationLayer, verificationCoverage, PACK_SCHEMA, packPending, packMaterial, budgetStatus, dangerousCommand } from './lib/harness.mjs';

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
 * `ran` là trường quan trọng, không phải `killed`. Một mutant CHỈ CRASH chứng minh
 * suite nhận ra file hỏng — nó KHÔNG nói gì về hành vi mà mutant tuyên bố đã gỡ bỏ.
 * Đây là cái bẫy giết mọi mutation test: mutant crash → probe thấy "không phải
 * output khoẻ mạnh" → suite ghi nhận "đã giết mutant" → XANH MÀ CHƯA KIỂM GÌ CẢ.
 * Đó là thất bại tệ nhất có thể xảy ra ở đúng cơ chế sinh ra để chứng minh một
 * check CÓ THỂ đỏ. Cách vá an toàn: `[].push(...)` thay vì `if (false)`.
 *
 * VÀ KHI MUTANT SỐNG SÓT: nhìn PHẠM VI của check TRƯỚC khi nhìn logic. Logic là thứ
 * tác giả đang nghĩ tới lúc viết test nên nó được phủ; còn phạm vi — áp cho file nào,
 * dòng nào — được khai một lần rồi không ai khẳng định lại. Nên mutant ĐẦU TIÊN hãy
 * tiêu vào phạm vi: thay bộ lọc bằng `() => true`. Suite vẫn xanh ⇒ dòng khai báo
 * phạm vi đó là trang trí.
 *
 * Mutant chạy trên một BẢN SAO cạnh file gốc (cần cùng thư mục để import tương đối
 * `../../tooling/lib/harness.mjs` còn resolve được). File gốc KHÔNG BAO GIỜ bị ghi.
 */
function mutate(hookFile, apply, input, { mayCrash = false, env = null } = {}) {
  const src = repoPath('.claude', 'hooks', hookFile);
  if (!exists(src)) return { killed: false, ran: false, note: 'hook không tồn tại' };
  const original = readFileSync(src, 'utf8');
  const mutated = apply(original);
  if (mutated === original) {
    return { killed: false, ran: false, note: 'MUTANT KHÔNG ĐỔI GÌ — neo sai chuỗi. Đây là lỗi của TEST, không phải của hook.' };
  }
  const tmp = repoPath('.claude', 'hooks', `.mutant.tmp.mjs`);
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
const na = [];
if (!CUR_BRANCH) {
  na.push('protect-integration-branch: 3 ca cần một NHÁNH đang đứng — HEAD đang detached '
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
if (!preToolUseHooks.size) {
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

// ─── gates.mjs — cùng luật: code có quyền exit 2 thì phải có test ────────────
// Nó không nằm trong .claude/hooks/ nhưng nó CHẶN được lượt, nên nó chịu cùng
// hợp đồng. Ba nhánh dưới đây là toàn bộ hành vi fail-đóng của nó.
const UNCONF = () => repoPath('tooling', 'fixtures', 'config-unconfigured.json');
const GATE_CASES = [
  [{ HARNESS_CONFIG: UNCONF() }, OK, 'phiên CÓ người + gate bỏ qua → cảnh báo, KHÔNG chặn', /BỎ QUA/],
  [{ HARNESS_CONFIG: UNCONF(), CI: '1' }, BLOCK, 'phiên KHÔNG người + gate bỏ qua → FAIL ĐÓNG', /KHÔNG có người ngồi xem/],
  [{ HARNESS_CONFIG: UNCONF(), CI: '1', HARNESS_ALLOW_SKIPPED_GATES: '1' }, OK, 'cửa thoát chủ ý mở được ở phiên không người', /BỎ QUA/],
];
for (const [env, expect, label, msg] of GATE_CASES) {
  const r = spawnSync(process.execPath, [repoPath('tooling', 'gates.mjs'), '--stage', 'stop'], {
    encoding: 'utf8', cwd: repoPath(''), env: { ...process.env, ...TEST_ENV, CI: '', ...env },
  });
  const status = r.status ?? -1;
  const both = (r.stdout ?? '') + '\n' + (r.stderr ?? '');
  if (status !== expect) fail.push(`gates.mjs ${label}  →  exit=${status}, mong đợi ${expect}`);
  else if (!msg.test(both)) fail.push(`gates.mjs ${label}  →  thông điệp không khớp ${msg}`);
  else ok.push(`gates.mjs${' '.repeat(19)} ${label}`);
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

// ─── LỚP KINH TẾ: mẩu bánh mì StopFailure ────────────────────────────────────
// Vendor BỎ QUA output và exit code của StopFailure, nên nhánh đó không thể assert
// bằng bộ ba (stdout, stderr, exit). Thứ phải assert là HIỆU QUẢ của nó: cảnh báo về
// TIỀN có tới được mắt người ở phiên sau hay không. Không có test này thì lớp kinh tế
// có thể đứt im lặng và mọi thứ khác vẫn xanh.
{
  const stateDir = join(tmpdir(), 'harness-test-state-crumb');
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
    const tmp = repoPath('.claude', 'hooks', '.mutant.observe.tmp.mjs');
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

  // `null` = CHƯA có tầng một. Đó là sự thật đo được, không phải thiếu sót của bảng —
  // và nó được đếm chứ không bị giấu.
  const LAYER1 = new Map([
    ['ghi lại lịch sử chung',                        'Bash(git push --force:*)'],
    ['phá thay đổi chưa commit',                     'Bash(git reset --hard:*)'],
    ['xoá không hồi phục ở gốc hoặc thư mục hiện tại', 'Bash(rm -rf /:*)'],
    ['apply hạ tầng không review plan',              'Bash(terraform apply *-auto-approve:*)'],
    ['xoá file untracked, không đường cứu',          null],
    ['bỏ thay đổi working tree',                     null],
    ['xoá nhánh chung',                              null],
    ['viết lại nhánh chung',                         null],
    ['phá dữ liệu',                                  null],
    ['chạm production',                              null],
    ['lệnh cấp hệ thống',                            null],
    ['fork bomb',                                    null],
  ]);

  // Ratchet: đo 2026-08-06. GIẢM thì sửa số này xuống; TĂNG là đỏ, và đó là mục đích.
  const UNCOVERED_RATCHET = 8;

  const missing = whys.filter(w => !LAYER1.has(w));
  const stale = [...LAYER1.keys()].filter(w => !whys.includes(w));
  const lying = [...LAYER1].filter(([, p]) => p && !deny.has(p)).map(([w]) => w);
  const uncovered = whys.filter(w => LAYER1.get(w) == null);

  if (!whys.length) {
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
  } else if (uncovered.length > UNCOVERED_RATCHET) {
    fail.push(`dcg ↔ permissions.deny${' '.repeat(6)} ${uncovered.length} điều cấm CHỈ có dcg đứng sau (ratchet ${UNCOVERED_RATCHET}) — `
      + `dcg né được bằng cú pháp nháy (issue #43), nên mỗi mục ở đây là một điều cấm KHÔNG có tầng nào cưỡng chế thật. Thêm dòng vào permissions.deny, đừng nới ratchet`);
  } else {
    ok.push(`dcg ↔ permissions.deny${' '.repeat(6)} ${whys.length} điều cấm đều khai tầng một; ${whys.length - uncovered.length} có, ${uncovered.length} chưa (ratchet ${UNCOVERED_RATCHET}, chỉ được giảm)`);
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
    fixlogTotal: 0, fixlogRepeated: 0, learningsNewerThanLessons: 0,
    skillCount: 5, maxSkills: 12, worktrees: 1, maxWorktrees: 4, pendingPacks: 0, harnessBlocks: 0,
    // "Trạng thái ĐỦ" cho guard nhánh tích hợp = đã gặp ít nhất một ca. 0/0 là `?` (mẫu số
    // rỗng, L0005), và ca ③ bên dưới khoá đúng điều đó.
    mainEditEscapes: 0, mainEditBlocks: 1,
    claudeCodeVersion: '2.1.221', reviewedClaudeCode: '2.1.221', reviewedClaudeCodeAt: '2026-08-05T00:00:00.000Z',
    // "Trạng thái ĐỦ" cho ngân sách = đã khai trần VÀ đã đo. Chỉ khai trần thôi là `?` —
    // ca ③ bên dưới khoá đúng điều đó.
    budget: { mode: 'ok', percent: 14, ageDays: 3, advice: null },
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

  // ③ Nhánh không suy ra được issue ⇒ `?`, không phải "ok, không có gì để nhận".
  if (get({ issue: null }, 'claim')?.state !== '?') {
    fail.push('rituals.mjs                 nhánh không suy ra được issue mà /claim vẫn báo `ok` — im lặng đúng lúc không biết');
  } else ok.push(`rituals.mjs${' '.repeat(17)} nhánh không theo quy ước ⇒ /claim là \`?\`, không phải \`ok\``);

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
  const DRIFT = [
    [{ reviewedClaudeCode: null }, 'due', /CHƯA có bản rà/, 'chưa có baseline ⇒ tới hạn (không phải `?`)'],
    [{ reviewedClaudeCode: '2.1.200' }, 'due', /2\.1\.200 → 2\.1\.221/, 'version đổi ⇒ tới hạn, và nêu CẢ HAI số'],
    [{}, 'ok', /2\.1\.221/, 'đã rà đúng version đang chạy ⇒ im lặng'],
  ];
  for (const [state, want, msg, label] of DRIFT) {
    const r = get(state, 'claude-code-drift');
    if (r?.state !== want) fail.push(`rituals.mjs${' '.repeat(17)} claude-code-drift: ${label} → state=${r?.state}, mong đợi ${want}`);
    else if (!msg.test(r.why)) fail.push(`rituals.mjs${' '.repeat(17)} claude-code-drift: ${label} → \`why\` không khớp ${msg}`);
    else ok.push(`rituals.mjs${' '.repeat(17)} claude-code-drift: ${label}`);
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

  // ④b-quater `guard-nhanh-tich-hop`: một cửa thoát không ai đếm là cửa thoát mở vĩnh viễn.
  //     Ba trạng thái, và cái đáng khoá nhất là 0/0 — guard vừa cắm thì MẪU SỐ BẰNG 0, và
  //     một tỉ lệ trên mẫu số 0 là câu trả lời dễ chịu chứ không phải câu trả lời đúng (L0005).
  const GUARD = [
    [{ mainEditEscapes: 0, mainEditBlocks: 0 }, '?', /chưa gặp ca nào/, '0 chặn 0 thoát ⇒ `?`, KHÔNG phải "ổn"'],
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
  ];
  const badK = KEY.filter(([[t, r], want]) => fixlogKey(t, r) !== want);
  if (badK.length) fail.push(`lib/harness.mjs${' '.repeat(13)} fixlogKey() sai ở ${badK.length}/${KEY.length} ca: ${badK.map(([, , l]) => l).join(' · ')}`);
  else ok.push(`lib/harness.mjs${' '.repeat(13)} fixlogKey(): luật người-khai thắng phép từ vựng, luật đầu thắng, needle rỗng bị bỏ — ${KEY.length} ca`);

  // ⑦ CHỐNG LỆCH HAI BẢNG. `fixlog.mjs --top` và `rituals.mjs` trả lời CÙNG một câu hỏi
  //    ("nhóm nào đã ≥2 lần"). Nếu chỉ một bên đọc luật gom nhóm, người dùng thấy "★ đủ điều
  //    kiện promote" ở một chỗ và "chưa nhóm nào đạt ngưỡng" ở chỗ kia — hai sự thật, không
  //    gì báo. Đây đúng là lỗi mà comment ở `lib/harness.mjs` đã tiên đoán cho bản sao thứ ba.
  const ritSrc = readFileSync(repoPath('tooling', 'rituals.mjs'), 'utf8');
  const fixSrc = readFileSync(repoPath('tooling', 'fixlog.mjs'), 'utf8');
  const drift = [];
  if (!/fixlogGroupRules/.test(ritSrc)) drift.push('rituals.mjs không đọc luật gom nhóm');
  if (!/fixlogGroupRules/.test(fixSrc)) drift.push('fixlog.mjs không đọc luật gom nhóm');
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
}

// ─── LỚP PHỐI HỢP: `chưa khai` KHÔNG ĐƯỢC gộp vào `solo` ─────────────────────
//
// `project.teamSize` tắt được ba cơ chế phối hợp liên-người. Chế độ hỏng đáng sợ của nó
// KHÔNG phải "solo mà không tắt" (tốn vài giây, nhìn thấy được) mà là **"chưa khai mà bị
// đọc thành solo"**: mọi repo chưa chạy `setup.mjs` lặng lẽ mất guard đặt chỗ, và không ai
// quyết định điều đó. Đúng lớp lỗi mà cả W32 đi sửa — một tín hiệu hai giá trị nuốt mất
// trạng thái thứ ba và đổ về phía dễ chịu.
//
// Nên bảng này chủ yếu là các ca RÁC: `0`, `"1"` (chuỗi), `1.5`, `-1`, `null`, không có
// khoá. Tất cả PHẢI ra `teamSize=null` + `isSolo=false`. Chỉ số nguyên dương mới là câu
// trả lời, và chỉ đúng `1` mới bật solo.
//
// `config()` memo hoá trong một process ⇒ mỗi ca phải là một process riêng. Fixture in ra
// là một FILE (`print-team.mjs`), không phải `node -e` — Parity Contract.
{
  const L = ' '.repeat(15);
  const baseCfg = JSON.parse(readFileSync(repoPath('tooling', 'fixtures', 'config-guard-paths.json'), 'utf8'));
  const work = join(tmpdir(), `harness-teamsize-${process.pid}`);
  mkdirSync(work, { recursive: true });

  //        tên ca      giá trị teamSize   mong đợi teamSize()   mong đợi isSolo()
  const TABLE = [
    ['solo',            1,                 '1',                  'true'],
    ['đội 4 người',     4,                 '4',                  'false'],
    ['0',               0,                 'null',               'false'],
    ['chuỗi "1"',       '1',               'null',               'false'],
    ['1.5',             1.5,               'null',               'false'],
    ['-1',              -1,                'null',               'false'],
    ['null tường minh', null,              'null',               'false'],
    ['KHÔNG có khoá',   undefined,         'null',               'false'],
  ];

  const bad = [];
  for (const [name, value, wantSize, wantSolo] of TABLE) {
    const c = structuredClone(baseCfg);
    if (value === undefined) delete c.project.teamSize; else c.project.teamSize = value;
    const p = join(work, `cfg-${TABLE.findIndex(t => t[0] === name)}.json`);
    writeFileSync(p, JSON.stringify(c), 'utf8');
    const r = spawnSync(process.execPath, [repoPath('tooling', 'fixtures', 'print-team.mjs')], {
      encoding: 'utf8', cwd: repoPath(''), env: { ...process.env, ...TEST_ENV, HARNESS_CONFIG: p },
    });
    const out = String(r.stdout || '').trim();
    const want = `teamSize=${wantSize} isSolo=${wantSolo}`;
    if (out !== want) bad.push(`${name}: được \`${out || r.stderr?.trim().slice(0, 60)}\`, cần \`${want}\``);
  }
  rmSync(work, { recursive: true, force: true });

  if (bad.length) fail.push(`teamSize/isSolo${L} ${bad.length}/${TABLE.length} ca sai: ${bad.join(' | ')}`);
  else ok.push(`teamSize/isSolo${L} ${TABLE.length} ca — chỉ số nguyên dương là câu trả lời, chỉ \`1\` bật solo, 6 dạng rác đều ra \`chưa khai\``);
}

// ─── telemetry của FIXTURE không được rơi vào sổ THẬT ────────────────────────
//
// Cột `N qua · M chặn` là thứ `/harness-retro` bước 1 dặn đọc TRƯỚC, và bước 4 dùng để
// quyết định CẮT cái gì. Đo 2026-08-07: 2/6 mục `gate-fails.log` mang project id của
// FIXTURE. Tổng 6 lần chặn thật ra là 1 cứu thật · 3 dương tính giả · 2 rác.
//
// Suite thì SẠCH (`TEST_ENV` có `HARNESS_TELEMETRY_DIR`, `mutate()` truyền xuống). Nguồn rò
// là probe hook BẰNG TAY lúc phát triển. Nên phép kiểm phải chạy với biến môi trường đó
// BỊ XOÁ — nếu không nó khẳng định đúng cái ca không hỏng.
//
// So NHÃN chứ không so đường dẫn: đường dẫn chứa `tmpdir()` và thư mục repo ⇒ khác nhau
// theo máy và theo OS. Parity Contract.
{
  const L = ' '.repeat(13);
  const probe = repoPath('tooling', 'fixtures', 'print-telemetry-dir.mjs');
  const run = (cfg, extra = {}) => String(spawnSync(process.execPath, [probe], {
    encoding: 'utf8', cwd: repoPath(''),
    // `HARNESS_TELEMETRY_DIR: ''` — XOÁ cửa thoát của suite, tái hiện đúng ca probe tay.
    env: { ...process.env, ...TEST_ENV, HARNESS_TELEMETRY_DIR: '', HARNESS_CONFIG: cfg, ...extra },
  }).stdout || '').trim();

  const FIXTURE_CFG = repoPath('tooling', 'fixtures', 'config-guard-paths.json');
  const REAL_CFG = repoPath('harness.config.json');

  //        nhãn ca                              config        env thêm                        mong đợi
  const TABLE = [
    ['fixture + không có env',                   FIXTURE_CFG, {},                              'TEST'],
    ['config THẬT + không có env',               REAL_CFG,    {},                              'THẬT'],
    ['env thắng tất cả, kể cả với config thật',  REAL_CFG,    { HARNESS_TELEMETRY_DIR: TEST_TELEMETRY_DIR }, 'TEST'],
  ];
  const bad = [];
  for (const [name, cfg, extra, want] of TABLE) {
    const got = run(cfg, extra);
    if (got !== want) bad.push(`${name}: được \`${got}\`, cần \`${want}\``);
  }
  if (bad.length) fail.push(`telemetryDir${L} ${bad.length}/${TABLE.length} ca sai: ${bad.join(' | ')}`);
  else ok.push(`telemetryDir${L} ${TABLE.length} ca — project id \`fixture-*\` chuyển hướng khỏi sổ THẬT kể cả khi không ai set biến môi trường`);
}

// ─── verificationCoverage: mẫu số 0 phải HIỆN RA, nhưng chỉ ở đúng ca ────────
//
// Đo 2026-08-07: `sakubun-single-user` có harness v2.13.0 và `features/` thật = **0**, trong
// khi auto-memory ghi 4 mục "pending live verify" qua 2 project. Nợ xác minh CÓ THẬT, chỉ
// không nằm ở chỗ harness nhìn được.
//
// Nó không tự lộ vì mọi cơ chế đo lặp qua `features/*.json` ⇒ tập rỗng ⇒ XANH. Cùng lớp lỗi
// `evals/run.mjs` sửa ở v2.24.0 nhưng NGƯỢC CHIỀU: ở đó "chưa đo" thành FAIL, ở đây thành
// PASS — và không ai đi điều tra một dấu tick xanh.
//
// Bảng này chủ yếu khoá HAI VẾ MIỄN TRỪ, vì bỏ vế nào cũng hỏng theo một kiểu riêng:
//   · `template` — bỏ ⇒ tái tạo #56 lần thứ ba (đỏ vĩnh viễn trong repo template)
//   · `quiet`    — bỏ ⇒ nổ ở mọi repo mới toanh, thành nhiễu ngay ngày đầu
{
  const L = ' '.repeat(6);
  //        role         features  commits7d   mode           có advice?
  const TABLE = [
    ['consumer',  0,   14,   'empty',       true ],   // ca thật: ship mà không khai feature
    ['consumer',  3,   14,   'covered',     false],
    ['consumer',  0,    0,   'quiet',       false],   // repo mới — chưa ship thì chưa nợ
    ['template',  0,   14,   'template-na', false],   // #56 KHÔNG được tái tạo
    ['consumer',  0, null,   'unknown',     false],   // không đọc được git ⇒ `?`, không phải "ổn"
    ['unknown',   0,   14,   'empty',       true ],   // vai lạ ⇒ KHÔNG được miễn
  ];
  const bad = [];
  for (const [role, features, commits7d, wantMode, wantAdvice] of TABLE) {
    const r = verificationCoverage({ role, features, commits7d });
    const got = `${r.mode}/${Boolean(r.advice)}`;
    const want = `${wantMode}/${wantAdvice}`;
    if (got !== want) bad.push(`${role} f=${features} c=${commits7d}: ${got} ≠ ${want}`);
  }
  if (bad.length) fail.push(`verificationCoverage${L} ${bad.length}/${TABLE.length} ca sai: ${bad.join(' | ')}`);
  else ok.push(`verificationCoverage${L} ${TABLE.length} ca — chỉ "có commit mà 0 feature" mới kêu; template và repo mới được miễn, vai lạ thì không`);
}

// ─── coordinationLayer: repo TEMPLATE không được bị đòi khai `teamSize` ──────
//
// Bug #56 đang mở là đúng lớp này: một advice đỏ VĨNH VIỄN trong repo template, về một việc
// repo template KHÔNG ĐƯỢC làm. `harness.config.json` là SEED ⇒ một con số `teamSize` ở đây
// ship sang MỌI consumer như câu trả lời của họ. "Chưa khai" là trạng thái ĐÚNG ở template.
//
// BỐN trạng thái, không ba: `template-na` phải tách khỏi `unknown`, vì chỉ `unknown` mới
// sinh advice. Gộp hai cái đó là tái tạo lại #56 ở một file khác.
{
  const L = ' '.repeat(11);
  //          teamSize    role         mode           có advice?
  const TABLE = [
    [1,          'consumer', 'solo',        false],
    [4,          'consumer', 'team',        false],
    [undefined,  'consumer', 'unknown',     true ],
    [undefined,  'template', 'template-na', false],
    [1,          'template', 'solo',        false],   // đã khai thì tôn trọng, kể cả ở template
    [0,          'template', 'template-na', false],   // rác ⇒ coi như chưa khai ⇒ vẫn miễn
    [0,          'consumer', 'unknown',     true ],
    [undefined,  'unknown',  'unknown',     true ],   // không nhận ra vai ⇒ KHÔNG được miễn
  ];
  const bad = [];
  for (const [ts, role, wantMode, wantAdvice] of TABLE) {
    const r = coordinationLayer({ teamSize: ts, role });
    const got = `${r.mode}/${Boolean(r.advice)}`;
    const want = `${wantMode}/${wantAdvice}`;
    if (got !== want) bad.push(`teamSize=${JSON.stringify(ts)} role=${role}: ${got} ≠ ${want}`);
  }
  if (bad.length) fail.push(`coordinationLayer${L} ${bad.length}/${TABLE.length} ca sai: ${bad.join(' | ')}`);
  else ok.push(`coordinationLayer${L} ${TABLE.length} ca — template KHÔNG bị đòi khai teamSize (bug #56 không tái tạo), vai lạ thì vẫn bị đòi`);
}

// ─── budgetStatus: trần khai rồi mà chưa đo KHÔNG được đọc là "ổn" ───────────
//
// `budget.monthlyUsdCap` là field MA cho tới v2.28.0: nơi DUY NHẤT đọc nó là một dòng advice
// nói "= 0". Đặt $50 vào cũng không có gì xảy ra — và chính điều đó khiến người ta TIN là
// có lớp bảo vệ. Cùng lớp với `modelTiering` bị cắt ở 2.0.0.
//
// Ca phải khoá chặt nhất là `unmeasured`: cap > 0, `capo-history.json` rỗng. Nếu ca đó đổ
// về `ok` thì bản vá này TỆ HƠN field ma — nó biến một con số không làm gì thành một dấu
// tick xanh, và không ai đi điều tra một dấu tick xanh.
{
  const L = ' '.repeat(13);
  const DAY = 86400000;
  const NOW = Date.parse('2026-08-07T00:00:00.000Z');
  const at = (d) => new Date(NOW - d * DAY).toISOString();
  //          cap    alert   latest                              mode          có advice?
  const TABLE = [
    [0,    80, null,                                  'off',        true ],  // chưa khai trần
    [50,   80, null,                                  'unmeasured', true ],  // ← ca nguy hiểm nhất
    [50,   80, { usd: 10, days: 7, at: at(90) },      'stale',      true ],  // đo 3 tháng trước
    [50,   80, { usd: 7,  days: 30, at: at(3) },      'ok',         false],  // run-rate $7 = 14%
    [50,   80, { usd: 10, days: 7, at: at(3) },       'alert',      true ],  // $42.9/tháng = 86%
    [50,   80, { usd: 15, days: 7, at: at(3) },       'over',       true ],  // $64.3/tháng = 129%
    [200,  80, { usd: 40, days: 7, at: at(1) },       'alert',      true ],  // $171/tháng = 86%
    [200,  95, { usd: 40, days: 7, at: at(1) },       'ok',         false],  // ngưỡng 95 ⇒ chưa kêu
    [50,   80, { usd: 10, days: 0, at: at(1) },       'unmeasured', true ],  // days=0 ⇒ chia 0
    [50,   80, { usd: 'nhiều', days: 7, at: at(1) },  'unmeasured', true ],  // rác
    [50,   80, { usd: 10, days: 7, at: 'hôm qua' },   'unmeasured', true ],  // ngày không parse được
    ['50', 80, { usd: 7,  days: 30, at: at(3) },      'ok',         false],  // cap dạng chuỗi vẫn đọc được
  ];
  const bad = [];
  for (const [cap, alertAtPercent, latest, wantMode, wantAdvice] of TABLE) {
    const r = budgetStatus({ cap, alertAtPercent, latest, now: NOW });
    const got = `${r.mode}/${Boolean(r.advice)}`;
    const want = `${wantMode}/${wantAdvice}`;
    if (got !== want) bad.push(`cap=${cap} ${JSON.stringify(latest)}: ${got} ≠ ${want}`);
  }
  // `ok` cũng phải mang theo BẰNG CHỨNG — một dòng xanh không kiểm được thì bị bỏ qua.
  const okCase = budgetStatus({ cap: 50, latest: { usd: 7, days: 30, at: at(3) }, now: NOW });
  if (okCase.percent !== 14 || okCase.ageDays !== 3) bad.push(`ok thiếu số đo: percent=${okCase.percent} ageDays=${okCase.ageDays}`);

  if (bad.length) fail.push(`budgetStatus${L} ${bad.length}/${TABLE.length + 1} ca sai: ${bad.join(' | ')}`);
  else ok.push(`budgetStatus${L} ${TABLE.length + 1} ca — khai trần mà CHƯA ĐO là \`unmeasured\`, không phải "ổn"`);

  // Doctor in bằng một bảng tra `mode → dòng`. Thiếu một mode ⇒ nó in `undefined` — và đó là
  // ca KHÔNG bảng thuần nào ở trên bắt được, vì lỗi nằm ở chỗ HIỂN THỊ. Không dựng repo có
  // `cap > 0` được (`harness.config.json` là vùng cấm), nên đối chiếu bằng mã nguồn.
  const MODES = ['off', 'unmeasured', 'stale', 'ok', 'alert', 'over'];
  const doc = readFileSync(repoPath('tooling', 'harness-doctor.mjs'), 'utf8');
  const budgetBlock = doc.slice(doc.indexOf('── NGÂN SÁCH ──'));
  const missing = MODES.filter(m => !new RegExp(`^\\s{4}${m}:`, 'm').test(budgetBlock));
  if (missing.length) fail.push(`budgetStatus${L} harness-doctor thiếu dòng cho mode: ${missing.join(' · ')} — sẽ in \`undefined\``);
  else ok.push(`budgetStatus${L} harness-doctor có dòng cho cả ${MODES.length} mode (không mode nào in \`undefined\`)`);
}

// ─── pack.json: MỌI field được ghi phải có bên ĐỌC ───────────────────────────
//
// Đây là bất biến GIỮA HAI FILE — không lint rule nào biểu diễn được, và một comment
// "nhớ cập nhật cả hai đầu" là đúng thứ đã thất bại: `upstream.mjs:150` ghi rõ tác giả
// BIẾT fixlog mới là payload có giá trị, rồi vẫn xây đúng một nửa kênh.
//
// Đo 2026-08-07 trước bản vá: `direction` · `evals` · `artifacts` · `mechanismDiffs` được
// GHI mà không nơi nào ĐỌC, cộng cả file `fixlog.md` và thư mục `mechanism-diffs/`.
// Chiều LÊN là chiều dễ tắt nhất của vòng học vì im lặng là trạng thái bình thường của nó.
{
  const L = ' '.repeat(9);
  const src = readFileSync(repoPath('tooling', 'knowledge', 'upstream.mjs'), 'utf8');
  // Cắt đúng object literal ghi vào pack.json, rồi lấy key ở cấp một.
  const m = src.match(/writeFileSync\(join\(DEST, 'pack\.json'\), JSON\.stringify\(\{([\s\S]*?)\n\}, null, 2\)/);
  if (!m) {
    fail.push(`pack.json ↔ PACK_SCHEMA${L} không tìm thấy chỗ upstream.mjs ghi pack.json — test này đã mất neo, sửa regex`);
  } else {
    // `key: value` VÀ shorthand `key,` — bỏ sót dạng shorthand thì `sourceCommit`, cái neo
    // của toàn bộ phép đếm "đã quyết", lọt lưới đúng cái hợp đồng này sinh ra để giữ.
    const written = [...m[1].matchAll(/^ {2}(\w+)\s*[:,]/gm)].map(x => x[1]);
    const declared = Object.keys(PACK_SCHEMA);
    const orphan = written.filter(k => !declared.includes(k));
    const ghost = declared.filter(k => !written.includes(k));
    const empty = declared.filter(k => !PACK_SCHEMA[k]);
    const bad = [
      ...orphan.map(k => `\`${k}\` được GHI mà không khai bên đọc`),
      ...ghost.map(k => `\`${k}\` khai ở PACK_SCHEMA mà upstream không còn ghi`),
      ...empty.map(k => `\`${k}\` khai bên đọc rỗng — bảng này KHÔNG nhận ô trống`),
    ];
    if (!written.length) bad.push('không bóc được key nào — regex hỏng, không phải "pack rỗng"');
    if (bad.length) fail.push(`pack.json ↔ PACK_SCHEMA${L} ${bad.join(' · ')}`);
    else ok.push(`pack.json ↔ PACK_SCHEMA${L} ${written.length} field, field nào cũng khai được BÊN ĐỌC`);
  }
}

// ─── packPending / packMaterial: một pack 0 bài học KHÔNG phải pack rỗng ──────
//
// Ba công cụ từng trả lời "có việc gì đang chờ?" bằng ba định nghĩa (issue #61):
//   doctor = có THƯ MỤC `lessons/` · accept = có FILE `.md` trong đó · rituals = `sourceCommit`
//   chưa vào `DECISIONS.log`. Pack `lessons: []` ⇒ doctor nói "1 pack — quyết đi", accept nói
//   "Không có gì". Người tin cái nói không-có-gì, và 20 mục fixlog nằm đó mãi.
{
  const L = ' '.repeat(11);
  const P = (o) => ({ sourceCommit: 'abc123', ...o });
  const bad = [];
  const eq = (name, got, want) => { if (got !== want) bad.push(`${name}: ${got} ≠ ${want}`); };

  // ① pack KHÔNG bài học mà CÓ fixlog vẫn là pack có nguyên liệu — ca thật của #61
  eq('fixlog-only.total', packMaterial({ lessons: [], fixlogEntries: 20 }).total, 20);
  // ② diff cơ chế cũng là nguyên liệu — phần issue #61 bỏ sót
  eq('diff-only.total', packMaterial({ mechanismDiffs: [{ rel: 'a' }, { rel: 'b' }] }).total, 2);
  // ③ pack thật sự rỗng
  eq('empty.total', packMaterial({ lessons: [], fixlogEntries: 0 }).total, 0);
  // ④ rác không được cộng vào (chuỗi, số âm, null)
  eq('rác.total', packMaterial({ lessons: 'nhiều', fixlogEntries: -3, evals: null }).total, 0);
  // ⑤ commit đã vào sổ ⇒ ĐÃ quyết. Pack là snapshot, đếm sự TỒN TẠI thì đỏ vĩnh viễn.
  eq('đã-quyết', packPending([P()], 'ACCEPT\tx\tp@abc123\tok').count, 0);
  // ⑥ commit chưa vào sổ ⇒ chờ
  eq('chưa-quyết', packPending([P()], '').count, 1);
  // ⑦ KHÔNG đọc được commit ⇒ coi là CHƯA quyết, thà nhắc thừa còn hơn im lặng bỏ qua
  eq('không-commit', packPending([{ name: 'x' }], 'abc123').count, 1);
  // ⑧ `material` cộng qua các pack CHỜ, không cộng pack đã quyết
  eq('material', packPending([P({ fixlogEntries: 7 }), P({ sourceCommit: 'z9', lessons: [1, 2] })],
    'ACCEPT\tx\tp@z9\tok').material, 7);

  if (bad.length) fail.push(`packPending/packMaterial${L} ${bad.length}/8 ca sai: ${bad.join(' | ')}`);
  else ok.push(`packPending/packMaterial${L} 8 ca — pack 0 bài học mà có fixlog/diff vẫn là pack CÓ nguyên liệu`);
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
    fixlogTotal: 0, fixlogRepeated: 0, learningsNewerThanLessons: 0,
    skillCount: 5, maxSkills: 12, worktrees: 1, maxWorktrees: 4, pendingPacks: 0,
    claudeCodeVersion: '2.1.221', reviewedClaudeCode: '2.1.221', reviewedClaudeCodeAt: '2026-08-05T00:00:00.000Z',
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
// chữ thường. Kết quả đo 2026-08-06: `--audit` đỏ với `docs/progress/vong-hoc-2026-W32.md`
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
  ];
  const bad = [];
  for (const [cmd, want, label] of TABLE) {
    const got = Boolean(dangerousCommand(cmd, RULES));
    if (got !== want) bad.push(`${label}: ${got ? 'CHẶN' : 'qua'}, mong đợi ${want ? 'CHẶN' : 'qua'}`);
  }
  if (bad.length) fail.push(`dcg khớp lệnh${L} ${bad.length}/${TABLE.length} ca sai: ${bad.join(' | ')}`);
  else ok.push(`dcg khớp lệnh${L} ${TABLE.length} ca — 5 lần chặn nhầm ĐÃ ĐO đều đi qua, 5 biến thể nguỵ trang đều bị chặn`);

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
  const referenced = [...src.matchAll(/[)\w]\.budget\??\.([A-Za-z][A-Za-z0-9_]*)/g)].map(m => m[1]);
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
{
  const L = ' '.repeat(9);
  const r = spawnSync(process.execPath, [repoPath('tooling', 'gates.mjs'), '--list', '--timing'], {
    encoding: 'utf8', cwd: repoPath(''), env: { ...process.env, ...TEST_ENV },
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
  const realLog = repoPath('.claude', 'telemetry', 'gate-runs.log');
  const lines = () => (exists(realLog) ? readFileSync(realLog, 'utf8').split('\n').length : 0);
  const before = lines();
  spawnSync(process.execPath, [repoPath('tooling', 'gates.mjs'), '--list', '--timing'], {
    encoding: 'utf8', cwd: repoPath(''),
  });
  const after = lines();
  if (after !== before) bad.push(`phép đo sàn ghi ${after - before} dòng vào gate-runs.log THẬT — công cụ đo đang làm nhiễu số của chính nó (#66)`);

  if (bad.length) fail.push(`gates sàn runner${L} ${bad.join(' · ')}`);
  else ok.push(`gates sàn runner${L} stage rỗng báo sàn ${ms}ms bằng SỐ, vẫn nói rõ việc thật chưa đo, và không ghi vào sổ thật`);
}

// ─── File ĐƯỢC SHIP không được trích đường dẫn KHÔNG được ship ───────────────
//
// Hợp đồng hai đầu, cùng khuôn với `PACK_SCHEMA`: `apply-to.mjs` quyết cái gì xuống repo con,
// và mọi file đi cùng phải tôn trọng quyết định đó.
//
// Đo 2026-08-07 ở `sakubun`: §9b báo `docs/progress/vong-hoc-2026-W32.md` là đường dẫn chết,
// bị `tooling/apply-to.mjs` và `tooling/harness-doctor.mjs` trỏ tới. Hai file đó ĐƯỢC ship;
// nhật ký thì KHÔNG (`apply-to` IGNORE `^docs/progress/(?!_)`). Nên một comment trích dẫn
// dạng đường dẫn ở đó thành con trỏ chết ở **mọi repo tiêu thụ**, mãi mãi — trong khi ở
// template nó xanh, vì ở template file đó có thật.
//
// Đây là ca không công cụ nào ở phía template thấy được: nó chỉ hiện ra SAU KHI phân phối.
// Bắt nó ở đây rẻ hơn bắt nó ở repo người khác.
{
  const L = ' '.repeat(6);
  // Hai thư mục `apply-to.mjs` cố ý KHÔNG ship (khuôn `_`-prefix thì có).
  // Đòi hẳn TÊN FILE `.md`: một tham chiếu tới THƯ MỤC (`.claude/learnings/`) là hợp lệ —
  // thư mục đó CÓ ở repo con vì khuôn `_TEMPLATE.md` được ship. Chỉ tên file cụ thể mới chết.
  const UNSHIPPED = /(docs\/progress\/(?!_)[A-Za-z0-9_-]+\.md|\.claude\/learnings\/(?!_TEMPLATE)[A-Za-z0-9_-]+\.md)/g;
  const shippedFiles = git(['ls-files', 'tooling', '.claude/hooks', '.claude/skills']).stdout
    .split('\n').filter(Boolean).filter(f => /\.(mjs|md)$/.test(f) && !f.startsWith('tooling/test-'));
  const offenders = [];
  for (const f of shippedFiles) {
    let txt = ''; try { txt = readFileSync(repoPath(f), 'utf8'); } catch { continue; }
    for (const m of txt.matchAll(UNSHIPPED)) offenders.push(`${f} → ${m[1]}`);
  }
  if (!shippedFiles.length) {
    fail.push(`ship ↔ trích dẫn${L} không liệt kê được file được ship — neo của ca này đã trôi`);
  } else if (offenders.length) {
    fail.push(`ship ↔ trích dẫn${L} ${offenders.length} chỗ trích đường dẫn KHÔNG được ship: ${offenders.slice(0, 3).join(' · ')}`
      + ` — ở repo tiêu thụ chúng là con trỏ chết VĨNH VIỄN. Viết tên nhật ký bằng chữ, đừng viết thành đường dẫn.`);
  } else ok.push(`ship ↔ trích dẫn${L} ${shippedFiles.length} file được ship, không file nào trích nhật ký/learnings dạng đường dẫn`);
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
  if (/KHÔNG TỒN TẠI/.test(out)) bad.push(`repo có đường dẫn chết: ${out.split('\n').find(l => l.includes('KHÔNG TỒN TẠI'))?.trim().slice(0, 90)}`);

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
// `harness-migrations/README.md` đã ghi luật này từ đầu ("Thêm hook mới → CÓ, migration phải
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
let skipped = 0;
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
  if (!events.length) fail.push('settings.json không khai sự kiện hook nào — không có gì để kiểm');
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
    const tmp = repoPath('.claude', 'hooks', '.failmode.tmp.mjs');
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

// SỐ MẪU không phải một phép cộng viết tay. Bản trước in
// `ok.length / (cases + MUTANTS + GATE_CASES + 3)` và ĐO ĐƯỢC 2026-08-05: **`75/72`** — tử số
// lớn hơn mẫu số. Tỉ số đó không sai vô hại: mẫu số tồn tại để trả lời "có case nào NGỪNG
// CHẠY không", và một mẫu số đã trôi thì không trả lời được gì nữa — nó lớn hơn hay nhỏ hơn
// tổng thật đều đọc như nhau. `+3` là mấy khối assert rời thêm sau mà không ai cộng lại.
//
// Hai con số, hai việc khác nhau: TỔNG THẬT là `ok+fail` (mô tả), RATCHET là sàn (cưỡng chế).
// Sàn là thứ DUY NHẤT ở đây thấy được một case biến mất — nâng nó khi thêm case.
//
// Sàn tính CẢ `skipped`. Bản 2.8.0 không tính, và nó đỏ ở CẢ BA repo tiêu thụ ngay trong lần
// phát hành: case "đường phân phối" chỉ chạy ở template, nên ở project đích tổng là 75 < sàn
// 76 ⇒ FAIL, exit 1. Đó đúng là `knowledge/lessons/0003` — self-test của template assert một
// thứ chỉ đúng trong repo template — và nó xảy ra TRONG bản vá viết ra để chống lớp lỗi đó.
// Bài học thật: một sàn phải cộng ĐỦ BA giá trị (chạy + bỏ qua có chủ ý), nếu không "n/a" bị
// gộp vào "0" — chính phép gộp mà AGENTS.md cấm.
const RATCHET = 174;
const ran = ok.length + fail.length;
// `na` = ca KHÔNG DỰNG ĐƯỢC ở hình dạng checkout này (HEAD detached). Cộng vào tổng cùng lý
// do `skipped` được cộng: nếu không, một môi trường thiếu điều kiện đọc y hệt một case vừa
// NGỪNG CHẠY, và sàn — thứ tồn tại để phân biệt hai chuyện đó — sẽ báo nhầm.
const naCount = CUR_BRANCH ? 0 : 3;
const total = ran + skipped + naCount;
if (total < RATCHET) {
  fail.push(`chỉ có ${total} khẳng định (${ran} chạy + ${skipped} bỏ qua + ${naCount} không dựng được), sàn là ${RATCHET} — một case đã `
    + `NGỪNG CHẠY (hook thiếu file? khối bị throw sớm?). Đây là chế độ hỏng mà một suite "xanh 100%" che kín nhất.`);
}
console.log(`\n=== HOOK TESTS (${ok.length}/${ran} pass`
  + `${skipped ? ` · ${skipped} n/a (chỉ chạy ở repo template)` : ''}`
  + `${naCount ? ` · ${naCount} n/a (không dựng được ở hình dạng checkout này)` : ''}, sàn ${RATCHET}) ===`);
for (const m of ok) console.log('  PASS  ' + m);
for (const m of na) console.log('  n/a   ' + m);
for (const m of fail) console.log('  FAIL  ' + m);
console.log('');

process.exit(fail.length ? 1 : 0);
