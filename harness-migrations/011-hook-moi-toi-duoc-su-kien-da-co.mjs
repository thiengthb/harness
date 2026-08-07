/**
 * Hook MỚI trong một sự kiện ĐÃ CÓ thì không có đường nào tới repo đã áp template.
 *
 * Migration `008` giải nửa bài toán: nó cắm những **sự kiện** mà project thiếu. Nhưng khi
 * template thêm một hook vào `PreToolUse` — sự kiện mà mọi repo đã có từ bản đầu — thì 008
 * đọc ra là *"không thiếu sự kiện nào"* và không làm gì. File hook được `apply-to` copy sang
 * (nó nằm trong `MECHANISM_PATHS`), rồi **nằm đó chết**: có mặt trên đĩa, không ai gọi.
 *
 * Đó đúng chế độ hỏng mà 008 mô tả, chỉ ở một độ sâu khác — và nó tệ hơn theo một cách:
 * `harness-doctor` liệt kê hook theo `settings.json`, nên một hook không được đăng ký sẽ
 * **không xuất hiện trong DANH MỤC HOOK**. Nó vắng mặt khỏi chính bảng dùng để phát hiện
 * vắng mặt.
 *
 * ── GỘP THEO LỆNH, KHÔNG THEO VỊ TRÍ
 *
 * Khoá so sánh là chuỗi `command`. Project có thể đã đổi `matcher` của một group, thêm hook
 * riêng, hay sắp xếp lại thứ tự — không cái nào trong số đó được phép bị ghi đè. Chỉ những
 * `command` mà template CÓ và project KHÔNG có mới được thêm, và thêm vào group có cùng
 * `matcher`; không có group nào khớp matcher thì tạo group mới.
 *
 * ── LUẬT MIGRATION SỐ 1: bảo đảm file tồn tại trước khi trỏ con trỏ vào nó
 *
 * Đăng ký `node .claude/hooks/x.mjs` vào một repo không có `x.mjs` là biến một lỗ hổng im
 * lặng thành một lỗi nổ mỗi lần gọi tool. Copy trước, đăng ký sau — cùng thứ tự với 008.
 */
export const version = '2.37.0';
export const description = 'Cắm những hook mà template có nhưng project thiếu, trong các sự kiện project ĐÃ có';

export const expect = {
  file: '.claude/settings.json',
  mustContain: [
    'protect-integration-branch.mjs',
    // Phần của PROJECT phải còn nguyên — đây là rủi ro thật của việc ghi lại một file JSON.
    'permissions', 'ThisIsALocalPermissionTheProjectAdded',
    '$comment_worktree',
  ],
};

/** Rút đường dẫn script harness ra khỏi một chuỗi lệnh. */
function scriptsIn(command) {
  const out = [];
  const re = /((?:\.claude|tooling)\/[\w./-]+\.mjs)/g;
  let m;
  while ((m = re.exec(String(command))) !== null) out.push(m[1]);
  return out;
}

export async function up(ctx) {
  const { repoPath, readJson, writeJson, existsSync, log } = ctx;

  const destPath = repoPath('.claude', 'settings.json');
  if (!existsSync(destPath)) return;   // chưa áp template — apply-to sẽ seed.

  // LUẬT MIGRATION SỐ 2: chỉ dùng năng lực `ctx` có ở bản `upgrade.mjs` CŨ NHẤT còn được đỡ.
  if (typeof ctx.tplPath !== 'function' || typeof ctx.copyFromTemplate !== 'function') {
    log('⚠ upgrade.mjs của project quá cũ (không có `tplPath`) — không đọc được settings.json của '
      + 'template, nên KHÔNG cắm được hook nào. Chạy lại `node tooling/upgrade.mjs` một lần nữa.');
    return;
  }

  const dest = readJson(destPath);
  if (!dest?.hooks) {
    log('⚠ .claude/settings.json không parse được hoặc không có `hooks` — KHÔNG sửa gì.');
    return;
  }
  const tpl = readJson(ctx.tplPath('.claude', 'settings.json'));
  if (!tpl?.hooks) {
    log('⚠ settings.json của template không có `hooks` — bỏ qua. Nếu không, migration này sẽ '
      + 'kết luận "không thiếu gì" từ một nguồn RỖNG, đúng dạng xanh rỗng.');
    return;
  }

  const added = [];
  for (const [event, tplGroups] of Object.entries(tpl.hooks)) {
    if (!(event in dest.hooks)) continue;          // sự kiện thiếu là việc của 008
    const have = new Set();
    for (const g of dest.hooks[event] ?? []) for (const h of g.hooks ?? []) have.add(String(h.command));

    for (const g of tplGroups ?? []) {
      for (const h of g.hooks ?? []) {
        const cmd = String(h.command);
        if (have.has(cmd)) continue;

        // File phải có thật TRƯỚC khi đăng ký.
        let ok = true;
        for (const rel of scriptsIn(cmd)) {
          if (existsSync(repoPath(rel))) continue;
          if (!ctx.copyFromTemplate(rel)) { ok = false; log(`⚠ không mang được ${rel} sang — bỏ qua hook này`); }
        }
        if (!ok) continue;

        const target = (dest.hooks[event] ?? []).find(x => x.matcher === g.matcher);
        if (target) (target.hooks ??= []).push(JSON.parse(JSON.stringify(h)));
        else dest.hooks[event].push({ matcher: g.matcher, hooks: [JSON.parse(JSON.stringify(h))] });
        added.push(`${event}/${cmd}`);
      }
    }
  }

  // Không thiếu gì thì KHÔNG ghi lại file — ghi lại một JSON không đổi nội dung vẫn đổi
  // format, và điều kiện ③ idempotent của `test-migrations` sẽ bắt đúng chuyện đó.
  if (!added.length) return;
  writeJson(destPath, dest);
  log(`✓ cắm ${added.length} hook vào sự kiện đã có: ${added.join(' · ')}`);
}
