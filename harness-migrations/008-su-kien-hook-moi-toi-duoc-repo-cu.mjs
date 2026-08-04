/**
 * Sự kiện hook ra đời SAU khi project đã áp template thì không có đường nào tới nó.
 *
 * ĐO 2026-08-05 trên cả ba repo tiêu thụ (`sakubun` v2.7.9, `sakubun-test`, `warehouse`):
 * `settings.json` có ĐÚNG 4 sự kiện — SessionStart, PreToolUse, PostToolUse, Stop — trong khi
 * template có 9. Năm sự kiện thiếu ở CẢ BA, kể cả repo chỉ đứng sau template một version.
 *
 * VÌ SAO KHÔNG PHẢI LỖI CỦA NGƯỜI DÙNG. `.claude/settings.json` thuộc lớp SEED (tạo một
 * lần, không bao giờ ghi đè) — và đó là quyết định ĐÚNG: project sửa `permissions`,
 * `worktree`, thêm hook riêng của họ vào đó. Nhưng cây con `hooks` thì do HARNESS sở hữu và
 * nó LỚN DẦN. Với một file như vậy, "copy nếu chưa có" là phép sai theo đúng cách mà
 * `.gitignore` từng sai ở 2.5.0: file nào cũng đã tồn tại ⇒ nội dung mới không bao giờ tới.
 *
 * Đây là phép thứ ba của cùng một bài học, ở một hình dạng mới: MERGE THEO KHOÁ.
 *
 * HẬU QUẢ THẬT, không phải giả định:
 *   · StopFailure + InstructionsLoaded → `observe.mjs` được COPY sang project rồi nằm đó
 *     CHẾT. Đó là LỚP KINH TẾ: chỗ duy nhất vendor gọi khi tiền/quota chạm trần. Ở template
 *     nó là dòng "PHIÊN TRƯỚC DỪNG VÌ: rate_limit" mà session-start in ra mỗi phiên; ở ba
 *     repo kia dòng đó không tồn tại, và một agent chạy sai 4 giờ lúc 3h sáng không có gì
 *     dừng lại. `docs/ECONOMICS.md` nói lớp này là lớp DUY NHẤT gây thiệt hại tài chính
 *     trực tiếp — và nó chưa từng được cắm ở bất cứ đâu ngoài template.
 *   · SubagentStop → gate của subagent không chạy. Output của agent con không bị kiểm gì.
 *   · ConfigChange → lớp hai của `protect-harness` mất; file cấu hình đổi bằng đường KHÁC
 *     Write|Edit đi qua tự do.
 *   · Setup → `init.mjs` trở lại thành một dòng trong README mà người ta phải nhớ.
 *
 * VÌ SAO NÓ SỐNG ĐƯỢC LÂU. Cả hai lớp phát hiện đều đã CÓ và đều đã nói đúng:
 * `harness-migrations/README.md` ghi rõ "Thêm hook mới → CÓ, migration phải TỰ ĐĂNG KÝ", và
 * `harness-doctor` in "N/5 điểm mở rộng native còn TRỐNG". Cái thiếu không phải hiểu biết —
 * là một MIGRATION. Một luật chỉ tồn tại dưới dạng văn xuôi thì bị bỏ qua bởi người đang
 * gấp, và người đang gấp luôn tồn tại. Bản vá kèm theo ở `tooling/test-hooks.mjs` biến luật
 * đó thành check tất định: mọi sự kiện trong `settings.json` phải có đường phân phối.
 *
 * KHÔNG chạm gì ngoài các khoá THIẾU. Không sửa entry đã có (project có thể đã đổi matcher
 * hoặc lệnh), không chạm `permissions`, không chạm `worktree`. Điều kiện ⑤ của
 * `test-migrations` khẳng định đúng chỗ đó.
 */
export const version = '2.8.0';
export const description = 'Cắm các sự kiện hook mà template có nhưng project (đã áp từ bản cũ) thiếu';

export const expect = {
  file: '.claude/settings.json',
  mustContain: [
    // Năm sự kiện phải tới được.
    'SubagentStop', 'StopFailure', 'InstructionsLoaded', 'ConfigChange', 'Setup',
    // Và phần của PROJECT phải còn nguyên — đây là rủi ro thật của việc ghi lại một file JSON.
    'permissions', 'ThisIsALocalPermissionTheProjectAdded',
    '$comment_worktree',
  ],
};

/** Rút đường dẫn script harness ra khỏi một chuỗi lệnh: "node tooling/gates.mjs --stage x". */
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
  if (!existsSync(destPath)) return; // chưa áp template — apply-to sẽ seed.

  // LUẬT MIGRATION SỐ 2: chỉ dùng năng lực `ctx` có ở bản `upgrade.mjs` CŨ NHẤT còn được đỡ.
  // `ctx` do bản upgrade.mjs của PROJECT dựng, và `tplPath` chỉ có từ 2.5.0.
  if (typeof ctx.tplPath !== 'function' || typeof ctx.copyFromTemplate !== 'function') {
    log('⚠ upgrade.mjs của project quá cũ (không có `tplPath`) — không đọc được settings.json của '
      + 'template, nên KHÔNG cắm được sự kiện nào. Chạy lại `node tooling/upgrade.mjs` một lần nữa: '
      + 'lần này bản mới đã nằm trong project.');
    return;
  }

  const dest = readJson(destPath);
  if (!dest || typeof dest !== 'object') {
    log('⚠ .claude/settings.json không parse được — KHÔNG sửa gì. Sửa tay rồi chạy lại.');
    return;
  }
  const tpl = readJson(ctx.tplPath('.claude', 'settings.json'));
  if (!tpl?.hooks) {
    log('⚠ settings.json của template không có `hooks` — bỏ qua (nếu không, migration này sẽ '
      + 'kết luận "không thiếu gì" từ một nguồn rỗng, đúng dạng xanh RỖNG).');
    return;
  }

  dest.hooks ??= {};
  const missing = Object.keys(tpl.hooks).filter(ev => !(ev in dest.hooks));

  // Không thiếu gì thì KHÔNG ghi lại file. Ghi lại một file JSON không đổi nội dung vẫn đổi
  // format (thứ tự khoá, thụt lề) — và điều kiện ③ idempotent sẽ bắt đúng chuyện đó.
  if (!missing.length) return;

  // LUẬT MIGRATION SỐ 1: một migration trỏ con trỏ vào một file thì phải BẢO ĐẢM file có
  // thật. Cắm `Setup → node tooling/init.mjs` vào một repo không có `init.mjs` là biến một
  // lỗ hổng im lặng thành một lỗi nổ mỗi phiên.
  const provided = [];
  for (const ev of missing) {
    for (const group of tpl.hooks[ev] ?? []) {
      for (const h of group.hooks ?? []) {
        for (const rel of scriptsIn(h.command)) {
          if (existsSync(repoPath(rel))) continue;
          if (ctx.copyFromTemplate(rel)) provided.push(rel);
        }
      }
    }
  }
  if (provided.length) log(`✓ mang sang ${provided.length} script mà sự kiện mới trỏ vào: ${provided.join(' · ')}`);

  for (const ev of missing) dest.hooks[ev] = JSON.parse(JSON.stringify(tpl.hooks[ev]));

  // `$comment_hooks` là tài liệu do HARNESS viết, và bản v1.x đặt giải thích BÊN TRONG
  // `hooks` — chỗ mà schema của Claude Code không nhận, nên IDE của mọi thành viên hiện
  // cảnh báo đỏ. Chỉ THÊM khi project chưa có; đã có thì để nguyên (có thể họ đã viết thêm)
  // và nói ra rằng nó cũ.
  if (tpl.$comment_hooks && !dest.$comment_hooks) {
    dest.$comment_hooks = tpl.$comment_hooks;
    log('✓ thêm `$comment_hooks` — mọi giải thích về hook ở MỘT chỗ, ngoài `hooks` (schema CC không nhận key lạ trong đó)');
  } else if (tpl.$comment_hooks && dest.$comment_hooks !== tpl.$comment_hooks) {
    log('⚠ `$comment_hooks` của project khác bản template — KHÔNG ghi đè (có thể bạn đã viết thêm). '
      + 'So bằng tay nếu muốn: .claude/settings.json của template.');
  }

  writeJson(destPath, dest);
  log(`✓ cắm ${missing.length} sự kiện hook còn thiếu: ${missing.join(' · ')}`);
  if (missing.includes('StopFailure')) {
    log('✓ LỚP KINH TẾ bật lần đầu ở repo này — `observe.mjs` giờ được vendor GỌI khi tiền/quota '
      + 'chạm trần, và `session-start.mjs` phiên sau sẽ in ra lý do phiên trước dừng.');
  }
}
