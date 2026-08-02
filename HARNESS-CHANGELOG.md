# Changelog của lớp harness

> Đây là **hợp đồng nâng cấp** giữa template và các project đã áp nó.
> `tooling/upgrade.mjs` đọc file này để biết cần chạy migration nào và cảnh báo gì.
>
> Format: mỗi version một mục `## x.y.z`. Mục **BREAKING** là bắt buộc đọc.
>
> - **major** — cần migration thủ công hoặc đổi hành vi mà project phải biết
> - **minor** — thêm cơ chế mới, tương thích ngược
> - **patch** — sửa lỗi, không đổi interface

---

## 1.3.0 — 2026-08-03

### BREAKING (hành vi guard đổi — đọc kỹ)

- **Migration KHÔNG còn bị coi là file generated.** `**/migrations/**` bị bỏ khỏi
  `paths.generated`. Trước đây mọi sửa đổi trong `migrations/` đều bị chặn kèm lời
  khuyên **sai** ("sửa nguồn rồi chạy gen") — trong khi Rails, Alembic, Django data
  migration, Prisma, Flyway, Liquibase và golang-migrate đều để bạn viết thân file
  bằng tay. Guard bắn nhầm hằng ngày dạy cả team rằng guard là thứ để lách.
- **Thay bằng `.claude/hooks/protect-migrations.mjs`** — chỉ chặn đúng ca nguy hiểm:
  sửa migration **đã có trong nhánh tích hợp** (= đã merge, có thể đã chạy trên DB
  của người khác). Migration mới luôn được phép.
- Migration `001-migration-khong-phai-generated.mjs` tự vá config của bạn.
  **Nếu project bạn thật sự SINH migration** và không muốn ai sửa tay: chuyển glob
  đó ngược lại vào `paths.generated`.

### Thêm

- `paths.migrations` và `project.integrationBranch` trong `harness.config.json`.
- Biến môi trường `HARNESS_INTEGRATION_BRANCH` — đè config; dùng cho team dùng
  `develop`, CI clone nông, và test cần ref tất định.
- Cửa thoát `HARNESS_ALLOW_MIGRATION_EDIT=1`, có ghi log vào
  `.claude/telemetry/migration-edits.log`.
- Test runner nhận `env` theo từng case, và **báo đỏ khi setup hỏng** thay vì
  im lặng bỏ qua case. 46 → 52 case.

### Sửa

- `.claude/rules/README.md` và `danger-zones.md` gọi tên **ba nhóm nguy hiểm khác
  nhau** ("migration đã merge" vs "lịch sử chung"). Nay thống nhất: ba nhóm là
  production · secret · lịch sử chung, và migration đã merge là một ca của nhóm ba.
- Khai báo nhánh tích hợp tường minh mà không resolve được thì **không fallback ngầm**
  sang `main` nữa — trả lời sai về "đã merge chưa" theo hướng chặn nhầm.

## 1.2.0 — 2026-08-03

### Thêm

- **Hệ migration**: `harness.version` · `tooling/upgrade.mjs` · `migrations/` ·
  `.claude/harness-manifest.json`. Project nâng cấp bằng một lệnh và **được cảnh báo**
  thay vì bị ghi đè im lặng.
- **`tooling/doctor.mjs`** — một lệnh kiểm sức khoẻ toàn bộ harness.
- **`tooling/entropy-scan.mjs`** — phần máy kiểm được của `/entropy-sweep`:
  tài liệu quá hạn, rule thiếu `paths`/`owner`, skill trỏ tới lệnh không tồn tại,
  bài học quá hạn review hoặc đã đạt điều kiện thoát.
- **Eval nối được với agent** qua `harness.config.json → evals.command`, cộng 3 task
  seed chạy được ở mọi repo.

### Không breaking

Mọi thay đổi đều là thêm mới. Project ở 1.1.0 nâng lên 1.2.0 không cần sửa gì.

---

## 1.1.0 — 2026-08-03

### Thêm

- **Lớp kinh tế**: `harness.config.json → budget` + `tooling/capo-report.mjs`.
- **Hook `protect-tests`** — chặn khi file test bị ghi với ít assertion/test block hơn.
- **Cửa thoát DRI**: `HARNESS_DRI=1` cho phép sửa file harness, có ghi log.
- **`apply-to.mjs --audit`** — bắt file bị bỏ sót khỏi danh sách phân phối.
- **`.mcp.json.example`**, `docs/{ROADMAP-30D,ANTI-PATTERNS,ARCHITECTURE,ECONOMICS,RECOVERY,TEAM,MULTI-PROJECT,DESIGN}.md`,
  `docs/{rubrics,specs,runbooks}/`, `tooling/generators/`.
- Skill `dedupe-scan`. Subagent `architect`, `design-evaluator`.

### Cần biết

- `protect-tests` sẽ **chặn** nếu bạn ghi file test nhỏ hơn bản cũ.
  Cửa thoát: comment `harness-allow-test-shrink`.
- Sửa lại comment trong `protect-harness`: nó là **cơ chế kỷ luật đội**, không phải
  ranh giới bảo mật (chỉ khớp `Write|Edit`; agent có Bash vẫn ghi được file).

---

## 1.0.0 — 2026-08-03

Harness baseline. Xem `docs/adr/0001-harness-baseline.md`.
