#!/usr/bin/env node
/**
 * Chặn sửa migration ĐÃ MERGE.   PreToolUse trên Write|Edit
 *
 * TẠI SAO HOOK NÀY TỒN TẠI RIÊNG, THAY VÌ COI MIGRATION LÀ "GENERATED":
 *
 * Bản harness đầu tiên nhét glob migrations vào `paths.generated`. Sai, và sai
 * theo kiểu tệ nhất — nó chặn ĐÚNG cái người ta cần làm hằng ngày:
 *
 *   Rails    `rails g migration` sinh KHUNG, thân do bạn viết
 *   Alembic  `alembic revision` sinh khung, `upgrade()`/`downgrade()` do bạn viết
 *   Django   `makemigrations` sinh, nhưng `RunPython` data migration viết tay
 *   Prisma   sinh SQL rồi bạn sửa tay là chuyện thường
 *   Flyway · Liquibase · golang-migrate   SQL viết tay 100%
 *
 * Và khi chặn, nó còn khuyên sai: "sửa NGUỒN rồi chạy gen" — với migration viết
 * tay thì không có nguồn nào để sửa. Một guard bắn nhầm còn tệ hơn không có
 * guard: nó dạy cả team rằng guard là thứ để lách.
 *
 * Cái NGUY HIỂM THẬT không phải "sửa migration" — mà là "sửa migration đã chạy
 * ở nơi khác". Đổi một migration đã merge thì:
 *   · DB của đồng đội và DB của bạn LỆCH NHAU IM LẶNG (không lỗi, chỉ sai dữ liệu)
 *   · Flyway/Liquibase/Alembic fail checksum với thông báo khó hiểu
 *   · staging đã apply bản cũ, không có đường quay lại trừ khi viết migration mới
 *
 * Đó là một ca của "lịch sử chung" (xem .claude/rules/danger-zones.md §3) — cùng
 * họ với force push. Hook này cưỡng chế đúng ca đó, không hơn.
 *
 * ĐÃ MERGE = có mặt trong nhánh tích hợp (mặc định origin/main).
 * File MỚI → luôn cho phép. Đó là 95% việc bạn làm với migration.
 *
 * FAIL OPEN khi không xác định được (chưa có remote, offline, repo mới):
 * đây là cơ chế kỷ luật, không phải ranh giới bảo mật. Guard không trả lời được
 * thì phải im, chứ không được chặn — nếu không nó sẽ chặn suốt trong worktree và CI.
 *
 * CỬA THOÁT:
 *   HARNESS_ALLOW_MIGRATION_EDIT=1  → cho phép, GHI LOG.
 * Dùng khi migration thật sự chưa apply ở đâu (vừa merge, chưa ai pull, chưa deploy).
 */
import {
  hookInput, toolFilePath, toRepoRel, matchAny, pathsFor,
  config, git, block, pass, telemetry, hookRan, currentBranch, declareFailMode,
} from '../../tooling/lib/harness.mjs';

declareFailMode(2, 'Không xác định được migration này đã merge chưa — sửa migration đã merge làm DB lệch nhau im lặng (nhóm 3).');

const rel = toRepoRel(toolFilePath(hookInput()));
if (!rel) pass();

const patterns = pathsFor('migrations');
if (!patterns.length || !matchAny(rel, patterns)) pass();

if (process.env.HARNESS_ALLOW_MIGRATION_EDIT === '1') {
  telemetry('migration-edits', [currentBranch(), rel, process.env.DEV_ID || process.env.USER || '?']);
  console.error(`⚠️  Sửa migration đã merge với cửa thoát: ${rel}`);
  console.error('   Đã ghi .claude/telemetry/migration-edits.log.');
  console.error('   Nếu migration này ĐÃ apply ở bất kỳ đâu ngoài máy bạn: quay lại, viết migration mới.');
  pass();
}

// Nhánh tích hợp.
// KHAI BÁO TƯỜNG MINH THÌ KHÔNG FALLBACK. Nếu bạn nói nhánh tích hợp là `develop`
// mà `develop` không resolve được, việc lặng lẽ quay sang `main` cho câu trả lời
// SAI về "đã merge chưa" — và sai theo hướng chặn nhầm. Không resolve được thì im.
// HARNESS_INTEGRATION_BRANCH thắng config: CI clone nông, hoặc test cần ref tất định.
const configured = process.env.HARNESS_INTEGRATION_BRANCH || config().project?.integrationBranch;
const candidates = configured ? [configured] : ['origin/main', 'origin/master', 'main', 'master'];
const ref = candidates.find(r => git(['rev-parse', '--verify', '--quiet', `${r}^{commit}`]).status === 0);

if (!ref) { hookRan('protect-migrations', 'skip', 'không resolve được nhánh tích hợp'); pass(); }

// Có mặt trong nhánh tích hợp = đã merge.
if (git(['cat-file', '-e', `${ref}:${rel}`]).status !== 0) { hookRan('protect-migrations', 'pass', `migration mới: ${rel}`); pass(); }

telemetry('gate-fails', ['protect-migrations', rel]);
block(
  `${rel} đã có trong ${ref} — migration này ĐÃ MERGE và có thể đã chạy trên DB của người khác.`,
  `Sửa nó làm DB lệch nhau im lặng và làm hỏng checksum của migration runner. ` +
  `Tạo migration MỚI để thay đổi schema/dữ liệu. ` +
  `Nếu migration này CHẮC CHẮN chưa apply ở đâu ngoài máy bạn: đặt HARNESS_ALLOW_MIGRATION_EDIT=1 (sẽ được ghi log).`
);
