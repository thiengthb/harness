<!-- version: 2026-08-04-b -->
<!--
  Thông báo thay đổi harness cho cả team.
  SessionStart hook so `version` ở trên với version người dùng đã xem
  (.claude/state/whats-new-seen.json) và nhắc MỘT LẦN nếu mới hơn.

  Đổi harness mà không thông báo = nửa team hành xử theo rule cũ.
  Mỗi lần merge thay đổi vào .claude/, cập nhật version + viết 3 dòng ở đây.
  Giữ file NGẮN — xoá mục cũ hơn 1 tháng.
-->

## 2026-08-04 — Gate gọi thẳng runner · doctor đổi tên (v2.0.0, BREAKING)

1. **`tooling/doctor.mjs` → `tooling/harness-doctor.mjs`.** `/doctor` là lệnh NATIVE
   của Claude Code và làm việc khác. Alias còn ở 2.x (có cảnh báo), **xoá ở 3.0.0** —
   cập nhật CI/runbook ngay. Và `/entropy-sweep` bước 1 giờ giao cho `/doctor` native.
2. **`.claude/hooks/stop-gate.mjs` đã bị xoá**, `Stop` gọi thẳng
   `node tooling/gates.mjs --stage stop`. Bản cũ thiếu một nhánh: fail-đóng ở phiên
   KHÔNG có người ngồi xem. Thêm gate `subagent` (**ngân sách 5 GIÂY** — nhân với tối
   đa 16 agent song song).
3. **Đừng cắm `WorktreeCreate`/`WorktreeRemove`.** Chúng là provisioner, không phải
   observer: một script advisory ở đó làm `claude --worktree` throw, hoặc làm rò rỉ
   worktree im lặng. `harness-doctor` sẽ chặn nếu bạn thử.
4. **Auto-memory của Claude Code là CHỈ THỊ, không phải ghi chú** — nó nạp 200 dòng đầu
   `MEMORY.md` mỗi phiên. Mâu thuẫn với `knowledge/lessons/` là một LỖI. **Không commit
   nó.** Xem AGENTS.md §Hai bộ nhớ.
5. Chạy suite hook không còn làm nhiễu telemetry của bạn, và không còn ăn mất thông báo
   `/whats-new` này.

BREAKING — làm theo thứ tự: `node tooling/upgrade.mjs <đường-dẫn-template> --apply`
(migration `003` vá tự động, phần cần người thì nó in ra `→ CẦN NGƯỜI:`), rồi
`node tooling/harness-doctor.mjs`.

## 2026-08-04 — Self-test không còn đỏ giả ở project đích (v1.5.0)

1. **`paths.secrets` giờ phủ định được**: `"**/.env.*"` + `"!**/.env.example"`.
   Trước đây pre-commit chặn `.env.example` — file `init.mjs` cần — ngay ở commit đầu.
2. **`--audit` tự bỏ qua** ở project đích (nó là check của repo template). Hết `Template
   coverage FAIL` trong `doctor` và trong CI parity.
3. **`test-hooks` assert logic, không assert config của bạn.** Điền `commands` không còn
   làm test suite đỏ. Cần một trạng thái config thì dùng `HARNESS_CONFIG=<fixture>`.

Không phải BREAKING — không cần làm gì. Muốn nhận bản sửa:
`node tooling/upgrade.mjs <đường-dẫn-template> --apply`

## 2026-08-03 — Bài học giờ đi được NGƯỢC LÊN template (v1.4.0)

1. **`node tooling/knowledge/upstream.mjs <template>`** — gửi bài học + gate + diff
   cơ chế của project này ngược lên template. Trước đây chiều này không tồn tại:
   trí tuệ tích ở project, project mới vẫn khởi động từ số 0.
2. **`node tooling/knowledge/accept.mjs --list`** — duyệt pack nạp về. `--merge <id>`
   cộng bằng chứng từ repo khác vào bài học có sẵn: đó là cách một bài học universal
   đủ ngưỡng "2 lần độc lập", vì mỗi repo chỉ gặp nó một lần.
3. Bài học dạng test/hook/generator giờ nên khai **`evals:`** — gate đi theo bài học.
   Không có gate thì repo nhận có cơ chế mà không kiểm được cơ chế đó.

## 2026-08-03 — Sửa migration KHÔNG còn bị chặn oan (v1.3.0)

1. **Bạn sửa được file trong `migrations/` rồi.** Guard cũ coi mọi migration là
   file generated và chặn hết — sai, vì Rails/Alembic/Django/Flyway đều để bạn viết
   thân file bằng tay.
2. **Chỉ còn chặn migration ĐÃ MERGE** (có trong `origin/main`). Sửa nó làm DB của
   mọi người lệch nhau im lặng. Muốn đổi → viết migration MỚI.
3. Chắc chắn migration đó chưa apply ở đâu? `HARNESS_ALLOW_MIGRATION_EDIT=1` (ghi log).

## 2026-08-03 — Nâng cấp harness giờ AN TOÀN, và một lệnh kiểm tất cả

1. **`node tooling/doctor.mjs`** *(đổi tên thành `tooling/harness-doctor.mjs` ở v2.0.0)* — lệnh DUY NHẤT bạn cần nhớ. Nó gọi mọi kiểm tra
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
