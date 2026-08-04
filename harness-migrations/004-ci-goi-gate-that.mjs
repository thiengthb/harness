/**
 * v2.0.0 → v2.1.0
 *
 * `ci.yml` trước 2.1.0 có ba bước là `echo "CHANGEME"` — job `verify`, job `e2e`, và
 * bước "Quét secret" trong job `security`. Chúng LUÔN XANH. Ghép với
 * docs/BRANCH-PROTECTION.md (dạy đặt các check thành `required`) thì kết quả là những
 * dấu tick xanh gác một cửa không có ai đứng — tệ hơn không có CI, vì không có CI thì
 * người ta BIẾT là không có.
 *
 * Bản 2.1.0 nối chúng vào cơ chế đã có: `node tooling/gates.mjs --stage preMerge` và
 * `node tooling/precommit-scan.mjs --all`.
 *
 * VÌ SAO CẦN MIGRATION CHỨ KHÔNG CHỈ COPY FILE. `ci.yml` mới mang theo một CỬA THOÁT
 * (`HARNESS_ALLOW_SKIPPED_GATES: '1'`) chỉ đúng cho REPO TEMPLATE, nơi `commands` rỗng
 * là placeholder và không có dòng đó thì CI template đỏ vĩnh viễn. Copy nguyên xi sang
 * project THẬT là mang một cái lỗ tới đúng chỗ nguy hiểm nhất: gate bị bỏ qua vẫn xanh.
 *
 * `upgrade.mjs` copy file TRƯỚC rồi mới chạy migration, nên đây là chỗ đúng để xoá nó.
 * Nếu không xoá, `harness-doctor` sẽ báo CHẶN (nó đối chiếu cửa thoát với
 * `.claude/harness-manifest.json`) — nhưng "đến rồi bị chặn" tệ hơn "đến đã đúng".
 *
 * Regex KHÔNG dùng `[\s\S]*?`: nó neo chính xác vào `env:` ở 4 space, rồi các dòng
 * comment ở 6 space, rồi đúng dòng biến. Một lazy match ở đây sẽ ăn sang bước `steps:`
 * nếu ai đó đổi thứ tự — và bài học `test-migrations.mjs` điều kiện ④ là regex ăn quá
 * nhiều thì migration im lặng làm hỏng file.
 */

export const version = '2.1.0';
export const description = 'ci.yml gọi gate THẬT; xoá cửa thoát HARNESS_ALLOW_SKIPPED_GATES ở project đích';

const HATCH = /\n {4}env:\n(?: {6}#[^\n]*\n)* {6}HARNESS_ALLOW_SKIPPED_GATES: '1'\n/;

/**
 * Kết quả mong đợi, khai cho `test-migrations.mjs` điều kiện ⑤.
 *
 * Bốn điều kiện tổng quát KHÔNG bắt được lỗi của migration này: ②④ chỉ nhìn JSON, còn
 * ③ thì một regex ăn tới cuối file vẫn idempotent (lần hai không còn gì để ăn). Đây là
 * chỗ duy nhất biết "vá đúng" nghĩa là gì với file này.
 */
export const expect = {
  file: '.github/workflows/ci.yml',
  mustContain: ['security:', 'node tooling/gates.mjs --stage preMerge', 'node tooling/precommit-scan.mjs --all'],
  mustNotContain: ['HARNESS_ALLOW_SKIPPED_GATES'],
};

export async function up(ctx) {
  const todo = [];
  const ciRel = '.github/workflows/ci.yml';
  const ciPath = ctx.repoPath(ciRel);

  if (!ctx.existsSync(ciPath)) {
    todo.push(`không thấy ${ciRel} — project này dùng CI khác. Bước preMerge phải là MỘT lệnh: `
      + `node tooling/gates.mjs --stage preMerge (KHÔNG liệt kê lại từng lệnh: hai danh sách gate là hai cơ hội lệch nhau)`);
  } else {
    const before = ctx.readFileSync(ciPath, 'utf8');
    const after = before.replace(HATCH, '\n');
    if (after !== before) {
      ctx.writeFileSync(ciPath, after);
      ctx.log(`đã xoá cửa thoát HARNESS_ALLOW_SKIPPED_GATES khỏi ${ciRel} — từ giờ gate bị BỎ QUA sẽ làm CI ĐỎ`);
    } else if (before.includes('HARNESS_ALLOW_SKIPPED_GATES')) {
      // Có chuỗi nhưng không khớp khuôn ⇒ project đã sửa tay. KHÔNG đoán, KHÔNG xoá mù.
      todo.push(`${ciRel} có HARNESS_ALLOW_SKIPPED_GATES ở dạng đã bị sửa tay — xoá tay. `
        + `Giữ nó lại nghĩa là gate bị bỏ qua vẫn cho tick XANH`);
    } else {
      ctx.log(`${ciRel}: không có cửa thoát nào cần xoá`);
    }

    if (/^\s*e2e:\s*$/m.test(after)) {
      todo.push(`${ciRel} còn job \`e2e\` riêng — \`e2e\` là một GATE trong gates.preMerge nên nó đã chạy ở job \`verify\`. `
        + `Xoá job đó HOẶC giữ và bỏ \`e2e\` khỏi gates.preMerge; đừng để cả hai`);
    }
  }

  todo.push('branch protection: BỎ `e2e` khỏi required status checks (job đó không còn tồn tại trong ci.yml của template). '
    + 'Không bỏ thì mọi PR sẽ treo mãi ở "Expected — waiting for status". Khối gh api tái lập được: docs/BRANCH-PROTECTION.md');
  todo.push('harness.config.json → commands: điền cho tới khi `node tooling/gates.mjs --stage preMerge` xanh THẬT. '
    + 'Mỗi lệnh còn rỗng là một gate KHÔNG TỒN TẠI, và giờ nó làm CI ĐỎ thay vì im lặng');

  for (const t of todo) ctx.log(`→ CẦN NGƯỜI: ${t}`);
}
