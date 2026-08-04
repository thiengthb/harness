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

## 2.4.1 — 2026-08-04

**patch.** Đổi tên metric ở 2.4.0 bỏ **mồ côi** lịch sử của nó.

`skills (số)` → `skills (tổng thư mục)` là **cùng một phép đo**, chỉ đổi nhãn. Nhưng
`harness-size` so baseline theo tên, nên trên mọi máy đã có baseline, metric đó thành
*"chưa có mốc"* **vĩnh viễn** — và cách duy nhất để dọn (`--baseline`) sẽ **xoá luôn** tín
hiệu phình đang có. Tức là phải chọn giữa một `n/a` mãi mãi và mất bằng chứng.

Nay có `BASELINE_ALIASES`. Đã thử **cả hai chiều**: alias giữ được lịch sử (delta 0, không
còn `n/a`), và khi thêm một skill thật thì nó báo `skills (tổng thư mục): +1` — nên nó đang
**so**, không phải đang bỏ qua im lặng.

`skills (discovery)` **cố ý không có alias**: nó là phép đo MỚI, `n/a` của nó là `n/a` thật.
Đừng gán cho một metric một lịch sử nó không có.

---

## 2.4.0 — 2026-08-04

**minor.** Không cần migration. Xoá skill `/whats-new` — nội dung chuyển vào
`/harness-propose §6`.

### `maxSkills` có HAI nghĩa, và một tool không đọc config

```
harness-doctor:  skill: 13 tổng · 3 model tự gọi được (trần 12)   → xanh
harness-size:    WARN skills (số): 13 (ngưỡng 12)                  → đỏ
```

`harness-size.mjs` đếm **số thư mục** và so với hằng số `12` **viết cứng trong bảng
`THRESHOLDS` của chính nó** — nó **không đọc `limits.maxSkills`** bao giờ. Cùng lúc
`harness.config.json → $comment_maxSkills` tự khai: *"Đếm theo tầng DISCOVERY, không theo
tổng số file… **harness-doctor** đọc field này."*

Một khái niệm hai nghĩa, hai tool hai phán quyết trái nhau về **cùng một repo** — và với
`harness-size` thì `limits.maxSkills` là một **field ma**, đúng lớp `budget.modelTiering`
bị cắt ở 2.0.0. Config đã tự khai nghĩa của nó, nên file kia sai.

Nay: `skills (discovery)` (gác, ngưỡng **đọc từ config**) + `skills (tổng thư mục)` (in ra,
**không** gác — nó là bề mặt bảo trì, đáng biết, không đáng gác).

### `?? 0` bịa ra sự phình

`harness-size` so baseline bằng `v - (base.metrics[k] ?? 0)`. Cái `?? 0` trông vô hại, và
ngay lần đổi tên metric đầu tiên nó báo `skills (discovery): +3` · `skills (tổng thư mục):
+12` rồi kết luận **"Harness đang PHÌNH"** — về một thay đổi **không thêm một dòng skill
nào**. Một mốc chưa tồn tại **không phải** mốc bằng không.

Nay metric vắng mặt trong baseline báo `n/a` kèm cảnh báo rằng ghim lại sẽ **xoá** tín hiệu
phình đang có.

### `--list --timing`: `0ms` không phải "nhanh"

Chỉ số mà `AGENTS.md` gọi là *chỉ số "harness đang cản" duy nhất đo trực tiếp được* **chưa
từng được chạy**. Chạy lần đầu:

```
OK  stop: tổng 0ms / ngân sách 30000ms        ← trong khi 11/11 gate là n/a
```

`0ms` ở đây nghĩa là **không có gì chạy**. Báo nó thành `OK` là chính phép gộp `0` với
`n/a` mà `gates.mjs §TRẠNG THÁI THỨ BA` cấm — và nó nói dối đúng hướng dễ chịu: *"harness
không cản gì cả"*. Nay stage không có gate nào chạy được báo `n/a`, và stage có chạy thì in
kèm **mẫu số** (`1/3 gate có lệnh`).

### Cắt: skill `/whats-new`

`harness-size` báo PHÌNH sau khi thêm `verify-ui` (2.3.0), và luật của repo là **mỗi lần
promote kèm một đề xuất CẮT**. Đã cắt: `/whats-new` (55 dòng).

Không mất năng lực nào — phần "xem" là 3 dòng mà **SessionStart hook đã tự động in**, phần
"cập nhật" + **canary** chuyển vào `/harness-propose §6`, nơi nó thuộc về: *một luật thi
hành nằm trong artefact người thi hành mở, không nằm trong một skill không ai mở đúng lúc.*
File `.claude/whats-new.md` **giữ nguyên** — chỉ cái cửa dẫn tới nó bị bỏ.

---

## 2.3.0 — 2026-08-04

**minor, có migration** (`harness-migrations/005`).

### Tiêu chí đã đòi bằng chứng từ đầu, nay mới có dụng cụ đo

`features/_TEMPLATE.json` đòi `a11y.evidence` và `perf.evidence`; `ship-feature` bước 7 có
hàng **a11y** và **perf**. Nhưng `commands` **không có field nào** sinh ra chúng. Hai tiêu
chí default-FAIL **không có đường hợp pháp nào thành `true`** ⇒ người đang gấp điền `"n/a"`
cho xong, đúng thói quen mà default-FAIL sinh ra để diệt.

> **Một tiêu chí không có dụng cụ đo thì không phải tiêu chí, nó là một lời nhắc — và lời
> nhắc bị bỏ qua bởi người đang gấp.**

- `commands.a11y`, `commands.perf` (rỗng) + hai tên đó vào `gates.preMerge`.
- **Đúng hai field.** Không `visual`/`coverage`/`seo`: không hợp đồng nào đòi chúng, và một
  field không script nào đọc là **một niềm tin được đóng gói thành cấu hình** — lý do
  `budget.modelTiering` bị cắt ở 2.0.0.
- Ở `preMerge`, **không** ở `stop`: a11y/perf chạy bằng phút, ngân sách Stop là **30 giây**.
- **Muốn tắt thì xoá tên gate khỏi mảng, đừng để lệnh rỗng.** *"Đội tôi không làm a11y"*
  phải là một dòng diff có người duyệt, không phải một field rỗng.

### `evidence` phải TRỎ TỚI THỨ CÓ THẬT

`check-feature-integrity` có hai lỗ:

1. Chỉ kiểm `evidence` **khác rỗng**, nên `"evidence": "đã chụp rồi"` đi qua sạch — luật
   *"Tôi đã kiểm tra KHÔNG phải bằng chứng"* bị cưỡng chế ở tầng **cú pháp** mà không ở tầng
   **tham chiếu**. Một chuỗi không trỏ đi đâu là một câu khẳng định.
2. Vòng lặp chỉ đi qua `platforms.*`. Nhưng `a11y` và `perf` là **anh em** của `platforms`,
   không nằm trong nó — nên `a11y.passes = true` với evidence rỗng đi qua **im lặng**. Đúng
   hai field vừa được thêm dụng cụ đo.

Nay `passes: true` ⇒ `evidence` phải là URL `http(s)` **hoặc** một đường dẫn **tồn tại**.
URL không bị kiểm tồn tại: repo không được gọi mạng để chấm một PR. Đã thử: cả hai chế độ
hỏng đều ĐỎ.

### Skill `verify-ui` — bước THẤY

Ba tài liệu **bắt buộc** một ảnh chụp (`DESIGN.md` vòng lặp verify · `AGENTS.md` evidence
hợp lệ · `rubrics/_TEMPLATE.md` điểm phải kèm ảnh) và **không cơ chế nào tạo ra nó**. Hệ
quả: `design-evaluator` đang chấm **mã nguồn**, không chấm **giao diện** — và đó là lý do
cài thêm một skill thẩm mỹ không giải quyết gì: nó thêm ý kiến vào một vòng lặp **không có mắt**.

`verify-ui` là **trình tự**, không phải tri thức: chạy app → chụp **2 viewport** →
`docs/evidence/<issue>/` → giao `design-evaluator` → mới đổi `features/<id>.json`.
`disable-model-invocation: true` nên nó tốn **0 token context**.

**Template không ship công cụ chụp, và đó là cố ý** — Playwright/Maestro là tri thức stack.

> **Sửa một khẳng định sai ở 2.1.0:** trần `maxSkills` tính trên **tầng discovery**
> (skill model tự gọi được), **không** trên tổng số file. Đang **3/12**, nên thêm một skill
> `disable-model-invocation` không chạm trần. README đã nói sai điều này và đã được sửa.

### Cần làm khi nâng cấp

1. `node tooling/upgrade.mjs <template> --apply` (migration 005 thêm field + gate).
2. Điền `commands.a11y`/`commands.perf`, **hoặc** xoá hai tên đó khỏi `gates.preMerge`.
3. Kiểm lại `features/*.json`: `evidence` nào không trỏ tới file có thật hoặc URL sẽ **ĐỎ**.

---

## 2.2.0 — 2026-08-04

**minor.** Không cần migration.

### Một nguồn cho `SECRET_PATTERNS` — và lỗ nó đang che

Danh sách hình-dạng-secret tồn tại **hai bản**: `.claude/hooks/block-secrets.mjs` (**7**
pattern) và `tooling/precommit-scan.mjs` (**5**). Bản ở pre-commit thiếu **Slack token**
và **JWT**.

**Chiều của lỗ đó là chiều tệ hơn.** `block-secrets` là PreToolUse — nó chỉ thấy thứ
**AGENT** ghi. Tầng duy nhất thấy thứ **NGƯỜI** gõ tay là `pre-commit`, và đó chính là
tầng thiếu hai pattern. Một Slack token do người dán vào file rồi commit **đi qua sạch**.

Nay `SECRET_PATTERNS` ở `tooling/lib/harness.mjs`, cả hai tầng import. Chỗ sửa **không
phải** "thêm hai pattern vào bản kia" — đó chỉ đặt lại đồng hồ cho lần lệch sau: hai bản
của một sự thật không lệch vào ngày viết, chúng lệch vào ngày ai đó thêm một pattern và
chỉ thấy một chỗ.

Test là test **CẤU TRÚC**, không phải test hành vi: nó khẳng định **không file nào khai
lại** danh sách (`const SECRET_PATTERNS =`), vì chế độ hỏng ở đây là *"hai bản lệch"*, không
phải *"pattern sai"*. Neo vào **KHAI**, không vào **NHẮC** — cả hai file đều có comment nhắc
tới nó. Đã thử: khai lại ⇒ ĐỎ; `SECRET_PATTERNS_MUTANT_PROBE =` ⇒ vẫn xanh (neo đủ hẹp).

Thêm hai case hành vi cho Slack token và JWT. Chuỗi trong test bị **ghép ở runtime** là cố
ý: `block-secrets` **không** honor marker `harness-allow-secret`, nên một literal đủ hình
dạng trong file test sẽ bị chính nó chặn lúc ai đó sửa file đó.

---

## 2.1.0 — 2026-08-04

**minor, nhưng CÓ VIỆC PHẢI LÀM TAY** (xem `harness-migrations/004`).

### CI không còn xanh giả

Ba chỗ trong `ci.yml` là `echo "CHANGEME"` và vì thế **luôn xanh**: job `verify`, job
`e2e`, bước "Quét secret". Ghép với `docs/BRANCH-PROTECTION.md` — tài liệu dạy đặt các
check thành `required` — kết quả là **những dấu tick xanh gác một cửa không có ai đứng.**
Đó không phải thiếu gate; đó là một tuyên bố sai, và nó tệ hơn không có CI vì không có
CI thì người ta BIẾT là không có.

Không có cơ chế nào mới được viết. `gates.mjs` đã fail-**đóng** khi phiên không có người
**và** gate bị bỏ qua (3 nhánh đều có test từ 2.0.0), và header của nó đã ghi
`--stage preMerge ← /pre-merge VÀ ci.yml, cùng một lệnh` — CI chỉ chưa bao giờ gọi.

- `verify` → `node tooling/gates.mjs --stage preMerge`. MỘT runner cho `/pre-merge`,
  Stop hook và CI, nên ba nơi không thể lệch nhau.
- **Job `e2e` bị XOÁ.** `e2e` là một GATE trong `gates.preMerge` nên nó chạy trong
  `verify`. Một job riêng chỉ để gọi cùng runner là bản sao thứ hai của danh sách gate.
  ⚠️ **Phải bỏ `e2e` khỏi required status checks**, nếu không mọi PR treo mãi ở
  *"Expected — waiting for status"*.
- `security` → `node tooling/precommit-scan.mjs --all` (thật) + SCA tất định
  (`npm audit` khi có lockfile). Bước "Lockfile toàn vẹn" và SCA đều **tự kích hoạt**:
  không có lockfile ⇒ nói `n/a` ra miệng; CÓ lockfile mà chưa điền lệnh ⇒ **ĐỎ**.

### `precommit-scan.mjs --all`

Bản chỉ-`staged` `exit 0` NGAY khi không có gì staged — và ở CI thì không bao giờ có.
`--all` quét mọi file được track (`git ls-files`). Test khẳng định **số file đã xem khớp
`git ls-files`**, không khẳng định "exit 0": một lưới an toàn luôn xanh vì không bao giờ
có gì để xem thì không phải lưới.

### Cửa thoát có người canh

`ci.yml` của template đặt `HARNESS_ALLOW_SKIPPED_GATES: '1'` ở job `verify` — đúng cho
template (`commands` rỗng là placeholder; không có nó thì CI template đỏ vĩnh viễn, và
một cái gác đỏ ngày đầu là một cái gác sẽ bị tắt). **Ở repo tiêu thụ nó là một cái lỗ.**
Hai lớp xử lý: migration 004 **xoá** nó khi nâng cấp, và `harness-doctor` báo **CHẶN**
nếu thấy nó cùng với `.claude/harness-manifest.json`.

### `harness-doctor` biết hai thứ mới

- **Con số máy đếm được mà người gõ tay trong README** — hook · skill · số test. Đo
  2026-08-04: README ghi *"9 hook"* (thật 10) và *"28 test"* (thật 70). Số test so theo
  **sàn** (`≥70`), vì chỉ trong một phiên nó đi 28 → 70 → 71 và một check nổ mỗi lần
  thêm một test là check dạy người ta ngừng đọc; chiều bị chặn là chiều **nói quá**.
- **Cửa thoát trong `ci.yml`** (ở trên).

### `test-migrations`: hợp đồng có SÀN, và hai lỗ trong chính nó

Migration 004 là cái đầu tiên chạm file **không phải JSON**, và nó phơi ra hai lỗi trong
suite — cả hai đều là *"nhìn PHẠM VI trước khi nhìn logic"*, lần thứ 7 và 8 của
`knowledge/lessons/0003`:

1. `snapshot()` đi theo **danh sách path cứng**, nên `③ idempotent` của 004 xanh **rỗng**
   — nó chưa từng nhìn file mà migration sửa. Nay `walk('.')` toàn cây.
2. Engine mutant quyết định trên **source đầy đủ**, nên một comment giải thích *"cố ý
   KHÔNG dùng lazy"* bị đọc thành code ⇒ báo `MUTANT SỐNG SÓT` về một migration ĐÚNG.
   Nay quyết định trên bản đã bỏ comment. **Neo vào code, đừng neo vào comment.**

Và một điều kiện mới, **⑤ kết quả mong đợi do migration tự khai** (`export const expect`).
Bản đầu của ⑤ là heuristic đo BYTE (*"không file nào teo hơn nửa"*); tôi thử nó bằng chế
độ hỏng thật — regex ăn tới cuối file — và **nó không bắt được** (đoạn bị ăn ~40%). Giữ
một check vừa thất bại phép thử của chính nó là giữ đồ trang trí, nên nó bị **bỏ**, không
được nới ngưỡng. Bài học: **một hợp đồng tổng quát có sàn** — chỗ duy nhất biết "vá đúng
nghĩa là gì với file này" là migration.

### Cần làm khi nâng cấp

1. `node tooling/upgrade.mjs <template> --apply` (migration 004 xoá cửa thoát).
2. **Bỏ `e2e` khỏi required status checks** — khối `gh api` tái lập được ở
   `docs/BRANCH-PROTECTION.md`.
3. Điền `harness.config.json → commands` cho tới khi `gates.mjs --stage preMerge` xanh
   THẬT. Mỗi lệnh còn rỗng giờ làm **CI ĐỎ** thay vì im lặng.

---

## 2.0.0 — 2026-08-04

### Tái phân vai harness ⟷ Claude Code native — nửa sau

Hoàn tất `docs/adr/0002-tai-phan-vai-native.md`. Nửa này chạm `paths.harness` nên nó
cần quyền DRI, và đó là lý do nó tách khỏi 1.6.0.

**Migration tự động:** `harness-migrations/003-runner-thay-stop-gate.mjs`.
Chạy `node tooling/upgrade.mjs <template> --apply`. Nó vá TEXT (giữ `$comment_*` của
bạn), và những gì nó KHÔNG tự quyết được thì in ra dưới dạng `→ CẦN NGƯỜI:`.

#### BREAKING 1 — `.claude/hooks/stop-gate.mjs` bị XOÁ

`Stop` hook giờ gọi thẳng `node tooling/gates.mjs --stage stop`.

`stop-gate.mjs` là bản sao logic của `gates.mjs` **thiếu một nhánh**: fail-đóng khi
phiên không có người ngồi xem. Một danh sách gate ở hai chỗ là hai cơ hội để chúng
lệch nhau, và khi lệch thì bản được TIN là bản người đọc gần nhất, không phải bản
đang chạy. Migration đổi `settings.json` rồi mới xoá file — ngược thứ tự thì có một
khoảng `settings.json` trỏ vào hook không tồn tại, và một hook không tồn tại là một
hook không chặn gì, im lặng.

Nếu bạn đã **tuỳ biến** `stop-gate.mjs`: migration KHÔNG ghi đè lựa chọn của bạn, nó
báo `→ CẦN NGƯỜI`. Chuyển phần tuỳ biến thành một gate trong `gates.stop` của config.

#### BREAKING 2 — `tooling/doctor.mjs` → `tooling/harness-doctor.mjs`

`/doctor` là lệnh **native** của Claude Code (chẩn đoán cài đặt, đề xuất cắt gọn
CLAUDE.md). Hai thứ khác nghề cùng tên, trong một template phân phối cho nhiều đội,
là chi phí nhầm lẫn tăng theo số repo.

Alias `tooling/doctor.mjs` còn ở toàn bộ 2.x (in cảnh báo, forward nguyên args và exit
code) và **bị xoá ở 3.0.0**. Cập nhật CI + runbook ngay, đừng đợi.

Kèm theo: `/entropy-sweep` bước 1 (*"cắt gọn AGENTS.md"*) giao lại cho `/doctor` native —
nó do vendor bảo trì và **biết nội dung nào suy ra được từ codebase**. Bước 2–8 giữ
nguyên (frontmatter rule, bài học quá hạn, ADR, MCP, dấu ngày) vì native không biết
gì về chúng.

#### BREAKING 3 — `budget.modelTiering` bị CẮT khỏi `harness.config.json`

Không script nào đọc nó ⇒ nó là một niềm tin được đóng gói thành cấu hình. Nguyên lý
giữ ở `docs/ECONOMICS.md`; chỗ cưỡng chế THẬT là `permissions.ask` →
**`Agent(model:opus)`**, nơi có NGƯỜI bấm.

#### Thêm — 5 sự kiện native, và HAI sự kiện bị TỪ CHỐI

| Sự kiện | Việc | exit 2 |
|---|---|---|
| `SubagentStop` | `gates.mjs --stage subagent` | **chặn** — subagent chạy tiếp |
| `StopFailure` | `observe.mjs` — lớp kinh tế | bị bỏ qua (fire-and-forget) |
| `InstructionsLoaded` | `observe.mjs` — đo thuế context | không (observability-only) |
| `ConfigChange` | `protect-harness.mjs` lớp hai | **chặn** thay đổi vào phiên |
| `Setup` | `init.mjs` · `harness-doctor --quick` | không |

**`WorktreeCreate` và `WorktreeRemove` KHÔNG được cắm, và đừng cắm.** Chúng không phải
observer — chúng là **provisioner**: `WorktreeCreate` phải in đường dẫn worktree ra
stdout (không in ⇒ `claude --worktree` **throw cho cả đội**), `WorktreeRemove` exit 0
nghĩa là *"đã xoá xong"* (⇒ CC bỏ qua bước xoá của nó ⇒ **rò rỉ worktree**).
`harness-doctor` có check chặn việc cắm lại. Đo từ schema hook nhúng trong binary CLI
2.1.221, không từ tài liệu — xem ADR 0002 §Nguồn.

Cùng lý do đó, hai cờ trong kế hoạch ban đầu **không được viết**:
`check-reservations.mjs --on-create` và `wt-clean.mjs --one`. Dòng *"kiểm
`reservations/`"* trong AGENTS.md vẫn xoá được, nhờ cơ chế ĐÃ CÓ: `session-start.mjs`
in reservation đang hoạt động, pre-commit cưỡng chế nó.

#### Thêm — `permissions` lớp hai

```jsonc
"deny": [ …, "Edit(**/*.gen.*)", "Edit(/features/_index.json)" ],
"ask":  [ …, "Agent(model:opus)" ]
```

Hai dòng `Edit(...)` **không thay** `block-generated-edit` / `protect-feature-files`:
hai hook đó đọc `harness.config.json` (`paths.generated` per-project, và so mã issue
với tên nhánh), nên deny rule tĩnh không làm được việc của chúng. Đổi lại, deny rule
phủ thêm `sed -i`/`cat >` trong Bash và **tự động thành ranh giới OS khi bật sandbox**.
Deny rule không test được bằng spawn hook ⇒ chỗ nó được kiểm là `harness-doctor`.

#### Thêm — `observe.mjs`: một file, ba việc quan sát

Và một chi tiết đáng chú ý: vendor khai `StopFailure` là **fire-and-forget — output và
exit code bị BỎ QUA**. Nên mọi `console.error` ở nhánh đó là **chữ chết**. `observe.mjs`
ghi `.claude/state/last-stop-failure.json`, và `session-start.mjs` in nó **MỘT LẦN** ở
phiên sau rồi xoá. Một cảnh báo về TIỀN mà không ai đọc thì bằng không có cảnh báo.

#### Thêm — `hookRan()` được cắm vào cả 10 hook

Trước đây ba tình huống đọc **giống hệt nhau** (cả ba là log rỗng): hook chạy suốt tuần
không bắt gì (đang làm việc TỐT) · hook chưa từng nổ vì không được cắm (mã chết) · hook
crash im lặng (hỏng). `harness-doctor` giờ có cột `N qua · M chặn`, và `? chưa đo`
**không phải `0`**.

#### Sửa — telemetry bị chính test của nó làm nhiễu

`test-hooks.mjs` spawn hook thật trong repo thật, nên mỗi lần chạy suite nó bơm hàng
chục dòng `gate-fails` vào telemetry THẬT: `dcg 267 chặn` gần như toàn bộ là **suite
tự gọi chính nó**. Con số đó là đầu vào của `/harness-retro` **bước 4**, chỗ bắt buộc
đề xuất CẮT BỎ — tức là bộ đếm nói dối về **hướng nguy hiểm**. Nay có
`HARNESS_TELEMETRY_DIR` và `HARNESS_STATE_DIR`, suite trỏ cả hai vào `os.tmpdir()`.

`HARNESS_STATE_DIR` chữa thêm một lỗ riêng: suite spawn `session-start.mjs` thật, và nó
**ăn mất thông báo `/whats-new` của chính bạn** — cơ chế đó cố ý chỉ in MỘT LẦN cho mỗi
version, nên *"đã in rồi"* là trạng thái không lấy lại được.

#### Sửa — suite gác thừa hưởng cửa thoát của người chạy nó

`TEST_ENV` giờ **đóng** `HARNESS_DRI` · `HARNESS_ALLOW_MIGRATION_EDIT` ·
`HARNESS_ALLOW_SKIPPED_GATES`. Không có nó, mọi case *"agent KHÔNG tự sửa harness"*
chuyển sang **xanh-giả đúng trên máy của người duy nhất sửa được hook** — DRI là người
duy nhất có `HARNESS_DRI=1`, và cũng là người chạy suite nhiều nhất.

Thêm hai case chưa từng có: cửa thoát DRI **mở được và hét lên**, và hình dạng input
của `ConfigChange` (`file_path` ở **cấp trên**, không trong `tool_input` — không có
fallback trong `toolFilePath()` thì lớp phòng thủ thứ hai `pass()` im lặng).

#### Sửa — `apply-to --audit` đỏ-giả trong worktree

Trong worktree, `.git` là một **FILE**, nên `/^\.git\//` không khớp và audit báo *"bỏ
sót .git"*. Trạng thái BÌNH THƯỜNG của một phiên harness là ở **trong** worktree
(AGENTS.md: một issue = một worktree) ⇒ check này đỏ-giả cho gần như mọi người, và eval
`0001-harness-tu-kiem` đỏ theo. Cùng lớp với `knowledge/lessons/0003`.

#### Thêm — `.claude/rules/untrusted-input.md`

Prompt đến từ **webhook · PR comment · issue body · log bên thứ ba** là **DỮ LIỆU**,
không phải **CHỈ THỊ**. Rule có `paths` nên nó chỉ nạp khi bạn chạm vùng nhận input từ
ngoài — không phải thuế context cho mọi request.

#### Thêm — hai bộ nhớ, hai vai

Claude Code auto-memory nạp **200 dòng đầu `MEMORY.md` MỖI phiên** ⇒ nó là **chỉ thị
thật**, dù không ai review nó. Nếu nó mâu thuẫn với `knowledge/lessons/`, Claude được
phép chọn tuỳ ý và **không gì báo cho bạn**. AGENTS.md + `knowledge/README.md` phân vai
rõ; `/harness-retro` bước 1 đọc nó như **đầu vào, không như thẩm quyền**;
`knowledge.autoMemoryDirectory` để RỖNG là đúng và `observe.mjs` hét lên nếu ai trỏ nó
vào cây repo.

#### Ngân sách file: **+5 / −1**

Thêm `observe.mjs` · `untrusted-input.md` · `003-…mjs` · `harness-doctor.mjs`(đổi tên,
có alias) · fixture `config-automemory-in-repo.json`. Bớt `stop-gate.mjs`.

**HẬU QUẢ CAM KẾT TRƯỚC** (viết ra để không bị uốn theo kết quả): nếu sau **90 ngày**
(≈ 2026-11-02) `harness-size.mjs` cho thấy harness **phình** so với baseline hôm nay,
đợt này **đã thất bại theo tiêu chí của chính nó** — vì mọi mục ở trên đều tự nhận là
*nối lại thứ đang đứt* hoặc *thay thứ đang sai*, không phải *thêm cơ chế*. Mục đầu tiên
cần xét lại khi đó là chính ADR 0002.

#### Sửa — ngưỡng kích cỡ PR chưa từng được hiệu chỉnh cho repo NÀY

`prWarnLines` 400 → **800** · `prFailLines` 800 → **1500** · `prWarnFiles` 15 → **30**,
và CI **loại tài liệu khỏi phép đếm** (nhưng **không** loại `AGENTS.md`, vì nó nạp vào
mọi phiên của mọi người ⇒ nó là chỉ thị đang thi hành, không phải tài liệu).

Phát hiện khi chạy `/pre-merge` cho chính đợt này: đo 6 release harness gần nhất (dòng,
đã trừ tài liệu) được **206 · 428 · 726 · 817 · 909 · 1299** — mốc fail 800 đã bị
**3/6 release vượt qua**, và mốc warn 15 file nổ ở **5/6**. Một cảnh báo nổ mọi lần là
cảnh báo dạy người ta phớt lờ nó. Ngưỡng cũ hiệu chỉnh cho **repo sản phẩm**, nơi PR nhỏ
co được cửa sổ conflict; ở template thì một thay đổi harness là đa file **bắt buộc** —
hook + config + test + changelog + migration phải hạ cánh cùng lúc, vì nửa BREAKING
giữa hai lần merge để `settings.json` trỏ vào hook không tồn tại.

Hiệu chỉnh theo **lịch sử**, không theo diff hôm nay: 1500 = release lớn nhất từng có +
~15% headroom. Đặt 2000 thì gate không bao giờ nổ. Và nó vẫn nổ đúng lúc: PR gộp cả
v1.6.0 + v2.0.0 (1811 dòng) **bị chặn**, nên đợt này lên thành **hai PR**, mỗi PR một
release — đúng luật "một PR một mục đích".

`harness.config.json` là SEED ⇒ project mới thừa hưởng con số này. Thừa hưởng im lặng là
cách một ngoại lệ có lý do biến thành mặc định không ai nhớ tại sao, nên
`harness-doctor` nhắc: repo **không phải** template mà có `prFailLines ≥ 1500` thì nên
hạ về 400/800.

#### Sửa — hai lớp cưỡng chế tưởng đang chạy mà không chạy

Phát hiện khi mở PR cho chính đợt này, cả hai đo bằng API chứ không đọc tài liệu:

1. **`main` chưa từng được bảo vệ.** `gh api …/branches/main/protection` → `404 Branch
   not protected`. Suốt thời gian đó mọi gate trong harness (8 CI check, ngưỡng kích cỡ,
   parity 3 OS) là **tư vấn**: một `git push origin main` bỏ qua sạch. `docs/BRANCH-PROTECTION.md`
   nay chứa **cấu hình tái lập được** (một khối `gh api -X PUT`), không phải một checklist
   để tự đối chiếu bằng mắt. Dòng quan trọng nhất và dễ bỏ nhất là **`enforce_admins: true`**:
   repo một người thì collaborator duy nhất LÀ admin, nên để `false` là miễn trừ đúng
   người duy nhất push được — bảo vệ không ai.
   Kèm cảnh báo: **`git push --dry-run` KHÔNG kiểm được luật này** (nó không chạy
   pre-receive hook), nên nó báo "thành công" cho một push mà server sẽ từ chối.

2. **`CODEOWNERS` placeholder là user THẬT của người lạ.** Đo 2026-08-04: `dri` và
   `Tech-lead` đều tồn tại trên GitHub. Một dòng CODEOWNERS chỉ có hiệu lực khi handle
   **TỒN TẠI *VÀ* có quyền PUSH** — hai điều kiện, không phải một; thiếu cái nào GitHub
   cũng bỏ qua **im lặng**, PR hiện *"không yêu cầu review nào"*. Thông điệp của
   `harness-doctor` nói *"handle không tồn tại"*, thực tế nguy hiểm hơn: **tồn tại nhưng
   không phải người bạn nghĩ**. Nay nó nêu đúng hai điều kiện + hai lệnh `gh api` để kiểm.

   Và bản thân check đó **đang bắn nhầm**: nó `includes('@dri')` trên **cả file**, nên một
   comment GIẢI THÍCH về placeholder cũng bị tính là dùng placeholder. Nay chỉ đọc **dòng
   luật** (bỏ comment, kể cả comment cuối dòng) và so cột owner với một tập placeholder.
   Cùng lớp lỗi với `fmKeys()`: *văn xuôi NHẮC tới một thứ không phải là KHAI nó* — và một
   check tự bắn nhầm là một check sẽ bị tắt.

#### Thêm — `tooling/test-migrations.mjs`: migration cuối cùng cũng có test

`grep harness-migrations` trong `test-hooks.mjs`, `evals/`, `.github/workflows/` trước
2.0.0 trả về **rỗng**. Ba migration đã ship mà **không một dòng test** — trong khi đó là
code **duy nhất ghi vào `harness.config.json` và `.claude/settings.json` của repo KHÁC**,
trên máy người khác, thường lúc họ đang gấp muốn nâng cấp cho xong.

Chế độ hỏng đáng sợ không phải crash (crash thì `upgrade.mjs` bắt và báo FAIL) mà là
**chạy thành công và làm sai** — phát hiện ở phiên sau, khi mọi hook im lặng vì
`config()` fail-open trả default rỗng.

Hợp đồng **bốn điều kiện** áp cho mọi migration, không cần viết assert riêng:
① không throw · ② JSON còn parse được · ③ **idempotent** (lần hai không đổi gì) ·
④ không mất `$comment_*`.

Migration có fixture (`tooling/fixtures/migration-<version>/`) thì chạy đường đi THẬT
CŨ→MỚI; không có fixture thì vẫn chịu hợp đồng trên bản sao cây hiện tại, nơi nó **phải
là no-op**. `001` và `002` hiện ở nhánh yếu đó và **suite NÓI RA điều đó** (`WARN`), thay
vì im lặng tính là pass.

Kèm **mutant có sẵn**: đổi mọi regex lazy `[\s\S]*?` thành greedy. Nó chứng minh hợp đồng
②④ đỏ được ở **mọi lần chạy CI**, không phải một lần lúc viết. Chạy cả trong
`harness-parity.yml` (3 OS) vì migration gọi `git rm` và chạm đường dẫn — đúng chỗ lớp
lỗi chỉ-đỏ-trên-Windows sống.

Và một ghi chú thẳng thắn trong header file đó: **bản đầu của nó nói sai.** Nó bảo ④ gác
`JSON.parse`-rồi-`stringify`, nhưng `$comment_*` là **key JSON thật** nên round-trip giữ
nguyên chúng. Mutant dựng theo giả thuyết sai đó **sống sót** — và một mutant sống sót vì
test neo sai là **lỗi của TEST**. Cái ④ thật sự gác là **regex ăn quá nhiều**, vì migration
buộc vá TEXT (stringify sẽ phá format thủ công project đã sửa).

#### Sửa — bốn chỗ tự kiểm lại sau khi rà soát plan

- **`evals/tasks/0001` chỉ gác 3 lệnh** (`test-hooks` · `--audit` · `knowledge/lint`) — không
  gác `harness-doctor`, `gates.mjs`, `test-migrations`. Nay **6 lệnh**. Một cơ chế không có
  gate là một cơ chế không ai biết đã đứt.
- **`knowledge/lessons/0003`** `occurrences: 3 → 6`. Đợt này sinh thêm **3 ca cùng lớp**
  (*"self-test giả định repo của nó"*): `--audit` đỏ-giả trong worktree · ngưỡng PR của repo
  sản phẩm áp lên template · check CODEOWNERS quét cả file. Không ghi lại thì bài học lặp
  nhiều nhất của đợt là bài học duy nhất không được thu.
- **`docs/ECONOMICS.md`** nói `budget.modelTiering` *"đã bị cắt"* từ **v1.6.0**, nhưng field
  chỉ bị cắt ở **v2.0.0** — merge v1.6.0 rồi dừng lại là ship một tài liệu khẳng định việc
  chưa xảy ra. Nay nêu rõ version + trỏ migration 003.
- **Ba tham chiếu chết**: `unattended()` trong `lib/harness.mjs` còn nói *"· stop-gate"* ·
  header `gates.mjs` còn ghi *"← .claude/hooks/stop-gate.mjs"* · mục `whats-new` cũ còn dạy
  `node tooling/doctor.mjs` (nay ghi kèm tên mới).

#### Còn đỏ, và biết vì sao

`node evals/run.mjs` → **2/4** (không tụt so với trước đợt này). Hai eval đỏ vì trạng
thái TEMPLATE, không vì đợt này: `0003` cần `features/eval-probe.json` (artifact do
agent tạo, mà `evals.command` chưa khai) và `0004` cần `commands.install`. Ở project
thật đã điền `commands`, cả hai xanh. Ghi ra đây vì một con đỏ không có lời giải thích
sẽ dạy người ta phớt lờ màu đỏ.

---

## 1.6.0 — 2026-08-04

### Tái phân vai harness ⟷ Claude Code native — nửa đầu

#### Sửa — `shell: true` chẻ args trên Windows, và CHỈ trên Windows

`git()` giờ **luôn** chạy `shell: false`. `git` là `git.exe`, một executable thật, không
phải `.cmd` shim — nó không cần shell, và đi qua shell thì Node **nối args mà KHÔNG
escape** (chính Node cảnh báo: DEP0190):

```
git commit-tree <sha> -m "fixture: migration da merge"
  shell:false → 1 tree  ✓
  shell:true  → git thấy `migration` `da` `merge` là 3 tree nữa
              → fatal: must give exactly one tree
```

Lớp lỗi này **xanh trên Linux/macOS, đỏ trên Windows** — đúng loại lỗi mà Parity
Contract tồn tại để bắt. Nó đã ẩn trong fixture của `test-hooks.mjs` từ v1.3.0 và chỉ
lộ ra ở job `parity (windows-latest)`. 40+ lệnh git trong repo thừa hưởng bản sửa này,
kể cả các đường dẫn Windows có khoảng trắng (`C:\Users\Nguyen Van A\…`).

`run()` giữ mặc định `shell: IS_WIN` (package manager **là** shim) nhưng nhận
`{ shell: false }` để nơi khác chọn.

#### Sửa — gate kích cỡ PR đếm cả tài liệu, nên nó mất nghĩa hai chiều

CI loại `docs/` · `HARNESS-CHANGELOG.md` · `README.md` · `whats-new.md` ·
`.claude/learnings/**` · `knowledge/README.md` khỏi phép đếm. Tài liệu là load-bearing
nhưng **review bằng cách khác**: đọc văn xuôi, không truy vết luồng thực thi. Gộp chúng
vào một ngưỡng làm ngưỡng sai theo cả hai chiều — một PR 500 dòng ADR bị chặn oan, còn
300 dòng hook thì lọt vì *"đa số là docs"*.

`AGENTS.md` **cố ý không** được loại: nó nạp vào mọi phiên của mọi người nên nó là chỉ
thị đang thi hành. Tính theo token × số lần đọc, đó là file đắt nhất repo.

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
