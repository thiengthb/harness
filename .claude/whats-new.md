<!-- version: 2026-08-03-d -->
<!--
  Thông báo thay đổi harness cho cả team.
  SessionStart hook so `version` ở trên với version người dùng đã xem
  (.claude/state/whats-new-seen.json) và nhắc MỘT LẦN nếu mới hơn.

  Đổi harness mà không thông báo = nửa team hành xử theo rule cũ.
  Mỗi lần merge thay đổi vào .claude/, cập nhật version + viết 3 dòng ở đây.
  Giữ file NGẮN — xoá mục cũ hơn 1 tháng.
-->

## 2026-08-03 — Sửa migration KHÔNG còn bị chặn oan (v1.3.0)

1. **Bạn sửa được file trong `migrations/` rồi.** Guard cũ coi mọi migration là
   file generated và chặn hết — sai, vì Rails/Alembic/Django/Flyway đều để bạn viết
   thân file bằng tay.
2. **Chỉ còn chặn migration ĐÃ MERGE** (có trong `origin/main`). Sửa nó làm DB của
   mọi người lệch nhau im lặng. Muốn đổi → viết migration MỚI.
3. Chắc chắn migration đó chưa apply ở đâu? `HARNESS_ALLOW_MIGRATION_EDIT=1` (ghi log).

## 2026-08-03 — Nâng cấp harness giờ AN TOÀN, và một lệnh kiểm tất cả

1. **`node tooling/doctor.mjs`** — lệnh DUY NHẤT bạn cần nhớ. Nó gọi mọi kiểm tra
   khác và tổng hợp thành một bảng có hành động.
2. **Nâng cấp harness không còn ghi đè mù**: `node tooling/upgrade.mjs <template>`.
   File bạn đã sửa được GIỮ NGUYÊN, bản template ghi ra `.new`. Xem `docs/MIGRATION.md`.
3. **`entropy-scan.mjs`** — máy tìm dấu hiệu harness hết hạn: rule thiếu `paths`,
   tài liệu quá hạn, hook đăng ký mà không có test.

Đừng gitignore `.claude/harness-manifest.json` — không có nó, nâng cấp sau này
không phân biệt được "bạn đã sửa" với "template đã đổi".

## 2026-08-03 — Lớp kinh tế, bảo vệ test, và cửa thoát DRI

1. **Hook mới `protect-tests`** — chặn khi bạn ghi một file test có ÍT assertion/test
   block hơn bản trên đĩa. Sửa CODE cho test pass, đừng sửa test cho code pass.
   Xoá test đã lỗi thời thật thì thêm comment `harness-allow-test-shrink`.
2. **Cửa thoát DRI**: `HARNESS_DRI=1` cho phép sửa file harness và **ghi log** vào
   `.claude/telemetry/harness-edits.log`. Dùng khi bạn CHỦ Ý bảo trì harness.
3. **Lớp kinh tế**: `harness.config.json → budget` (cap turn/wall-clock/tool-call)
   và `node tooling/capo-report.mjs`. Đọc `docs/ECONOMICS.md`.

Tài liệu mới: `ROADMAP-30D` (làm gì tuần nào) · `ANTI-PATTERNS` (tra cứu khi có gì
đó sai) · `ARCHITECTURE` · `RECOVERY` · `TEAM` · `MULTI-PROJECT`.

## 2026-08-03 — Harness baseline v1

Ba thứ bạn cần biết ngay:

1. **Hook sẽ chặn bạn** khi sửa file generated, file secret, hoặc `.claude/settings.json`.
   Đó là cố ý. Đọc thông báo, làm theo. Nếu bạn nghĩ hook sai → `/harness-propose`, **đừng tự tắt hook**.
2. **Nghi thức**: `/claim` khi bắt đầu · `/handoff` khi kết thúc · `/pre-merge` trước khi mở PR.
3. **Trần song song 2 session/người.** Muốn nhanh hơn thì làm PR nhỏ hơn, đừng thêm session.

Chưa cấu hình `harness.config.json` → gate rỗng → harness này chỉ là trang trí. Làm việc đó trước.
