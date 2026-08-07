#!/usr/bin/env node
/**
 * Sửa file khi đang đứng trên NHÁNH TÍCH HỢP.   PreToolUse trên Write|Edit
 *
 * Luật đã viết ra HAI LẦN, ở hai artefact người-đọc-đầu-tiên, và KHÔNG gì cưỡng chế nó:
 *   · `AGENTS.md`: "Một issue = một nhánh = một worktree."
 *   · `/claim` bước 1: "Đang ở nhánh `main`? → dừng, tạo nhánh trước khi sửa gì."
 *
 * Đo 2026-08-06, CÙNG MỘT AGENT, CÙNG MỘT NGÀY, HAI LẦN: sửa `tooling/lib/harness.mjs` khi
 * đang ở `main` rồi mới tạo nhánh (trước `8634ecc`, PR #41); tạo `tooling/overlap-scan.mjs`
 * + sửa 4 file khi đang ở `main` rồi mới tạo nhánh (trước `2cb7e1e`, PR #42). `git reflog`
 * cho thấy hai dòng `checkout: moving from main to <nhánh>` xảy ra SAU khi cây đã bẩn.
 *
 * Lần đó MAY: agent tự nhớ ra và tạo nhánh trước khi commit. Chế độ hỏng thật là lần KHÔNG
 * nhớ — lúc đó nó là một commit thẳng lên nhánh tích hợp, hoặc tệ hơn, một `git add -A` cuốn
 * theo file của phiên khác. Đúng sự cố `sakubun` mà header `tooling/rituals.mjs` đã ghi.
 *
 * ── BẮN THEO HÀNH ĐỘNG, ĐỪNG ĐOÁN Ý ĐỊNH
 *
 * "Ghi file đầu tiên trên nhánh tích hợp" là sự kiện TẤT ĐỊNH, quan sát được, xảy ra đúng
 * khoảnh khắc một việc thật sự bắt đầu. Không cần phân loại "người dùng vừa nói thêm tính
 * năng hay chỉ đang hỏi" — phép phân loại đó là inferential control, thứ `AGENTS.md` bắt
 * phải hỏi "có biến thành check tất định được không?" trước khi dùng. Ở đây CÓ.
 *
 * ── FAIL-OPEN, và đó là một quyết định có giá đã đo
 *
 * `declareFailMode(1)`: hook hỏng thì CHO QUA nhưng exit 1 để hiện ra. Đây là guard PHỐI HỢP,
 * không phải guard AN TOÀN — sửa nhầm trên nhánh tích hợp thì hoàn tác được, còn một hook
 * hỏng chặn mọi `Write|Edit` thì bạn không sửa được cả chính nó.
 *
 * Chi phí đó không phải lý thuyết: 2026-08-07, `dcg.mjs` (fail-CLOSED, đúng cho nhóm an toàn)
 * lỗi import và chặn MỌI lệnh Bash trong phiên — kể cả lệnh đi sửa nó. Thoát được nhờ tool
 * `Edit`. Nếu hook NÀY cũng fail-closed, cả `Edit` cũng đóng, và cửa cuối cùng là biến
 * `HARNESS_FAIL_OPEN`.
 *
 * ── CỬA THOÁT LÀ BẮT BUỘC, VÀ NÓ PHẢI ĐẾM ĐƯỢC
 *
 * Sửa tài liệu/changelog thẳng trên nhánh tích hợp là việc HỢP LỆ và hay gặp. Không có cửa
 * thoát thì người ta tắt hook — và lúc đó mất CẢ guard LẪN tín hiệu.
 *
 * Nên cửa thoát ghi sổ, và số lần dùng được đối chiếu với số lần chặn ở `rituals.mjs`:
 * **cửa thoát dùng nhiều hơn nhánh chặn ⇒ GUARD SAI, cắt nó — đừng nới nó.**
 */
import { hookInput, toolFilePath, toRepoRel, currentBranch, config, git, block, pass, telemetry, hookRan, declareFailMode } from '../../tooling/lib/harness.mjs';

declareFailMode(1, 'Không biết đang ở nhánh nào. Đây là guard PHỐI HỢP, không phải guard an toàn: cho qua và NÓI RA, vì một hook hỏng chặn mọi Write|Edit thì chặn cả đường sửa chính nó.');

const file = toolFilePath(hookInput());
if (!file) pass();
const rel = toRepoRel(file);

// Nhánh tích hợp khai ở config dạng `origin/main`; ta đang so với tên nhánh CỤC BỘ.
// `HARNESS_INTEGRATION_BRANCH` thắng config — cùng cửa mà `protect-migrations.mjs` đã mở, vì
// cùng nhu cầu: test cần một ref TẤT ĐỊNH, và nhánh hiện tại thì mỗi lần chạy một khác.
//
// CẮT TIỀN TỐ REMOTE, KHÔNG CẮT ĐOẠN ĐẦU. Bản đầu dùng `.replace(/^[^/]+\//, '')` — nó biến
// `origin/main` thành `main` đúng như ý, NHƯNG cũng biến `feat/44-x` thành `44-x`. Tên nhánh
// có dấu `/` là quy ước của chính repo này (`<type>/<issue>-<slug>`), nên phép cắt đó sai ở
// đúng hình dạng phổ biến nhất. Chỉ cắt khi đoạn đầu THẬT SỰ là một remote.
const remotes = new Set(git(['remote']).stdout.split('\n').map(s => s.trim()).filter(Boolean));
const configured = String(process.env.HARNESS_INTEGRATION_BRANCH || config().project?.integrationBranch || 'origin/main');
const slash = configured.indexOf('/');
const integration = slash > 0 && remotes.has(configured.slice(0, slash)) ? configured.slice(slash + 1) : configured;
const branch = currentBranch();
if (!branch || branch !== integration) { hookRan('protect-integration-branch', 'pass', branch || '(detached)'); pass(); }

if (process.env.HARNESS_ALLOW_MAIN_EDIT === '1') {
  telemetry('main-edits', [branch, rel]);
  hookRan('protect-integration-branch', 'pass', `escape:${rel}`);
  console.error(`⚠️  Sửa trên nhánh tích hợp \`${branch}\` với cửa thoát: ${rel}`);
  console.error('   Đã ghi .claude/telemetry/main-edits.log — nếu cửa thoát dùng nhiều hơn nhánh chặn thì GUARD SAI.');
  pass();
}

telemetry('gate-fails', ['protect-integration-branch', rel]);
block(
  `đang ở nhánh tích hợp \`${branch}\` mà sửa file: ${rel}\n`
  + `   Một issue = một nhánh = một worktree (AGENTS.md). Sửa thẳng ở đây làm việc của bạn\n`
  + `   và việc của phiên khác nằm chung một chỗ, và không ai review được nó.`,
  `tạo nhánh trước: \`git checkout -b <type>/<issue>-<slug>\` — thay đổi trong cây làm việc đi theo bạn, không mất gì.\n`
  + `   Sửa tài liệu/changelog thẳng ở đây là việc hợp lệ: đặt \`HARNESS_ALLOW_MAIN_EDIT=1\` (sẽ được ghi sổ).`
);
