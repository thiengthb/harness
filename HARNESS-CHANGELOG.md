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

## 1.6.0 — 2026-08-04

### Tái phân vai harness ⟷ Claude Code native — nửa đầu

Nền: `docs/adr/0002-tai-phan-vai-native.md`. Nguyên tắc một dòng — **Claude Code sở
hữu RUNTIME, harness sở hữu CHÍNH SÁCH** — và luật đặt mỗi cơ chế ở **bậc thấp nhất
mà nó còn làm được việc**.

Đây là **nửa không breaking**. Nửa sau (`2.0.0`) chạm `paths.harness` nên cần quyền
DRI; spec đầy đủ ở `.claude/learnings/2026-W32-tai-phan-vai-native.md`.

**BREAKING:** không có.

#### Sửa — `allowed-tools` đang CẤP quyền cho skill được thiết kế để không ghi

`allowed-tools` khai tool dùng được **mà không cần hỏi**. Trường **hạn chế** là
`disallowed-tools`. Cả 12 skill dùng trường cấp quyền; 5 trong số đó có thân skill tự
viết *"Ra ĐỀ XUẤT, không ra thay đổi"* hoặc *"DỪNG, báo cáo"*.

Đây **không phải lỗ quyền đang mở** — `protect-*` là PreToolUse, chặn bất kể
frontmatter nói gì. Nó nghiêm trọng vì lý do khác: đây là **template dạy thói quen
cho mọi repo nhận nó**, và nó đang dạy rằng frontmatter không phải hợp đồng.

Đã kiểm với tài liệu vendor: cú pháp **YAML list được parse** — trường đang có hiệu
lực thật, không phải field chết.

#### Thêm — `disable-model-invocation` cho 9 skill nghi thức

Chi phí context của một skill về **0**: nó biến mất khỏi tầng discovery. Tầng
discovery **12 → 3**, không mất chức năng nào.

Hệ quả: trần *"≤12 skill"* đọc lại thành **"≤12 skill model tự gọi được"**.
`harness-doctor` đếm theo nghĩa mới.

#### Thêm — `tooling/gates.mjs`: một runner, ba nơi gọi

```
node tooling/gates.mjs --stage stop|subagent|preMerge
node tooling/gates.mjs --list [--timing]
```

`gates.preMerge` từng sống ở ba bản sao (config · skill dạng văn xuôi · CI). Ba bản
sao của một danh sách là ba cơ hội để chúng lệch, và khi lệch thì bản được TIN là bản
người đọc gần nhất, không phải bản đang chạy.

Kèm **ngân sách độ trễ**: `stop` < 30s, `subagent` < 5s (nhân với tối đa 16 agent song
song). Đắt hơn thì đẩy xuống CI.

Và **fail-đóng ở phiên không có người ngồi xem**: ở phiên có người, một dòng cảnh báo
là đủ — có người đọc nó. Ở phiên không người thì không ai đọc.

#### Thêm — năm chỗ vá trong dụng cụ đo (`tooling/lib/harness.mjs`)

Lớp lỗi này không có triệu chứng riêng: nó chỉ hiện ra dưới dạng một kết luận sai mà
mọi người tin. Chi tiết ở `docs/ANTI-PATTERNS.md §H`.

- `worktreeInfo()` + `reportScope()` — mọi báo cáo **nói ra nó đo ở cây nào**. Trạng
  thái BÌNH THƯỜNG của phiên harness là ở trong worktree, và `sparsePaths` làm file
  vắng mặt **hợp lệ**. `harness-size` giờ ghi cây vào baseline và **từ chối so** khác cây.
- `report()` có **5 rổ**: thêm `na` (bằng không **do cấu trúc**) và `unknown` (chưa đo
  được). Gộp hai giá trị bất kỳ là cách một thay đổi schema biến thành một đề xuất xoá.
  Luật kèm theo: tổng kết có `unknown` thì **không được gọi là xanh**.
- `hookRan()` — bằng chứng một hook đã chạy **kể cả khi nó cho qua**. Không có nó,
  "chạy suốt tuần không bắt gì" · "chưa từng được cắm" · "crash im lặng" đọc **giống
  hệt nhau**. Định nghĩa xong ở `1.6.0`; các hook gọi nó ở `2.0.0`.
- `unattended()` — nhận diện phiên không có người. **KHÔNG dùng `!isTTY`**: hook luôn
  được spawn với stdio piped nên isTTY sai ở mọi phiên. Chỉ ba tín hiệu đọc được từ
  trong hook: `CI`, `CLAUDE_CODE_ENTRYPOINT=sdk-cli`, cờ tường minh.

#### Thêm — suite gác đủ bốn phần (53 → 59 case)

Đầu ra của một cái gác là **bộ ba** (stdout, stderr, exit code), không phải một giá trị.

- **Đường im lặng**: input phải bỏ qua ⇒ exit 0 **VÀ không in gì**. Case OK muốn in
  thì phải **khai `msg`** và khớp — không có cờ "được phép ồn", vì một cửa thoát DRI
  im lặng vẫn xanh là một cửa thoát không audit được.
- **Đường hành động**: hợp đồng phổ quát cho **mọi** nhánh từ chối — phải có phần
  TỪ CHỐI **và** phần GỢI Ý. Gợi ý là thứ agent đọc để biết làm gì tiếp; trước bản này,
  xoá dòng gợi ý của một hook đi mà cả suite vẫn xanh.
- **`mutate()`** với gác `ran` trước `killed`: một mutant **chỉ crash** chứng minh
  suite nhận ra file hỏng, **không** nói gì về hành vi nó tuyên bố đã gỡ.
- Ba mutant đầu tiên (`dcg`, `block-secrets`, `protect-harness`) đều tiêu vào **PHẠM VI**
  của check, không phải logic — đó là chỗ cần nhìn trước tiên khi mutant sống sót.

#### Thêm — phòng chờ nghỉ hưu, **luật hai con số**, không có lệnh xoá

```
node tooling/entropy-scan.mjs --stage <file> --why "…"   # ≥20 ký tự
node tooling/entropy-scan.mjs --verify                    # dấu hiệu sống = MIỄN TỘI
```

Suy đoán vô tội: gánh nặng chứng minh nằm ở bên **XOÁ**. Một món chỉ đủ điều kiện khi
**cả hai** đúng — không dấu hiệu dùng trong toàn bộ lịch sử **VÀ** ≤1 liên kết trỏ tới.
*Một lần nhắc là nhắc, hai lần là phụ thuộc.*

`paths.harness` **không bao giờ** đủ điều kiện. **Cố ý không có lệnh `--delete`** —
bước không thu hồi được không phải việc của agent; `--verify` in lệnh cho DRI gõ.

#### Thêm — ratchet trong `harness-size.mjs`

Một cái gác **đỏ ngay ngày đầu** là một cái gác sẽ bị **tắt** — nó dạy người ta cách
tắt gate. Mốc khai công khai, có ngày, có người khai; chỉ nổ khi số **tăng**; và nó
**đòi hạ mốc trong cùng commit** khi số giảm, để backlog không bị che.

#### Thêm — `harness-doctor` biết về bề mặt vendor

- Allowlist **16 key** frontmatter skill, **có ngày** (fetch 2026-08-04). Vendor thêm
  field liên tục; allowlist không ngày sẽ báo một field **đang chạy** là inert.
- Tách `paths` (Claude Code **thật sự** đọc) khỏi `owner`/`added`/`expires-review`/
  `why`/`exit-condition` (chỉ `entropy-scan` đọc). Cả hai hợp lệ, nhưng phải gọi đúng tên.
- **Danh mục hook sinh tự động** từ `settings.json`: hook nào cắm vào event nào, chặn
  được hay chỉ nhắc, có được `apply-to` mang đi không. Bảng viết tay đã lệch — README
  nói *28 test*, thực tế **53**.
- Cảnh báo deny rule **không bao giờ được tra cứu**: Claude Code chỉ kiểm file theo
  `Edit(path)` và `Read(path)`. `Write(...)`, `Glob(...)`, `NotebookEdit(...)`,
  `MultiEdit(...)` được nhận nhưng không đọc.

#### Thêm — `occurrences ≥ 2` mà `artifacts` rỗng giờ bị cảnh báo

Một bài học ghi xuống **lần thứ hai** đã tự chứng minh việc ghi xuống không có tác
dụng. Lần thứ hai phải có cơ chế — hoặc thân bài phải nói **thành lời** vì sao không
thể có. Lựa chọn thứ ba hợp lệ, nhưng không được là mặc định.

#### Tài liệu

- `docs/adr/0002-tai-phan-vai-native.md` — thang 8 bậc, bài test bốn câu, bảng chủ sở
  hữu (không ô nào hai chủ), 10 dòng bằng chứng đo trước khi sửa, và **ba chỗ từ chối
  làm theo tài liệu nguồn** kèm lý do.
- `docs/ECONOMICS.md` — **§1.1 khi nào KHÔNG delegate**: subagent khởi động **nguội**.
  Delegate khi việc RỘNG / MÁY MÓC / LÀM BẨN CONTEXT — ba điều kiện, "để cho nhanh"
  không nằm trong đó. Cộng ba tầng research (**Quick là mặc định**).
- `docs/ANTI-PATTERNS.md` — **nhóm H: dụng cụ đo** (10 mục) + F7–F9.
- `docs/progress/_TEMPLATE.md` — `issue:` bắt buộc (neo yêu cầu gốc) + khối **4 câu hỏi
  trước mỗi lô**, đặt trong artefact người thi hành **thật sự mở**: một luật nằm trong
  skill mà không ai mở lúc thi hành thì *đọc như là đã có phủ sóng*.

#### Đã CẮT khỏi kế hoạch nguồn — và vì sao

- **Không xoá `/wt`, `/whats-new`.** Nguồn gọi chúng là "bọc một lệnh"; đọc thật thì
  `/wt` chứa bảng tài nguyên cục bộ + sparse-checkout, `/whats-new` chứa quy trình
  canary. `disable-model-invocation` đạt đúng mục tiêu (cắt discovery) với **0 tri thức
  bị mất**.
- **Không thay `block-generated-edit`/`protect-feature-files` bằng deny rule.** Cả hai
  **đọc `harness.config.json`**. Deny rule tĩnh đánh đổi nguồn-sự-thật-duy-nhất lấy
  chút phủ sóng Bash. Ở `2.0.0` chúng được thêm làm **lớp hai**, không thay thế.
- **Không bật sandbox.** Nó **sẽ** chặn oan — chắc chắn. Quy trình bắt buộc: một máy,
  hai ngày công việc thật, ghi mọi lần chặn oan. Xem `knowledge/lessons/0002-guard-ban-nham.md`.

#### Việc cho project đã áp template

Không có. Không breaking, không migration. Chạy `node tooling/upgrade.mjs` như thường.

Sau khi nâng cấp, hai lệnh đáng chạy một lần:

```
node tooling/gates.mjs --list --timing    # gate nào ĐANG THẬT SỰ chạy, tốn bao lâu
node tooling/harness-size.mjs --baseline  # ghi lại mốc, giờ có kèm cây đã đo
```

---

## 1.5.0 — 2026-08-04

### Sửa — self-test của template không còn đỏ giả ở project đích

Ba defect cùng một lớp: self-test assert **cấu hình của project** thay vì **logic của
harness**, nên chúng xanh trong repo template và đỏ ở project đầu tiên áp nó — mà
project đó không sai gì, nó chỉ làm đúng điều README dặn (điền `commands`).

Phát hiện khi áp v1.4.0 lên project thật (`sakubun`): `test-hooks` 49/52,
`doctor` báo `Template coverage FAIL` với "thiếu 351 file" — 351 file đó là source
của chính project.

1. **`matchAny()` hỗ trợ phủ định `!glob`** (luật `.gitignore`: pattern sau ghi đè
   pattern trước). `paths.secrets` mặc định giờ là `"**/.env.*"` + `"!**/.env.example"`.
   Trước đây `**/.env.*` chặn luôn `.env.example` — file mà `tooling/init.mjs` CẦN và
   `.gitignore` đã whitelist — nên pre-commit báo sai ở commit ĐẦU TIÊN của mọi project
   mới, và đường thoát dễ nhất là `--no-verify`.
2. **`apply-to.mjs --audit` tự bỏ qua ở project đích.** Tín hiệu: `.claude/harness-manifest.json`
   chỉ tồn tại ở ĐÍCH. Check này đối chiếu HARNESS/SEED với cây file của TEMPLATE, chạy
   ở đích thì báo cả codebase là "thiếu" — và `harness-parity.yml` chạy nó trong CI, nên
   MỌI PR đầu tiên của MỌI project đích đều đỏ.
3. **`config()` đọc `HARNESS_CONFIG`** + `tooling/fixtures/config-unconfigured.json`.
   Hai case "lệnh chưa khai → bỏ qua" giờ chạy trên fixture, không trên config thật.
   Case `post-edit-lint` cũng bỏ hardcode `src/a.ts` (project không dùng layout `src/`
   thì eslint trả "No files matching the pattern" → exit 2 → hook chặn đúng thiết kế,
   test sai).

Bài học: `knowledge/lessons/0003-self-test-gia-dinh-repo-cua-no.md` (scope `universal`).

### BREAKING — không

`matchAny` chỉ THÊM hành vi: danh sách không có `!` chạy y như trước. Project đã áp
v1.4.0 không cần làm gì; muốn nhận bản sửa thì `node tooling/upgrade.mjs <template> --apply`.

Nếu bạn đã tự vá `paths.secrets` bằng cách liệt kê hậu tố env (cách duy nhất trước
v1.5.0), giờ thay được bằng `"**/.env.*", "!**/.env.example"` — ngắn hơn và không quên
hậu tố mới.

## 1.4.0 — 2026-08-03

### Thêm — vòng học giờ có CHIỀU LÊN

Trước đây vòng học chỉ chạy trong một project, cộng vận chuyển NGANG giữa hai
project (`export`→`import`). Template không tham gia. Hậu quả: trí tuệ tích ở LÁ,
không về GỐC — project bạn tạo tháng sau vẫn khởi động từ đúng số bài học seed, dù
các project cũ đã học được nhiều thứ. `knowledge.upstream` được khai trong config
mà **không có code nào đọc**; `knowledge/proposals/**` được whitelist trong
`protect-harness` mà thư mục không tồn tại và không ai đọc. Ý định có, cơ chế không.

- **`tooling/knowledge/upstream.mjs`** — chiều project → template. Gửi ba thứ:
  bài học mang đi được (trừ `candidate`), **gate của chúng** (`evals:`), và **diff
  cơ chế** (file harness project đã sửa so với manifest — ứng viên cải tiến template).
  Ghi vào `<template>/knowledge/incoming/<project>/` + `CONTRIB.md` có checklist.
  Không bao giờ ghi vào `.claude/` của template.
- **`tooling/knowledge/accept.mjs`** — bước "tôi đã nhận", trước đây không tồn tại
  nên `import` là NGÕ CỤT (copy tay, id trùng, mất provenance).
  `--list` · `--merge <id>` · `--reject "lý do"` (ghi `DECISIONS.log`).
- **Trường `evals:` trong bài học** — GATE đi theo bài học. `export`/`upstream` copy
  file eval kèm; `lint` cảnh báo khi dạng cưỡng chế bằng máy mà không khai gate.
- **`status: candidate`** — bài học nhận từ repo khác, repo này chưa gặp lần nào.
  Không được export, không được gửi lên. `lint` nhắc sau 90 ngày.
- **`seen-in`** — danh sách repo đã gặp độc lập. `scope: project` tự leo lên
  `universal` khi thấy ở ≥2 repo.
- **`ctx.copyFromTemplate` / `ctx.tplPath` cho migration** — cho migration SEED
  được nội dung mới. Không có nó, migration chỉ biến đổi được thứ đã có, và một
  file lớp nội dung mới của template không bao giờ tới được project đã áp.
- `evals/tasks/0004-khong-merge-tay-lockfile.md` — gate cho bài học L0001.

### Sửa

- **Nghịch lý ngưỡng 2 lần.** Điều kiện promote là "≥2 lần độc lập", nhưng bài học
  càng universal càng phân tán mỏng: A gặp 1 lần, B gặp 1 lần, không ai đủ 2 — luật
  lọc bỏ đúng những bài học đáng mang đi nhất. `accept --merge` cộng bằng chứng
  chéo repo. 1 + 1 = 2.
- **`import.mjs` bỏ mất ca giá trị nhất.** Nó loại theo tiêu đề, nên "cùng bài học,
  bằng chứng MỚI" bị bỏ im lặng. Nay ba rổ: mới · gộp được · đã có không gì mới.
- **Chống lạm phát bằng chứng.** Bài học nảy vòng A→B→A mang bằng chứng gốc của A về
  A dưới nhãn của B. So khớp nay bỏ mọi tiền tố `[...]` rồi mới đối chiếu nội dung;
  `occurrences` cộng theo số dòng thật sự thêm, không theo con số pack tự khai.
- **`--audit` không thể bắt eval task bị bỏ sót** vì IGNORE che cả nhóm
  `evals/tasks/`. Đã bỏ; gặp thật khi task 0004 không được ship và `lint` của
  project đỏ.
- `entropy-scan` nhắc khi pack chờ duyệt >30 ngày — "chờ người" không có hạn thì
  thành "không bao giờ", và `incoming/` tích thành bãi rác ai cũng tưởng là backlog.

### Không breaking

Trường mới đều tuỳ chọn. Project ở 1.3.0 nâng lên 1.4.0 chỉ nhận thêm cảnh báo
`lint` nhắc khai `evals:` — không có gì vỡ.

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
