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
import { readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { repoPath, report, exists, git, tmpdir, repoRole, readJson } from './lib/harness.mjs';

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
  HARNESS_TELEMETRY_DIR: join(tmpdir(), 'harness-test-telemetry'),
  // Không có dòng này, mỗi lần chạy suite sẽ ăn mất thông báo `.claude/whats-new.md` của chính
  // bạn: cơ chế đó cố ý chỉ in MỘT LẦN cho mỗi version, nên "đã in rồi" là trạng thái
  // không lấy lại được. Test không được phép tiêu thụ trạng thái thật của người dùng.
  HARNESS_STATE_DIR: join(tmpdir(), 'harness-test-state'),
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
function mutate(hookFile, apply, input, { mayCrash = false } = {}) {
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
    const r = spawnSync(process.execPath, [tmp], {
      input: JSON.stringify(input), encoding: 'utf8', cwd: repoPath(''),
      env: { ...process.env, ...TEST_ENV },
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
  ['protect-feature-files.mjs', { tool_input: { file_path: '' } }, OK, 'path rỗng không làm crash'],
  ['protect-tests.mjs', { tool_input: null }, OK, 'input rác không làm crash'],
];

const ok = [], fail = [];

// Setup hỏng = KHÔNG chạy được case "đã merge". Báo ĐỎ, không im lặng bỏ qua —
// một test bị skip âm thầm đọc y hệt một test đang xanh.
if (!MERGED_REF) fail.push(`SETUP: không dựng được commit fixture cho protect-migrations — ${setupErr || 'không rõ lý do'}`);

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

  // ② ĐƯỜNG HÀNH ĐỘNG — hợp đồng PHỔ QUÁT cho mọi nhánh từ chối.
  //    Kiểm CẢ phần TỪ CHỐI (nói sai ở đâu) LẪN phần GỢI Ý (làm gì bây giờ).
  //    Không có check này thì xoá dòng gợi ý của một hook đi mà cả suite vẫn xanh —
  //    và dòng gợi ý CHÍNH LÀ thứ agent đọc để biết phải làm gì, tức là toàn bộ
  //    giá trị của hook. Một hook chỉ nói "không" là một hook đẩy agent đi đoán.
  if (expect === BLOCK) {
    if (!/BỊ CHẶN/.test(err)) {
      fail.push(`${hook.padEnd(28)} ${label}  →  exit đúng nhưng KHÔNG nói bị chặn. Exit code đúng không phải bằng chứng nổ đúng lý do.`);
      continue;
    }
    if (!/\n\s*→ /.test(err)) {
      fail.push(`${hook.padEnd(28)} ${label}  →  chặn mà KHÔNG có dòng gợi ý "→ ". Agent bị chặn mà không biết làm gì tiếp là agent sẽ đoán.`);
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
];
for (const [hook, apply, input, label] of MUTANTS) {
  const m = mutate(hook, apply, input);
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
const RATCHET = 78;
const ran = ok.length + fail.length;
const total = ran + skipped;
if (total < RATCHET) {
  fail.push(`chỉ có ${total} khẳng định (${ran} chạy + ${skipped} bỏ qua), sàn là ${RATCHET} — một case đã `
    + `NGỪNG CHẠY (hook thiếu file? khối bị throw sớm?). Đây là chế độ hỏng mà một suite "xanh 100%" che kín nhất.`);
}
console.log(`\n=== HOOK TESTS (${ok.length}/${ran} pass${skipped ? ` · ${skipped} n/a (chỉ chạy ở repo template)` : ''}, sàn ${RATCHET}) ===`);
for (const m of ok) console.log('  PASS  ' + m);
for (const m of fail) console.log('  FAIL  ' + m);
console.log('');

process.exit(fail.length ? 1 : 0);
