# harness-migrations/

Script xử lý những thứ mà **copy file không làm được**: đổi tên field trong
`harness.config.json`, chuyển cấu trúc thư mục, tách một file thành nhiều.

`tooling/upgrade.mjs` tự chạy các script có `version` nằm trong khoảng
`(version hiện tại của project, version của template]`, theo thứ tự tăng dần.

> **Vì sao không đặt tên `migrations/`:** project thật gần như chắc chắn đã có
> `migrations/` cho database. Trùng tên gây nhầm lẫn, và `paths.generated` mặc định
> chặn `**/migrations/**` (hook `block-generated-edit` bắt được đúng collision này
> khi thư mục còn tên cũ).

## Khi nào cần viết migration

| Thay đổi | Cần migration? |
|---|---|
| Thêm hook / skill / doc mới | **Không** — copy file là đủ |
| Sửa logic một hook | **Không** |
| Đổi tên field trong `harness.config.json` | **CÓ** — nếu không, hook đọc `undefined` và **fail âm thầm** |
| Đổi cấu trúc thư mục | **CÓ** |
| Đổi format frontmatter của `knowledge/lessons/*.md` | **CÓ** |
| Thêm field bắt buộc vào config | **CÓ** — điền giá trị mặc định |

> Luật: **nếu project không sửa gì mà vẫn hỏng sau khi nâng cấp → cần migration.**

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
`existsSync` · `run` · `log`.

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
