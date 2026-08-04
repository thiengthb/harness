<!-- version: 2026-08-05-e -->
<!--
  Thông báo thay đổi harness cho cả team.
  SessionStart hook so `version` ở trên với version người dùng đã xem
  (.claude/state/whats-new-seen.json) và nhắc MỘT LẦN nếu mới hơn.

  Đổi harness mà không thông báo = nửa team hành xử theo rule cũ.
  Mỗi lần merge thay đổi vào .claude/, cập nhật version + viết 3 dòng ở đây.
  Giữ file NGẮN — xoá mục cũ hơn 1 tháng.
-->

## 2026-08-05 — NÂNG CẤP TỪ BẢN CŨ TỪNG ĐỂ REPO HỎNG (v2.7.2)

**Đã nâng từ v1.x lên 2.x trước hôm nay? Kiểm ngay:**

```
node -e "console.log(require('fs').existsSync('tooling/gates.mjs'))"   # phải là true
```

`false` nghĩa là `settings.json` đang trỏ Stop hook vào một file KHÔNG TỒN TẠI — mọi sự
kiện Stop ném lỗi. Sửa: `node <template>/tooling/apply-to.mjs . --apply --update`, hoặc
nâng cấp lại (migration `003` nay tự mang file đó sang).

Nguyên nhân: `upgrade.mjs` luôn chạy bằng **bản cũ của chính nó**, và danh sách file cơ chế
nằm trong đó — nên mọi `tooling/*.mjs` ra đời sau version của bạn là vô hình với nó.

## 2026-08-05 — Hai cảnh báo đỏ-do-hoàn-cảnh đã tắt (v2.7.1)

Nếu bạn thấy *"chưa gửi bài học lên template"* hoặc *"skill `dedupe-scan` ứng viên GỠ BỎ"*
ngay sau khi áp harness: đó là dương tính giả, đã sửa. Chạy `apply-to`/`upgrade` một lần.

## 2026-08-05 — Áp / nâng cấp không cần bản harness trên máy (v2.7.0)

1. **`npx github:thiengthb/harness init`** — không phải clone gì trước.
2. **`node tooling/upgrade.mjs <URL> --ref v2.7.0 --apply`** — nâng cấp từ xa. `--ref` là
   BẮT BUỘC; `--ref main` chạy được nhưng bị cảnh báo (nhánh di chuyển, không phải mốc).
3. **`upstream.mjs` nhận URL** — chiều LÊN của vòng học không còn đòi hai repo cùng một máy.
   Nó IN RA lệnh push + `gh pr create`, không tự push: ghi vào template là supply-chain vào
   mọi project khác, cổng đó phải có người.
4. `entropy-scan` nhắc khi bạn có bài học mang đi được mà **chưa bao giờ** gửi lên template.

## 2026-08-05 — Phỏng vấn thay cho "nhớ điền config" (v2.6.0)

1. **`node tooling/setup.mjs --apply`** — chạy MỘT LẦN sau khi áp template. Nó đọc repo
   (package.json/pyproject/go.mod + lockfile), đề xuất `commands.*` **kèm bằng chứng**, hỏi
   phần không đọc được, ghi config + `docs/adr/0001-*`. Nó **từ chối kết thúc** khi
   `commands.verify` còn rỗng. Xem trước: `--detect` (không ghi gì).
2. **Nó không cài gì và không bịa lệnh nào.** Không thấy thì để rỗng và nói ra.
3. **Nếu bạn đã áp harness trước 2.6.0:** `tooling/gates.mjs` của bạn CHƯA BAO GIỜ được cập
   nhật qua `upgrade` (nó thiếu trong danh sách lớp cơ chế). Chạy `upgrade` một lần nữa —
   lần này nó tới.
4. `apply-to` nay gỡ `HARNESS_ALLOW_SKIPPED_GATES` khỏi `ci.yml` của project đích.

## 2026-08-05 — Áp template có ba lỗ im lặng, đã bịt (v2.5.0)

1. **Chạy lại `apply-to` hoặc `upgrade` trên project của bạn.** `.gitignore` /
   `.gitattributes` của harness trước đây **không bao giờ tới** project đã có hai file đó
   (tức là mọi project thật). Nếu bạn thấy `.claude/settings.local.json` hoặc
   `.claude/telemetry/` trong `git status` thì đây là lý do.
2. **Repo bạn có `.claude/` trong `.gitignore`?** Vậy `.claude/hooks/` chưa từng được
   commit — cả đội tưởng có harness, thật ra chỉ máy chạy `apply-to` có. Migration `006` tự
   thêm `!.claude/`. Dòng đúng là `!.claude/`, KHÔNG phải `!.claude/settings.json`: sau khi
   cả thư mục bị loại, phủ định cho từng file bên trong **vô tác dụng** (đo bằng
   `git check-ignore`).
3. **ADR của lớp harness dời sang `docs/adr/harness/`.** Số `0001` giờ thuộc về SẢN PHẨM.
4. `/verify-ui` giờ được `/ship-feature` bước 5 gọi tới, và điều kiện thoát của nó khoá vào
   `commands.e2e` thay vì một field không bao giờ tồn tại.

## 2026-08-04 — Skill `/whats-new` bị XOÁ · hai chỉ số thôi nói dối (v2.4.0)

1. **`/whats-new` không còn.** File `.claude/whats-new.md` **giữ nguyên** — bạn đang đọc nó,
   và SessionStart hook vẫn in nó một lần mỗi version. Phần *cập nhật* + *canary* chuyển vào
   **`/harness-propose` §6**, nơi bạn đang đứng khi thật sự cần chúng.
2. **`harness-size` giờ gác `skills (discovery)`**, đọc ngưỡng từ `limits.maxSkills`, không
   đếm số thư mục. Skill có `disable-model-invocation: true` tốn 0 context nên không tính.
3. **`gates --list --timing`**: stage mà mọi gate đều `n/a` giờ báo `n/a`, không báo
   `OK 0ms`. `0ms` khi không có gì chạy không phải "nhanh".

## 2026-08-04 — a11y/perf cuối cùng có dụng cụ đo · skill `verify-ui` (v2.3.0)

1. **`commands.a11y` + `commands.perf`** và hai tên đó trong `gates.preMerge`.
   `features/*.json` đòi hai bằng chứng đó từ đầu mà không có chỗ nào sinh ra chúng.
   **Điền, hoặc xoá tên khỏi `gates.preMerge`** — đừng để lệnh rỗng.
2. **`evidence` phải TRỎ TỚI THỨ CÓ THẬT.** `passes: true` giờ đòi đường dẫn **tồn tại**
   hoặc URL `http(s)`. `"đã chụp rồi"` sẽ ĐỎ. Và `a11y`/`perf` **giờ mới được kiểm** —
   trước đó vòng lặp chỉ đi qua `platforms.*`.
3. **Skill `verify-ui`**: chạy app → chụp **2 viewport** → `docs/evidence/<issue>/` → giao
   `design-evaluator`. Chạy nó **trước** khi đặt `platforms.web.passes = true`.
   `disable-model-invocation` nên nó tốn 0 context.
4. Sửa một điều harness nói sai: trần `maxSkills` tính trên **tầng discovery** (đang 3/12),
   không trên tổng số skill.

## 2026-08-04 — `pre-commit` nay bắt Slack token và JWT (v2.2.0)

Danh sách hình-dạng-secret từng có **hai bản**: hook `block-secrets` 7 pattern, `pre-commit`
chỉ 5 — thiếu **Slack token** và **JWT**. Hook chỉ thấy thứ **agent** ghi; `pre-commit` là
tầng duy nhất thấy thứ **bạn** gõ tay. Nên hai pattern thiếu đúng ở tầng gác người.

Nay một nguồn ở `tooling/lib/harness.mjs`. Không cần làm gì — nhưng nếu bạn từng dán một
token Slack/JWT vào file và nó lọt qua, **giờ nó sẽ bị chặn**, kể cả file cũ (`--all` ở CI).

## 2026-08-04 — CI không còn xanh giả (v2.1.0)

1. **Job `verify` giờ chạy `node tooling/gates.mjs --stage preMerge`.** Trước đó nó là
   `echo "CHANGEME"`, tức LUÔN XANH — trong khi `docs/BRANCH-PROTECTION.md` dạy đặt nó
   thành check bắt buộc. Mỗi `commands` còn rỗng giờ làm **CI ĐỎ**, không im lặng nữa.
2. **Job `e2e` bị XOÁ** — `e2e` là một gate trong `gates.preMerge` nên nó chạy ở
   `verify`. **Bỏ `e2e` khỏi required status checks**, không thì PR treo mãi ở
   *"Expected — waiting for status"*.
3. **`security` quét secret THẬT**: `node tooling/precommit-scan.mjs --all` (mọi file
   được track) + SCA tất định khi có lockfile. Không có lockfile thì nó nói `n/a` ra
   miệng — `n/a` không phải *"không có lỗ hổng"*.
4. `ci.yml` của TEMPLATE có `HARNESS_ALLOW_SKIPPED_GATES: '1'`. **Repo của bạn phải
   không có dòng đó** — migration 004 xoá, và `harness-doctor` báo CHẶN nếu nó còn.

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
