# harness-migrations/

Script xử lý những thứ mà **copy file không làm được**: đổi tên field trong
`harness.config.json`, chuyển cấu trúc thư mục, tách một file thành nhiều.

`tooling/upgrade.mjs` tự chạy các script có `version` nằm trong khoảng
`(version hiện tại của project, version của template]`, theo thứ tự tăng dần.

> **Vì sao không đặt tên `migrations/`:** project thật gần như chắc chắn đã có
> `migrations/` cho database. Trùng tên gây nhầm lẫn cho cả người và agent, và
> `paths.migrations` mặc định khớp `**/migrations/**` — thư mục này sẽ dính guard
> `protect-migrations` một cách vô nghĩa.
>
> Collision đó là chuyện có thật, không phải giả định: bản v1.2.0 đặt tên thư mục
> này là `migrations/` và bị chính hook của mình chặn. Xem
> `knowledge/lessons/0002-guard-ban-nham.md`.

## Khi nào cần viết migration

| Thay đổi | Cần migration? |
|---|---|
| Thêm **hook** mới | **CÓ** — xem cạm bẫy ngay dưới |
| Thêm skill / agent mới (lớp cơ chế) | **Không** — copy file là đủ |
| Thêm **nội dung seed** mới (eval task, doc, rule) | **CÓ** — dùng `ctx.copyFromTemplate` |
| Sửa logic một hook | **Không** |
| Đổi tên field trong `harness.config.json` | **CÓ** — nếu không, hook đọc `undefined` và **fail âm thầm** |
| Đổi cấu trúc thư mục | **CÓ** |
| Đổi format frontmatter của `knowledge/lessons/*.md` | **CÓ** |
| Thêm field bắt buộc vào config | **CÓ** — điền giá trị mặc định |

> Luật: **nếu project không sửa gì mà vẫn hỏng sau khi nâng cấp → cần migration.**

### Cạm bẫy: thêm hook mới thì phải TỰ ĐĂNG KÝ

`.claude/settings.json` thuộc lớp **NỘI DUNG** — `upgrade.mjs` không bao giờ ghi đè
nó (project sửa được `permissions`, `worktree`, hook riêng…). Nên copy file hook
sang project là **chưa đủ**: hook nằm đó chết, và bạn tưởng guard đang chạy.

Migration thêm hook phải chèn vào `settings.json`, idempotent:

```js
const raw = ctx.readFileSync(ctx.repoPath('.claude', 'settings.json'), 'utf8');
if (raw.includes('ten-hook')) { ctx.log('đã đăng ký sẵn'); return; }
const s = JSON.parse(raw);
const g = s.hooks?.PreToolUse?.find(g => /Write/.test(g.matcher || ''));
if (!g) { ctx.log('⚠ không tìm thấy nhóm — đăng ký tay: ...'); return; }
g.hooks.push({ type: 'command', command: 'node .claude/hooks/ten-hook.mjs' });
ctx.writeFileSync(..., JSON.stringify(s, null, 2) + '\n', 'utf8');
```

Xem bản đầy đủ ở `001-migration-khong-phai-generated.mjs`.
`tooling/entropy-scan.mjs` bắt được cả hai chiều — hook đăng ký mà thiếu file,
và file hook mà không đăng ký.

## Khuôn

```js
// harness-migrations/003-doi-ten-hot-thanh-hotspots.mjs
export const version = '1.3.0';
export const description = 'paths.hot → paths.hotspots';

export async function up(ctx) {
  const p = ctx.repoPath('harness.config.json');
  const cfg = ctx.readJson(p);
  if (!cfg?.paths?.hot) { ctx.log('không có paths.hot — bỏ qua'); return; }
  cfg.paths.hotspots = cfg.paths.hot;
  delete cfg.paths.hot;
  ctx.writeJson(p, cfg);
  ctx.log(`đã chuyển ${cfg.paths.hotspots.length} pattern`);
}
```

`ctx` có: `repoPath` · `readJson` · `writeJson` · `readFileSync` · `writeFileSync` ·
`existsSync` · `run` · `log` · **`tplPath`** · **`copyFromTemplate`**.

`copyFromTemplate(rel, { overwrite = false })` là cách SEED nội dung mới vào project.
Cần vì `upgrade.mjs` chỉ cập nhật lớp **cơ chế** — một file lớp **nội dung** mới của
template (eval task seed, doc, rule) sẽ không tự tới được project đã áp. Trả `false`
nếu file đã tồn tại (không ghi đè nội dung của project). Xem `002-gate-di-theo-bai-hoc.mjs`.

## Ràng buộc cấu trúc: migration chạy dưới `upgrade.mjs` của version TRƯỚC

Bạn chạy `node tooling/upgrade.mjs <template>` **từ trong project**, nên đó là bản
copy của project — tức bản của version **cũ**. Nó copy file cơ chế mới xuống đĩa
(kể cả chính `upgrade.mjs`), rồi mới chạy migration — nhưng module đã nạp vào bộ nhớ
vẫn là code cũ, và `ctx` do code cũ dựng.

**Hệ quả: một migration cho version N không được dùng tính năng `ctx` thêm ở version N.**
Nó chỉ dùng được `ctx` của version ≤ N-1. Cải tiến `ctx` luôn có hiệu lực chậm một
version — và không có cách nào tránh, kể cả tự re-exec, vì logic re-exec cũng nằm
trong bản mới không được chạy.

Ba cách xử lý, theo thứ tự ưu tiên:

1. **Thêm tính năng `ctx` một version TRƯỚC migration cần nó.** Sạch nhất.
2. **Migration phòng thủ**: `typeof ctx.foo === 'function' ? ... : <đường lùi>`.
   Đường lùi hay dùng: `.claude/harness-manifest.json → source` ghi đường dẫn
   template lúc áp gần nhất. Xem `002-gate-di-theo-bai-hoc.mjs`.
3. **Log cách làm tay** khi cả hai không được. Migration thất bại phải nói cách sửa.

Phát hiện này đến từ test E2E, không từ đọc code — `ctx.copyFromTemplate` được thêm
ở v1.4.0 và migration v1.4.0 gọi nó thì nhận `is not a function`.

## Ba luật

1. **Idempotent.** Chạy 2 lần cho cùng kết quả. Kiểm trạng thái trước khi sửa —
   project có thể đã ở trạng thái đích.
2. **Không bao giờ xoá dữ liệu của project.** Đổi tên, di chuyển, thêm mặc định —
   nhưng không xoá nội dung. Buộc phải xoá thì ghi bản sao `.bak` và `log` rõ.
3. **Migration thất bại phải nói CÁCH SỬA TAY.**
   `throw new Error('... — sửa tay: ...')`. Người đang nâng cấp cần biết làm gì tiếp,
   không chỉ biết là hỏng.

## Test

Migration không có test là code **chạy một lần trên repo người khác**.
Tối thiểu: chạy `upgrade.mjs` lên một bản copy của project thật trước khi tag version.
