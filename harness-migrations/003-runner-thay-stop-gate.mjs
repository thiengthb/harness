/**
 * v1.6.0 → v2.0.0   (ADR 0002, nửa sau)
 *
 * Hai thay đổi BREAKING và hai field config chết cần dọn:
 *
 *   1. `.claude/hooks/stop-gate.mjs` bị XOÁ. Logic đã nằm hết trong
 *      `tooling/gates.mjs --stage stop`, kể cả phần FAIL-ĐÓNG ở phiên không có người
 *      ngồi xem — thứ bản cũ KHÔNG có. Một danh sách gate ở hai chỗ là hai cơ hội để
 *      chúng lệch nhau, và khi lệch thì bản được TIN là bản người đọc gần nhất.
 *   2. `tooling/doctor.mjs` → `tooling/harness-doctor.mjs` (alias còn ở 2.x).
 *      `/doctor` là lệnh NATIVE của Claude Code và làm việc khác.
 *   3. `budget.modelTiering` bị CẮT — không script nào đọc nó.
 *   4. Thêm `gates.subagent`, `limits.maxSkills`, `knowledge.autoMemoryDirectory`.
 *
 * Sửa TEXT chứ không parse-rồi-stringify: `harness.config.json` và `settings.json`
 * có `$comment_*` và định dạng thủ công mà project có thể đã sửa. Ghi đè bằng
 * JSON.stringify sẽ xoá hết chúng.
 */

export const version = '2.0.0';
export const description = 'Stop hook gọi thẳng gates.mjs, xoá stop-gate.mjs, dọn modelTiering, thêm gates.subagent';

export async function up(ctx) {
  const done = [], todo = [];

  // ── 1. Stop hook trỏ vào runner ────────────────────────────────────────────
  const sp = ctx.repoPath('.claude', 'settings.json');
  if (ctx.existsSync(sp)) {
    let s = ctx.readFileSync(sp, 'utf8');
    const before = s;
    s = s.replace(/node \.claude\/hooks\/stop-gate\.mjs/g, 'node tooling/gates.mjs --stage stop');
    if (s !== before) {
      ctx.writeFileSync(sp, s, 'utf8');
      done.push('Stop hook → `node tooling/gates.mjs --stage stop`');
    } else if (!/gates\.mjs --stage stop/.test(s)) {
      // Project đã tự đổi Stop hook thành thứ khác. KHÔNG ghi đè lựa chọn của họ.
      todo.push('`.claude/settings.json` → Stop hook không trỏ vào stop-gate.mjs lẫn gates.mjs. '
        + 'Bạn đã tuỳ biến nó — tự quyết: gate của bạn có FAIL-ĐÓNG ở phiên không người không? '
        + 'Nếu không, xem `tooling/gates.mjs`.');
    }
  }

  // ── 2. Xoá hook đã hết vai ─────────────────────────────────────────────────
  // Xoá SAU khi settings.json đã trỏ đi chỗ khác. Ngược lại thì có một khoảng
  // settings.json trỏ vào file không tồn tại — và một hook không tồn tại là một
  // hook không chặn gì, im lặng.
  const hp = ctx.repoPath('.claude', 'hooks', 'stop-gate.mjs');
  if (ctx.existsSync(hp)) {
    const wired = ctx.existsSync(sp) && /stop-gate\.mjs/.test(ctx.readFileSync(sp, 'utf8'));
    if (wired) {
      todo.push('`.claude/hooks/stop-gate.mjs` vẫn được settings.json gọi — xoá tay sau khi đổi Stop hook.');
    } else {
      ctx.run('git', ['rm', '-q', '--ignore-unmatch', '.claude/hooks/stop-gate.mjs']);
      if (ctx.existsSync(hp)) todo.push('không xoá được `.claude/hooks/stop-gate.mjs` — xoá tay.');
      else done.push('đã xoá `.claude/hooks/stop-gate.mjs` (logic ở tooling/gates.mjs)');
    }
  }

  // ── 3. harness.config.json ─────────────────────────────────────────────────
  const cp = ctx.repoPath('harness.config.json');
  if (!ctx.existsSync(cp)) { ctx.log('không có harness.config.json — bỏ qua phần config'); }
  else {
    let s = ctx.readFileSync(cp, 'utf8');
    const before = s;

    // 3a. CẮT budget.modelTiering — cả comment lẫn khối.
    const MT = /[ \t]*"\$comment_modelTiering":[\s\S]*?\r?\n[ \t]*"modelTiering":\s*\{[\s\S]*?\}[ \t]*,?[ \t]*\r?\n/;
    if (MT.test(s)) {
      s = s.replace(MT, '');
      // Dấu phẩy treo sau khi cắt phần tử cuối của `budget`.
      s = s.replace(/,(\s*\r?\n\s*)\}/g, '$1}');
      done.push('cắt `budget.modelTiering` (field ma — không script nào đọc)');
    }

    // 3b. gates.subagent — CHỈ gate rẻ nhất, ngân sách 5 giây.
    if (!/"subagent"\s*:/.test(s)) {
      const m = s.match(/([ \t]*)"stop"\s*:\s*\[[^\]]*\],?[ \t]*\r?\n/);
      if (m) {
        s = s.replace(m[0], m[0]
          + `${m[1]}"$comment_subagent": "CHỈ gate rẻ nhất. Con số ở đây nhân với tối đa 16 agent song song trong một dynamic workflow.",\n`
          + `${m[1]}"subagent": ["typecheck"],\n`);
        done.push('thêm `gates.subagent` (ngân sách < 5 giây)');
      } else {
        todo.push('không tìm được `gates.stop` để chèn `gates.subagent` — thêm tay: "subagent": ["typecheck"]');
      }
    }

    // 3c. limits.maxSkills — trần theo tầng DISCOVERY, không theo tổng số file.
    if (!/"maxSkills"\s*:/.test(s)) {
      const m = s.match(/([ \t]*)"docStaleDays"\s*:\s*\d+/);
      if (m) {
        s = s.replace(m[0], `${m[0]},\n${m[1]}"maxSkills": 12`);
        done.push('thêm `limits.maxSkills` (đếm skill model TỰ GỌI ĐƯỢC, không phải tổng số file)');
      } else {
        todo.push('không tìm được `limits.docStaleDays` để chèn `maxSkills` — thêm tay: "maxSkills": 12');
      }
    }

    // 3d. knowledge.autoMemoryDirectory — RỖNG là đúng.
    if (!/"autoMemoryDirectory"\s*:/.test(s)) {
      const m = s.match(/([ \t]*)"exportScopes"\s*:\s*\[[^\]]*\]/);
      if (m) {
        s = s.replace(m[0], `${m[0]},\n${m[1]}"autoMemoryDirectory": ""`);
        done.push('thêm `knowledge.autoMemoryDirectory` (để RỖNG — mặc định vendor nằm NGOÀI repo)');
      } else {
        todo.push('không tìm được `knowledge.exportScopes` để chèn `autoMemoryDirectory` — thêm tay: "autoMemoryDirectory": ""');
      }
    }

    if (s !== before) {
      try { JSON.parse(s); } catch (e) {
        throw new Error(`vá harness.config.json xong nhưng JSON không hợp lệ (${e.message}) — KHÔNG ghi. `
          + 'Sửa tay theo HARNESS-CHANGELOG.md §2.0.0, hoặc so với harness.config.json của template.');
      }
      ctx.writeFileSync(cp, s, 'utf8');
    }
  }

  for (const d of done) ctx.log(`✓ ${d}`);
  for (const t of todo) ctx.log(`→ CẦN NGƯỜI: ${t}`);
  if (!done.length && !todo.length) ctx.log('bỏ qua — đã ở trạng thái đích');

  // Hai việc CỐ Ý không tự động, vì cả hai đều cần người quyết:
  ctx.log('→ `tooling/doctor.mjs` đổi tên thành `tooling/harness-doctor.mjs`. Alias còn ở 2.x '
    + '(có cảnh báo), bị XOÁ ở 3.0.0 — cập nhật CI và runbook của bạn.');
  ctx.log('→ 5 sự kiện native mới (SubagentStop · StopFailure · InstructionsLoaded · ConfigChange · Setup) '
    + 'KHÔNG được cắm tự động vào settings.json của bạn. `harness-doctor` sẽ liệt kê cái nào còn trống. '
    + 'ĐỪNG cắm WorktreeCreate/WorktreeRemove — chúng là provisioner, xem ADR 0002.');
}
