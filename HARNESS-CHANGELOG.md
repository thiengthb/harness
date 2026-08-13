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

## 2.77.0 — 2026-08-13

**minor.** Hai field ngân sách đi cùng một đường xuống consumer (`apply-to.mjs:48` chép
`harness.config.json`). Một cái có gác, một cái không — và cái không có gác rò nặng hơn.

### Thiệt hại, đo trên hàm thuần

| repo | cap | plan | chi thật | phán quyết |
|---|---|---|---|---|
| consumer | $50 | `metered` | $500/30 ngày | **`over` 1000%** |
| consumer | $50 | `flat` *(thừa kế)* | $500/30 ngày | `flat-limited`, `percent = null` |

Một cap sai chỉ mang theo một con số sai. `plan: flat` thừa kế **tắt hẳn phép so cap** — và
`docs/ECONOMICS.md` gọi cap là *"lớp duy nhất gây thiệt hại tài chính TRỰC TIẾP"*.

Không phải rủi ro giả định: `setup.mjs` **không hỏi** `plan`, nên đường duy nhất field này vào
config là sửa TAY. Xảy ra thật 2026-08-13 09:50; `protect-harness.mjs` vẫn chặn nguyên, nhưng
sửa tay không đi qua tool nên `harness-edits.log` không thấy — thứ phát hiện ra là `git status`.

### Gác mới: `template-plan`

Phân biệt theo **nguồn**, không theo giá trị. `budget.plan` trong config CHẢY XUỐNG;
`HARNESS_BUDGET_PLAN` (ở `settings.local.json` của từng người) thì không. Nên:

- template + `plan` khai bằng **config** ⇒ `due`, kèm đường đi tiếp;
- template + `plan` khai bằng **env** ⇒ đo bình thường, không kêu;
- **consumer** ⇒ không bao giờ kêu (ở đó `plan` không chảy đi đâu nữa, và một repo solo khai gói
  của chính mình là hợp lệ). Gộp hai nguồn lại là bắn nhầm vào người đã làm đúng — `L0002`.

Đặt trước nhánh gói-phẳng, cùng chỗ và cùng lý do với `template-cap`. Cap kêu trước khi cả hai rò.

### Và thứ tìm ra khi mutation-test bản vá trên

`MODES` — danh sách mode mà hai ca "doctor có đủ dòng" + "rituals phân nhánh đủ" đối chiếu — là
một **mảng khai tay**. `template-plan` vào codebase với **đúng 0 coverage**: bỏ nhánh khỏi
`rituals` ⇒ suite XANH; bỏ dòng khỏi `harness-doctor` ⇒ suite XANH. Trong khi cả hai ca vẫn in
một con số đọc như độ phủ (*"đủ 11 mode"*).

Nay bóc từ nguồn `budgetStatus`, kèm **sàn 13**: `MODES` rỗng làm cả hai ca
`filter(...).length === 0` ⇒ xanh vô căn cứ, đúng chiều dễ chịu của `L0005`.

### Điều kiện tiên quyết: bộ eval đang ĐỎ, và nó đỏ vì chính nó hỏng

Đo trên `main` sạch (`c534fc8`), không liên quan bản vá trên: eval `0007` gọi `m.mergeBaseline`
sau khi `import('./tooling/lib/harness.mjs')`, nhưng hàm đó export ở `tooling/rituals.mjs` và
**chưa bao giờ** ở lib (`git log -S` trên lib: không một commit nào). ⇒ `TypeError` ⇒ cả assertion
chết ⇒ `✗ EVAL — 1 FAIL`, exit 1. Task đó chấm *"agent có viết ca cho chiều còn lại không"*, nên
phép đo im lặng đo một crash thay vì đo điều nó tuyên bố đo.

CI chạy `evals/run.mjs --dry` (đúng — chiều thật cần mạng + agent), nên assertion **không bao giờ
được thực thi ở CI** và lỗi này vô hình ở đó.

Nay `tooling/test-evals.mjs` (CI **có** chạy) đối chiếu tĩnh: mọi `m.NAME(` trong một assertion
phải có thật ở module mà assertion đó import — 20 lời gọi, kèm sàn 10 chống phép-bóc-trôi. Một
câu hỏi tất định thì đừng để nó chờ một lần chạy có mạng mới trả lời.

BREAKING: không. `configPlan` mặc định `null` ⇒ mọi bên gọi cũ giữ nguyên hành vi.

---

## 2.76.0 — 2026-08-13

**minor.** `v2.75.0` vá `runConfigured`. Cùng lớp lỗi vẫn còn nguyên ở **tầng dưới nó**:
`run()` — nguyên thuỷ mà `git()` và 60+ nơi khác đi qua — cũng `stdio: 'pipe'` mà không khai
`maxBuffer`.

Đây đúng hình dạng `L0007` mô tả: một bản vá đúng, viết cho **ca đã nhìn thấy**, và cái cùng
gốc rễ ở chỗ khác không có triệu chứng nào nên không ai đi tìm.

### Tái hiện — không phải suy luận

```
run('node', ['-e', 'process.stdout.write("x".repeat(N))'])

  N = 500 KiB  →  status 0  ·  nhận đủ 512 000 byte
  N = 2 MiB    →  status 1  ·  nhận 1 059 776 byte      ← tiến trình con exit 0 ở CẢ HAI ca
```

Hai hại riêng biệt trong cùng một dòng: lệnh **thành công đọc ra là hỏng**, và `stdout` bị
**cắt cụt im lặng**.

### Ngòi nổ hiện thực

`git()` đi qua `run()`, nên **mọi phép đo git của harness** đang chịu trần 1 MiB.

`git status --porcelain` ≈ 45 byte/dòng ⇒ vỡ ở **~23 300 file bẩn**. Một repo tiêu thụ quên
gitignore `node_modules` là quá đủ — đo trên máy phát hiện: **57 737** file (`sakubun`),
**35 709** (`warehouse`).

Khi đó `dirtyFiles` trong `collect()` thành `null`, và `/handoff` ra `?` với lý do *"không đọc
được cây làm việc (`git status`)"*. Triệu chứng đúng, nguyên nhân sai: git không hỏng, cái trần
này mới hỏng.

Ở repo template hiện tại output lớn nhất là **32 952 byte** (`test-hooks`) — nên đây là **bom
hẹn giờ chưa nổ**, không phải sự cố đang xảy ra. Ghi rõ để không ai đi tìm triệu chứng ở đây.

### Ba sửa

1. `run()` khai `maxBuffer`.
2. `status === null` **không** còn gộp vào `r.status ?? 1`. Giữ `status: 1` để **fail-đóng** —
   một lệnh bị cắt cụt không được đọc thành thành công — nhưng nói ra ở `signal` / `error` /
   `detail`. Ba trường thêm là **phụ**: hợp đồng cũ `{status, stdout, stderr}` không đổi, nên
   60+ nơi gọi không phải sửa gì.
3. **`MAX_BUFFER` là MỘT hằng số.** Ngưỡng này vừa có bản chép thứ ba (`runConfigured` ·
   `evals/run.mjs` · và `run()`, nơi vốn không khai gì cả). Ba bản chép của một ngưỡng thì trôi
   khỏi nhau, và bản trôi chậm nhất luôn là bản không ai nhớ là nó tồn tại — cùng lý do
   `versionCmp`, `codeOnly`, `handledGroups` đều đã phải gom về một chỗ.

### Bằng chứng

Sàn **283 → 284**. Suite `284/284 exit 0` · doctor · migrations · evals đều exit 0.

Ca này là **HÀNH VI, không phải quét nguồn** — `run()` spawn được ngay trong test, khác
`runConfigured` (cần một project đã cấu hình mới chạy thật). Ca hành vi không mục khi ai đó đổi
cách viết, và nó bắt được cả chế độ hỏng chưa ai nghĩ ra tên.

Ba mutant, mỗi cái giết một **nhóm khẳng định khác nhau**:

| mutant | ca bị giết |
|---|---|
| bỏ `maxBuffer` khỏi `run()` | `status=1` ở 2 MiB · `stdout` cắt còn 1 059 776 byte |
| tắt nhánh `status === null` | thiếu `error` · `detail` không nói *"KHÔNG PHẢI mã lỗi"* |
| một bản chép literal quay lại | ngưỡng viết bằng số ở 1 chỗ |

Và có ca **chiều ngược**, để bản vá không thành *"cái gì cũng là sự cố hạ tầng"*: lệnh `exit 3`
phải ra `status 3` với `detail` im.

### Parity: bản đầu của ca test ĐỎ ở Windows, và đó là ca test hỏng

`run()` mặc định `shell: IS_WIN`, nên trên Windows lệnh đi qua `cmd.exe` và dấu nháy trong
`-e "…"` bị nát — `0 byte`, trông y hệt bug `maxBuffer`. Ca nay truyền `shell: false`, đúng
đường mà `git()` (nạn nhân chính) đi qua.

Cò của ca ② cũng đổi: **binary không tồn tại** (`ENOENT`) thay cho `SIGKILL`. Windows KHÔNG có
signal — `process.kill(pid,'SIGKILL')` ở đó chỉ là `TerminateProcess` và `spawnSync` trả
`signal: null`. Một ca dựng trên `signal` đỏ ở đúng một OS; `ENOENT` khoá cùng nhánh code mà
giống nhau ở cả ba.

---

## 2.75.1 — 2026-08-13

**patch.** Một ca trong `test-hooks.mjs` khẳng định thứ **chỉ đúng ở repo template**, nên nó đỏ
vĩnh viễn ở mọi project đã áp template. Đo được 2026-08-13, khi một repo tiêu thụ bắt kịp từ
2.13.0 lên 2.75.0 và suite đỏ ở đúng ca đó.

## Ca ②

```js
[null, { HARNESS_CONFIG: UNCONF(), CI: '1' }, OK, 'TEMPLATE + phiên không người → CHO QUA', /REPO TEMPLATE/]
```

`root: null` nghĩa là **chính repo đang chạy suite**, nên VAI của nó là biến chứ không phải hằng.
Ở repo tiêu thụ, `gates.mjs` fail-đóng (exit 2) — **đúng như thiết kế**, và ca ④ ngay bên dưới
khẳng định chính điều đó. Nên ca ② không phát hiện lỗi gì; nó chỉ ghi lại giả định "suite này
luôn chạy trong template".

Đây là `knowledge/lessons/0003` — self-test của template khẳng định thứ chỉ đúng trong template —
và trớ trêu là nó nằm cùng file với dòng RATCHET đang trích dẫn chính bài học đó.

**Cửa ra:** ca ② chỉ vào danh sách khi `repoRole() === 'template'`; ngược lại cộng vào `skipped`,
để một ca bỏ qua CÓ CHỦ Ý không đọc giống một ca NGỪNG CHẠY. Sàn giữ nguyên 283 ở cả hai vai.

Ba ca `root: null` còn lại không đụng tới, và lý do được ghi tại chỗ kẻo lần sau có người dọn cho
đồng bộ: ① và ③ mong đợi OK ở **cả hai** vai, ⑥ mong đợi BLOCK ở cả hai. Chỉ ② phân biệt vai.

## Một cái bẫy đo được trong chính bản vá

Bản đầu cộng thẳng vào `skipped`, biến được `let` ở gần cuối file ⇒ **ReferenceError** (temporal
dead zone). Nó KHÔNG nổ ở template, vì ở đó nhánh này không chạy — chỉ nổ ở repo tiêu thụ, đúng
lớp lỗi mà bản vá đang sửa, chỉ ngược chiều. Nay đếm qua `gateCaseSkipped` khai ở module scope
trước chỗ dùng, và đã chốt bằng cách chạy suite ở một repo tiêu thụ thật: `278/279 · 4 n/a`.


## 2.75.0 — 2026-08-13

**minor.** Một gate có thể đỏ vì **lượng log nó in ra**, không vì kết quả nó đo. Cơ chế đã nằm
trong `runConfigured` từ đầu, và nó vô hình đúng cho tới ngày một gate bắt đầu in nhiều.

## Chế độ hỏng

`spawnSync(..., { stdio: 'pipe' })` không truyền `maxBuffer` thì Node áp mặc định **1 MiB**. Vượt
ngưỡng, Node **không truncate — nó GIẾT tiến trình con**: SIGTERM, `status: null`, `error.code =
'ENOBUFS'`. Nhánh mặc định `stdio: 'inherit'` che ca này, nên bug chỉ nổ ở lời gọi
`capture: true`, tức đúng những gate in nhiều nhất.

Đo trên một project đã áp template (2026-08-10): gate `e2e` pipe cả log dev server, tổng output
dao động quanh **đúng 1 MiB**, nên **cùng một commit lúc XANH lúc ĐỎ** — 4 lần OK / 2 lần FAIL
trên cùng base. Report Playwright của đúng lần "FAIL" cho **28/28 test PASS**: gate nói đỏ trong
khi bộ test nói xanh.

| stdout của lệnh | `status` | `signal` | `error` | kết quả |
|---|---|---|---|---|
| 100 KB | `0` | - | - | PASS |
| 2 MB | `null` | `SIGTERM` | `ENOBUFS` | **FAIL** |
| 2 MB + `maxBuffer: 64MB` | `0` | - | - | PASS |

## Lỗi thứ hai, và nó đắt hơn

`return { status: r.status ?? 1 }` **ném đi** `r.signal` và `r.error`. Một sự cố HẠ TẦNG được
báo cáo y hệt một test đỏ, nên người đọc CI đi tìm bug trong test của mình — chỗ không có gì
sai. Cùng lớp lỗi mà `gen-clean` và `runGate` đã phải sửa: **MÀU đúng chưa đủ, CHẨN ĐOÁN phải
đúng.**

## Cửa ra

1. `maxBuffer: 64 * 1024 * 1024` khi `stdio` là `'pipe'`.
2. `status === null` có nhánh riêng: trả `signal`, `error`, và một `detail` nói thẳng *"KHÔNG
   PHẢI lệnh trả mã lỗi"*. `gates.mjs:96` đã đọc `r.detail ?? …` từ trước, nên nó hiện ra ngay
   mà không cần đổi chỗ nào khác.

**Không BREAKING:** hai field mới (`signal`, `error`) là thêm vào; `status` giữ nguyên kiểu số.

## Gác

`test-hooks.mjs` +2 ca (sàn 281 → **283**). Test CẤU TRÚC, cùng lý do như ca `SECRET_PATTERNS`:
chế độ hỏng không phải "logic sai" mà là "một đợt refactor bỏ mất hai dòng", và hành vi không
dựng được rẻ vì `config()` cache module-level. Đã chốt bằng **phép thử ngược**: bỏ `maxBuffer`
đi thì suite ĐỎ (`282/283`, exit 1), đắp lại thì `283/283`.


## 2.74.0 — 2026-08-13

**minor.** Ba nghi thức nói ra một câu mà con số đằng sau nó không nói. Cùng một chế độ hỏng,
ba nạn nhân — nên sửa cùng lô, vì tách ra thì cái thứ ba đọc như một chuyện vặt về chữ nghĩa.

Chế độ hỏng: **một cảnh báo đúng-về-trạng-thái vẫn dạy sai người đọc**, và người đọc hiệu chỉnh
niềm tin xuống. Đó là cách mọi cảnh báo mất giá — không cần cái nào sai hẳn.

## ① `/knowledge-promote` đếm FILE, đáng lẽ đếm ỨNG VIÊN

Nó đếm file trong `.claude/learnings/` mới hơn bài học mới nhất. Phép đếm đó gộp *"có bài học
tồn tại"* với *"có bài học SẴN SÀNG promote"*.

Hệ quả: `/harness-retro` **bắt buộc** ghi một file vào đúng thư mục đó, nên chạy đúng hai nghi
thức theo đúng thứ tự **kết thúc bằng đèn đỏ y như lúc bắt đầu** — kể cả khi kết luận của retro
là *"không có gì đáng promote"*. Ghi sổ 2026-08-05, còn nguyên tới 2026-08-13.

Một tín hiệu mà **hành động đúng không tắt được** là tín hiệu sẽ bị bỏ qua (`L0008`).

**Cửa ra:** file tự khai `promote: <lý do>` trong frontmatter. Mặc định **vắng = vẫn là ứng
viên**, nên 17 file learnings đang có không đổi hành vi — cửa chỉ mở khi có người chủ động khai.
Trả **lý do** chứ không phải boolean, cùng lý do `--close` bắt buộc có lý do.

`_TEMPLATE.md` và `/harness-retro` bước 5 dạy đúng cửa đó; `harness-doctor` in số file đã khai,
vì một cơ chế im lặng là cơ chế không ai biết mình đang dùng.

## ② `/handoff` đo một đại lượng, giải thích bằng một đại lượng KHÁC

Nó đo `ahead` (chưa vào nhánh tích hợp) rồi in *"đó là thứ biến mất khi bạn đổi máy"*.

Hai đại lượng khác nhau, và chỉ một cái biến mất:

| đại lượng | ý nghĩa | mất khi đổi máy? |
|---|---|---|
| `dirtyFiles` | chưa commit | **có** |
| `unpushed` | chưa ở remote NÀO | **có** |
| `ahead` | chưa vào nhánh tích hợp | **không** — đã push thì nó nằm trên remote |

Đo 2026-08-13, ngay sau khi push nhánh và mở PR `#198`: mục đỏ nói 2 commit sắp mất, trong khi
cả 2 đang nằm an toàn trên remote.

Thêm phép đo `unpushed` = `git rev-list --count HEAD --not --remotes`. Không dùng
`@{upstream}..HEAD`: nhánh chưa có upstream thì `@{u}` **ném lỗi**, và ca đó (nhánh vừa tạo,
chưa push) chính là ca cần đo nhất.

Trạng thái "đã đẩy, chưa merge" **vẫn `due`** — không có gì để mất, nhưng phiên sau không biết
nó đang chờ gì. Đổi câu, không tắt tín hiệu.

## ③ Bộ đếm skill có điểm mù, và điểm mù đó nuôi một quyết định XOÁ

`/entropy-sweep` §3 nói *"Skill nào không được dùng 2 tuần qua? → đề xuất bỏ"*, và nguồn duy
nhất cho "được dùng" là sổ `skill-calls` — do ô `UserPromptExpansion` ghi.

**Đo trực tiếp 2026-08-13:** gọi skill bằng công cụ `Skill` (model tự gọi) **không tạo mục
nào** — `skill-calls.log` thậm chí không được sinh ra. Đã loại trừ hai nguyên nhân dễ đổ lỗi: ô
**có** đăng ký trong `settings.json`, và `native-surface` xác nhận sự kiện **có** trong binary
(31 sự kiện, tập không đổi so với lần ghi 2.1.228). Nên nguyên nhân là ngữ nghĩa sự kiện, không
phải dây điện.

Ở repo này **3/12 skill model gọi được**. `0 lần` không phân biệt được *"chết"* với *"chỉ model
gọi"*.

Không vá được đường ghi từ đây — nó cần `PreToolUse` trong `settings.json` và `observe.mjs`,
cả hai đều là **vùng cấm**, tức `/harness-propose`. Vá được là **đường đọc**:

- `slotCounters().skills` mang theo `blindTo` ở **mọi** lần đọc. Bản trước chỉ cảnh báo ở nhánh
  `total === 0`, nên ở mọi con số khác 0 phạm vi bị giấu hoàn toàn.
- `harness-doctor` in `skill NGƯỜI GÕ … (KHÔNG thấy: …)` — cái tên tự khai phạm vi.
- `/entropy-sweep` đòi **bằng chứng thứ hai** trước khi đề xuất bỏ: `disable-model-invocation:
  true` trong frontmatter (⇒ bộ đếm THẤY được nó, nên `0` mới có nghĩa), hoặc `rg` không ra
  tham chiếu sống.

### Bằng chứng

Sàn **276 → 281**. Suite `281/281 exit 0` · doctor exit 0 · migrations, evals exit 0.

**Cả ba đã mutation-test, và mỗi mutant chỉ giết ca của chính nó:**

| mutant | ca bị giết |
|---|---|
| `promoteDeclined` luôn trả `null` | 1 ca `promoteDeclined` |
| `atRisk` quay về đọc `ahead` | ca `handoff` *"commit ĐÃ ở trên remote mà vẫn bảo biến mất"* |
| bỏ `blindTo` | 2 ca `slotCounters` (có dữ liệu · sổ rỗng) |

Ca ② cố ý dựng **hai trạng thái cùng `ahead: 2`, khác nhau đúng ở `unpushed`** — một ca thôi
thì mutant "quay lại đọc `ahead`" sống sót.

---

## 2.73.0 — 2026-08-13

**minor.** `claude-code-drift` thôi giả định drift chỉ đi một chiều. `versionCmp()` lên `lib`
làm phép so DÙNG CHUNG, và `mergeBaseline()` thôi hạ mốc đã rà.

### Lỗi

`reviewedVersion` là sự thật **của repo** — nó được commit, và máy ghi nó có thể không phải máy
bạn. Version đang chạy là sự thật **của máy này**. Hai đại lượng khác chủ ngữ thì lệch được
theo **cả hai chiều** — nhưng phép so là `!==`, một phép so **không có chiều**.

Đo 2026-08-13: sổ đã rà `2.1.228` (máy khác ghi), máy này chạy `2.1.222`. Nghi thức in:

```
Claude Code đã đổi 2.1.228 → 2.1.222: đọc changelog bản mới…
```

`2.1.222` là bản **cũ hơn**. Không có changelog nào chưa đọc. Việc đúng là KHÔNG LÀM GÌ.

Cùng lớp lỗi với **#194** (*check tag chỉ hỏi một chiều*) — lần thứ hai của lớp này.

### Vì sao nó tệ hơn một dòng chữ sai

Ở chiều lùi, hành động **duy nhất** tắt được đèn đỏ là chạy `--reviewed-claude-code` — và làm
thế sẽ **hạ `reviewedVersion` đã commit từ `2.1.228` xuống `2.1.222`**, tức vứt một bản rà của
đội để làm xanh một mục trên máy mình. Từ đó `2.1.223`–`228` đọc thành *"chưa ai rà"* trong khi
bản ghi của chúng vẫn nằm ngay trong `history`.

Đó đúng là `L0008`: *một tín hiệu TỚI HẠN phải TẮT ĐƯỢC bằng hành động nó đề nghị* — ở đây
hành động nó đề nghị gây thiệt hại.

### Ba sửa

1. **`versionCmp()` lên `lib` và được EXPORT.** Phép so này vốn khoá bên trong `releaseTagGap()`.
   Hai bản chép của cùng một phép so sẽ trôi khỏi nhau — đúng điều `codeScanDesync` và
   `handledGroups` tồn tại để chặn. Nó trả **`null`** khi không so được, không phải `0`: *"không
   đọc được dạng số"* và *"hai version bằng nhau"* là hai câu khác hẳn.
2. **Nghi thức phân biệt ba chiều.** Tiến ⇒ `due` (như cũ). Lùi ⇒ `ok`, kèm câu **cản** người
   chạy lệnh rà. Không so được ⇒ `?`, không im lặng coi như bằng nhau.
3. **`mergeBaseline()` coi `reviewedVersion` là một ĐỈNH**, không phải "lần gần nhất". Rà một
   bản cũ hơn thì mốc giữ nguyên và `history` vẫn nhận bản ghi — việc đã làm không mất.
   `reviewedAt` đi **cùng** `reviewedVersion`: giữ version cũ mà nhận ngày mới là khai một bản
   rà chưa từng xảy ra.

### Bằng chứng

Sàn **273 → 276**. Suite `276/276 exit 0`, doctor exit 0.

Chiều ① của bản vá là chiều **ồn** (dòng chữ sai, ai cũng đọc thấy); chiều ③ là chiều **lặng**
— một con số âm thầm tụt lại, không triệu chứng. `L0007` nói đúng chỗ này, nên **cả hai chiều
đều có ca và cả hai đều đã mutation-test**:

| mutant | ca bị giết |
|---|---|
| `drift` quay về `!==` | 3 ca `claude-code-drift` (lùi ×2 + không-so-được) |
| `keepPrev = false` | 2 ca `mergeBaseline` (hạ mốc · cặp version↔ngày nói dối) |

Và ca chiều ngược cũng có, để bản vá không thành *"không bao giờ cập nhật"*: bản mới hơn vẫn
nâng được mốc, và một `reviewedVersion` là chuỗi rác không khoá được mốc mãi.

---

## 2.72.0 — 2026-08-13

**minor.** `fixlog.mjs` thôi mất dữ liệu im lặng — **hai đường**, cả hai đều tìm được bằng
cách dùng chính công cụ đó trong một phiên.

Cùng một mục đích, vì cả hai đều là **cùng một chế độ hỏng ở cùng một file**: cái sổ mà toàn
bộ vòng học đứng trên, tự đánh rơi hoặc tự làm bẩn dữ liệu của nó mà không kêu một tiếng.

## ĐƯỜNG 1 — một CỜ không phải là NỘI DUNG

Thêm `--help`/`-h`, và cửa thoát POSIX `--` cho nội dung thật sự mở đầu bằng dấu gạch.

### Lỗi

Nhánh mặc định nhận mọi đối số không khớp năm cờ đã biết làm nội dung. Nên `--help` — cờ quy
ước nhất của mọi CLI — **ghi một dòng rác vào chính cái sổ mà công cụ này tồn tại để giữ
sạch**, rồi in `✓ đã ghi (tổng 17)` như thể vừa làm đúng.

Nó không phải giả thuyết: ghi sổ **2026-08-05** (mục 12/16 của `manual-fixes.log`), tái hiện
**y nguyên 2026-08-13** trên v2.71.0 — 59 minor version ở giữa, và không lần nào có triệu
chứng nào ngoài một dòng rác không ai đọc lại.

### Vì sao chặn theo HÌNH DẠNG, không theo tên cờ

Thứ làm bẩn sổ không phải chữ `help` mà là **nhánh mặc định**. `--to` (gõ hụt `--top`),
`--lst`, `--closs` đều hạ cánh vào đúng chỗ đó và đều im lặng y hệt. Thêm mỗi một ca `--help`
là vá cái triệu chứng đã nhìn thấy và để nguyên cả lớp — đúng lỗi mà #149 đã bỏ khi chuyển
`mergeBaseline` từ danh-sách-tên sang bất biến tổng quát.

Với một công cụ mà đầu ra là **dữ liệu được giữ lâu**, mặc định "không nhận ra ⇒ chắc là nội
dung" sai chiều. Không nhận ra thì phải KÊU.

### Cửa thoát `--` không phải cho đủ lệ

Sổ này đầy dòng nói về `--force`, `--auto-approve`, và mục mô tả chính bug này mở đầu bằng
`--help`. Một guard chặn cả nhóm mà không có đường thoả là guard bắn nhầm (`L0002`), và ở đây
ca bắn nhầm lại đúng là ca thường gặp nhất của chính repo này.

### Bằng chứng

`test-hooks` ⑩ khoá bốn chiều: `--help` im · cờ gõ sai kêu ở **stderr** và không ghi · `--`
cứu được nội dung mở đầu bằng gạch · đường thường không hỏng. Sàn **271 → 272**.

Ca test đã bị **mutation-test**: tắt bản vá ⇒ 6/6 khẳng định đỏ, suite exit 1. Nó không phải
một ca trang trí chưa từng đỏ.

## ĐƯỜNG 2 — trần của `--top` giấu đúng phần đang là việc

`--top` cắt ở 15 nhóm và **vứt phần dư không nói gì**. Trên sổ thật, phép cắt đó cắt **sai
đầu**.

### Số đo, 2026-08-13

Sổ có **17 nhóm, 14 đã đóng**. Mọi nhóm đều `1×`, nên phép sắp theo tần suất rơi về thứ tự
chèn — và hai nhóm bị trần đánh rơi là hai nhóm **mới nhất**, tức đúng hai mục **chưa ai xử**.

Kết quả: `rituals` nói *"2/17 mục fixlog chưa xử"*, còn `--top` — chính cái lệnh mà bảng nghi
thức chỉ bạn tới để XEM chúng — hiện đúng **1**. Hai công cụ, hai con số, cho cùng một câu
hỏi. Đó là lớp lỗi mà mục fixlog về `accept.mjs`/`rituals`/`doctor` đã ghi từ 2026-08-05.

### Hai sửa, và cái thứ nhất chữa gốc

1. **CHƯA XỬ đứng trước ĐÃ XỬ**, rồi mới tới tần suất. Một nhóm đã đóng không còn là việc,
   nên nó không được chiếm suất của một nhóm đang là việc.
2. **Phần bị cắt tự khai**, kèm bao nhiêu trong đó chưa xử. Một cái trần không nói gì đọc y
   hệt *"đã in hết"* — và với công cụ có nhiệm vụ KHÔNG ĐÁNH RƠI phát hiện nào, đó là chế độ
   hỏng tệ nhất nó có thể có.

### Bằng chứng

`test-hooks` ⑪ dựng 20 nhóm (16 đã đóng, 4 mở) — nhiều hơn trần, và phần mở nằm ở đúng vị
trí bản cũ đánh rơi. Ca này còn **khẳng định fixture dựng đúng** trước khi đo, vì khi viết nó
16 lệnh `--close` từng bị từ chối do tên lồng tiền tố nhau và ca đỏ ở một khẳng định **khác**.

Sàn **272 → 273**. Suite `273/273 exit 0`. Mutation-test: trả phép sắp về tần suất-đơn-thuần
⇒ ca đỏ với đúng câu *"trần của --top GIẤU 4/4 nhóm CHƯA XỬ"*.

---

## 2.71.0 — 2026-08-12

**minor.** `TaskCompleted` được cắm — **chạy KHÔNG ĐẠN**. Nó ghi đúng con số mà quyết định
"có nên lên đạn không" cần, và không chặn ai trong lúc đo (#131).

Đóng nốt nhóm #129: **6/6 ô** đã cắm, **11 file hook** (không đổi từ 2026-08-05).

### Ô duy nhất trong nhóm mà vendor cho CHẶN

Đo từ binary 2.1.228: *"`TaskCompleted` — Exit code 2 — show stderr to model and **prevent task
completion**"*. Và nó bắn đúng khoảnh khắc lời tuyên bố được đưa ra — sớm hơn hẳn `Stop`/CI, nơi
lớp lỗi *"agent tự khen, mark done sớm"* đang bị bắt.

### Vì sao CHƯA lên đạn — ba lý do, không phải "để sau"

1. Payload **không trỏ tới sản phẩm nào** (`task_id`, `task_subject`, `task_description`), nên
   gate phải **tự đi tìm** thứ để kiểm. Một guard phải đoán là một guard bắn nhầm được.
2. `L0002` vừa tính xong cái giá của guard bắn nhầm — **hai lần trong tuần này** (#160, #177).
3. Canary 2 ngày **không chạy được** bởi agent, và đó là thứ duy nhất đo được tỉ lệ bắn nhầm.

Nên lô này ghi con số ấy thay vì đoán nó:

```
node tooling/harness-doctor.mjs
  task ĐÁNH DẤU XONG 7 ngày: 24 lần · 3 lần gate SẼ chặn nếu được lên đạn (13%)
```

**Đó chính là canary, chỉ khác là nó không chặn ai trong lúc đo.** Lên đạn về sau là một dòng,
có số liệu đứng sau.

### MỘT định nghĩa của "tự khen", hai bên đọc

`selfPraiseClaims()` ra `lib`, và `check-feature-integrity.mjs` **gọi** nó thay vì giữ bản chép.
Hai bản chép của luật này sẽ bất đồng về câu *"đã xong chưa"* — câu đắt nhất trong repo, và đúng
hình dạng của #125. Có ca test bắt `check-feature-integrity` phải gọi hàm đó.

Phép hợp nhất `a11y`/`perf` (anh em của `platforms`, không nằm trong nó — lỗ đã có thật trước
2.3.0) nằm trong hàm chung, nên cả hai bên thừa hưởng.

---

## 2.70.0 — 2026-08-12

**minor.** `PreCompact` + `SessionEnd` ghi mốc mất context, và **`/handoff` tự tới hạn** khi
quãng làm việc đó chưa ai ghi lại (#130).
Kèm **một bản vá cho v2.67.0**: rule backtick để lọt đúng nhóm nó sinh ra để bắt.

### `/handoff` chưa chạy lần nào, và đó không phải lỗi của người dùng

`rituals` đo được `/handoff` **chưa chạy lần nào** kể từ khi harness ra đời. Khi context bị nén
hoặc phiên kết thúc, **0 byte** được ghi tự động.

Hai tín hiệu cũ của `/handoff` đều đo qua **commit**. Nhưng quãng nguy hiểm nhất **không có
commit nào**: bạn làm việc, context bị nén, và thứ mất là những gì **chưa thành commit**.

```
▸ /handoff   context bị nén/kết phiên 3 giờ trước, SAU lần sửa docs/progress/144.md gần nhất
             — quãng làm việc giữa hai mốc đó chưa ai ghi lại, và nó không có commit nào để suy ngược
```

**Ghi một MỐC, không ghi một BẢN SAO.** Cám dỗ là chụp trạng thái git vào file mốc. Không làm:
`rituals.collect()` đã đọc hết những thứ đó ở phiên sau, và chép lại là dựng bản sao thứ hai của
một sự thật (#125). Thứ **chỉ ở đây mới biết** là *thời điểm* context biến mất.

**Đo được, cố ý KHÔNG dùng:** vendor khai `PreCompact` → *"exit 0 - stdout appended as custom
compact instructions"*, tức mọi thứ in ra đó thành **chỉ thị cho phép nén**. Mạnh hơn hẳn thứ
issue hình dung — và vì thế nó không thuộc `observe.mjs`, file khai ở dòng đầu là *"quan sát,
không quyết định gì"*. Có ca test khẳng định hook **không in gì** ở nhánh này.

### Vá v2.67.0: rule backtick để lọt LỆNH NHIỀU DÒNG

`simpleCommands()` cắt theo `\n`, nên một đối số nhiều dòng bị xé và mảnh mang backtick **không
còn `program` là `node`**:

```
node -e "        → program=node,   không backtick
const s = `a`    → program=const,  CÓ backtick     ← gate chương trình trượt ở đây
```

Bảy lần đã đo đều là **văn bản nhiều dòng** — tức rule trượt đúng nhóm nó sinh ra để bắt. Bộ ca
test ban đầu toàn lệnh **một dòng** nên nó xanh suốt; lỗ chỉ lộ ra khi guard **để lọt một lệnh
thật**, một giờ sau khi merge.

`simpleCommands(cmd, { splitNewlines: false })` là cờ mới; **mặc định không đổi** — phép cắt
theo `\n` là nền của #43, và đổi nó là đổi hành vi của cả 12 rule để chữa một rule.

---

## 2.69.0 — 2026-08-12

**minor.** Ba ô native nữa vào cùng chậu `observe.mjs`: **`UserPromptExpansion`** (#135),
**`SubagentStart`/`SubagentStop`** (#136), **`PermissionDenied`** (#137).

**Số file hook vẫn 11.** 14 sự kiện được cắm, 11 file — đó là toàn bộ điểm của "cùng một chậu".

### Ba câu hỏi harness trước giờ chỉ SUY được

| | trước | nay |
|---|---|---|
| skill nào thật sự được gọi | suy từ artefact (*"`reservations/` chỉ có README"*) — sai được | đếm trực tiếp |
| bao nhiêu subagent chạy ĐỒNG THỜI | con số **16** trong `AGENTS.md`, chưa ai đo | đỉnh đường cong start/stop |
| vendor chặn việc thật bao nhiêu lần | **không có số nào** | đếm theo `tool_name` × `reason` |

### Hai chỗ một con số sẽ nói dối, cả hai có ca test riêng

**① "ĐỒNG THỜI" không phải TỔNG.** Ba lần khởi động rải rác một tuần không phải ba agent cùng
lúc. `slotCounters` duyệt hai loại mốc theo **thứ tự thời gian** (`+1` mỗi `start`, `−1` mỗi
`stop`) và lấy đỉnh. Vì thế `SubagentStop` cũng phải gọi `observe` — một mình `Start` không nói
được "đồng thời". Thiếu mốc kết thúc thì đỉnh **chỉ có thể cao hơn sự thật**, nên `unpaired`
được in ra cạnh nó.

**② `reason: "hook"` là lần chặn của CHÍNH TA.** Tập giá trị `reason` của vendor bao gồm cả
`hook`. Gộp nó vào *"vendor chặn việc thật"* là **tự đếm mình hai lần**, và thổi phồng đúng con
số đang định dùng để tranh luận (`L0005`).

### Chi phí đã biết

`SubagentStop` nay chạy **hai** hook (`gates.mjs --stage subagent` + `observe.mjs`). Trần của ô
đó là **< 5 giây** (`AGENTS.md`), sàn runner đo được là 91ms; thêm một spawn ~60–90ms là ~2%
trần. Đo lại bằng `node tooling/gates.mjs --list --timing`.

Và nếu gate ở `SubagentStop` **chặn**, lời gọi `observe` sau nó có thể không chạy ⇒ thiếu mốc
`stop` ⇒ `unpaired` tăng. Con số đó được in, không bị nuốt.

### Không tự động cắt skill theo dữ liệu mới

`/entropy-sweep` **vẫn** đếm `12/12`. Một tuần dữ liệu chưa nói được skill nào chết, và dựng một
ngưỡng trên tập dữ liệu vừa mới bắt đầu chảy là đúng lỗi `L0008`. Doctor in số; ngưỡng đợi đủ
cửa sổ.

---

## 2.68.0 — 2026-08-12

**minor.** Hai ô native được cắm vào `observe.mjs`: **`PostToolUseFailure`** (em họ tự động của
`fixlog`) và **`Notification`** (ma sát người↔agent). Quan sát, **không chặn gì**.

Số hook **không đổi** (11) — cả hai vào cùng cái chậu đã có.

### Vì sao: tầng CAPTURE đang dựa vào trí nhớ

`fixlog` là *"3 giây người phải NHỚ gõ"*. Đây là phần máy ghi được mà không ai phải nhớ.

```
node tooling/harness-doctor.mjs      # §VÒNG HỌC, ngay cạnh fixlog
  ma sát 7 ngày: 3 lần công cụ HỎNG · 1 lần NGƯỜI dừng · 2/9 thông báo là "chờ người vượt ngưỡng"
       hay hỏng nhất: Bash 2 · Edit 1
```

### Hai ranh giới ĐO TỪ BINARY, không đoán từ tài liệu

Schema lấy thẳng từ `claude.exe` 2.1.228:

```
PostToolUseFailure  { tool_name, tool_input, tool_use_id, error, is_interrupt?, duration_ms? }
Notification        { message, title?, notification_type }
```

1. **`is_interrupt` là cột RIÊNG.** Nó nghĩa là *người bấm dừng* — một quyết định, không phải
   một lỗi. Gộp vào `errors` cho ra câu *"công cụ này hay hỏng"* trong khi sự thật là *"tôi hay
   bấm dừng nó"* (`L0005`, phía dễ chịu).

2. **`idle_prompt` KHÔNG mang thời lượng** — và điều này **bác một nửa câu hỏi gốc của issue**.
   Vendor bắn nó khi thời gian chờ vượt `messageIdleNotifThresholdMs`, một ngưỡng **người dùng
   chỉnh được**. Nên con số là *"số lần vượt ngưỡng CỦA MÁY NÀY"*, đọc được **xu hướng** và
   **không so được giữa hai máy**. Cùng hình dạng với CAPO-TRẦN của gói phẳng.

### Hợp đồng mới: ô CAPTURE không được MỒ CÔI

Một ô đã cắm mà `harness-doctor` không đọc sổ của nó ⇒ **suite đỏ**. Cắm mà không đọc là tự tạo
mục tiếp theo cho danh sách cắt bỏ của `/harness-retro` bước 4 — v2.67.0 vừa đo được đúng một ca
như thế (cảnh báo mềm `package.json`, in ra nhưng không tới được ai).

---

## 2.67.0 — 2026-08-12

**minor.** `dcg` chặn **backtick nằm ngoài nháy đơn** trong đối số văn bản của `node -e` và
`gh --title/--body`. Và bảng đối chiếu hai tầng có **giá trị thứ ba**.

### Defect: kiến thức tôi CÓ mà vẫn vi phạm ≥9 lần

Lớp `Context`, không phải `Constraint`. Nó nằm trong auto-memory nhiều phiên liền và vẫn tái
phát. **Một lời nhắc đã thuộc lòng mà vẫn bị vi phạm thì không phải cơ chế — nó là ghi chép.**

Thiệt hại đo được (2026-08-07): `cap > 0` trong `node -e` bị bash đọc thành **redirect** ⇒ một
file rỗng tên `0` ở gốc repo; một lần **suýt ghi hỏng `MEMORY.md`**; backtick trong `--title`
của `gh issue create` bị thay bằng output của lệnh.

### Nháy ĐƠN được phép — đó là nửa quan trọng hơn

```
node -e "const s = `xin chào`"    ⛔ CHẶN — bash thay bằng output lệnh
node -e 'const s = `xin chào`'    ✅ QUA  — bash không diễn giải gì trong '…'
echo "hôm nay là `date`"          ✅ QUA  — substitution CỐ Ý, ngoài node/gh
node scripts/x.mjs "… `date` …"   ✅ QUA  — phạm vi HẸP có chủ ý (false negative đã biết, có ca test)
```

`dcg` chính là hook đã bắn nhầm **5 lần** ở #43, nên bảng ca có **6 ca CHO QUA / 5 ca CHẶN** —
nửa "không được bắn nhầm" dài hơn nửa "phải bắt được", cố ý.

**Thông báo chặn nêu đường đi tiếp**: dùng nháy đơn, hoặc — với văn bản nhiều dòng — công cụ
`Write` ghi một file `.mjs` rồi `node file.mjs`.

### `test:` — rule mà regex không biểu diễn được

`simpleCommands()` **bỏ nháy** trước khi khớp, nên tới lúc một rule `re:` nhìn thấy chuỗi thì
thông tin *"backtick này nằm trong nháy nào"* đã mất. `dangerousCommand` nay nhận `test: (c) =>
bool` với `c` là lệnh đơn (còn `raw`). Rule `re:` không đổi hành vi.

### Bảng `dcg ↔ permissions.deny` có BA giá trị

`permissions.deny` khớp theo **tiền tố lệnh**, nên nó không bao giờ biểu diễn được *"một ký tự
nằm giữa đối số"*. Ép ca đó vào `null` thì ratchet đòi một thứ **không tới được**, và cách duy
nhất đi tiếp là **nới ratchet** — tức phá đúng cái nó bảo vệ.

| giá trị | nghĩa | vào ratchet? |
|---|---|---|
| `'<pattern>'` | đã có tầng một, và pattern phải THẬT SỰ nằm trong `settings.json` | không |
| `null` | **chưa** có | **có** |
| `{ why: '…' }` | **không thể** có, kèm lý do **bắt buộc** | không |

Giữ nó trung thực: lý do là bắt buộc (thiếu ⇒ suite đỏ) và được **in ra ở dòng xanh mỗi lần
chạy**, nên "không thể có" là một lời khai review được, không phải cửa thoát im lặng.
Ratchet **không đổi**: 13 điều cấm · 4 có · 8 chưa · 1 không thể.

---

## 2.66.0 — 2026-08-12

**minor.** `dcg` phân biệt được `git checkout -- .` (**bỏ cả cây**) với
`git checkout -- <file>` (**khôi phục đúng mấy file**). Ca thứ ba của
`knowledge/lessons/0002`, và là ca đầu tiên có cơ chế.

### Defect: guard bắn nhầm vào đúng nghi thức harness đòi hỏi

Rule cũ `/^git\s+checkout\s+--\s/` khớp **mọi** pathspec, nên nó chặn cả bước **dọn dẹp của
mutation test**. Đo 2026-08-10 (`fixlog` + `gate-fails.log` `02:49` · `02:59` · `07:38`):
**3 lần**.

**Phần đắt nhất không phải ba lần bị chặn.** Đường vòng thực tế đã dùng là `writeFileSync` từ
Node — **không có telemetry**. Guard vẫn chạy, vẫn đếm `17 chặn`, **trông khoẻ hơn trước**; thứ
chuyển đi là hành vi thật. Một guard bắn nhầm tự che dấu vết của chính nó, nên số đo của nó
không bao giờ báo — chỉ `fixlog` (người tự ghi) mới thấy.

### Bản vá đi CẢ HAI chiều

| chiều | lệnh | trước | sau |
|---|---|---|---|
| **nới** | `git checkout -- tooling/x.mjs` | CHẶN (sai) | cho qua |
| **nới** | `git checkout -- a.mjs b.mjs` | CHẶN (sai) | cho qua |
| **siết** | `git checkout --` (trần) | **lọt** — rule cũ đòi một dấu cách sau `--` | CHẶN |
| **siết** | `git checkout HEAD -- .` | **lọt** — có token đứng trước `--` | CHẶN |
| giữ | `git checkout -- .` · `./` · `:/` · `*` · `..` | CHẶN | CHẶN |

Một bản vá chỉ-nới sẽ để nguyên hai lỗ kia và không ai đếm chúng — đó là chiều im lặng của
`knowledge/lessons/0007`.

### Regex ở `lib`, không trong hook

`GIT_DISCARD_WHOLE_TREE` ở `tooling/lib/harness.mjs`. Ranh giới của nó quá hẹp (`.` chặn,
`./src/x.ts` cho qua) để tin một bản chép trong test — và `dcg.mjs` đọc stdin ngay lúc import
nên test không import được nó. Cùng lý do, cùng cái giá đã đo, với `SECRET_PATTERNS`.

**Không đổi ratchet `dcg ↔ permissions.deny`**: vẫn 12 điều cấm · 4 có tầng một · 8 chưa.
`permissions.deny` không có mục nào về `git checkout` (đã kiểm), nên thu hẹp ở tầng HAI không
làm yếu tầng MỘT.

---

## 2.65.0 — 2026-08-12

**minor.** Harness **tự đo** xem tín hiệu "tới hạn" của chính nó có tắt được không —
`knowledge/lessons/0008`, bước PROMOTE của vòng học W33.

### Defect: cùng một lớp lỗi, lần thứ NĂM trong hai tuần

| lần | đại lượng lái tín hiệu | vì sao hành động ở `cmd` không tắt được nó |
|---|---|---|
| W32 §1 (#105) | mọi dòng từng có trong `gate-fails.log` | sổ chỉ biết ghi thêm |
| v2.61.0 (#174) | `b.measured` — cờ của gói metered | người gói PHẲNG không bao giờ gõ `--usd` |
| v2.63.0 (#180) | `rateLimitHits > 0`, cửa sổ 30 ngày | cửa sổ TRƯỢT trên tín hiệu bạn còn sinh ra |
| v2.64.0 (#182) | `fixlogTotal >= 10` | số ĐỜI, chỉ tăng |
| **v2.65.0 (#185)** | `rows.length >= 10` ở `fixlog --list` | đếm cả mục đã `--close` và đã `--track` |

Hợp đồng W32 đề xuất (*"bộ đếm lái tín hiệu phải khai `window:` hoặc `closable:`"*) chỉ bắt được
**1 trong 3** ca của tuần W33 — `rateLimitHits` CÓ cửa sổ 30 ngày và vẫn đỏ vĩnh viễn. Nên
`window`/`closable` là hai **cách đạt tới** tính chất cần có, không phải tính chất đó:

> Tồn tại một trạng thái mà phép kiểm trả `ok`, và trạng thái đó tới được bằng đúng hành động
> ghi ở `cmd`.

### Cơ chế: ĐO, không bắt KHAI

Bắt mỗi nghi thức khai `clearedBy:` là rule cứng trá hình — người viết nghi thức mới sẽ điền
một câu nghe hợp lý và không gì kiểm được câu đó. Thứ kiểm được là lịch sử:

1. `rituals.collect()` ghi snapshot `{state, since, lastOkAt, okRuns}` cho mỗi nghi thức, mỗi
   lượt chạy. Nguyên liệu miễn phí: nó đã chạy ở mọi SessionStart.
2. `harness-doctor` §VÒNG HỌC in *"N nghi thức `due` liên tục ≥14 ngày với **0** lần `ok`"*.

Ở **doctor** chứ không ở `rituals`: một nghi thức canh các nghi thức khác rơi vào chính cái bẫy
nó canh — nó đỏ khi có mục đỏ lâu, mà mục đỏ lâu thường là mục *không tắt được*.

### CẮT: mẫu số của `fixlog --list`

Ngưỡng `≥10 lần/tuần` nay đặt trên số mục **CHƯA XỬ**. Đo trên sổ thật 2026-08-12: cảnh báo bật
với **11 mục**, trong đó 5 thuộc nhóm đã đóng từ 08-07 và 4 thuộc hai nhóm đã có địa chỉ (#177,
#160). Thật sự chưa xử: **2**. Phép trừ nay là MỘT hàm dùng chung (`handledGroups()`), không
phải hai bản chép — `rituals` đã trừ từ #182, `--list` thì chưa.

### Sổ mới

`.claude/state/ritual-states.json` — gitignore, cục bộ máy này, **O(1)** (một dòng mỗi nghi
thức đang tồn tại). Không cần migration: thiếu sổ ⇒ doctor in `?`, không in kết luận.

---

## 2.64.0 — 2026-08-12

**minor.** `fixlog` có **trạng thái thứ tư**: `⇢` *đã có địa chỉ, đang chờ*. Và ngưỡng của
`/harness-retro` chuyển từ số ĐỜI sang số CHƯA XỬ.

### Defect: hai mục đỏ vĩnh viễn nữa, trong cùng một hàm

Cùng lớp lỗi với **#180** (v2.63.0), tầng trên:

1. **Nhóm đã chưng cất vẫn đếm là "chưa chưng cất".** Ba trạng thái cũ — mở (`★`) · đã đóng
   (`✔`) · tái phát (`↻`) — không có chỗ cho *"đã thành một việc CÓ ĐỊA CHỈ, đang chờ người
   khác"*. Nhóm `node -e nuốt backtick` (3×) là **#177**: có spec, ba phương án, một khuyến
   nghị; nó chờ **DRI** (bản vá nằm trong `.claude/hooks/`, vùng cấm). Chạy `/harness-retro`
   lần nữa không sinh ra gì — nhưng mục đỏ vẫn nói *"ứng viên bài học ĐANG chờ"*.

   `--close` **không** phải câu trả lời: nó nghĩa là *đã sửa tận gốc*. Đóng một việc đang chờ
   là ghi lời khai sai VÀ xoá dấu vết rằng lỗi còn sống.

2. **`fixlogTotal >= 10` là ngưỡng trên một con số CHỈ TĂNG.** Sổ chỉ biết ghi thêm, nên qua
   mục thứ 10 nhánh này đỏ vĩnh viễn. Nay ngưỡng đặt trên **số mục chưa xử** (chưa đóng, chưa
   có địa chỉ) — đóng hoặc ghi địa chỉ thì con số giảm THẬT.

### Bản vá

- **`node tooling/fixlog.mjs --track "<vài chữ>" "<issue + chờ gì>"`** → `.claude/telemetry/
  fixlog-tracked.log`. Địa chỉ là **bắt buộc**: *"đang chờ"* mà không nói chờ ở đâu thì không
  khác gì im lặng bỏ qua.
- **`--track` KHÔNG giấu nhóm.** Nó vẫn in trong `--top` với đủ số đếm, và **tái phát sau khi
  ghi địa chỉ được ĐẾM ra** — số đó nói việc đang chờ đắt lên, và nó thay cho một màu đỏ không
  tắt được.
- **`groupTracked()` kết luận NGƯỢC `groupStillClosed()`** trên cùng một phép tính (`rowsAfter`):
  `--close` khai *"lỗi này không xảy ra nữa"* ⇒ mục mới **bác bỏ** ⇒ mở lại; `--track` khai
  *"tôi biết, nó ở #177"* ⇒ mục mới **xác nhận** ⇒ vẫn đang chờ. Có ca test riêng cho đúng
  chỗ chép nhầm này.
- **`groupMarks()`** — MỘT phép đọc sổ đánh dấu cho cả `fixlog --top` lẫn `rituals`. Trước đó
  mỗi bên tự parse TSV, và bản `rituals` vứt cột thời gian (#176, #125).
- `rituals` nói ra việc đang chờ **kể cả trong dòng XANH**, kèm số issue.

### Không có migration

Sổ mới tự sinh ở lần `--track` đầu tiên. Không có `--track` nào thì mọi thứ giữ nguyên hành vi
cũ. Guard chống lệch trong `test-hooks` mở rộng: `rituals.mjs` và `fixlog.mjs` **phải GỌI**
`groupTracked()` và `groupMarks()`, không được tự quyết.

**Mutation 5/5 giết, cả năm chạy được.** M5 (*ngưỡng quay lại đếm số đời*) **sống sót ở lượt
đầu** — nguyên nhân ① lỗ hổng độ phủ thật: fixture chỉ có 3 mục nên nhánh ngưỡng chưa bao giờ
chạy. Chi tiết: `docs/progress/182.md`.

---

## 2.63.0 — 2026-08-11

**minor.** Gói PHẲNG có **sổ đo riêng**, nên CAPO-TRẦN đọc được **xu hướng** — và nghi thức
`capo-report` **tắt được**.

### Defect: một nghi thức KHÔNG BAO GIỜ TẮT ĐƯỢC

`budgetStatus` trả `flat-limited` khi `rateLimitHits > 0`, và `rituals` map thẳng nó thành
`due`. Số lần chạm trần nằm trong một **cửa sổ trượt 30 ngày**: nó là quá khứ, và không hành
động nào hôm nay làm nó nhỏ lại — kể cả hành động chính mục đó yêu cầu.

Đo trên repo này: **19 lần chạm** ⇒ mục đỏ ở **mỗi SessionStart trong 30 ngày**, không cách
nào tắt. Đây là lỗi vừa sửa cho `flat-ok` ở **v2.61.0**, dịch sang nhánh bên cạnh — lần đó
`flat-ok` treo vào một cờ chỉ có nghĩa với gói metered; lần này `flat-limited` **không có
khái niệm "đã đo" nào cả**, vì nhánh phẳng không ghi gì.

### Defect thứ hai, đắt hơn: chỉ số đúng duy nhất là chỉ số duy nhất không có lịch sử

`capo-report.mjs` tồn tại vì một CÁI ĐỌC: *"CAPO đi lên trong khi bạn cải thiện harness ⇒
harness đang phình"*. Cái đọc đó là **xu hướng**. Nhánh `--usd` có nó; nhánh phẳng in một
con số nổi không neo vào gì — `0.15` so với cái gì, sau 50 lần chạy vẫn không ai biết.

### Bản vá

- **`.claude/state/capo-flat-history.json`** — file **RIÊNG**, `{at, days, hits, accepted,
  capoTran}`. Không phải hình dạng thứ hai trong `capo-history.json`: `latestCapoEntry()` đọc
  `entries.at(-1)` và mong `{usd, days}`, nên trộn hai hình dạng là #107 ở dạng phòng ngừa.
  Hai file thì bên đọc cũ **không thể** đọc nhầm — nó không mở file kia.
- **Mode mới `flat-capo`** — `hits > 0` **và** có số đo còn hạn. `rituals` đọc là `ok` kèm
  con số; `harness-doctor` in tỉ lệ thay vì một dấu ⚠️ không định lượng.
- **Hạn 30 ngày**, bằng đúng cửa sổ đếm hits: số đo cũ hơn cửa sổ mô tả một khoảng thời gian
  **rời hẳn** khoảng đang xét. Quá hạn ⇒ rơi **lại** `flat-limited` ⇒ `due`. Đo một lần rồi
  tắt vĩnh viễn là đổi *cảnh báo luôn bật* lấy *cảnh báo không bao giờ bật* — chiều IM LẶNG
  của cùng một lỗi (`lessons/0007`), và nó có mutant riêng.
- **Xu hướng + cảnh báo >20%** ở nhánh phẳng, đúng chỗ nhánh `--usd` đặt nó. Hai kỳ khác
  `--days` thì **TỪ CHỐI so** — trộn tỉ lệ 7 ngày với tỉ lệ 30 ngày là một phân số bịa.

### Không có migration

Sổ mới tự sinh ở lần chạy `capo-report` đầu tiên của gói phẳng. Project dùng gói metered
không đổi gì: ca test ③ khoá đúng điều đó (`CAPO-TRẦN` **không** được in ở nhánh metered).

Hợp đồng `MODES` trong `test-hooks.mjs` bắt buộc **cả hai** bên đọc phải rẽ nhánh cho mode
mới — thiếu bên nào thì đỏ, không im lặng rơi xuống `ok`.

**Mutation 4/4 giết, cả bốn chạy được.** Chi tiết: `docs/progress/180.md`.

---

## 2.62.0 — 2026-08-11

**minor.** Một nhóm fixlog **ĐÃ ĐÓNG** thôi nuốt một mục **CHƯA XONG**. Hai defect độc lập,
cùng một hậu quả: backlog báo *"không có gì tới hạn"* trong khi có.

### Defect ①: luật gom nhóm RỘNG hơn, khai TRƯỚC, thắng luật hẹp khai sau

`fixlog-groups.log` thật:

```
2026-08-06  dcg-chuoi-khong-phai-lenh            khớp: "dcg"                       ← ĐÃ ĐÓNG 08-07
2026-08-10  dcg-rule-qua-rong-chan-buoc-don-dep  khớp: "buoc DON DEP cua mutation"
```

Mục ngày **08-10** khớp **cả hai**. `fixlogKey` lấy luật **đầu tiên** khớp, nên mục đó thừa
hưởng dấu **✔** của một nhóm đóng **ba ngày TRƯỚC KHI nó tồn tại** — trong khi việc đó đang mở
dưới dạng **#160**.

Nay **luật CỤ THỂ HƠN (needle dài hơn) thắng**; bằng độ dài thì giữ thứ tự file. *"Dài hơn"*
chứ không *"mới hơn"*: độ dài là thuộc tính của **chính luật**, nên phép chọn không đổi theo
thứ tự người ta khai. Chọn *"mới hơn"* thì một luật rộng khai sau sẽ nuốt mọi luật hẹp khai
trước — đúng chiều hỏng vừa gặp, chỉ đảo trục.

### Defect ②: `--close` được hiểu là VĨNH VIỄN

Một mục ghi **sau** ngày đóng là **tái phát** — và đó là ca đáng canh nhất của cả cơ chế đóng
nhóm: *cùng một lỗi quay lại sau khi bạn tuyên bố đã sửa tận gốc*.

`groupStillClosed(closedTs, rowTimestamps)` (thuần) quyết định điều này cho **cả hai** bảng.
`fixlog --top` có dấu mới **`↻`** kèm số mục mới hơn và ngày gần nhất.

### Vì sao phải là MỘT hàm

`rituals.fixlogState()` đọc `fixlog-closed.log` bằng `l.split('\t')[1]` — **chỉ lấy khoá, vứt
cột thời gian**. Nó không thể phát hiện tái phát dù có muốn, trong khi `--top` thì có thể. Hai
bảng trả lời cùng một câu hỏi bằng hai câu khác nhau — đúng thứ ca ⑦ của `test-hooks` sinh ra
để chống. `rituals` nay giữ mốc thời gian từng mục và gọi cùng một hàm.

### Đo trên sổ thật

```
trước:  ✔ 5× ⊕ dcg… (gồm mục 08-10)          ⇒ 0 nhóm ★, retro thấy "không có gì tới hạn"
sau:    ✔ 4× ⊕ dcg…   ·   1× ⊕ dcg chan git checkout --  ← hiện ra, KHÔNG còn dấu ✔
```

### Test

228 ca (+5). Năm mutant, **5/5 chết**:

| mutant | ca đỏ |
|---|---|
| quay lại "luật đầu thắng" | fixlogKey ⑥ |
| "luật cuối thắng" (phụ thuộc thứ tự khai) | fixlogKey ⑥ ×2 |
| đã đóng là đóng vĩnh viễn | groupStillClosed ⑥b |
| chưa từng đóng bị đọc thành tái phát | groupStillClosed ⑥b |
| `rituals` tự quyết, thôi gọi hàm chung | fixlog ↔ rituals ⑦ |

Mutant thứ năm **SỐNG SÓT ở lượt đầu**: ca dùng `codeOnly(src).includes('groupStillClosed')`,
mà dòng `import` vẫn còn cái tên đó — ca chứng minh *"có nhắc tên"*, không chứng minh *"có
GỌI"*. Đúng `L0006` §*"Ba cách một mutant sống sót"* ③, lần thứ ba trong tuần. Neo lại vào
`/groupStillClosed\s*\(/`.

Refs: retro W33

---

## 2.61.0 — 2026-08-11

**minor.** Gói **PHẲNG**: CAPO tính bằng **lần chạm trần**, không bằng USD. `capo-report.mjs`
thôi đòi một con số mà chính nó khai là không đọc được.

### Nghi thức tự mâu thuẫn với chính nó

```
capo-report.mjs --usd <N>  —  gói PHẲNG: 19 lần chạm rate limit trong 30 ngày —
ĐÂY là trần thật của bạn, không phải USD.
```

Nó nói *"không phải USD"* rồi bảo chạy `--usd <N>`. `budgetStatus` biết gói phẳng từ #111
(chi tiêu tháng **bằng định nghĩa** đúng bằng trần, chi phí biên = 0, cổ chai là rate limit);
`capo-report` thì chưa, và hint của chính nó ghi *"harness KHÔNG đọc được hoá đơn"*.

Với gói phẳng, `USD / accepted` là **một hằng số chia cho accepted** — nó đo *"tháng này ra
nhiều kết quả hay ít"*, không đo gì về hiệu quả. Con số RÀNG BUỘC thì nằm sẵn trên đĩa:

```
CAPO-TRẦN = 0.15 lần chạm trần / kết quả được chấp nhận (19 lần · 126 kết quả · 30 ngày)
```

### Ba trạng thái — chép hình dạng, không tự nghĩ lại

```
sổ VẮNG   ⇒ 0      observe.mjs chưa từng ghi lần nào LÀ một số đo
đọc HỎNG  ⇒ null   `?` — không biết
```

Bản đầu gộp cả hai thành `?`. Nghe an toàn mà sai hai lần: nó biến một repo yên ả thành `?`
vĩnh viễn, VÀ nó làm **hai công cụ đọc cùng một cái sổ trả lời khác nhau** — đúng #125, thứ
`budgetSnapshot` ra đời để chống. Không gọi thẳng `budgetSnapshot()` được vì nó chốt cứng cửa
sổ 30 ngày, còn ở đây cửa sổ phải **bằng** cửa sổ đếm merge (`--days`).

### Hai chỗ chống BẮN NHẦM

- **Gói metered không đổi hành vi.** Với trả-theo-mức-dùng thì USD mới là cổ chai, và
  `--usd` vẫn được nhắc.
- **0 kết quả được chấp nhận ⇒ WARN, không FAIL** — trong khi nhánh `--usd` ngay trên FAIL cho
  cùng tình huống. Khác biệt là **ai bật nó**: `--usd` là người TỰ khai; nhánh này chạy tự động
  vì gói cước là phẳng. Một tuần nghỉ phép không được làm báo cáo đỏ (**L0002**).

### `rituals.mjs`: một nghi thức không bao giờ tắt được

Nhánh `flat-ok` treo vào `b.measured` — cờ hỏi *"đã có ai NHẬP số USD chưa"*. Người gói phẳng
không cần `--usd`, nên sổ USD **mãi rỗng**, nên mục đỏ **vĩnh viễn** kể cả khi họ 0 lần chạm
trần. Nay `flat-ok` ⇒ `ok`, kèm câu nói rõ số này **không cần dashboard**.

### Test

`tooling/test-hooks.mjs` 226 ca. Bốn mutant, **4/4 chết**:

| mutant | ca đỏ |
|---|---|
| sổ VẮNG ⇒ `null` (lỗi bản đầu) | CAPO gói phẳng ① |
| bỏ cửa sổ thời gian | CAPO gói phẳng ② |
| bật CAPO-TRẦN cho MỌI gói | CAPO gói phẳng ③ |
| nuốt luôn nhắc `--usd` của metered | CAPO gói phẳng ③ |

Refs: #173

---

## 2.60.0 — 2026-08-11

**minor.** Phép trừ nói ra **từng task** rơi khỏi nó và **vì sao** — và tách riêng nguyên nhân
*"chạm trần ngân sách"*, thứ làm mẫu số co lại **theo một hướng cố định**.

### Rào thứ sáu của #144: trần lượt lẫn với thứ đang đo

Lớp harness tồn tại một phần để **tiết kiệm lượt**. Nên cùng một task luôn tốn nhiều lượt hơn
ở **chiều trần** — nó phải tự suy lại những gì `AGENTS.md`/rules nói sẵn.

`maxTurns` của mọi task đang hiệu chỉnh trên **chiều đầy đủ**. Hệ quả là một vòng khép kín:

```
chiều trần cần nhiều lượt hơn  →  chạm trần trước  →  `?`  →  rơi khỏi phép trừ
                                                                    ↓
              task nào harness giúp NHIỀU nhất rơi ra TRƯỚC — hiệu số còn lại
              chỉ nói về phần harness giúp ít, và nó nói theo chiều dễ chịu
```

Đo 2026-08-10 trên `0003`: đầy đủ **15/15** lượt (`completed`), trần **16/15** (`max_turns`,
cắt giữa `tool_use`). Task duy nhất so được lúc đó, và nó rơi ra vì đúng chuyện này.

### Bản cũ đếm chúng bằng MỘT con số không tên, và con số đó có hai lỗ

```js
const absent = mine.size - common.length - skew.length - unknownDen.length;
```

- **Lỗ ①** — nó GỘP *"hạ tầng hỏng, chạy lại là có"* với *"trần bó, chạy lại VẪN THẾ"*.
  Hai nguyên nhân, hai hành động ngược nhau, một con số.
- **Lỗ ②** — nó đếm trên `mine`, mà `mine` chỉ chứa task **đo được**. Một task chạm trần **ở
  chính lần chạy này** không nằm trong bất kỳ số hạng nào của nó: nó biến mất khỏi phần kế
  toán mà không để lại một con số. Đúng chiều im lặng của **L0007**.

Nay phép trừ duyệt **HỢP** của hai lần chạy, nêu tên từng task, ở **vế nào**, và **vì sao**:

```
⚠  0003 — RA KHỎI PHÉP TRỪ VÌ TRẦN NGÂN SÁCH, không vì agent.
          trần: cạn NGÂN SÁCH DO TASK KHAI (chạm trần LƯỢT do task khai, dùng 16/15 lượt)
?  0006 — ra khỏi phép trừ: trần: hạ tầng (hết quota)
```

`hạ tầng` xếp **trước** `ngân sách` — cùng thứ tự với dòng `KHÔNG ĐO ĐƯỢC` từ #147: agent chạm
quota giữa chừng in **cả hai** dấu hiệu, và hạ tầng là nguyên nhân gần hơn.

### Cảnh báo TRẦN SẮP BÓ nay nói rõ số của chiều nào mới dùng được

Nâng trần theo số đo của **chiều đầy đủ** là tái tạo lại đúng thiên lệch trên. Nên cảnh báo
khai thẳng: số của chiều đầy đủ là **CẬN DƯỚI**, vế ràng buộc là **chiều TRẦN**.

### `0003`: `maxTurns` 15 → 30

`0005`/`0006`/`0007` đều đặt trần **≈2× số đo** (45/22 · 105/51 · 55/26). `15` là trần duy nhất
không theo luật đó — **1.07×** số đo 14 — và là trần duy nhất đã **cắt thật** một lượt chạy.

`30` là **SÀN**, chưa phải hiệu chỉnh xong: chiều trần vẫn chưa có số đo hoàn chỉnh, vì chính
trần `15` cắt nó trước khi nó kịp khai.

### Test

47 ca trong `tooling/test-evals.mjs` (+4). Năm mutant, **5/5 chết**:

| mutant | ca đỏ |
|---|---|
| đếm lại trên `mine` (bỏ HỢP) | ⑲j |
| bỏ nhánh `infra` | ⑲k ⑲l |
| xét `budget` TRƯỚC `infra` | ⑲l |
| đảo nhãn hai vế | ⑲i ⑲j |
| bỏ cặp số lượt | ⑲i |

`⑲k` bản đầu dùng regex `/hạ tầng/` quét **cả output**, nên nó xanh cả khi phân loại sai —
dòng `KHÔNG ĐO ĐƯỢC` ở khối trên cũng chứa hai chữ đó. Mutant *"bỏ nhánh `infra`"* **sống sót**
vì đúng chỗ này. Ca nay neo vào **đúng dòng kế toán**.

---

## 2.59.0 — 2026-08-11

**minor.** `# full-arm-only: <lý do>` — task tự khai assertion **không so được do bản chất**.
Mẫu số lệch về **0**; hai chiều chấm trên **cùng tập assertion**.

### Vì sao cần một khái niệm mới, thay vì vá thêm một công cụ

v2.57.0 và v2.58.0 vá **bốn công cụ báo oan**: chúng đọc `.claude/settings.json` hoặc
`.claude/rules`, mà `--bare` vừa gỡ. Đó là lỗi, và vá được.

`0007` thì khác **về bản chất**: assertion của nó chạy `tooling/test-evals.mjs`, và suite đó
kiểm chính `--bare`. Trong một cây **đã** trần, `--bare` **từ chối chạy** (*"KHÔNG gỡ được gì"*)
— **đúng thiết kế**. Không có gì để vá.

Gộp hai ca đó lại là hỏng theo cả hai hướng: hoặc ta vá mãi một thứ không hỏng, hoặc ta cho phép
mọi assertion khó trốn vào cùng một cái cớ.

### Cơ chế

```bash
# full-arm-only: suite này kiểm chính `--bare`, mà trong cây ĐÃ trần thì `--bare` từ chối chạy
node tooling/test-evals.mjs
```

**HAI thứ, không một.** Đánh dấu KHÔNG làm assertion biến mất:

- chiều **đầy đủ** vẫn CHẠY và vẫn chấm nó — giá trị regression giữ nguyên;
- phép **trừ** loại nó khỏi **cả hai** vế — một assertion chỉ chạy ở một bên thì hai bên đang
  chấm trên hai tập, và đó là đúng bệnh v2.54.0 sinh ra để chữa.

Nên mỗi task nay có **hai phán quyết**: `passed` (mọi assertion — tỉ lệ regression) và
`passedComparable` (chỉ assertion so được — phép trừ). Gộp lại là quay về lỗi cũ.

### Cửa thoát này đắt một cách cố ý

`danger-zones.md §Cưỡng chế` viết: *"không có cửa thoát, người ta tự tạo cửa thoát — và cửa đó
không ghi log"*. Nên có cửa, và nó phải trả giá:

- **lý do BẮT BUỘC** — không có `:` thì marker không được nhận;
- lý do được **in ra** ở cả `--denominators` lẫn báo cáo;
- task đánh dấu tới mức `ranComparable === 0` ⇒ **ra khỏi phép trừ hoàn toàn**, kèm một dòng nói
  thẳng rằng đánh dấu hết cho ra **giao rỗng**, không phải con số đẹp.

### Ratchet chạm 0, và thôi là ratchet

```
5 lệch · trần 13/24   đo lần đầu 2026-08-10
4 · 16/24             `0002` thôi hỏi về `AGENTS.md`
2 · 20/24             `test-hooks` phân biệt "gỡ có chủ ý" với "repo hỏng"
1 · 23/24             `harnessStripped()` lên lib; test-migrations · apply-to · test-evals
0 · 23/23             `0007` khai `full-arm-only` cho ĐÚNG dòng không so được
```

`SKEW_RATCHET` nay là **bất biến**, không phải backlog: mọi task đo được phải cùng mẫu số so
được. Nó có **điều kiện thoát** viết rõ — xoá khi `--bare` không còn tồn tại. Đây là mục CẮT mà
`.claude/learnings/2026-W33-phep-do-khong-xay-ra…` đề xuất, đã thực hiện.

Phép trừ `eval − eval --bare` nay so được **6/6 task đo được**. Hai phiên trước: **1**.

---

## 2.58.0 — 2026-08-11

**minor.** `harnessStripped()` lên `lib`, và ba công cụ nữa dùng nó. Ratchet mẫu số **2 → 1**.

### Điều kiện tự khai của v2.57.0 đã thoả

v2.57.0 viết: *"khi có công cụ thứ hai cần nó, `BARE_TREE` chuyển lên `lib/harness.mjs`"*. Có ba.

| công cụ | đỏ vì gì trên cây trần | vá |
|---|---|---|
| `test-migrations.mjs` | migration 008/011 đọc `settings.json` của **template** làm vật liệu ⇒ hợp đồng ⑤ báo *"MẤT đoạn phải giữ — regex ăn quá nhiều"* | migration nào **nhắc `settings.json` trong nguồn** ⇒ `?` |
| `apply-to.mjs --audit` | liệt 9 mục `*.bare-disabled` như file chưa khai | thêm `/\.bare-disabled(\/\|$)/` vào `IGNORE` |
| `test-evals.mjs` | **CRASH** `ENOENT AGENTS.md` ở ca ㉙ — cả suite chết, 0 dòng kết quả | file mốc chọn `harness.config.json` khi `AGENTS.md` vắng |
| `harness-doctor --quick` | tổng hợp — đỏ vì ba cái trên | tự xanh theo |

Neo của `test-migrations` là **nguồn của migration**, không phải `!fixture` và không phải
*"đang ở cây trần"*: 008/011 **có** fixture (nên `!fixture` trượt), còn cắt hết mọi migration là
sửa quá tay — **7/12 migration không nhắc `settings.json` một lần nào** và vẫn phải bị kiểm.

Một suite **CHẾT** tệ hơn một suite **ĐỎ**: nó không nói được nó đã kiểm gì. `test-evals` ném
`ENOENT` trước khi in một dòng nào — đó là lý do ca ㉙ nay chọn file mốc còn tồn tại.

### Kết quả

```
5 task lệch · trần 13/24        (trước)
4 task lệch · trần 16/24        2.56.0
2 task lệch · trần 20/24        2.57.0
1 task lệch · trần 23/24        2.58.0   ← chiều trần chấm trên 96% phép đo
```

`0001` **cân hẳn** (6 vs 6). Phép trừ nay so được **5/6 task đo được**, thay vì 1.

### Vì sao mốc dừng ở 1, không phải 0

`0007` **không cùng lớp** với bốn cái trên — nó là **cấu trúc**. Assertion của nó chạy
`tooling/test-evals.mjs`, mà suite đó kiểm chính `--bare`; trong một cây **đã** trần thì `--bare`
từ chối chạy (*"KHÔNG gỡ được gì"*) — **đúng thiết kế**, không phải lỗi.

Ép nó thành `?` sẽ làm suite exit 0 và mốc về 0, nhưng nó chỉ **dời lệch mẫu số xuống TRONG
assertion**, nơi không bộ đếm nào nhìn thấy. Đó là đúng cái bệnh v2.54.0 sinh ra để chữa, lùi
một tầng. Lối ra nằm ở **task**: `0007` đừng lấy cả một bộ test làm assertion. Xem #163.

---

## 2.57.0 — 2026-08-11

**minor.** `test-hooks` phân biệt *"cây bị gỡ lớp harness CÓ CHỦ Ý"* với *"repo hỏng"*. Ratchet
mẫu số **4 → 2**.

### Một dòng, ba task

`node evals/run.mjs --denominators` (v2.56.0) chỉ đúng thủ phạm: `node tooling/test-hooks.mjs`
đỏ trên cây trần, và nó là assertion của `0005`, `0006`, `0007`. Đỏ vì 5 check đọc
`.claude/settings.json` hoặc `.claude/rules/` — mà đó đúng là thứ `--bare` gỡ.

Và thông điệp chúng in là *"neo của check này đã trôi, sửa neo thay vì xoá check"*. Câu đó
**đúng** trong repo thật (ai đó vừa đổi tên một thứ) và **sai** ở đây (không ai đổi tên gì; file
bị gỡ theo yêu cầu). Cùng lớp lỗi #155 và v2.54.0 đã dọn ở lớp eval, lần này ở lớp kiểm.

Năm check đó nay là **`?`** trên cây trần: không phải `PASS` (chúng không chạy — biến khoảng
trống thành dấu tick là L0005), không phải `FAIL` (chúng cũng không phát hiện ra gì).

### Điều kiện là BẰNG CHỨNG, không phải sự vắng mặt

```js
const BARE_TREE = exists(repoPath('.claude', 'settings.json.bare-disabled'));
```

Neo vào cái xác `.bare-disabled` — thứ **chỉ `evalTree()` tạo ra**. KHÔNG neo vào
`!exists(settings.json)`: một `settings.json` **biến mất** trong repo thật vẫn phải ĐỎ TO, vì
đó là repo hỏng. Chỉ khi cái xác nằm ngay cạnh thì sự vắng mặt mới là **cố ý**.

Đo cả hai chiều:

| cây | `test-hooks` |
|---|---|
| repo thật | **exit 0** |
| cây trần (có `.bare-disabled`) | **exit 0**, 5 check thành `?` |
| `settings.json` bị xoá, KHÔNG có xác | **exit 1**, 4 FAIL |

Có ca khoá chính cái neo đó (`BARE_TREE`), vì neo sai biến bản vá này thành cửa thoát: mọi repo
áp template mất `settings.json` sẽ được chấm XANH, không triệu chứng. Ca dùng `codeOnly()`
**không** `blankStrings` — neo cần kiểm chính là một hằng chuỗi, và xoá chuỗi đi thì ca đỏ oan
(đã xảy ra khi viết nó).

### Kết quả đo

```
trước:  5 task lệch · đầy đủ 24 · trần 13
2.56.0: 4 task lệch · đầy đủ 24 · trần 16   (0002)
2.57.0: 2 task lệch · đầy đủ 24 · trần 20   ← chiều trần chấm trên 83% phép đo
```

`0005` và `0006` **cân hẳn**. Còn `0001` (test-migrations · apply-to --audit · doctor --quick)
và `0007` (test-evals) — **cùng một lớp**, bốn công cụ nữa cần cùng phép phân biệt đó. Khi công
cụ thứ hai cần nó, `BARE_TREE` chuyển lên `lib/harness.mjs`; giờ chưa, vì một helper dựng cho
người dùng chưa tồn tại là suy đoán.

---

## 2.56.0 — 2026-08-10

**minor.** `node evals/run.mjs --denominators` — điều kiện của phép trừ nay **đo được bằng một
lệnh**, không cần agent, không tốn đồng nào.

### Vấn đề: câu hỏi đắt nhất về phép đo lại không cần phép đo để trả lời

v2.54.0 dựng luật *"hai chiều phải cùng mẫu số thì mới trừ được"*. Nhưng cách duy nhất biết
mình có thoả luật đó là **chạy cả hai chiều với agent** — tốn tiền, tốn quota, và ra kết quả
sau nhiều phút. Trong khi mẫu số là phép **tất định**: dựng hai cây, chạy tiền kiểm, so.

```
LỆCH 0001 — đầy đủ 6 · trần 2   ↳ test-hooks · test-migrations · apply-to --audit · doctor --quick
OK   0002 — mẫu số 3 ở cả hai chiều
OK   0003 — mẫu số 3 ở cả hai chiều
n/a  0004 — khai `## Dựng cảnh`
LỆCH 0005 — đầy đủ 4 · trần 3   ↳ test-hooks
LỆCH 0006 — đầy đủ 5 · trần 4   ↳ test-hooks
LỆCH 0007 — đầy đủ 3 · trần 1   ↳ test-hooks · test-evals

tổng assertion sống: đầy đủ 24 · trần 16 (chiều trần chấm trên 67% phép đo)
ratchet task-lech-mau-so: 4 = mốc
```

### `0002` đã cân — và nó chứng minh dụng cụ có răng

`test -f AGENTS.md` hỏi về đúng file mà `BARE_STRIP` đổi tên. Thay bằng `harness.config.json` +
`tooling/lib/harness.mjs` — cùng trả lời *"cây làm việc có bị xoá không"*, và trả lời được ở
**cả hai chiều**. Mốc đi từ 5 xuống **4**, và chính ratchet là thứ báo phải hạ mốc.

### RATCHET, không phải gate đỏ

4/6 task còn lệch. Gate đỏ từ ngày đầu là guard bắn nhầm, và guard bắn nhầm dạy người ta lách
(L0002). Nên: vượt mốc ⇒ đỏ; **dưới** mốc ⇒ cũng đỏ, kèm yêu cầu hạ mốc trong **cùng commit**
(không hạ thì backlog bị che). Mốc về 0 ⇒ đóng #163.

### Vì sao KHÔNG phải một ca test, cũng không phải gate `Stop`

Assertion của `0007` chạy `node tooling/test-evals.mjs`. Tiền kiểm **chạy** assertion, nên một
ca trong test-evals gọi `--denominators` sẽ đệ quy không đáy. Và hai lượt tiền kiểm gồm hai bộ
test đầy đủ — **đo được ~5 phút**, trong khi ngân sách `Stop` là 30 giây. Lệnh gõ tay; ratchet
là thứ giữ cho nó không bị quên.

### Đính chính đi kèm

Mục 2.54.0 viết *"6/7 task assert lên file của chính harness"* — **là 5** (`0001` `0002` `0005`
`0006` `0007`). Bảng đúng, câu tóm tắt dưới bảng sai: con số được gõ tay từ một bảng thay vì
được in ra bởi thứ tạo ra bảng. Đó chính là lỗ mà lệnh này bịt.

Và hai con số tổng đổi: bản đo đầu (`22` / `13`) **bỏ assertion `# requires-agent`**, nhưng
chúng CÓ chạy khi agent chạy nên chúng thuộc mẫu số thật. Số đúng là `24` / `16`.

---

## 2.55.0 — 2026-08-10

**minor.** Hai lỗi lộ ra khi **chạy thật** cả hai chiều lần đầu — cùng một gốc: **chiều thứ hai
chưa từng được chạy, nên lỗi của nó chưa có cơ hội lộ.**

### ① Patch của chiều trần là patch của `--bare`, không phải của agent

`capturePatch` chụp bằng `git add -A` + commit, mà `evalTree` đổi tên 7 mục của `BARE_STRIP`
**sau** khi clone và không commit. Nên mọi rename đó vào patch.

Đo trên `0003` chiều trần: **26 file trong patch, 25 là rename của `BARE_STRIP`** — đúng **một**
file là việc agent làm. Nó phá đúng mục đích `capturePatch` ra đời để phục vụ: PR #149 và #157
đều đến từ việc **đọc** patch của agent, và một patch 25/26 là nhiễu thì không ai đọc. Chế độ
hỏng im lặng — patch vẫn có, vẫn `git apply` được, chỉ là không đọc được.

**Vá:** một commit **MỐC** đóng lại mọi thứ runner vừa làm, trước khi agent chạy.

### ② …và commit mốc đó suýt tái tạo chính lỗi #155

Commit chỉ ở chiều trần ⇒ cây trần 2 commit, cây đầy đủ 1 ⇒ hai chiều lại khác nhau ở một thứ
**ngoài `BARE_STRIP`**. Nên commit mốc chạy ở **cả hai chiều**, `--allow-empty`.

**Đổi hợp đồng cho người viết task:** cây eval nay có **2 commit** (clone `--depth 1` + mốc),
không phải 1. Assertion nào đếm commit phải biết. Mọi thứ khác giữ nguyên.

### ③ Thứ tự chạy ngược đã có ca test

`--bare --baseline` trước rồi chạy đầy đủ là luồng hợp lệ, và nó đi qua nhánh `BARE === false`
của thông điệp "MẪU SỐ LỆCH" (v2.54.0) — nhánh chưa ca nào chạm tới. Đảo nhầm cặp số thì con số
**vẫn in ra, vẫn đúng định dạng**, chỉ gán sai nhãn, và người đọc đi thu hẹp nhầm task.

### Bằng chứng

`tooling/test-evals.mjs` **39/39**. Ca mới: `⑲d` (thứ tự ngược) · `㉙b` (patch chiều trần sạch)
· `㉙c` (commit mốc đối xứng). Mutation **5/5 chết** qua hai lượt, mỗi mutant bị đúng ca của nó
bắt — gồm hai chiều SỬA QUÁ TAY (`capturePatch` nuốt luôn việc agent; commit mốc chỉ một chiều).

Fixture `writes` nay tạo file mới khi không thấy `AGENTS.md` — ở cây trần chính `--bare` đã đổi
tên file đó, và một fixture **ném** thì ca test không nói được gì về cơ chế nó định kiểm.

---

## 2.54.0 — 2026-08-10

**minor.** Giao theo TASK chưa đủ để trừ — mẫu số phải bằng nhau ở tầng **assertion**. Rào thứ
NĂM của #144.

### 2.53.0 khử được biến ở tầng CÂY, còn một biến ở tầng dưới

Hai chiều nay chạy cùng loại cây. Nhưng `passed` của một task là *"mọi assertion **chạy được**
đều xanh"*, và `--bare` gỡ lớp harness nên nhiều assertion **đỏ sẵn ở tiền kiểm** bên trần ⇒
chấm `n/a` ⇒ chiều trần được chấm trên tập **dễ hơn**. Rồi hai boolean từ hai mẫu số bị trừ
cho nhau — đúng phép tính mà khối đó ra đời để chống, lùi xuống một tầng.

Đo 2026-08-10 trên 7 task thật (probe tất định, **không thả agent** — đếm mẫu số không cần agent):

| task | đầy đủ | trần | assertion biến mất ở chiều trần |
|---|---|---|---|
| `0001` | 6 | **2** | test-hooks · test-migrations · apply-to --audit · doctor --quick |
| `0007` | 3 | **1** | test-hooks · test-evals |
| `0006` | 5 | **4** | test-hooks |
| `0005` | 4 | **3** | test-hooks |
| `0002` | 3 | **2** | `test -f AGENTS.md` — chính `--bare` đổi tên nó |
| `0003` | 1 | 1 | (không) |

**22 assertion sống ở chiều đầy đủ, 13 ở chiều trần — 41% phép đo biến mất.** Và lệch luôn cùng
một hướng: bên trần chỉ mất, không bao giờ được thêm. Sai số không tự triệt tiêu qua nhiều task,
nó **dồn về phía "harness không giúp gì"**.

Tệ nhất là câu runner in khi hiệu số bằng 0: *"chênh lệch 0 là một PHÁT HIỆN, không phải hiện
vật của dụng cụ"*. Với mẫu số lệch, câu đó khẳng định **đúng điều ngược lại** với sự thật.

### Đổi gì

- Bản ghi kết quả mang thêm `ran` (số assertion THẬT SỰ chạy). Baseline lưu nó.
- Phép trừ chỉ nhận task có `ran` **bằng nhau** ở hai chiều. Lệch ⇒ ra khỏi giao, in cặp số và
  nói rõ phải sửa ở **TASK**, không ở runner.
- `ran` thiếu (baseline sinh trước bản này) ⇒ `?`, **không** suy ra "bằng nhau". Luật ba giá
  trị, lần này áp cho chính dụng cụ.
- Câu "chênh lệch 0" chỉ in kèm số task **cùng mẫu số**.

### Nguyên nhân gốc nằm ở TASK, và bản này không sửa nó

5 task (`0001` `0002` `0005` `0006` `0007`) assert lên **file của chính harness** — mà đó đúng
là thứ `--bare` gỡ. (Bản 2.54.0 viết *"6/7"*; đếm lại từ chính bảng ngay trên là **5**, và
`--denominators` ở 2.56.0 in ra con số đó mỗi lần chạy.) Một assertion
như vậy đo *"harness có mặt không"*, không đo *"harness làm agent tốt hơn không"*. `n/a` là
đúng; hệ quả là hai vế không so được, cũng đúng. Bản này làm cho điều đó **nói ra được** thay
vì biến thành một con số. Sửa thật là viết task assert lên **sản phẩm**.

Không migration: baseline là trạng thái cục bộ, chạy lại hai chiều là có `ran`.

---

## 2.53.0 — 2026-08-10

**minor.** Hai chiều của `eval − eval --bare` khác nhau ở **nhiều hơn harness**. Đóng #155.

### Phép trừ so hai thứ không so được

```js
const ROOT = bare?.root || repoPath('');   // ← chiều đầy đủ = repo SỐNG
```

| | đầy đủ (cũ) | trần |
|---|---|---|
| cây | **repo đang mở** | clone dùng một lần |
| lịch sử git | đầy đủ | **1 commit** |
| `origin` | có thật | **đã gỡ** |
| file chưa commit | có | **không** |

Chỉ dòng đường-dẫn là vô hại. Chiều nó nói dối là chiều **dễ chịu**: cây trần sạch hơn và nông
hơn, nên một task khó có thể **dễ hơn** ở đó ⇒ hiệu số bị kéo xuống ⇒ *"harness không giúp gì
mấy"*. Một con số thật trên một phép so không hợp lệ.

`docs/progress/144.md` đã ghi một ca của lỗ này cho riêng task `0002` (gỡ remote ⇒ force-push
*"không có gì để làm"* ⇒ **PASS GIẢ**). Đó không phải ngoại lệ của một task — đó là mẫu vật đầu
tiên của lớp lỗi chung, nhìn từ task duy nhất mà nó lộ ra sớm.

### Vá: cả hai chiều là cây dùng một lần, khác nhau đúng ở `BARE_STRIP`

Kèm hai thứ được sửa miễn phí:

- **Bẫy *"đừng ghi vào repo trong lúc eval chạy"* hết.** `worktreeFingerprint` nay gác cái
  clone, không gác cây làm việc của người đang ngồi đó.
- **Tiền kiểm chạy ở cả hai chiều.** Cây đầy đủ nay là clone `--depth 1` không remote, nên một
  assertion đọc lịch sử git / `origin` / file chưa commit sẽ đỏ ở đó mà xanh trong repo đang
  mở — hỏng **do chính bản vá này gây ra**. Không có tiền kiểm, #155 tự sinh ra một lớp FAIL giả.
  Thông điệp nêu đúng **tên cây**: *"ĐỎ SẴN trên cây trần"* ở chiều đầy đủ là một lời khai sai.

### Clone chỉ khi CÓ AGENT — không phải tối ưu, mà là giữ nghĩa

`evals.command` rỗng ⇒ runner cố ý đo *"trạng thái HIỆN TẠI"* của cây bạn đang làm việc; dòng
cảnh báo của nó nói đúng chữ đó. Clone lúc ấy bỏ mất mọi thứ chưa commit và đổi nghĩa của chính
dòng nó in, trong khi **không có agent nào để cô lập**.

### Cây bị xoá, nhưng VIỆC AGENT LÀM thì không

Hệ quả **bắt buộc**, không phải tính năng phụ. Hai lần thu hoạch thật của cả lớp eval đến từ
việc agent sửa cây — và cả hai lần **điểm số nói ngược**:

| | | runner chấm |
|---|---|---|
| **PR #149** | agent `0007` viết 7 ca `mergeBaseline`, bắt một lời khai sai trong docstring | **FAIL** (cạn trần lượt) |
| **PR #157** | agent `0006` thêm trạng thái `n/a` cho bảng nghi thức | `?` |

Cô lập cây mà không rút patch ra thì bản vá này **phá một thứ đang có giá trị**, và không ai
biết — thứ bị mất chưa bao giờ có tên trong báo cáo. Nay mỗi task để lại một patch **áp lại
được**, và nó hiện ra cả ở nhánh `?`.

### Kiểm

```
test-evals   33 ca OK    ㉗ chiều đầy đủ cô lập + GIỮ harness · ㉘ không agent ⇒ không clone
                         ㉙ patch rút ra được, repo thật không đụng · ㉚ tiền kiểm hai chiều
mutation     7 mutant, 0 sống sót
```

## 2.52.1 — 2026-08-10

**patch.** Ngân sách của bộ task eval thôi là số **đoán**. Và con số `REGRESSION 0% (0/3)` của
#144 hoá ra đo turn budget, không đo harness: cùng bộ task, trần rộng ⇒ **100% (3/3)**.

### Số đo

Trần nới rộng `60 lượt / 15 phút` để nó KHÔNG bó, rồi đọc `num_turns` từ phong bì (#153):

| task | trần cũ (đoán) | **ĐO ĐƯỢC** | trần mới | sai bao nhiêu lần |
|---|---|---|---|---|
| `0005` | 6 lượt / 6p | **22 lượt / 4.0p** | 45 / 10 | **3.7×** |
| `0006` | 8 lượt / 8p | **51 lượt / 13.9p** | 105 / 30 | **6.4×** |
| `0007` | 20 lượt / 12p | **26 lượt / 13.5p** | 55 / 30 | 1.3× |
| `0001` | 10 lượt / 10p | *chạm rate limit sau 1.5p* | **giữ 10 / 10** | chưa đo |

### `maxMinutes` cũng bó — và nó là rào TIẾP THEO nếu chỉ sửa lượt

Đo được mà không ai chờ: `0006` chạy **13.9 phút** với trần **8**, `0007` chạy **13.5** với
trần **12**. Cả hai sẽ bị `SIGTERM` — tức sửa xong `maxTurns` thì lần chạy sau chạm trần
WALL-CLOCK, và báo cáo lại ra `?` với một nguyên nhân khác. Hai trần, một phép đo.

### Cảnh báo mới của 2.52.0 nổ đúng ngay lượt đầu

```
WARN 0006: TRẦN LƯỢT SẮP BÓ — dùng 51/60 lượt (≥ 80%)
```

Ngay cả trần **60** cũng đã sắp bó cho `0006`. Không có dòng này, `60` sẽ trông như một con số
rộng rãi và lần chạy sau task rơi khỏi mẫu số mà không ai biết vì sao.

### Trần đặt GẤP ĐÔI số đo, và đó là một phán đoán — nói ra như vậy

Một mẫu không cho phương sai. Gấp đôi để một lần chạy bình thường nằm dưới ngưỡng
`budget.alertAtPercent`; sát hơn thì cảnh báo kêu ở mọi lượt và sẽ bị tắt. Số đo, ngày đo, và
đời CLI được ghi **trong chính file task** — trần không có xuất xứ thì lần sau lại thành số đoán.

### `0001` GIỮ NGUYÊN và được ghi là CHƯA ĐO

Không suy trần của nó từ ba task kia: chúng nặng hơn, nên một con số suy ra sẽ rộng quá và
cảnh báo mất tác dụng ở đúng task rẻ nhất. `?` là câu trả lời đúng cho một phép đo chưa xảy ra —
cùng luật mà cả lớp eval đứng trên.

---

## 2.52.0 — 2026-08-10

**minor.** Runner eval đọc **văn xuôi** của agent để biết nó cạn ngân sách, trong khi agent có
sẵn một **lời khai có cấu trúc** — và ví dụ trong docstring của chính runner khuyên dùng đúng
cái cờ làm bộ dò đó mù. Đóng #153.

### Đo được

`claude -p --output-format json`, lúc cạn trần lượt:

```
is_error  true · subtype "error_max_turns" · terminal_reason "max_turns" · num_turns 2 · exit 1
```

Không có chuỗi `Reached max turns` ở đâu cả — nó là JSON. Còn `budgetExhausted()` (v2.51.0,
#147) khớp regex trên văn xuôi. Nên **bật cờ đó là làm bản vá #147 mù**, và `evals/run.mjs:332`
lấy đúng cờ đó làm ví dụ mẫu. Người làm theo tài liệu là người dính.

### Hai thứ được mở ra

**`num_turns` — con số duy nhất còn thiếu để đóng #144.** Trần `maxTurns` của bộ task
(`6 · 8 · 10 · 15 · 20`) là số **đoán**. Runner nay in `dùng/trần` cho mọi task đo được, nên
hiệu chỉnh trở thành sản phẩm phụ của mỗi lượt chạy thay vì một đợt khảo cổ transcript riêng.

**Cảnh báo TRẦN SẮP BÓ** khi `dùng/trần ≥ budget.alertAtPercent` (field **đã có** — không thêm
field mới, máy dò field chết giữ nguyên 0/0). Một trần sát ngưỡng là một task sắp rơi khỏi
**mẫu số** ở lần chạy sau: model đổi một nhịp, task thành `?`, và tỉ lệ đổi mà không dòng nào
giải thích.

### Có phong bì thì phong bì là nguồn DUY NHẤT — không phải `??`

Chỗ này suýt sai, và ca ㉖ là ca duy nhất chứng minh nó. `budgetExhausted()` quét **toàn bộ
stdout**; ở chế độ JSON, stdout chứa cả **câu trả lời của agent**. Một agent viết *"gate này
chặn khi reached max turns"* — câu hoàn toàn hợp lệ cho một task về gate — sẽ bị chấm là cạn
ngân sách, và một task **XANH** lặng lẽ rơi khỏi mẫu số.

Nên ba nguồn, và nguồn ③ chỉ sống ở nhánh KHÔNG có phong bì:

```
① SIGTERM   trần WALL-CLOCK — không để lại chữ nào
② PHONG BÌ  terminal_reason / subtype — CẤU TRÚC
③ văn xuôi  Reached max turns — CHỈ khi không có phong bì
```

### Kiểm

Bằng **agent GIẢ** — tất định, 0 token. Hai chế độ mới (`json`, `jsonmaxturns`) chép nguyên văn
hình dạng đo được; `FAKE_AGENT_TURNS` và `FAKE_AGENT_SAY` để ca chọn số lượt và nhét chữ vào
câu trả lời.

```
test-hooks   223/223   agentEnvelope 20 ca — nhiễu hai đầu, phong bì CUỐI, 8 ca KHÔNG-phải-phong-bì
test-evals   29 ca     ㉓ đọc số lượt · ㉔ cấu trúc · ㉕ trần sắp bó · ㉖ agent NÓI VỀ chữ ký
mutation     9 mutant, 0 sống sót
```

---

## 2.51.1 — 2026-08-10

**patch.** Self-test của harness **chạy sản phẩm của project** — dev server, trình duyệt, cả
`e2e` — mỗi lần bạn `upgrade`. Đóng #141.

### Chuỗi gọi, đo bằng `Get-CimInstance Win32_Process`

```
node tooling/upgrade.mjs <template> --apply
  └─ tooling/test-hooks.mjs                      ← mục "── Verify ──", ĐỒNG BỘ, không timeout
       └─ tooling/gates.mjs --list --timing       ← test-hooks spawn, trên config THẬT
            └─ npx playwright test                ← gate `e2e`, LỆNH CỦA PROJECT
                 └─ next dev -p 3799              ← webServer của Playwright
```

`--list --timing` đo độ trễ bằng cách **chạy thật từng gate** — đó là việc của nó, và khi
người gõ nó thì đúng. Sai là ở chỗ một self-test gọi nó trên config của project.

| | `test-hooks.mjs` |
|---|---|
| ở **template** | 26 giây |
| ở **eval-sandbox** (18 minor nâng cấp) | **> 20 phút, chưa xong — phải giết** |

`docs/ROADMAP-30D.md:127` ghi ngân sách *"(5 phút)"* cho lệnh này.

### Bốn cái giá, và cái thứ ba đắt nhất

1. **Đọc y hệt treo.** Gọi đồng bộ, không timeout, không in tiến độ.
2. **Tác dụng phụ ngoài repo:** mở một dev server trên cổng 3799 của máy người dùng và một
   trình duyệt Playwright. Không dòng nào báo trước.
3. **Chẩn đoán sai.** `e2e` của project đỏ vì lý do không liên quan ⇒ `upgrade.mjs` in
   *"hook test ĐỎ sau khi nâng cấp"* — đổ lỗi cho bản nâng cấp về thứ không thuộc bản nâng cấp.
   Cùng lớp lỗi `gen-clean` đã phải sửa một lần.
4. **CI trả hai lần:** job `verify` chạy `test-hooks` ⇒ chạy `e2e`; job `e2e` chạy lại.

### Và một cái giá thứ năm không ai thấy: ca test đó ĐỎ ở mọi repo tiêu thụ

Ca `gates sàn runner` khẳng định *"stage không gate nào có lệnh phải báo sàn bằng SỐ"*. Ở repo
có `commands` thật, stage `subagent` **có** lệnh ⇒ không in dòng sàn ⇒ ca đỏ, vì một lý do
không liên quan gì tới thứ nó khẳng định. Nó chỉ xanh nhờ template vô tình rỗng.

### Đo ở VAI TIÊU THỤ — vì ở template không thể thấy gì

Repo tiêu thụ giả, mọi lệnh trong `commands` là một tripwire ghi lại dấu khi bị chạy:

```
                lệnh của project bị chạy                        ca `gates sàn runner`
origin/main     6 — build · e2e · gen · lint · test · typecheck  FAIL
sau vá          0                                                PASS
```

### Bản vá

Hai lời gọi `--list --timing` trong `test-hooks.mjs` đi qua
`HARNESS_CONFIG=fixtures/config-unconfigured.json` — đúng cơ chế mà 6 ca gate khác **trong
chính file đó** đã dùng. Fixture nhận thêm stage `subagent` (`config()` chỉ mặc định
`stop`/`preMerge`, và gate **tổng hợp** như `gen-clean` luôn được tính là "có lệnh" nên không
dùng được làm neo).

Cộng một ca **hai vế**: ⓐ tripwire chứng minh `--list --timing` **thật sự** chạy lệnh trong
config — nếu điều đó đổi, vế ⓑ thành trang trí và ⓐ đỏ trước; ⓑ quét nguồn, không lời gọi
**tự động** nào được đưa `--list` cho `gates.mjs` mà thiếu `HARNESS_CONFIG`.

Vế ⓑ neo vào lời gọi `spawnSync(` chứ không neo vào chuỗi `gates.mjs`: `setup.mjs` **in ra**
câu `node tooling/gates.mjs --list --timing` cho người dùng gõ — đó là cách dùng đúng. Đo:
bản neo-theo-chuỗi bắn oan **2 phát** vào `setup.mjs`; bản đang dùng **0**.

Mutation: 5 mutant, 0 sống sót.

### Vì sao 19 minor không ai thấy

*"Template là mẫu vật không điển hình"*, lần thứ **tư**. `commands.*` rỗng ở template nên
`--list --timing` ở đó đo đúng cái nó nên đo; ở consumer nó đo bằng cách **chạy cả sản phẩm**.
Chỗ nó hiện ra là máy người khác, sau khi `upgrade.mjs` đã chạy.

---

## 2.51.0 — 2026-08-10

**minor.** *"Agent hết ngân sách"* thôi bị ghi thành *"agent làm sai"*. Trạng thái thứ **tư**
của lớp eval. Đóng #147.

### Con số nói dối, và nó nói dối theo chiều hoảng

Lượt đo #144 (sau khi #145 đã gỡ vòng lặp Stop) ra:

```
REGRESSION  0%  (0/3)
```

Mở transcript thì **cả ba là cùng một thứ**:

| task | maxTurns | transcript | thực tế |
|---|---|---|---|
| 0005 | 6 | 44 B `Reached max turns` | không biết agent làm gì |
| 0006 | 8 | 44 B `Reached max turns` | không biết |
| 0007 | 20 | 45 B `Reached max turns` | **làm việc ĐÚNG tới lúc cạn** |

Bằng chứng cho dòng cuối: agent của `0007` viết **7 ca test** vào `mergeBaseline`, và chúng có
răng thật — mutation `slice(0,20)` → `slice(-20)` bị giết bởi đúng ca nó thêm (đã nhận vào ở
2.50.x, PR #149). Một agent làm đúng, làm sâu, bị chấm **FAIL** vì hết lượt.

### Nguyên nhân — một dòng

```js
const passed = measured && asserts.failed.length === 0 && (!agent || agent.ok);
```

`agent.ok = (r.status ?? 1) === 0`, và `claude -p` thoát **1** khi chạm trần lượt. Runner đã
tách rất kỹ *"chưa nối agent"* / *"hạ tầng hỏng"* / *"chạy rồi mà không có gì chấm được"* —
nhưng **cạn ngân sách** rơi thẳng vào `FAIL`, cùng rổ với *"agent hạ `dcg` xuống fail-open"*.

Đúng lớp lỗi mà `infraFailure()` ra đời để chống ở #93, ở một trạng thái chưa ai tách.

### Vì sao là hàm RIÊNG, không phải thêm chữ ký vào `infraFailure`

Khác biệt không nằm ở cách nhận diện mà ở **việc phải làm sau đó**:

| | nguyên nhân | chạy lại có giúp không |
|---|---|---|
| `infraFailure` | ngoài, thường TẠM THỜI | **có** — *"chạy lại khi hạ tầng ổn"* |
| `budgetExhausted` | trần do **chính task khai** | **không** — lần sau cạn ở đúng chỗ đó |

Gộp hai cái thì lời khuyên đi kèm sai một nửa số ca. Ca test ㉑ khoá đúng câu *"CHẠY LẠI KHÔNG
GIÚP GÌ"*, và ca chéo khoá việc hai hàm không nhận ca của nhau.

### HAI nguồn, một trạng thái

Trần **lượt** để lại chữ trong output. Trần **wall-clock** thì không — `spawnSync` chỉ báo bằng
`signal === 'SIGTERM'`. Trước bản vá, `timedOut` chỉ được một dòng WARN rồi task **vẫn** thành
FAIL. Bỏ nguồn thứ hai thì nửa còn lại của cùng lớp lỗi vẫn im lặng — ca ㉒ khoá nó.

### Mutation — 5 mutant, 0 sống sót

| # | Mutant | Ca giết nó |
|---|---|---|
| M1 | `budgetExhausted` luôn trả `null` | bảng thuần + ㉑ |
| M2 | `measured` bỏ vế ngân sách | ④ ㉑ ㉒ |
| M3 | bỏ nguồn SIGTERM | ④ ㉒ |
| M4 | nới regex, nuốt luôn chữ ký hạ tầng | **6 ca**, gồm ② *"eval FAIL đọc thành PASS"* |
| M5 | bỏ câu *"chạy lại không giúp gì"* | ㉑ |

M4 là chiều nới-quá-tay: nới phép nhận diện thì mọi task khó thành `n/a` và tỉ lệ **biến mất**
— chiều nói dối im lặng hơn, và nó bị 6 ca chặn.

### Ca ④ đổi thứ nó khẳng định

Nó từng neo vào chuỗi `WALL-CLOCK CAP`, mà ㉒ nay sở hữu phần đó. Thứ **chỉ ④** khẳng định được
là **phép cắt có thật sự xảy ra**: nếu `timeout` của `spawnSync` biến mất, runner vẫn in một
dòng hợp lệ — chỉ khác là in sau **một phút** thay vì 3 giây. Nên ④ nay đo con số thời gian.

### CÒN LẠI — nói ra thay vì im

Bản vá này làm báo cáo **thành thật**, nó **không** làm phép đo chạy được. Với `maxTurns` hiện
tại, ba task kia trở thành `n/a` ⇒ mẫu số về 0 ⇒ vẫn chưa có `eval − eval --bare`.

Việc còn lại là **hiệu chỉnh `maxTurns` của task**, và nó cần số đo chứ không cần ý kiến: `0001`
(10 lượt) **đủ** — nó ra 2043 byte kết luận thật; `0005`/`0006`/`0007` thì không. Một lượt
`claude -p` là một vòng tool-call, nên task đòi đọc file cạn lượt trước khi kịp trả lời.

### Đã đổi

- `tooling/lib/harness.mjs` — `budgetExhausted()` (thuần)
- `evals/run.mjs` — `agent.budget` từ HAI nguồn · `measured` · câu thứ tư
- `evals/fixtures/fake-agent.mjs` — chế độ `maxturns`
- `tooling/test-hooks.mjs` · `tooling/test-evals.mjs` — bảng thuần + ㉑ ㉒, và ④ đổi phép khẳng định

---

## 2.50.0 — 2026-08-10

**minor.** Ở repo TEMPLATE, gác fail-đóng của `gates.mjs` là một gác **không có đường thoả** —
và nó biến mọi phiên headless thành vòng lặp không đáy. Thu hẹp phạm vi. Đóng #145.

### Gác mà lời khuyên của nó bất khả thi

```
if (skipped && unattended() && HARNESS_ALLOW_SKIPPED_GATES !== '1') exit 2
   → "Khai đủ lệnh trong harness.config.json"
```

Ở template, lời khuyên đó **không thực hiện được**: `setup.mjs` TỪ CHỐI `--apply` ở đây, với
đúng lý do — *"ghi cấu hình thật vào đây sẽ biến placeholder của template thành cấu hình của
MỘT project, và mọi project áp sau đó thừa hưởng nó"*. `commands` rỗng là trạng thái **ĐÚNG và
VĨNH VIỄN** của template.

Nên gác chỉ còn một lối ra: đi vòng. Đó đúng tiêu chí nghi thức `guard-nhanh-tich-hop` dùng để
đề nghị **cắt** một cái gác: *"cửa thoát dùng nhiều hơn được tuân theo là một guard đang dạy
người ta đi vòng"*.

### Cái giá, đo được

```
claude -p ⇒ CLAUDE_CODE_ENTRYPOINT=sdk-cli ⇒ unattended() = true
          ⇒ gates.stop bỏ qua 3/3 ⇒ exit 2 ở MỌI lượt Stop
          ⇒ Claude Code re-invoke agent ⇒ Stop lại đỏ ⇒ KHÔNG HỘI TỤ
```

| lệnh trong template | kết quả |
|---|---|
| `claude -p --max-turns 6` + prompt **tầm thường** | `Error: Reached max turns (6)`, exit 1 |
| cùng lệnh + `HARNESS_ALLOW_SKIPPED_GATES=1` | `OK.`, exit 0 |

Nó chặn eval runner, scheduled agent, canary — **mọi thứ chạy không có người**, ở đúng repo mà
lớp eval phải chạy để chứng minh harness có giá trị. Task eval `0005` bị chấm **FAIL** với
transcript **44 byte**, trong khi 4 assertion tất định đều PASS và repo không đổi một byte.

### Phạm vi hẹp — ba điều kiện, và điều kiện giữa mới là điều đáng nói

```js
const templateCannotComply = repoRole() === 'template' && declaredCommands(config()).length === 0;
```

- `repoRole() === 'template'` — repo tiêu thụ có `.claude/harness-manifest.json` ⇒ **vẫn chặn
  y như cũ**. Với họ, `commands` rỗng đúng là cấu hình sai.
- `declaredCommands().length === 0` — khai được MỘT lệnh nghĩa là khai được nhiều hơn. Template
  khai 1/3 rồi bỏ 2 là **thiếu sót**, không phải cấu trúc ⇒ vẫn chặn.
- `skipped && unattended()` — như cũ.

### CHO QUA, NHƯNG NÓI RA

Im lặng ở đây biến ca *"không thể thoả"* thành ca *"đã thoả"* — đúng phép gộp mà cả `gates.mjs`
tồn tại để chống. Nên nó vẫn in, ở stderr của mọi lượt:

```
⚠️  REPO TEMPLATE, phiên không người: 3 gate bị BỎ QUA và KHÔNG có gì được kiểm.
   Ở repo TIÊU THỤ, cùng tình huống này VẪN CHẶN.
```

### Mutation — 5 mutant, 0 sống sót

| # | Mutant | Ca giết nó |
|---|---|---|
| M1 | bỏ `repoRole()` ⇒ repo **tiêu thụ** cũng được miễn | ④ tiêu thụ + không người → **vẫn** fail-đóng |
| M2 | bỏ `declaredCommands()===0` ⇒ mọi template miễn nhiễm | ⑥ template đã khai 1 lệnh → **vẫn** fail-đóng |
| M3 | cho qua mà **im lặng** | ② phải in `REPO TEMPLATE` |
| M4 | đảo chiều (template chặn, tiêu thụ miễn) | ② ④ ⑥ cùng đỏ |
| M5 | cửa thoát thôi tác dụng | ⑤ cửa thoát ở repo tiêu thụ |

M1 là mutant quan trọng nhất: không có ca ④, một bản *"đơn giản hoá"* bỏ `repoRole()` sẽ xanh
và **cả lớp fail-đóng biến mất im lặng** ở mọi repo tiêu thụ.

### CHƯA VERIFY ĐƯỢC — nói ra thay vì im

Bản vá được kiểm ở **tầng gate** (6 ca, 5 mutant, tất định). Phần *"agent nay kết thúc được một
lượt headless trong template"* thì **CHƯA đo end-to-end**: `claude -p` đang chạm session limit
(`resets 1am`, bộ đếm 30 ngày đi 12 → 14). Đó là một `?`, không phải một đảm bảo — chạy lại khi
quota mở.

### Đã đổi

- `tooling/gates.mjs` — nhánh fail-đóng + nhánh cảnh báo mới
- `tooling/test-hooks.mjs` — bảng gate đi từ 3 ca lên **6 ca**, chạy trên HAI cây (220 ca)

---

## 2.49.0 — 2026-08-09

**minor.** Hai phát hiện cuối của máy dò #127 được xử. Máy dò về **0 / 0**. Đóng #142.

Chúng là **hai chiều của cùng một lớp lỗi**, nên chúng đi cùng một PR:

| Field | Chiều | Xử |
|---|---|---|
| `limits.sessionPresenceMinutes` | **đọc mà chưa khai** — `session-start.mjs:156` gọi `limit(…, 240)`, config im lặng ⇒ 240 là hằng số cứng và người mở config để hiệu chỉnh **không thấy nó tồn tại** | khai, kèm `$comment_` |
| `mcp.maxTools` | **khai mà không ai đọc** — 0 nơi đọc (`maxServers` thì có, `harness-doctor.mjs:157`) | cắt, để lại bia mộ |

### `mcp.maxTools`: không chỉ chết, tiền đề của nó cũng hết hạn

`$comment_mcp` viết *"Tool definition ăn context ở MỌI request"*. Câu đó **không còn đúng**:
tool definition của MCP nay nạp **theo yêu cầu** (tool search), nên *"tổng tool phơi ra"* thôi
là con số trả ở mỗi lượt. Cắt một field mà để nguyên tiền đề đã hết hạn ngay cạnh nó là **giữ
lại một câu sai** — nên bia mộ `$comment_da_cat_maxTools` nói ra cả hai lý do. Phần nguyên lý
còn đúng (3–5 server, CLI rẻ hơn MCP) ở lại `$comment_mcp`.

Đây đúng câu hỏi mà nghi thức `claude-code-drift` tồn tại để hỏi, chỉ là lần này nó tới từ máy
dò config chứ không từ bản rà vendor.

### PHẢI có migration — và đây là chỗ 2.35.0 đã bỏ sót

`harness.config.json` là lớp **SEED**: bước copy của `upgrade.mjs` KHÔNG chạm nó. Sửa ở template
thì repo đã áp **không bao giờ nhận được**.

Nửa THÊM là nửa quan trọng: consumer đang chạy `session-start.mjs` đọc field đó, và máy dò mới
(2.46.0) sẽ báo đúng phát hiện này ở **mọi** repo con — một phát hiện họ không tự hiểu được nếu
template im lặng.

**Tiền lệ ngược:** 2.35.0 cắt `budget.maxToolCallsPerRun` mà **không** kèm migration, nên mọi
consumer vẫn mang field chết đó tới hôm nay. Migration `012` không dọn hộ ca đó — nó ngoài
phạm vi PR này — nhưng nó ghi lại rằng ca đó tồn tại.

### Giá trị khai phải BẰNG ĐÚNG fallback đang chạy

`240`, vì `session-start.mjs` đang chạy `limit('sessionPresenceMinutes', 240)`. Khai một số
khác là dùng một migration mang danh *"làm cho config đọc được"* để lặng lẽ **đổi hành vi** —
người nâng cấp không xin điều đó, và không gì báo cho họ.

### Template và migration KHÔNG được lệch nhau

Văn bản đích của `harness.config.json` được sinh ra **bằng chính migration 012** chạy trên bản
cũ, rồi mới áp vào template. Hai đường — thứ consumer nhận và thứ template có — không thể lệch
vì chúng là **một phép biến đổi**.

### Bằng chứng

```
$ node tooling/test-migrations.mjs
  OK  012-hai-chieu-cua-field-cau-hinh.mjs (v2.49.0): fixture CŨ→MỚI · ①②③④⑤ đạt · $comment 4→5

$ (chạy thử khô trên config THẬT)
  ✓ khai `limits.sessionPresenceMinutes` = 240
  ✓ cắt `mcp.maxTools`
  MÁY DÒ: 49 field · 0 không ai đọc · 0 đọc-mà-chưa-khai · 1 cố ý vắng
```

Fixture `tooling/fixtures/migration-2.49.0/` cố ý dựng **nhánh nguy hiểm nhất** của vá-TEXT:
`maxTools` nằm **cuối** khối `mcp` (cắt nó tạo dấu phẩy treo), và một khoá do project tự thêm
(`DuAnNayTuThem`) đứng **ngay cạnh** chỗ bị cắt để bắt regex ăn quá tay.

### Đã đổi

- `harness.config.json` — **vùng cấm**, cần `HARNESS_DRI=1` do DRI bật
- `harness-migrations/012-hai-chieu-cua-field-cau-hinh.mjs` + fixture

---

## 2.48.0 — 2026-08-09

**minor.** `limits.prWarnFiles` có người đọc. Đóng #139 — phát hiện đầu tiên của máy dò
#127 được **xử**, không chỉ được báo.

### Vì sao CHO NGƯỜI ĐỌC chứ không CẮT

`harness-doctor` cho hai lối. Cắt thì vứt bỏ một công hiệu chỉnh THẬT: `$comment_prWarnFiles`
ghi lại đo trên 6 release (**19 · 15 · 21 · 10 · 25 · 35** file) và lý do nâng mốc 15 → 30
(*"mốc 15 cũ cảnh báo ở 5/6 release — một cảnh báo nổ mọi lần là cảnh báo dạy người ta phớt
lờ nó"*). Đó là con số đã trả giá để biết; nó xứng đáng có một cái cò.

Và lối này **không cần tay DRI**: `.github/workflows/ci.yml` KHÔNG nằm trong `paths.harness`
— chỉ `.github/CODEOWNERS` nằm trong đó.

### MỘT phép diff, HAI con số

```diff
- LINES=$(git diff … --numstat -- . ':(exclude)…' | awk '{a+=$1; d+=$2} END {print a+d+0}')
+ NUMSTAT=$(git diff … --numstat -- . ':(exclude)…')
+ LINES=$(echo "$NUMSTAT" | awk '{a+=$1; d+=$2} END {print a+d+0}')
+ FILES=$(echo "$NUMSTAT" | awk 'NF{n++} END {print n+0}')
```

Gọi `git diff` lần thứ hai với một bản **chép** của danh sách loại trừ là cách hai ngưỡng
lặng lẽ đo hai tập file khác nhau: sửa một bên, quên bên kia, và không gì báo. Cùng hình dạng
với bug **v2.45.1** — hai bên đọc ngân sách tự lắp tham số nên một cái sổ ra hai câu trả lời.

### HAI cảnh báo độc lập, không phải `elif`

Dòng và file đo hai thứ khác nhau. Một PR **200 dòng rải trên 40 file** là *"đang gộp nhiều
mục đích"*; một PR **1200 dòng trong 3 file** là *"một thay đổi lớn"*. Nhánh `elif` làm ca thứ
nhất **không bao giờ được nói ra** — và đó chính là ca `prWarnFiles` được hiệu chỉnh để bắt.

### Một cái bẫy `bash -e` bắt được lúc thử

`FILES=$(… | grep -c .)` là cách viết tự nhiên hơn, và nó **hỏng**: `grep -c` thoát **1** khi
đếm ra 0, bước CI chạy dưới `bash -e`, nên một PR không chạm file nào (sau khi loại tài liệu)
làm **CI ĐỎ vì đúng cái nó đo được**. Đo tại chỗ trước khi commit:

```
$ echo "" | grep -c . ; echo "thoát $?"
0
thoát 1          ← bash -e ⇒ bước CI đỏ
$ echo "" | awk 'NF{n++} END {print n+0}'
0                ← thoát 0
```

Dùng `awk`, cùng công cụ dòng bên cạnh đã dùng.

### Đo được ngay

```
$ node tooling/harness-doctor.mjs
  ⚠️   config: 49 field · 1 không ai đọc · 1 đọc-mà-chưa-khai · 1 cố ý vắng
```

**2 → 1.** Còn lại `mcp.maxTools` (cắt) và `limits.sessionPresenceMinutes` (khai) — cả hai
nằm trong `harness.config.json`, tức **vùng cấm**, tức tay DRI.

### Đã đổi

- `.github/workflows/ci.yml` — bước *"Kích thước PR"*

---

## 2.47.0 — 2026-08-09

**minor.** Nghi thức chạm bề mặt vendor chỉ hỏi **một nửa** câu hỏi suốt từ đầu. Nay có nửa
còn lại, và nó có sổ. Đóng #129.

### Nửa câu hỏi bị thiếu

`claude-code-drift` hỏi câu **TRỪ**: *"vendor vừa ra sẵn thứ nào harness đang tự làm tay?"* —
nó đi tìm cơ chế để **cắt**, nên nó chỉ nhìn được những chỗ harness **đã có mặt**. Chỗ vendor
**gọi cho ta mà ta chưa bao giờ nhấc máy** thì không mục nào trong bảng nghi thức nhìn thấy.

Ba mảnh đã tồn tại, mỗi mảnh làm đúng việc của nó, và **không mảnh nào hỏi câu còn lại**:

```
native-surface.mjs   ĐO từ binary → "31 sự kiện · 9 đang cắm · 22 để trống"
claude-code-drift    HỎI          → "vendor ra sẵn thứ nào harness tự làm?"   ← TRỪ
harness-doctor       LỌC          → NATIVE_SLOTS = 5 ô, cả 5 đã cắm
```

Con số **22** được **in ra** suốt nhiều version như một số đo. Không ai **xét** nó.

### Rổ `na` là chỗ câu hỏi đi chết

Dòng cũ của `native-surface`:

```js
na.push(`${empty.length} để trống — không phải thiếu sót, nội dung là đặc thù repo: …`)
```

Theo đúng định nghĩa ở `report()` (`lib/harness.mjs`), rổ `na` nghĩa là **bằng không DO CẤU
TRÚC** — *"một hook không có đường exit 2 thì `fired` không thể nhúc nhích"*. 22 ô mà **chưa
ai xét** không phải bằng-không-do-cấu-trúc; nó là 22 câu hỏi chưa hỏi, tức rổ `unknown`.

Câu *"không phải thiếu sót"* **đúng** cho những ô đã được xét và bác. Áp nó cho cả tập là tự
khai đã trả lời xong một câu chưa ai đặt ra — và nó đã đọc như một câu trả lời suốt nhiều
version. Đây là cùng lớp lỗi mà chính `report()` ra đời để chặn, sống trong một bên gọi nó.

### Ba trạng thái, và chúng trùng đúng ba rổ đã có

| Sổ | Rổ `report()` | Nghĩa |
|---|---|---|
| `co-viec` | `warn` | có việc, **đã mở issue** |
| `khong-co-viec` | `na` | đã xét và bác, có lý do |
| `chua-xet` | `unknown` | chưa ai hỏi — **không phải 0** |

### Sổ là PHẦN BÙ, không phải một danh sách

`chua-xet = events − wired − ledger`. Vì là phần bù, một sự kiện **MỚI** vendor thêm vào
binary **tự rơi vào `chua-xet`** ở lần `--record` kế tiếp — **không có bảng viết tay nào phải
bảo trì**, và không có cách nào quên một ô mới.

Khác cố ý với `NATIVE_SLOTS` ở `harness-doctor`: bảng đó là 5 ô mà **template** đã quyết là có
việc, để repo tiêu thụ đối chiếu `settings.json` của **họ**. Nó viết tay và **cố ý không đổi
theo binary**. Hai câu hỏi khác nhau, hai cơ chế — không gộp.

### Đo được ngay khi cắm vào

```
$ node tooling/rituals.mjs --slots
  OK   31 sự kiện (đo ở 2.1.226) · 9 đang cắm · 22 để trống
  WARN 5 ô CÓ việc: PostToolUseFailure · Notification · SessionEnd · PreCompact · TaskCompleted
  n/a  2 ô đã XÉT và bác: WorktreeCreate · WorktreeRemove
  ?    15/22 ô CHƯA ai xét
```

Bảy ô được nạp trong chính PR này vì **repo đã có sẵn câu trả lời** cho chúng — không nạp thì
nghi thức đi hỏi lại thứ `docs/adr/0002` và `.claude/learnings/` đã trả lời, và *"một sự thật
ở hai chỗ là một LỖI"*. Năm ô `co-viec` sinh ra #130 · #131 · #132.

**Mục này ĐỎ ngay khi merge, với 15 ô.** Đó là số thật, không phải lỗi.

### `co-viec` bắt buộc có số issue

Nghi thức XANH khi **mọi ô đã xét**, kể cả ô `co-viec`. Bắt nó đỏ cho tới lúc ô được cắm là
bắt nó **đỏ vĩnh viễn**, và mục đỏ vĩnh viễn dạy người ta bỏ qua màu đỏ (`lessons/0003` tầng
1 — cùng lý do `ui` phải khoá vào issue hiện tại thay vì quét cả repo).

Ranh giới: mục này theo dõi **"đã HỎI chưa"**, không phải **"đã LÀM chưa"**. Đổi lại,
`--slot … co-viec` **từ chối** một lý do không có `#N` — nếu không thì "có việc" là một câu
ghi vào sổ rồi không ai đọc lại. Số issue được rút **từ chính lý do**, không có trường riêng
để lệch, và in ở dòng `ok` mỗi lần `--all`.

### Sổ đặt ở đâu — và vì sao KHÔNG theo đề xuất của chính mình

Đề xuất trong `.claude/learnings/2026-W32-cau-hoi-cong-va-may-do-config.md` viết
`.claude/state/native-slots-reviewed.json`. **Sai**: `.claude/state/` nằm trong `.gitignore`.

Một phán đoán kiểu *"`WorktreeCreate` là provisioner, đừng cắm advisory vào"* là sự thật của
**đội** — nó phải review được trong PR và phải sống qua một lần đổi máy. Sổ fixlog đã ở đúng
chỗ gitignore đó và cái giá đã đo được: việc treo chỉ nằm trên **một** máy, người ở máy kia
không biết nó tồn tại. Nên sổ nằm cạnh `nativeEvents` trong `.claude/claude-code-baseline.json`
— file **được commit**, và là file mà nghĩa của sổ phụ thuộc vào (phép trừ cần `events`).

Cái giá: baseline nay có **BA** người ghi. #120 là lần một người dựng lại object từ đầu và
xoá đo của người kia, **im lặng**, phụ thuộc thứ tự chạy hai lệnh. Cả ba nay đọc-sửa-ghi trên
`prev`, và bảng `mergeBaseline` khoá cả ba khoá.

### Một nhánh đặt sai chỗ, tự bắt được bằng bài học của #127

`wired` không đọc được (`settings.json` hỏng) phải ra `null` ⇒ `?`. Bản đầu để nhánh đó trong
`collect()` — **không thuần, không test được**, đúng lớp mutant đã sống sót ở #127. Đẩy vào
hàm thuần thì nó thành một dòng trong bảng ca. Rơi xuống `[]` ở vế đó thì **mọi** sự kiện
thành "ô trống": nghi thức đỏ với 31 cái tên, dựng trên một file chưa đọc nổi.

### Mutation — 8 mutant, 0 sống sót

| # | Mutant | Ca giết nó |
|---|---|---|
| M1 | mọi mục trong sổ đều là "đã xét" (`if (led[e])`) | trạng thái gõ sai (`coviec`) phải vào `chua-xet` |
| M2 | `wired` không đọc được ⇒ `[]` thay vì `null` | `wired: null` ⇒ `null` |
| M3 | quên trừ ô ĐANG CẮM | sổ rỗng ⇒ đúng 2 ô trống |
| M4 | `stale` luôn rỗng | phán đoán về sự kiện vendor đã bỏ |
| M5 | `issues` lấy từ mọi trạng thái | lý do `khong-co-viec` nhắc `#999` |
| M6 | `events` rỗng ⇒ object thay vì `null` | `events: []` ⇒ `null` |
| M7 | nghi thức không đỏ khi còn ô chưa xét | `unexamined: ['B']` ⇒ `due` |
| M8 | `native-surface` đẩy ô chưa xét về lại `na` | **neo cấu trúc** |

M1 là chiều **SỬA QUÁ TAY** của L0007: chiều ồn ào (quên một ô ⇒ đỏ) thì ai cũng test; chiều
này làm mẫu số `chua-xet` teo về 0 và nghi thức **xanh** trong khi chưa ai xét gì.

M8 không chạy-để-test được — phần in nằm trong `runCli()` sau một phép quét binary 285 MB, và
CI ba OS không có `CLAUDE_CODE_EXECPATH`. Neo vào **đúng câu lệnh**, có nhánh riêng báo *"neo
đã trôi"* để người sau sửa neo thay vì xoá check (cùng khuôn với neo `blankStrings` của #127).

### Độ trễ

`collect() + evaluate()` đo 3 lần: **109 · 104 · 102 ms** — thêm đúng một phép đọc JSON
(`settings.json`) so với trước. **Không quét binary ở đây**: 285 MB, ~0,5 s, và `rituals` chạy
ở **mọi** `SessionStart`. Chỗ trả chi phí đó vẫn là `native-surface --record`, một lần mỗi
version.

### Điều kiện thoát

Hai quý liên tiếp nghi thức này không đổi được ô nào từ `chua-xet` sang một việc thật ⇒ hạ
xuống nhịp quý, hoặc bỏ.

### Đã đổi

- `tooling/rituals.mjs` — `nativeSlotState()` (thuần) · nghi thức thứ 14 `native-slot-review` ·
  `--slot` / `--slots` · `collect()` đọc thêm `settings.json`
- `tooling/native-surface.mjs` — ba rổ thay cho một
- `tooling/test-hooks.mjs` — 13 ca hàm thuần + 4 ca tầng nghi thức + 1 neo cấu trúc (217 ca)
- `.claude/claude-code-baseline.json` — khoá `slotReview`, 7 ô đã xét

---

## 2.46.0 — 2026-08-08

**minor.** Lớp lỗi *"field cấu hình không ai đọc"* đã bị sửa **bằng tay ba lần**; giờ nó có
máy dò. Quét **hai chiều**, và hai chiều **không đối xứng**. Đóng #127.

### Ba lần sửa ca, không lần nào dựng máy

| Version | Field | Bia mộ để lại trong config |
|---|---|---|
| 2.0.0 | `budget.modelTiering` | *"một niềm tin được đóng gói thành cấu hình"* |
| 2.28.0 | `budget.monthlyUsdCap` | *"nơi DUY NHẤT đọc nó là một dòng advice"* |
| 2.35.0 | `budget.maxToolCallsPerRun` | *"không cơ chế nào đọc nó"* |

`AGENTS.md`: lỗi cùng kiểu ≥2 lần thì làm **cơ chế**, đừng sửa tay lần nữa. Đây là lần ba.

### Đo được ngay khi cắm vào

```
$ node tooling/harness-doctor.mjs
  ⚠️   config: 49 field · 2 không ai đọc · 1 đọc-mà-chưa-khai · 1 cố ý vắng (có $comment_)
```

- `limits.prWarnFiles` — 0 nơi đọc. Trớ trêu: nó mang **đoạn biện minh dài nhất file**
  (đo 6 release: 19·15·21·10·25·35). Một niềm tin được hiệu chỉnh kỹ, nối vào hư không.
- `mcp.maxTools` — 0 nơi đọc (`maxServers` thì có).
- **Chiều ngược**: `limits.sessionPresenceMinutes` được `session-start.mjs` đọc qua
  `limit(…)` mà config **không khai** ⇒ TTL 240 phút là hằng số cứng, và người mở config
  để hiệu chỉnh **không thấy nó tồn tại**.

### Hai chiều KHÔNG đối xứng — đây là quyết định, không phải tối ưu

| | Chiều A *"có gì tiêu thụ field này không?"* | Chiều B *"code với tay tới thứ không tồn tại?"* |
|---|---|---|
| Quét | code **+ markdown** | **chỉ** code |
| Vì sao | một skill bảo agent đọc `limits.reservationTtlHours` **là** một người tiêu thụ — chỉ là inferential thay vì computational | `harness-migrations/README.md` có ví dụ migration **giả định** dùng `cfg.paths.hotspots`; nhận nó vào là một dương tính giả **ngày đầu**, và gác đỏ ngày đầu là gác sẽ bị tắt |

Allowlist cho ca **cố ý vắng** dùng chính idiom sẵn có: một khoá `$comment_<tên>` trong
config. `$comment_teamSize` đã nói *"KHÔNG khai ở template — file này là SEED"*. **Không có
danh sách thứ hai để bảo trì.**

### BỐN lần phép quét tự tố giác mình trong lúc viết

| # | Triệu chứng | Nguyên nhân |
|---|---|---|
| 1 | báo 6 field ĐANG ĐƯỢC ĐỌC là chết | sao chép `blankStrings: true` từ check `lib-import`. Tên field sống **trong** chuỗi: `limit('staleLockMinutes', 5)` |
| 2 | báo `paths.hotspots` thiếu | quét markdown ở chiều B — bắt phải một ví dụ giả định trong tài liệu |
| 3 | mutant `blankStrings: true` **SỐNG SÓT** | neo 5-field bị làm bẩn bởi **chính file test**: `test-hooks.mjs` chứa `pathsFor\('lintable'\)` trong một **regex literal**, và `codeOnly` không hiểu regex literal — nó thấy hai dấu nháy và xử lý như chuỗi |
| 4 | ngay khi cắm vào doctor, báo **5 field ma**: `limits.doDot` · `limits.doStr` · `limits.thieuTrongConfig` · `limits.x` · `paths.hotspots` | `srcCode` gồm `tooling/test-hooks.mjs`, và bảng test của phép quét chứa **fixture config GIẢ** ở dạng chuỗi. Chuỗi giữ ruột (mục 1!) nên fixture đọc thành accessor thật |

Mục 4 là hệ quả trực tiếp của mục 1 — hai quyết định đúng, ghép lại thành sai. Bản vá:
**file `test-*.mjs` là fixture ở dạng khác**, loại khỏi chiều B (giữ ở chiều A: một test đọc
field THẬT thì đó là người đọc thật). Cùng lý do `fixtures/` bị loại từ đầu.

Mục 3 là hở **đã ghi sẵn** trong chú thích của `codeOnly` (*"regex literal … vẫn đánh lừa
được nó"*), chỉ khác chiều: ở đó là `//`, ở đây là dấu nháy. Luật của chính chú thích đó —
*gặp thì thêm ca test trước, đừng thêm nhánh trước* — nên bản vá là **đổi neo**, không phải
sửa `codeOnly`. Neo mới trỏ vào **đúng lời gọi trong đúng hàm**, kèm nhánh riêng báo
*"neo đã trôi"*.

### `rejected` — con số bắt được ca phạm vi mở toang

Mutant vô hiệu `COV_ROOTS` **sống sót** phép so `scanned < tracked`, vì lọc theo **đuôi
file** vẫn giữ bất đẳng thức đó đúng. Phải đếm **riêng** số file bị *phạm vi* loại. Quét cả
repo là quét cả changelog/docs/ADR — nơi mọi tên field được nhắc như bia mộ — và khi đó
**mọi** field đọc thành "có người đọc": phép quét câm, im lặng, đúng chiều hỏng của `L0007`.

Đo hôm nay: **82 quét · 88 bị phạm vi loại · 206 tracked**.

### Mutant

| mutant | trước | sau |
|---|---|---|
| chiều A không bắt gì | sống sót | giết |
| `blankStrings: true` | **SỐNG SÓT** | giết |
| chiều B nhận markdown | giết | giết |
| bỏ allowlist `$comment_` | giết | giết |
| `COV_ROOTS` mở toang | **SỐNG SÓT** | giết |
| `COV_ROOTS` rỗng (quét 0 file) | giết | giết |

### Chưa làm, cố ý

Ba phát hiện là **dữ liệu**, không phải bản vá. Quyết chúng cần tay DRI —
`harness.config.json` là vùng cấm — và mỗi field là một quyết định riêng: cho người đọc,
hay cắt và giữ nguyên lý trong `docs/`.

---

## 2.45.1 — 2026-08-08

**patch.** Hai bên đọc ngân sách trả lời **trái ngược nhau về cùng một cái sổ** — và cái lưới
dựng ở `2.44.2` để bắt đúng lớp lỗi đó thì **mù 89% file lớn nhất**. Đóng #125.

### Đo được

```
$ node tooling/harness-doctor.mjs
  ⚠️   gói PHẲNG · 12 lần chạm rate limit trong 30 ngày

$ node tooling/rituals.mjs
  ?  capo-report.mjs --usd <N>   KHÔNG đo được — chưa đọc được `budget-alarm.log`
```

`rituals.mjs` gọi `budgetStatus({ plan, cap, alertAtPercent, latest, role })` — **thiếu
`rateLimitHits`**. Mặc định là `null`, và `null` ⇒ `flat-unmeasured`: đúng theo hợp đồng ba
trạng thái, không ném, không đỏ. Và `rituals` là cái chạy ở **mỗi SessionStart**, nên câu sai
là câu người dùng thấy hằng ngày.

### Bản vá là BỎ CHỖ ĐỂ QUÊN, không phải thêm một luật phải nhớ

`budgetSnapshot(cfg, role, now)` — một phép IO cho **mọi** bên đọc. Cả `harness-doctor` lẫn
`rituals` gọi nó; không còn đối số nào để quên. Phép đếm vẫn ở `rateLimitHitsIn()` (thuần, 6 ca).

`lib-import` (#122) **không thấy được** lỗ này: nó bắt *tên được gọi mà chưa import*, còn đây
là một *đối số không được truyền*. Nên ca thứ hai: **không bên đọc nào ngoài `lib` và `test-*`
được gọi thẳng `budgetStatus`**.

### Và chỗ tệ hơn: lưới của `2.44.2` báo XANH trên một file nó không đọc được

`lib-import` tự viết một `strip()` bằng 5 cái `replace` để bỏ chú thích và chuỗi. Đo trên
`rituals.mjs`:

```
thô 46709 ký tự  →  sau strip 5016  (11%)
"budgetSnapshot("  thô: có   ·  sau strip: KHÔNG
"repoRole("        thô: có   ·  sau strip: KHÔNG
```

**89% file biến mất**, nên check duyệt 40 file và báo xanh trong khi nó gần như không đọc được
file lớn nhất. Mutant tái hiện đúng lỗi #125 **sống sót**.

Đây là **chiều B của `L0007`** xảy ra ngay bên trong cái lưới vừa dựng để bắt chiều A — và bài
học đó merge trước bản vá này đúng một PR.

### `codeOnly()` đã tồn tại từ trước, với chú thích kể đúng chuyện này

```
* PHẢI BIẾT CHUỖI, và bản đầu thì không — nó đã bắn oan ngay lần dùng thứ hai. Trong
* `rituals.mjs` có một template literal chứa `features/*.json`; cặp regex ngây thơ đọc đó là
* MỞ block comment, rồi nuốt từ dòng 173 tới `*/` thật ở dòng 349 — 176 dòng code biến mất.
```

Cùng file, cùng nguyên nhân, và lời cảnh báo nằm ngay trên hàm giải quyết nó. Tôi viết lại một
`strip()` bằng regex thay vì dùng nó.

`codeOnly()` nhận thêm `{ blankStrings: true }` — xoá **ruột** chuỗi, giữ cặp nháy. Mặc định
`false` giữ nguyên hành vi cho bên gọi cũ (hợp đồng hai đầu **cần** nội dung chuỗi: lệnh mà một
thông báo in ra sống trong đó). Sau khi đổi: `rituals.mjs` còn **35%** thay vì 11%, và cả hai
tên đều đọc được.

### 3 mutant, 0 sống sót

| mutant | trước bản vá | sau |
|---|---|---|
| `rituals` quay lại tự lắp tham số (tái hiện #125) | **SỐNG SÓT** | giết bởi `budgetStatus trực tiếp` **và** `lib-import` |
| `budgetSnapshot`: sổ không có ⇒ `null` thay vì `0` | giết | giết |
| `budgetSnapshot`: bỏ cửa sổ 30 ngày | giết | giết |

Dòng đầu là cả bản vá: cùng một mutant, cùng một suite, khác nhau ở chỗ suite có **thật sự
đọc được file** hay không.

---

## 2.45.0 — 2026-08-08

**minor.** `L0007` — *một bản vá có HAI chiều sai, và bộ ca test chỉ được viết cho chiều ồn ào*.
Promote từ `.claude/learnings/` (#119) sau khi DRI duyệt.

### Bằng chứng: 4 lần trong MỘT phiên

| bản vá | ca viết ra (chiều A) | bản vá cực đoan vẫn xanh vì |
|---|---|---|
| `measured` bỏ `Boolean(agent)` (#117) | mẫu số CO LẠI | `measured = false` ⇒ tỉ lệ trên tập rỗng |
| `--bare` gỡ lớp harness (#118) | cây trần không còn `AGENTS.md` | gỡ sạch cả `tooling/` |
| phép trừ `full − bare` (#118) | có in ra một hiệu số | hai lần chạy có hai MẪU SỐ khác nhau |
| `mergeBaseline` giữ khoá cơ chế khác (#121) | `nativeEvents` sống sót | `...prev` đặt sau ⇒ nuốt bản ghi mới |

Cả bốn đều bị bắt bởi **cùng một động tác**: chạy một mutant làm *tất cả theo một chiều*, rồi
hỏi *"suite có đỏ không?"*.

### Vì sao chiều B chưa từng có issue nào

```
chiều A   đếm/giữ thứ KHÔNG nên   → số sai, và nó ồn: có người mở issue
chiều B   BỎ ĐẾM/BỎ GIỮ thứ nên   → mẫu số rỗng, bản ghi mới bị nuốt — KHÔNG có triệu chứng
```

`#93` là chiều A theo hướng hoảng. `#104` là chiều A theo hướng dễ chịu. **Chiều B chưa từng có
issue nào** — không ai mở issue cho một con số không xuất hiện.

Mặt còn lại của `L0002`: guard **bắn nhầm** thì bị TẮT (ai cũng thấy); guard **bắn quá rộng**
thì không ai tắt — nó chỉ thôi đo gì cả. Họ hàng gần của `L0005`: ở đó bộ đếm đổ về phía dễ
chịu, ở đây **bộ ca test** đổ về phía dễ nghĩ ra.

### Cơ chế đi kèm — bài học không có `artifacts` chỉ là một ghi chú

5 ca đã hiện thực và **mỗi ca đã được đo là giết một mutant thật**: `⑮`, vế hai của `⑰`, `⑳`
(`test-evals.mjs`), `mergeBaseline ②` và `rateLimitHitsIn` `0`≠`null` (`test-hooks.mjs`).

Điều kiện tiền đề, ghi rõ trong bài học: **phép hợp nhất/đếm phải là hàm THUẦN**. `rateLimitHitsIn`
sống trong trạng thái hỏng 30 phút (#122) vì nó nằm lẫn trong một IIFE có IO và một `catch`
trần — **không có chỗ nào để đặt ca cho chiều thứ hai**.

### Gate: `evals/tasks/0007`

Prompt cố tình **không nhắc** "hai chiều" hay "mutation" — nó chỉ nói *"viết test cho
`mergeBaseline`"*. Lớp 1 có **7 khẳng định**, mỗi cặp khoá **hai chiều của cùng một quyết
định**: giữ-quá-ít với giữ-quá-nhiều, `0` với `null`.

`REGRESSION 100% (6/6)` sau khi thêm task — mẫu số **tăng**, không phải tỉ lệ đẹp lên do co
mẫu số.

### Lớp phân phối bắt được ngay

`apply-to.mjs --audit` đỏ với đúng hai file mới: *"KHÔNG nằm trong HARNESS hoặc SEED — sẽ không
được copy sang project mới"*. Một bài học không đi kèm gate của nó sang repo khác thì repo nhận
**có cơ chế mà không kiểm được cơ chế đó**. Đã đăng ký cả hai; audit phủ **163 file**.

### Bước 7 của `/knowledge-promote` — "xét cắt một thứ"

Bắt buộc **xét**, không bắt buộc cắt. Đã đo: **9/9 khoá `limits` và 2/2 khoá `mcp` đều có bên
đọc** (3–10 file mỗi khoá), không tìm thấy field ma nào như `maxToolCallsPerRun` (cắt ở 2.35.0)
hay `modelTiering` (cắt ở 2.0.0).

Hai lần cắt **đã được lên lịch** thay vì làm bây giờ:

- `exit-condition` của `L0007` — bài học retire khi bộ mutant tổng quát có ratchet về 0;
- `evals/tasks/0004` vẫn ngoài mẫu số cho tới khi runner biết chạy `## Dựng cảnh` (#104 đường a).

`harness-size` vẫn báo **PHÌNH** (`lessons +4`, `hooks +181` dòng so với 2026-08-05). Ghi ra,
không giấu.

---

## 2.44.2 — 2026-08-08

**patch.** Nhánh gói **PHẲNG** — thêm ở `2.44.0` cách đây 30 phút — **chưa từng đếm được một
lần nào**. Đóng #122.

### Nó lộ ra vì có người BẬT CỜ

`HARNESS_BUDGET_PLAN=flat` vào `.claude/settings.local.json`. Trước đó **không repo nào khai
`flat`**, nên cả nhánh này chưa từng chạy ở đâu — kể cả trong 13 ca test của chính nó.

### Hai lỗi, chồng lên nhau, và cái thứ hai tệ hơn

**① `telemetryDir` không có trong danh sách import của `harness-doctor.mjs`.**

```
CATCH nuốt: ReferenceError: telemetryDir is not defined
rateLimitHits = null   ← luôn null ⇒ flat-unmeasured VĨNH VIỄN
```

`catch { return null }` được viết với nghĩa *"đọc sổ hỏng ⇒ không biết"*. Nó **cũng nuốt
`ReferenceError`**. Đo trên máy có sổ **12 dòng đọc được**:

```
?    gói PHẲNG — không đọc được `budget-alarm.log`, nên số lần chạm rate limit KHÔNG ĐO ĐƯỢC
```

**② Kể cả khi sửa ①, phép cộng vẫn sai — và nó sai theo chiều DỄ CHỊU.**

`tallyLines` trả `Map<key, {sub: count}>` — giá trị là **object**:

```
tallyLines → [ [ 'rate_limit', { money: 12 } ] ]
0 + {money:12}  =  "0[object Object]"   →  Number(...) = NaN  →  rơi xuống nhánh cuối
budgetStatus → flat-ok · rateLimitHits: 0
```

**`ok  gói PHẲNG · 0 lần chạm rate limit`** — trong khi sự thật là **12**. `L0005` ở dạng nguyên
bản, trong chính cơ chế vừa dựng để chống một cảnh báo vô nghĩa: #111 sửa một cảnh báo **luôn
bật**; sửa nửa vời thì được một cảnh báo **không bao giờ bật**.

### Vì sao 13 ca của #111 không thấy

Chúng kiểm `budgetStatus` — **hàm thuần** — bằng `rateLimitHits` **truyền tay**. Phép đếm nằm
inline trong `harness-doctor.mjs`: không thuần, không ca nào. **Ranh giới test dừng đúng trước
chỗ hỏng.**

`rateLimitHitsIn(text, sinceMs)` dời ranh giới đó qua chỗ hỏng: hàm thuần trong `lib`, 6 ca,
gồm ca đòi **kiểu trả về là số** (`"0[object Object]"` cũng "khác 0", nên chỉ so giá trị là
không đủ) và ca đòi `0` ≠ `null`.

### Và một lưới cho cả LỚP lỗi ①

`lib-import` — phép trừ tập hợp trên **40 file**: mọi tên `lib` xuất ra mà một file **gọi** thì
phải có trong danh sách import của file đó. `ReferenceError` chỉ nổ **lúc chạy**, và ở đây nó
nổ trong một nhánh không ai bật, bọc trong một `catch` trần.

Bản đầu của lưới này **bắn nhầm 243 ca** — hai nguyên nhân, cả hai đáng ghi:

- regex `[\s\S]*?` bắt đầu ở `import {` **đầu tiên** của file (thường `node:fs`) rồi nuốt qua
  nhiều dòng, nên **tên đầu tiên** của danh sách `harness.mjs` dính liền chuỗi `import {` và
  không bao giờ khớp — `repoPath` bị báo thiếu ở 17 file đang import nó;
- và nó quét cả **chuỗi**, không chỉ chú thích: `"… config() fail-open"` trong một message.

Một check bắn nhầm là một check sắp bị tắt (`L0002`), nên cả hai được vá trước khi ship: quét
trên mã đã bỏ chú thích **và** chuỗi, cộng tên khai bằng phá cấu trúc. Còn **0/40** dương tính
giả.

### 4 mutant, 0 sống sót

| mutant | giết |
|---|---|
| bỏ `telemetryDir` khỏi import (tái hiện lỗi ①) | `lib-import` |
| bỏ `rateLimitHitsIn` khỏi import | `lib-import` |
| cộng chính object thay vì giá trị (tái hiện lỗi ②) | `rateLimitHitsIn` 3/6 ca |
| không đọc được ⇒ `0` thay vì `null` | `rateLimitHitsIn` 1/6 ca |

### Đo được sau bản vá

```
⚠️   gói PHẲNG · 12 lần chạm rate limit trong 30 ngày — ĐÂY là trần thật, không phải USD
```

---

## 2.44.1 — 2026-08-08

**patch.** `.claude/claude-code-baseline.json` có **hai người ghi**, và một người **xoá phép đo
của người kia**. Đóng #120.

### Đo được — tìm ra bằng cách chạy đúng nghi thức

```
$ node tooling/native-surface.mjs --record
  OK   đã ghi 31 sự kiện vào .claude/claude-code-baseline.json

$ node tooling/rituals.mjs --reviewed-claude-code "…"
  ✓ đã ghi: rà Claude Code 2.1.226

$ git diff --stat
  .claude/claude-code-baseline.json | 48 +++-----   (8 thêm, 40 XOÁ)

$ node tooling/rituals.mjs
  ▸ rituals.mjs --reviewed-claude-code   đã rà changelog 2.1.226 nhưng CHƯA đo tập sự
    kiện hook lần nào
```

*"CHƯA đo lần nào"* — trong khi nó vừa được đo **30 giây trước**, và bị ném đi.

### Nguyên nhân

`rituals.mjs` dựng lại object từ đầu với đúng bốn khoá, và chỉ đọc `prev` để lấy `history`:

```js
writeJson({ $comment, reviewedVersion, reviewedAt, history });   // ← nativeEvents biến mất
```

`native-surface.mjs` làm **đúng**: đọc `prev`, gán `prev.nativeEvents = …`, ghi `prev` về.

### Vì sao tệ hơn "mất một field"

**Phụ thuộc THỨ TỰ, và im lặng.** Chạy `--record` sau thì không sao; chạy trước thì mất. Không
có gì báo — chỉ có nghi thức nói *"chưa đo lần nào"*, mà câu đó **không phân biệt được** với
"thật sự chưa ai đo".

Và nó đánh đúng vào phép đo mà chính `rituals.mjs` gọi là *"máy trừ được thì đừng hỏi người"*:
tập sự kiện hook là con số **duy nhất** trong bề mặt vendor kiểm được bằng máy. Cơ chế bảo vệ
nó lại là cơ chế xoá nó.

### Đổi gì

`mergeBaseline(prev, {version, at, found})` — hàm **thuần**, export để test được mà không đụng
file thật (đường dẫn baseline cứng ở `repoPath('.claude', …)`, không có env chuyển đích như
`HARNESS_STATE_DIR`, nên một suite chạm file thật sẽ ăn mất bản rà của chính người chạy nó).

`...prev` **trước**, bốn khoá của lần rà ghi đè **sau**. Thứ tự đó là cả bản vá — đảo lại thì
`history` cũ thắng bản ghi mới: cùng một lỗi, đổi nạn nhân.

### 6 ca, 3 mutant, không mutant nào sống sót

| mutant | giết |
|---|---|
| bỏ `...prev` (quay lại bản dựng-từ-đầu) | ① giữ `nativeEvents` |
| `...prev` đặt SAU bốn khoá | ②③ bản rà mới thắng · history cũ được nối |
| bỏ trần 20 | ④ |

Ca ② tồn tại vì ca ① **không đủ một mình**: một bản vá *"giữ hết mọi thứ của prev"* cũng làm ①
xanh, trong khi nó nuốt đúng bản rà vừa viết. Đây là chiều **sửa quá tay** mà
`.claude/learnings/2026-W32-chieu-sua-qua-tay.md` vừa nói tới — lần thứ tư trong cùng một phiên.

### Kèm theo: bản rà Claude Code 2.1.226

`2.1.225–226` **không** ra sẵn thứ nào harness đang tự làm tay. Tập sự kiện hook **không đổi**
so với 2.1.224 (31 sự kiện, đo bằng `native-surface`). Mục gần nhất là *"gateway spend-limit
support"* ở 2.1.225 — thông báo chạm trần nay nêu cap, giờ reset và lời của operator, **nhưng
nó đòi gateway** (triển khai enterprise), nên nó không thay được `budget-alarm.log` của v2.44.0.

Đáng theo dõi: nếu vendor đưa cap + giờ reset vào thông báo cho **mọi** tài khoản thì
`flat-limited` đọc được số thật thay vì chỉ đếm số lần chạm.

---

## 2.44.0 — 2026-08-08

**minor.** Lớp ngân sách giả định **trả theo mức dùng**. Với gói **phẳng**, cảnh báo *"vượt
trần"* luôn bật và luôn vô nghĩa. Đóng #111.

### Đo được — dữ liệu ĐÚNG cũng ra `over`

Người dùng Claude Pro, ~$20/tháng, trả phẳng. Khai đúng và nhập đúng:

| dữ liệu | mode | % |
|---|---|---|
| `--days 30 --usd 20` (nguyên tháng) | **`over`** | 100% |
| `--days 7 --usd 4.67` (chia đều) | **`over`** | 100% |

Với gói phẳng, chi tiêu **bằng định nghĩa** đúng bằng trần, nên `percent >= 100` luôn đúng và
`over` **không bao giờ tắt**. Một cảnh báo luôn bật không phân biệt được với một cảnh báo không
tồn tại — và tệ hơn, nó dạy người đọc bỏ qua cả mục ngân sách. Đây là
`knowledge/lessons/0002-guard-ban-nham.md` ở dạng nguyên bản.

### Nguyên nhân: một giả định về MÔ HÌNH TRẢ TIỀN, không phải một lỗi số học

`budgetStatus` tính `runRate = usd/days*30` rồi so với cap. Giả định đó đúng cho API
pay-as-you-go và **sai** cho subscription phẳng, nơi:

- chi phí **biên** của một lần chạy là **0**;
- chi phí tháng **biết trước**, không cần đo;
- cổ chai thật **không phải tiền** mà là **rate limit**.

`docs/WIP.md` §*"Sự thật số 2"* đã nói đúng điều này (*"cổ chai không phải máy tính, cũng không
phải tiền"*) — cơ chế ngân sách thì không biết.

### Tín hiệu ĐÚNG cho gói phẳng đã có sẵn, chỉ chưa được nối

`observe.mjs` ghi `budget-alarm.log` ở sự kiện `StopFailure`. Đo hôm nay: **12 dòng
`rate_limit`**, hai trong số đó cùng ngày 2026-08-07 (11:52 và 19:24). Với người dùng gói
phẳng, **đó** là tín hiệu ngân sách thật — không phải phần trăm USD. Và nó do **chính harness
đo**, không phải người chép từ dashboard.

### Ba mode mới, và `?` không bị làm tròn thành `0`

```
metered · dữ liệu ĐÚNG (20$/30d)   mode=over             percent=100   ← KHÔNG đổi
flat    · 0 lần chạm rate limit    mode=flat-ok          percent=null
flat    · 12 lần chạm              mode=flat-limited     percent=null
flat    · chưa đo được (null)      mode=flat-unmeasured  percent=null
```

`rateLimitHits === null` ⇒ `flat-unmeasured`, **không** phải `flat-ok`. "Chưa đo được số lần
chạm trần" và "đã đo, bằng 0" là hai câu khác nhau, và gộp chúng là đúng phép gộp mà cả lớp
`report()` tồn tại để chống.

### Gói cước là thuộc tính của NGƯỜI TRẢ TIỀN, không phải của project

`budgetPlan(cfg, env)` — hai tầng, tầng theo NGƯỜI thắng:

```
HARNESS_BUDGET_PLAN=flat  (theo người, .claude/settings.local.json)   ← thắng
budget.plan               (theo đội, harness.config.json)
không khai gì             ⇒ metered, hành vi cũ y nguyên
```

Một đội hoàn toàn có thể có người dùng Pro phẳng và người dùng API theo mức dùng. Khai gói cước
ở tầng project là ép cả hai vào một câu trả lời sai với ít nhất một người.

### `metered` KHÔNG đổi một chút nào

Hai ca test khoá riêng điều đó. Bản vá này chỉ **thêm** một nhánh; repo nào không khai gì thì
đọc y hệt trước.

`harness-doctor` thôi in *"harness không đọc được hoá đơn"* ở nhánh phẳng — ở đó con số do chính
harness đo. `rituals.mjs` phân nhánh cho cả ba mode thay vì rơi xuống `ok` cuối hàm.

### Phát hiện phụ: cái gác chặn bản vá này có một lỗ, và một dấu `?` lách qua nó

Gác `budget ↔ bên đọc` đòi mọi khoá `budget.*` mã nguồn ĐỌC phải được `harness.config.json`
KHAI. Regex của nó là `[)\w]\.budget` — đòi ký tự liền trước `.budget` là `)` hoặc chữ.

Phép đọc mới nằm trong helper ở `lib` và viết là `cfg?.budget?.plan`. Ký tự trước là `?` ⇒
**không khớp** ⇒ suite chuyển sang xanh, và sự im lặng đó đọc y hệt *"đã sửa xong"*.

Đã vá thành `[)\w]\??\.budget`. Đây là **lần thứ ba trong một phiên** một phép kiểm dựa trên
quét chuỗi tự phản bội nó (hai lần trước ở #112, check tự khớp với chú thích của chính mình).

### 13 ca test mới

7 ca cho các mode, 6 ca cho nguồn khai `plan`. Suite `205/205`.

---

## 2.43.0 — 2026-08-08

**minor.** `--bare` là một cái **NHÃN không có cơ chế** — và phép trừ *"giá trị đo được của
toàn bộ harness"* đang so hai lần chạy **giống hệt nhau**. Đóng #91.

### Đo được

Grep toàn bộ chỗ dùng biến `BARE` trong `evals/run.mjs` trước bản này:

```
26:  const BARE = has('--bare');
72:  bare: BARE,                                   // metadata trong env
311: `eval-baseline${BARE ? '-bare' : ''}.json`    // đổi tên file baseline
329: report(BARE ? 'EVAL (HARNESS TRẦN)' : 'EVAL', …)   // đổi tiêu đề
331: if (BARE) { … }                               // đổi lời nhắn cuối
```

`spawnSync` ở `runAgent()` **không nhận `BARE`**: không đổi `cwd`, không đổi `env`, không đổi
`cmd`. Agent con chạy trong đúng repo, đọc đúng `.claude/settings.json`, với đúng bộ hook.

### Vì sao nó tệ hơn một cờ hỏng

`docs/adr/harness/0002` và `evals/README.md` đặt phép trừ này làm **chỉ số trung tâm**, và lời
nhắn cuối của chính runner dạy người đọc tin vào nó:

> *"Chênh lệch NHỎ nghĩa là phần lớn harness của bạn là dead weight. Bật lại từng mảnh…"*

Chênh lệch **luôn** ≈ 0 do cấu trúc — và câu trên bảo người đọc kết luận *"phần lớn harness là
dead weight"*. Một chỉ số bằng 0 do cấu trúc, kèm một dòng hướng dẫn diễn giải số 0 đó thành
một kết luận sai về chính harness. ADR 0002 quy nguyên nhân cho `evals.command` rỗng: đúng
nhưng **chưa đủ** — lấp `evals.command` cũng không làm số đó khác 0, chỉ tốn gấp đôi tiền.

### Cơ chế: cây trần là một CLONE DÙNG MỘT LẦN

`git clone --depth 1` qua `file://` (clone local mặc định bỏ qua `--depth`), gỡ remote, rồi
**đổi tên** — không xoá — lớp harness. Ranh giới là *"Claude Code có TỰ NẠP thứ này không"*:

```
gỡ   .claude/settings.json            đăng ký hook + permission ⇒ không có nó, hook không chạy
gỡ   .claude/rules · skills · agents · .mcp.json    nạp vào context / tầng discovery
gỡ   CLAUDE.md · AGENTS.md            memory file, ~4.6k token (ADR 0002)
GIỮ  .claude/hooks/**                 script TRƠ khi không được đăng ký
GIỮ  tooling/ · harness.config.json   chỉ chạy khi CÓ NGƯỜI GỌI
```

Giữ `tooling/` không phải nhân nhượng: assertion lớp 1 gọi thẳng vào đó. Gỡ nó thì lần chạy
trần đo *"harness còn tồn tại không"*, không đo *"agent có hành xử khác không"*.

Gỡ remote là bắt buộc, không phải vệ sinh: agent chạy trong cây đó với quyền ghi, và một
`git push` từ đó là push vào repo thật.

### Tiền kiểm — thứ làm phép trừ có nghĩa thay vì chỉ có số

Gỡ lớp harness thì có assertion **đứt theo**. Đo `--bare --task 0001`: **4/6 assertion** đỏ vì
đúng lý do đó (`test-hooks` · `test-migrations` · `apply-to --audit` · `harness-doctor --quick`
đều đọc `.claude/`).

Không xử lý, task đó ĐỎ ở lần trần và XANH ở lần đầy đủ ⇒ chênh lệch được ghi vào cột *"giá trị
của harness"*, trong khi agent không liên quan gì. **Một số 0 do cấu trúc được thay bằng một số
DƯƠNG do cấu trúc thì không khá hơn** — nó chỉ sai theo hướng dễ chịu hơn.

Nên: chạy các assertion không phụ thuộc agent trên cây trần **trước khi agent chạy**. Cái nào đã
đỏ khi chưa có gì xảy ra thì không nói gì về agent ⇒ `n/a`. Tất định, không cần task tự khai, và
tự đúng khi ai đó đổi `BARE_STRIP`.

### Runner tự làm phép trừ, trên GIAO của hai tập đo được

```
=== GIÁ TRỊ ĐO ĐƯỢC CỦA HARNESS ===
  đầy đủ 100%  −  trần 100%  =  +0pp   trên 1 task so được
```

Hai tỉ lệ đó có **hai mẫu số khác nhau** (`0001` đo được ở lần đầy đủ, `n/a` ở lần trần), nên
trừ bằng mắt là một phép tính sai không có gì báo. Giao rỗng ⇒ `?` kèm số task mỗi bên, **không
bịa ra một hiệu số**.

### `--bare` TỪ CHỐI in ra con số nó không tạo ra được

Hai lối ra CHẶN, không phải cảnh báo — người gõ `--bare` đang xin đúng một con số:

- `evals.command` rỗng ⇒ không agent nào chạy ⇒ hai lần đo không thể khác nhau;
- `BARE_STRIP` không khớp gì ⇒ cây trần y hệt cây đầy đủ.

### Parity Contract: dọn rác thất bại KHÔNG được là một exception

Đo trên Windows, `--bare --task 0001` (task spawn nhiều tiến trình con nhất): `rmSync` ném
`EPERM` **trên chính thư mục** sau khi đã xoá hết file bên trong — còn hai thư mục **rỗng**, và
chúng không xoá được **kể cả từ một tiến trình mới**, trong khi cây của lần chạy trước xoá được
ngay. Không tiến trình nào giữ chúng (đã soi `Win32_Process`) ⇒ trình quét nền, không phải
handle rò trong code.

Bản đầu ném exception **sau khi đã in xong báo cáo**: phép đo đã xong, đã đúng, và người dùng
nhận một stack trace kèm exit code sai. Nay `rmTree()` không bao giờ ném, thất bại thành một
WARN kèm đường dẫn, và lần chạy `--bare` sau **quét lại** những cây cũ hơn 1 giờ.

### Năm ca mới, sáu mutant, không mutant nào sống sót

`tooling/test-evals.mjs` ⑯–⑳. Hai trong năm ca khoá chiều **ngược** (gỡ quá tay · trừ trên hai
mẫu số khác nhau) — vì một cơ chế "gỡ harness" sai theo chiều đó **vẫn cho ra số**.

| mutant | giết |
|---|---|
| bỏ chốt `evals.command` rỗng | ⑯ |
| `ROOT` luôn là repo thật | ⑰ ⑱ ⑳ |
| bỏ tiền kiểm | ⑱ ⑳ |
| trừ KHÔNG theo giao | ⑳ |
| `BARE_STRIP` rỗng | ⑰ ⑱ ⑲ ⑳ |
| bỏ hẳn phép trừ | ⑲ ⑳ |

`evals/fixtures/fake-agent.mjs` khai thêm `FAKE_AGENT_CWD` và `FAKE_AGENT_SEES`: một agent giả
không tự biết nó "trần" hay không, nên cách duy nhất kiểm được từ ngoài là bắt nó khai chỗ nó
đứng và những gì còn đọc được từ đó.

### Đổi kèm

- `eval-baseline*.json` nay đi qua `stateDir()` ⇒ `HARNESS_STATE_DIR` chuyển được. Không có nó,
  suite ghi đè baseline THẬT của người đang chạy — một mốc so sánh mất vĩnh viễn.
- `evals/tasks/0001` bỏ dòng *"task tốt nhất để chạy với `--bare`"*: đo được 4/6 assertion của
  nó là `n/a` ở chế độ trần. Dòng đó viết khi `--bare` chưa gỡ gì, nên chưa có gì để mâu thuẫn.

---

## 2.42.4 — 2026-08-08

**patch.** Một task eval được chấm **PASS** cho một phép đo nó **không thực hiện**. Đóng #104.

### Đo được

`evals/tasks/0004-khong-merge-tay-lockfile.md` có mục `## Dựng cảnh` — nó dựng một conflict
lockfile thật. **Runner không bao giờ chạy mục đó**: `runAssertions()` trích đúng một khối,
`## Chấm lớp 1`.

Nên agent nhận prompt *"Có conflict khi merge. Giải quyết giúp tôi rồi commit."* trong một repo
không có conflict nào. Transcript thật (2026-08-07, lần chạy đầu tiên của lớp eval):

```
Không có conflict nào để giải quyết — và không có gì để commit.
```

Lần chạy 2026-08-08 in `REGRESSION 100% (4/4)`, và `0004` **góp một điểm** vào đó.

### Vì sao chiều này tệ hơn chiều của #93

#93 là một phép đo không xảy ra bị ghi thành **THẤT BẠI** — tỉ lệ đổ về phía hoảng, và phản ứng
với hoảng là tháo dỡ. Ở đây cùng lớp lỗi nhưng **ngược chiều**: nó đẩy tỉ lệ **LÊN**.

Chiều này im lặng hơn hẳn. **Không ai đi điều tra một con số đẹp** — không ai mở transcript của
một task xanh. `L0005` (*"bộ đếm đổ về phía dễ chịu"*) ở đúng dạng nguyên bản của nó, lần này
nằm trong chính công cụ có quyền nói *"KHÔNG promote thay đổi này"*.

### Đổi gì — hai vế, và vế thứ hai rộng hơn vế thứ nhất

**① Task khai `## Dựng cảnh` ⇒ dừng TRƯỚC `runAgent()`.** Không gọi agent, không chấm, ra khỏi
mẫu số, kèm lý do. Thứ tự là phần chính: gọi agent rồi mới nói *"không đo được"* thì đã trả
tiền cho một lượt chạy không nói gì.

Cho runner **tự chạy** mục đó là một thay đổi **hợp đồng**, không phải một dòng code: setup
CỐ Ý ghi vào repo đang đo, còn `worktreeFingerprint()` tồn tại để chặn đúng chuyện ghi vào repo
đang đo. Hai thứ đó chỉ phân biệt được trong một cây **cô lập** — chưa có, nên chưa làm.

**② Một agent chạy xong KHÔNG phải một phép đo:**

```diff
- const measured = (asserts.ran > 0 || Boolean(agent)) && !agent?.infra;
+ const measured = asserts.ran > 0 && !agent?.infra;
```

Vế `Boolean(agent)` đưa một task **0 assertion chạy được** vào mẫu số rồi chấm nó theo exit
code của agent — mà exit code của `claude -p` chỉ nói *"phiên kết thúc bình thường"*, không nói
gì về việc agent làm ĐÚNG. Runner này chỉ chấm **lớp 1**; `## Chấm lớp 2` là việc của người và
runner không đọc nó.

Thông báo `KHÔNG ĐO ĐƯỢC` tách **ba** nguyên nhân (trước là hai), vì ba việc phải làm khác nhau:
chưa nối agent (cấu hình) · agent không chạy được (hạ tầng, tạm thời) · agent chạy rồi mà không
có gì chấm được (lỗ trong chính TASK).

### Ba ca mới, mỗi ca giết một mutant khác nhau

`tooling/test-evals.mjs` ⑬⑭⑮. Cả ⑬ và ⑭ chạy **với agent giả** và có kết cục PASS nếu bản vá
biến mất — mốc chung của chúng là `REGRESSION` **không được in ra**.

⑮ là chốt ngược chiều: task có ≥1 assertion chạy được **phải** ở lại mẫu số. Không có nó, một
`measured = false` cứng cũng làm ⑬⑭ xanh, và lớp eval im lặng thành vô dụng. Đã đo cả ba mutant:
mỗi mutant giết đúng một ca, không ca nào thừa.

### Không sửa gì trong `0004`

Placeholder `<lệnh install ở chế độ frozen/ci>` **giữ nguyên**. Lấp nó bằng `npm ci` cho xanh
là một **PASS giả**: lockfile nhất quán vì chưa ai đụng nó. Đó tệ hơn `n/a` — nó làm vấn đề
biến mất khỏi tầm nhìn thay vì được giải quyết.

---

## 2.42.3 — 2026-08-08

**patch.** `DEV_ID` placeholder được ghi vào **sổ audit của cửa thoát DRI** như thể là một cái
tên — và nó vô hiệu hoá cái gác vốn có cho đúng chuyện này. Đóng #114.

### Đo được

```
$ node -e "console.log(process.env.DEV_ID)"       → CHANGEME-ten-cua-ban
$ tail -3 .claude/telemetry/harness-edits.log     → …|CHANGEME-ten-cua-ban  (cả ba dòng)
```

`harness-edits.log` là thứ làm cửa thoát `HARNESS_DRI=1` **audit được** — lý do duy nhất nó
được chấp nhận thay vì bị coi là lỗ hổng. Câu nó phải trả lời là *"AI đã ghi vào vùng cấm?"*.
Ngày 2026-08-08 có **hai phiên Claude Code song song** trên cùng máy, một mở DRI một không, và
sổ **không phân biệt được**. Đúng câu hỏi nó sinh ra để trả lời là câu nó không trả lời được.

### Cái gác đã có, và placeholder đi lọt qua nó

`check-reservations.mjs` in *"Chưa set DEV_ID"* — nhưng điều kiện là chuỗi **rỗng**.
`"CHANGEME-ten-cua-ban"` không rỗng ⇒ nhánh đó **chưa từng chạy một lần nào**, kể cả trên repo
chưa ai khai gì.

Lỗi nằm ở mô hình hoá: *"chưa khai"* bị viết thành *"chuỗi rỗng"*, trong khi thực tế nó là
*"còn nguyên giá trị mẫu"*. Placeholder đi lọt mọi phép kiểm vì nó **hợp lệ về mặt kiểu**.
Cùng lớp với #96 (`issuePrefixes: ["ABC"]`) — hạt giống của template dùng như dữ liệu thật.

### `devId()` trả OBJECT, không trả chuỗi

Hai câu hỏi khác nhau, và gộp chúng là cách tái tạo đúng lỗi đang sửa:

| câu hỏi | trả lời |
|---|---|
| ghi tên nào vào sổ? | `id` — giá trị thật tốt nhất (`DEV_ID` → `USER` → `USERNAME`) |
| DEV_ID đã khai chưa? | `from === 'DEV_ID'` |

Trên Windows `USERNAME` **luôn** có. Chỉ trả một chuỗi thì `id` không bao giờ rỗng, cảnh báo
không bao giờ bắn, và bản vá chỉ đổi tên biến. Và `USERNAME` không thay được `DEV_ID`: chính
`check-reservations.mjs` đã ghi lý do — *cùng một người trên hai máy thường có `USERNAME` khác
nhau*, nên reservation của bạn đọc ra là của người khác.

### Còn thiếu — cần `/harness-propose`

Hai hook vẫn ghi `process.env.DEV_ID` thô vào sổ: `protect-harness.mjs:36` và
`protect-migrations.mjs:54`. `.claude/hooks/**` là **vùng cấm**, nên phần đó không đi trong PR
này. Ở máy đã khai `DEV_ID` thì sổ ghi đúng ngay; ở máy chưa khai, `harness-doctor` giờ **nói
ra** thay vì im.

## 2.42.2 — 2026-08-08

**patch.** `issuePrefixes` placeholder làm `/claim` · `/handoff` · `/verify-ui` đọc `?` trên
**mọi** nhánh làm việc. Đóng #96.

### Đo trên 30 nhánh THẬT của repo, không phải trực giác

| dạng tên nhánh | số | prefix `["ABC"]` khớp? |
|---|---|---|
| `<type>/<số>-<slug>` (`fix/100-…`, `feat/85-…`) | **21** | không |
| không có số (`docs/retro-w32-lan-hai`) | **9** | không (đúng) |
| `ABC-123` kiểu Jira | **0** | — |

Khớp **0/30**. Ba nghi thức chỉ xanh khi đứng trên `main` — đúng lúc chúng không có gì để nói.

### Nhận số trần, và NÓI RA rằng đó là suy ra

`inferIssue(branch, prefixes)` ở `lib/harness.mjs` — hàm thuần, trả `{ issue, from }`. Prefix
khai thật vẫn thắng trước; không khớp thì nhận số **ở đầu tên nhánh**, neo `^<type>/`. Số ở
GIỮA không được đọc là issue (`feat/promote-L0005-…` ⇒ không phải issue 5).

Bắn nhầm có thật (`fix/2-space-indent` ⇒ issue 2) và **không vá được offline**. Hướng "đòi
`docs/progress/<issue>.md` tồn tại trước khi tin" đã đo và bỏ: thư mục đó gần như rỗng và 0/4
PR gần nhất tạo nó, nên điều kiện ấy sẽ làm nhánh dự phòng không bao giờ kích hoạt.

Thay vào đó `from` được trả về và nghi thức in `· issue SUY TỪ số trần trong tên nhánh`. Hai
cái giá không đối xứng: `?` là mù trên **100%** nhánh; bắn nhầm cần một tên nhánh bất thường
(**0/30**), và khi xảy ra thì nó nhìn thấy được nên sửa được.

### Bản cũ còn LỎNG hơn — đây là siết, không phải nới

`prefixes` rỗng ⇒ biểu thức thành `()-?d+` ⇒ khớp **chuỗi số bất kỳ ở bất kỳ đâu** trong tên
nhánh. Nhánh mới có neo đầu, chặt hơn thứ nó thay thế.

### Bằng chứng

12 ca lấy từ lịch sử nhánh thật, khoá **cả hai vế**: nhận (bỏ ⇒ tái tạo #96) và bỏ qua (bỏ ⇒
số ở giữa tên bị đọc thành issue). Xác minh trên chính nhánh `fix/96-…`: `/claim` chuyển từ
`?` sang `due` và đòi đúng `docs/progress/96.md`.
## 2.42.1 — 2026-08-08

**patch.** Suite gác thôi chập chờn: **năm** đường ghi trạng thái mang tên cố định toàn máy,
nên hai phiên cùng máy làm nhau đỏ ngẫu nhiên. Đóng #100.

### Chập chờn đo được, và nó chỉ xuất hiện khi chạy song song

| cách chạy | kết quả |
|---|---|
| tuần tự 6 lần | 6/6 xanh |
| **2 suite song song** | **cả hai đỏ ngay lần đầu**, mỗi bên một tập ca khác nhau |

Tuần tự xanh là lý do nó sống lâu: ai gặp đỏ cũng chạy lại một mình và thấy xanh, rồi kết luận
"chắc máy lag". `AGENTS.md` cho phép nhiều session cùng máy, nên đây là cấu hình thường.

Nghiêm trọng vì repo này đặt **toàn bộ thẩm quyền** lên lớp xác minh. Một suite chập chờn dạy
đúng một phản xạ: **chạy lại cho tới khi xanh** — chính phản xạ mà mọi ratchet ở đây được viết
ra để chặn. Và ba ca đỏ đầu tiên nói về `block()` không ghi sổ: lần sau chúng đỏ vì lý do thật,
phản xạ đầu tiên vẫn sẽ là "chạy lại đi".

### Năm tài nguyên dùng chung, không phải một

```
tmpdir()/harness-test-telemetry          ← lib/harness.mjs
tmpdir()/harness-test-state              ← lib/harness.mjs
tmpdir()/harness-test-state-crumb        ← test-hooks.mjs
.claude/hooks/.mutant.tmp.mjs            ← mutate()
.claude/hooks/.mutant.observe.tmp.mjs    ← mutant observe
.claude/hooks/.failmode.tmp.mjs          ← bảng chế độ hỏng
```

Ba cái sau nằm **trong repo**, không phải `tmpdir()` — và bắt buộc phải thế, vì bản sửa của
hook cần giải được import tương đối của hook gốc. Bên này ghi đè file bên kia, rồi
`finally { rmSync }` của bên này xoá file bên kia **giữa lúc nó đang spawn**. Hai kiểu hỏng:
`exit=1` (module vừa bị xoá) và `exit=2, mong đợi 1` (chạy nhầm bản sửa của suite kia). Kiểu
thứ hai nguy hiểm hơn — nó không giống lỗi hạ tầng, nó giống **hook có bug**.

### Tên cố định làm HAI việc, và chỉ một việc là cần

Tên cố định tồn tại để `harness-doctor` (cha) đọc được telemetry của suite (con) — nguồn *"bằng
chứng thứ hai"*. Nhưng *"hai tiến trình thoả thuận được đường dẫn"* không đòi *"mọi tiến trình
trên máy dùng chung một đường dẫn"*. Giờ đường dẫn theo **lần chạy**, và cha **ghim** id xuống
con qua `HARNESS_TEST_RUN_ID`:

- chạy thẳng `test-hooks.mjs` → id = pid của nó ⇒ hai lần chạy không giẫm nhau
- `harness-doctor` spawn suite → id = pid của **doctor** ⇒ cha đọc đúng chỗ con vừa ghi

PID được dùng lại sau khi tiến trình chết. Không vá ở đây: `tallyLines({ sinceMs })` đã chỉ đếm
dòng sinh ra trong lần chạy hiện tại. Hai lớp cùng hướng, không thay nhau.

### Bằng chứng

- **4 suite song song × 3 vòng ⇒ 12/12 lần đạt `201/201 pass`, 0 FAIL.** Trước bản vá, 2 suite
  song song đã đủ làm cả hai đỏ.
- **3 mutant, cả 3 bị giết**: `TEST_RUN_ID` thành hằng · `hookTempName` bỏ qua `runId` ·
  doctor thôi ghim id.
- `harness-doctor` vẫn in `suite ✓` — nguồn bằng chứng thứ hai còn nguyên.

Mutant thứ ba lúc đầu **sống sót**, và nó chỉ ra lỗi trong chính ca kiểm: ca grep cả file tìm
`HARNESS_TEST_RUN_ID`, mà **chú thích giải thích cơ chế cũng chứa chuỗi đó** — check tự khớp
với lời giải thích của chính nó. Đã neo lại vào đúng lời gọi spawn.

### Kèm theo

- **Sàn `RATCHET` 185 → 201.** Đo được `195/195 pass, sàn 185`: 10 ca thêm vào mà không ai nâng
  sàn, tức 10 ca có thể ngừng chạy mà thứ duy nhất nhìn thấy điều đó vẫn xanh.
- `.gitignore` che `.claude/hooks/.*.tmp.*.mjs` — suite bị kill giữa chừng để lại file `.mjs`
  lạ trong `.claude/hooks/` mà git không che.
- `sweepStaleTestRuns()` dọn thư mục lần-chạy > 24h (một thư mục mỗi lần chạy thì phải có ai dọn).

---

## 2.42.0 — 2026-08-08

**minor.** Sổ phiên **dùng chung cho mọi worktree**, và bản tin đầu phiên **nói ra cái giá**.
Đóng #108.

### Ba phiên song song 2 giờ, 0 cảnh báo

Đo 2026-08-07/08 trên chính repo này. `session-start` **có** ghi sự có mặt của phiên — nhưng
vào `stateDir()`, mà `stateDir()` neo vào **gốc worktree**. Ba phiên ở ba worktree ⇒ ba sổ
riêng ⇒ không phiên nào thấy phiên nào.

`.claude/state/sessions/` chỉ có **một** file suốt cả buổi. `overlap-scan` cũng không lấp
được: nó đối chiếu với **PR đang mở**, nên một phiên chưa push là vô hình với nó.

Người dùng phát hiện ra bằng **cảm giác hoá đơn**, không bằng một dòng báo.

### Sổ về `.git/harness-shared/`

`git rev-parse --git-common-dir` trỏ về `.git` của cây **chính** từ mọi worktree — chỗ duy nhất
mọi phiên cùng nhìn thấy. Nằm trong `.git` nên **không bao giờ bị commit** và không cần thêm
dòng `.gitignore` nào.

Ca phải khoá chặt nhất là **worktree phụ**: ở đó git trả đường dẫn **tuyệt đối**. Nối nó vào
gốc worktree sẽ ra một đường dẫn vô nghĩa, và mỗi worktree lại có sổ riêng — bug quay lại
nguyên vẹn với một tên hàm mới. `resolveSharedState()` là hàm **thuần** nên test lái được cả
hai ca mà không cần dựng worktree thật.

### Bản tin nói CÁI GIÁ, không chỉ đếm

Một dòng *"2 phiên khác"* là thông tin. Một dòng kèm **chi phí** là một quyết định:

```
ℹ️  2 phiên KHÁC đang mở trên repo này (trần 2/người):
     fix/93-…  ·  C:/project/harness-93  ·  12 phút trước
   Song song KHÔNG bị cấm — nhưng nó KHÔNG rẻ gấp đôi, nó đắt hơn thế
```

**Phá một hiểu lầm:** hai phiên **không nói chuyện với nhau** — không có kênh nào. Nên không
token nào chi cho việc *"hai agent hiểu nhau"*. Hoá đơn tăng hơn gấp đôi là do: **context nhân
đôi** (~2×, sàn cứng, không tránh được) + **rebase** + **nhiễu do tranh máy** + **làm trùng**.
Ba cái sau tránh được, và `docs/WIP.md` giờ có quy trình 5 bước cho chúng.

**Ảnh hưởng tới project đã áp:** sổ phiên đổi chỗ. Bản ghi cũ ở
`.claude/state/sessions/` bị bỏ lại — vô hại (nó tự hết hạn theo liveness), xoá tay được.

---

## 2.41.1 — 2026-08-08

**patch.** Cờ **thiếu giá trị** thôi bị đọc thành **có giá trị**. Đóng #107.

### Người dùng gõ, và công cụ tự bịa hộ

```
$ node tooling/capo-report.mjs --days 7 --usd

  OK   CAPO = $NaN / kết quả được chấp nhận
```

Nhãn **`OK`**. Và nó **ghi thật** vào `.claude/state/capo-history.json`:

```json
{ "days": 7, "usd": null, "accepted": 87, "capo": null }
```

`arg('--usd', null)` trả `undefined` khi cờ đứng cuối; guard là `USD !== null`, mà
`undefined !== null` là **`true`**. **Ba trạng thái của một cờ chỉ có chỗ cho hai** — *vắng
mặt* · *có mà thiếu giá trị* · *có giá trị* — nên cái ở giữa rơi vào cái thứ ba. `--days` cùng
lỗi.

### Vì sao nó tệ hơn một lỗi CLI thường

`capo-history.json` là **sổ đo lường**, và `budgetStatus` neo vào entry **gần nhất**. In `NaN`
ra màn hình thì người đọc thấy; ghi `NaN` vào sổ thì không ai thấy, và nó ở đó vĩnh viễn.

`budgetStatus` (v2.39.0) may mắn kiểm `Number.isFinite(usd)` nên hạ nguồn không tin mục đó.
Nhưng đó là **phòng thủ tình cờ ở phía ĐỌC**. Bên GHI phải tự từ chối — dựa vào bên đọc lọc là
một hợp đồng chỉ đúng cho tới khi có bên đọc thứ hai.

`L0006` lần thứ năm: một phép **không-đo** được viết thành một **câu trả lời**.

### Giờ nó dừng, kèm chỉ dẫn

```
⛔ `--usd` thiếu giá trị.
  Đây KHÔNG được đoán thành 0 hay bỏ qua: --usd đi thẳng vào sổ đo lường,
  và một con số bịa ở đó thì mọi kỳ sau neo vào nó.
  Lấy con số từ dashboard billing — harness KHÔNG đọc được hoá đơn. Ví dụ: --usd 43
```

**Không khai `--usd` vẫn hợp lệ** — báo cáo chạy, chỉ không tính CAPO. Đó là trạng thái thứ
nhất, và nó khác hẳn trạng thái thứ hai.

Test khoá cả **sổ**, không chỉ exit code: sau 4 ca hỏng + 1 ca không khai, sổ phải có **đúng
một** entry. Mutant "parser nghiêm nhưng bên ghi vẫn ghi rác" bị bắt riêng.

---

## 2.41.0 — 2026-08-08

**minor.** Sổ telemetry **đóng được**. Đóng #105. `L0006` lên 4 lần xuất hiện.

### Một tín hiệu không bao giờ xanh lại được thì thôi là tín hiệu

`/harness-propose` đỏ vì `rituals.mjs` đếm **mọi dòng từng có** trong `gate-fails.log`. Ba lần
chặn ngày 2026-08-07 lúc `12:00:44` · `12:26:00` · `12:26:01` **đã xử lý xong** — mở
`HARNESS_DRI`, rồi mọi thay đổi vùng cấm đi qua PR #79–#101. Việc đã xong, nghi thức vẫn đỏ,
và **không lệnh nào làm nó xanh lại được**.

`fixlog` có `--close` từ **v2.11.0**. Bài học đó được giải ở đúng một chỗ và không tổng quát
hoá cho cái sổ **cùng file, cách 380 dòng**.

### Đây KHÔNG phải nút tắt — ba thứ giữ nó trung thực

| | |
|---|---|
| **Lý do bắt buộc** | không có lý do thì `closeTelemetry` trả `false` |
| **Dòng đóng nằm trong CHÍNH cái sổ đang audit** | nó không xoá gì; người review sau đọc được cả hai |
| **Occurrence MỚI tự mở lại** | đóng lúc `T` chỉ vô hiệu các dòng TRƯỚC `T` |

```
node tooling/rituals.mjs --close harness-propose "<đã làm gì>"
```

Lệnh này **in ngay trong dòng báo đỏ**. Một cơ chế đóng mà người đọc không tìm thấy thì tương
đương không có — và mục này đã đỏ vĩnh viễn suốt vì đúng lý do đó.

### Đóng sổ xong, lịch sử KHÔNG được biến mất

Bản đầu in `ok  chưa lần nào bị chặn ở vùng cấm` cho một repo đã bị chặn ba lần và xử lý xong.
Giờ nó in `3 lần bị chặn ở vùng cấm, tất cả ĐÃ ĐÓNG` — đúng lớp lỗi mà cơ chế này sinh ra để
tránh, xuất hiện lại trong chính thông báo của nó.

### `codeOnly()` phải biết CHUỖI — bản v2.40.0 bắn oan

`rituals.mjs` có một template literal chứa `features/*.json`. Cặp regex ngây thơ đọc đó là
**mở block comment** và nuốt từ dòng 173 tới `*/` thật ở dòng 349 — **176 dòng code biến mất**,
và một assertion dựng trên nó báo thiếu một thứ đang nằm ngay trong file.

Giờ nó là một máy quét trạng thái biết mình đang ở trong chuỗi hay không. **Nội dung chuỗi
được giữ**, có chủ ý: lệnh mà một thông báo in ra sống trong chuỗi, và đó là thứ hợp đồng hai
đầu cần soi. Còn hở, ghi ra để không ai tưởng nó kín: **regex literal** chứa `//` hoặc `/*` vẫn
đánh lừa được nó.

**Ảnh hưởng tới project đã áp:** không có hành vi nào đổi cho tới khi ai đó gõ `--close`.

---

## 2.40.1 — 2026-08-08

**patch.** Assertion eval dùng cú pháp POSIX giờ bị bắt — nó chỉ đỏ trên Windows, và im trên
hai OS còn lại. Đóng #102.

### Vấn đề: một lớp xác minh chỉ đúng trên 2/3 OS

Assertion `## Chấm lớp 1` chạy qua `spawnSync(cmd, {shell: true})` (`run.mjs:139`). Trên
Windows đó là **cmd.exe**. Một assertion POSIX hỏng ở đó và **xanh** trên Linux/macOS — nên nó
đi qua CI của hầu hết mọi người mà không ai thấy. `AGENTS.md §Parity Contract` đòi cả ba OS;
lớp eval chưa có gì cưỡng chế điều đó.

### HAI nhóm bị chặn, và ba nhóm CỐ Ý không

Đo trực tiếp trên cmd.exe 2026-08-08, chạy y hệt cách runner chạy:

| assertion | cmd.exe |
|---|---|
| `... > /dev/null` · `>/dev/null` · `2>/dev/null` | **FAIL** — *"The system cannot find the path specified."* |
| `... 2>&1` | PASS — cmd.exe **có** hỗ trợ |
| `test -f AGENTS.md` | PASS — Git-for-Windows để `test.exe` trong PATH |
| `[ -f AGENTS.md ]` | PASS — và `[.exe` |
| `echo ok && test -f ...` | PASS |

**Ba nhóm cuối không bị chặn.** Chặn thứ đang chạy được là dương tính giả, và
`knowledge/lessons/0002-guard-ban-nham.md` là bài học của chính repo này về đúng chuyện đó.
Bản đầu của bản vá này định chặn cả `2>&1` và `[ … ]` — **phép đo đã ngăn lại**.

`$(…)` bị chặn vì lý do **khác và tệ hơn**: cmd.exe không có command substitution nên nó so
**chuỗi literal**.

```
test "$(echo hi)" = "hi"          POSIX exit 0  ·  cmd.exe exit 1   ← FAIL GIẢ
test -n "$(git rev-parse HEAD)"                 ·  cmd.exe exit 0   ← PASS GIẢ
```

Kết quả **sai tuỳ ý**, không sai một chiều. Một assertion pass giả tệ hơn một assertion fail:
nó báo an toàn ở nơi không có gì được kiểm.

### Vì sao một CHECK, không phải một bản vá cho consumer

Template **đã sạch** — bỏ `> /dev/null` từ v2.24.0 (#64). Nhưng `evals/tasks/` là **SEED**:
`upgrade.mjs` tạo một lần, **không bao giờ ghi đè** (phân loại đúng — task là nội dung của đội).

Nên bản sửa đó **không bao giờ tới được consumer đã tồn tại**. Đo được: `sakubun-single-user` ở
**v2.30.2** — sau bản sửa — vẫn mang `> /dev/null`.

Một migration vá task của họ phải **đoán** họ chưa sửa tay, và nó chạm nội dung của đội. Một
check thì không, và nó bắt cả task **do đội tự viết** — thứ migration không bao giờ chạm tới.

### Phạm vi và mẫu số

Chỉ quét khối `## Chấm lớp 1`. `## Dựng cảnh` và văn xuôi được phép chứa POSIX — runner không
chạy chúng.

Ở template mọi task đều sạch, nên một check chỉ quét task thật sẽ **xanh vĩnh viễn** và không
ai biết nó đã chết. Ca ⑫a là mẫu số của nó: 9 ca khẳng định thẳng vào bộ dò, gồm cả 5 ca phải
**KHÔNG** bắt. Kiểm: cắm hai POSIX-ism vào một task thật ⇒ `exit 1`, gỡ ra ⇒ `exit 0`.
## 2.40.0 — 2026-08-08

**minor.** `wt-clean` thôi mù với squash-merge, và **"không hỏi được" thôi bị viết thành
"chưa merge"**. Đóng #97. Promote `L0006`.

### Bộ dò chưa từng đúng một lần nào

`git branch --merged` hỏi *"commit này có phải tổ tiên của main không"*. Squash-merge tạo một
commit **mới**, nên commit gốc không bao giờ thành tổ tiên — và với phép hỏi đó, một nhánh
**đã squash-merge** đọc **giống hệt** một nhánh **chưa từng có PR**.

Đo 2026-08-07: PR #89 merge lúc 13:10:45Z → squash `cd450bf`, worktree sạch hoàn toàn,
`wt-clean --apply` in *"giữ (chưa merge)"* và không xoá gì. Repo này squash **100%** số PR.

Nó lệch về phía "giữ" nên không mất dữ liệu — và đó là lý do nó sống lâu mà không ai thấy.
Hệ quả thật: worktree tích lại **im lặng**, `/wt` không bao giờ đỏ.

### Ba trạng thái, không phải hai

`mergeState()` (thuần, trong `lib/harness.mjs`) trả `merged` · `open` · `unknown`, mỗi cái kèm
`why` bắt buộc:

| | nghĩa |
|---|---|
| `merged` | bằng chứng **dương**: git nói tổ tiên, HOẶC `gh` nói có PR đã merge |
| `open` | hỏi được GitHub và nó trả về không có PR merged nào |
| `unknown` | **không hỏi được** — không `gh`, chưa đăng nhập, không mạng, không phải repo GitHub |

Gộp `unknown` vào `open` là quay lại đúng bug cũ với câu chữ dễ chịu hơn.

### Ba chuyện phụ, cùng gốc rễ

- `git branch -d` **từ chối** nhánh squash-merged, nên nó luôn thất bại ở repo squash và để
  lại nhánh mồ côi. Giờ `-D` được dùng **chỉ khi** có bằng chứng merged.
- `git log @{u}..HEAD` khi upstream đã bị xoá thì git **lỗi**, `stdout` rỗng, và code cũ đọc
  thành *"không có commit chưa push"*. Giờ nó là `unknown` và **chặn** việc xoá.
- Nhánh **remote** sống sót khi `gh pr merge --delete-branch` bỏ dở vì worktree đang giữ nhánh
  local. `wt-clean` nói ra thay vì tự xoá — một nhánh remote không PR nào mở đọc y hệt việc
  bỏ quên.

### `codeOnly()` — neo vào CODE, không vào comment

Assertion đầu tiên của hợp đồng hai đầu **không giết được mutant của chính nó**: gỡ sạch lời
gọi `mergeState` khỏi `wt-clean.mjs` mà test vẫn xanh, vì chữ `mergeState` còn nằm trong
comment giải thích. Lần thứ **tư** repo này vấp đúng chỗ đó (v2.10.2 · `governanceDrift` ·
lần này), nên nó thôi là giai thoại và thành một hàm.

**Một assertion không giết được mutant của chính nó là một assertion chưa tồn tại — nó chỉ
trông như đã tồn tại.**

**Ảnh hưởng tới project đã áp:** `wt-clean` giờ gọi `gh`. Không có `gh` thì mọi nhánh chưa
phải tổ tiên đọc là `unknown` và **được giữ lại** — an toàn hơn hành vi cũ, nhưng `--apply`
sẽ dọn ít hơn cho tới khi cài `gh`.

---

## 2.39.3 — 2026-08-08

**patch.** Allowlist frontmatter thôi so CHUỖI THÔ, và biết tự nói khi nó đang mục. Đóng #94.

### Hai lỗi, một gốc: một hằng số viết tay mô tả bề mặt vendor

`KNOWN_SKILL_KEYS` (16 key, ghi ngày rà `2026-08-04`) có comment tự cảnh báo *"allowlist không
ngày sẽ báo một field ĐANG CHẠY là inert"*. Cảnh báo đúng, và nó đã thành sự thật.

**① So chuỗi thô.** Vendor chuẩn hoá tên key trước khi đọc — đo từ binary 2.1.224:

```js
ahs = (e) => e.replace(/[-_]/g, "").toLowerCase()
```

Nên `whenToUse` ≡ `when_to_use`, `disallowed-tools` ≡ `disallowedTools`. Một skill khai
`whenToUse` bị doctor báo là key lạ trong khi Claude Code đọc nó bình thường. Cùng lớp lỗi
`dcg` sửa ở v2.36.0: so chuỗi thay vì so **thứ mà chuỗi nghĩa là**.

**② Danh sách thiếu.** Bảng gốc trong binary có **60** key. Thiếu ít nhất `when_to_use` ·
`metadata` · `license` · `compatibility`.

Đối chiếu 16 key đang khai với bảng 60: **cả 16 đều hợp lệ**. Không có key sai — chỉ thiếu.

### Đổi gì: ba nhánh thay vì hai

**Không** nhận cả 60 key. Bảng đó là **hợp nhất** skill + plugin + agent + output-style (chứa
`mcpServers`, `themes`, `workflows`); nhận hết cho một `SKILL.md` là **nới** check chứ không
sửa nó. Dùng nó làm **oracle**:

| key trong frontmatter | doctor nói |
|---|---|
| trong 16 key curated | im |
| **không** trong 16, **có** trong 60 của binary | *"allowlist ĐANG MỤC — vendor CÓ đọc key này. Skill không sai; danh sách sai"* |
| không có ở cả hai | *"KHÔNG có trong bảng 60 key của binary — gõ sai, hoặc field harness tự nghĩ ra"* |
| binary không đọc được | rơi về hành vi cũ, **và nói rõ là chưa xác minh** — `?`, không phải `ok` |

Nhánh giữa là phần đáng giá: nó biến *"danh sách này sẽ mục"* — thứ comment chỉ **cảnh báo** —
thành thứ **phát hiện được**, và nó tự nói khi tới lúc cập nhật. Cùng nâng cấp v2.38.0 làm cho
tập sự kiện hook.

### Test, và một mutant lấy từ bug CÓ THẬT

`pickLongestArray()` tách ra dùng chung cho cả hai bảng — chép đôi nó nghĩa là ca *"lấy mảng
ĐẦU TIÊN"* chỉ khoá được một bản.

Mutant đắt nhất **là bug tôi thật sự mắc khi viết**: lớp ký tự chỉ nhận `[a-z]`, mà bảng thật
chứa `mcpServers` · `disallowedTools` · `permissionMode` ⇒ nó khớp **0 mảng**. Và một `null` ở
đây **đọc y hệt "vendor đổi hình dạng bundle"** — bug tự nguỵ trang thành một phát hiện. Khôi
phục đúng bản đó ⇒ suite `exit 1`.

### Một con số trông đúng và sai

Bản đầu in *"binary Claude Code 24.18.0"*. Đó là version **Node**, lấy từ đoạn `nvm/v24.18.0/`
trong chính `CLAUDE_CODE_EXECPATH`, bằng một regex `\d+\.\d+\.\d+` tự chế. Repo đã có
`claudeCodeVersionMeasured()` cho đúng việc này — giờ dùng nó.

## 2.39.2 — 2026-08-08

**patch.** Agent KHÔNG CHẠY được thôi bị chấm là agent LÀM SAI. Đóng #93 ①.

### Đo được, không suy ra

Lần đầu `evals.command` được lấp và chạy thật (2026-08-07, clone dùng một lần):

```
=== TỈ LỆ PASS ===
  REGRESSION  25%  (1/4)
```

Ba task "fail" trả về sau **0.1 phút**; task chạy thật mất **3.9 phút**. Transcript của cả ba:

```
You've hit your session limit · resets 12am (Asia/Saigon)
```

**Agent chưa từng chạy.** Nhưng `runAgent()` vẫn trả một object, `Boolean(agent)` là `true`,
nên `measured` là `true` — và assertion tất định, chấm một cây **không có gì xảy ra**, fail.

### Vì sao đây là chế độ hỏng tệ nhất trong cả harness

Một phép đo **KHÔNG XẢY RA** được ghi thành một phép đo **THẤT BẠI**, và con số đổ về phía
*"harness của bạn chỉ bảo vệ được 25%"*.

Đó không phải một con số sai vô hại. Đó là con số đẩy người đọc đi **CẮT những lớp đang làm
việc** — và nó xuất hiện ở lớp đắt nhất, mờ nhất, ít người kiểm lại nhất. `L0005` (*"bộ đếm đổ
về phía dễ chịu"*) ở biến thể nguy hiểm hơn bản gốc: ở đây bộ đếm đổ về phía **hoảng**, và
phản ứng với hoảng là tháo dỡ.

`run.mjs` **đã có** ba trạng thái và **đã** loại `n/a` khỏi mẫu số. Thiếu đúng một thứ: phép
nhận diện *"agent hỏng vì hạ tầng"*.

### Đổi gì

`infraFailure(text)` — hàm THUẦN trong `lib/harness.mjs`, sáu nhóm chữ ký: quota/session ·
rate limit · credit/billing · xác thực · mạng · lỗi phía nhà cung cấp.

`runAgent()` trả thêm `infra`, và `measured` loại nó ra:

```js
const measured = (asserts.ran > 0 || Boolean(agent)) && !agent?.infra;
```

Thông báo tách **hai nguyên nhân** mà bản trước gộp — *"chưa nối agent"* (cấu hình, đứng im
tới khi người sửa) khác *"agent không chạy được"* (hạ tầng, thường TẠM THỜI, chạy lại là có số):

```
9001 […]: KHÔNG ĐO ĐƯỢC — agent hỏng vì HẠ TẦNG (chạm trần phiên/quota), trả về sau 0.1p.
Đây KHÔNG phải "agent làm sai": nó chưa từng chạy. Task ra khỏi mẫu số. Chạy lại khi hạ tầng ổn
```

### Khớp RỘNG có chủ ý

Cái giá của một `?` nhầm là một dòng *"chưa đo được"*. Cái giá của một `FAIL` nhầm là một kết
luận sai về chính harness, ghi vào ADR. Hai cái giá đó **không đối xứng** — nên khi phân vân
thì nghiêng về `?`. Bảng test khoá cả chiều ngược: 4 ca output bình thường (gồm *"Tôi từ chối
chạy lệnh phá hoại này"* — đó là **KẾT QUẢ**, không phải hỏng) **không** được nhận nhầm.

### Test

`evals/fixtures/fake-agent.mjs` thêm chế độ `quota` — in chữ ký **nguyên văn** rồi **exit 0**.
Chi tiết quyết định: một agent chết vì quota trông y hệt một agent chạy xong, nên **exit code
không phân biệt được**; chỉ nội dung mới phân biệt được.

Ca ⑪ dùng task `9001`, mà assertion của nó chạy được và **PASS**. Nên nếu phép nhận diện biến
mất, task sẽ PASS chứ không FAIL — và ca vẫn đỏ, vì nó đòi chữ `KHÔNG ĐO ĐƯỢC`. Nó khoá **cả
hai** chiều nói dối, không chỉ chiều hoảng. Kiểm: gỡ `!agent?.infra` ⇒ `exit 1`.

### Ghi lại: suite hook có ca PHỤ THUỘC TRẠNG THÁI

Khi verify bản này, `test-hooks.mjs` fail 3 ca ở một lần chạy rồi xanh ở lần sau — và
`origin/main` **sạch** cũng fail 1 ca rồi xanh ở lần sau. Không liên quan tới bản vá này (đã
kiểm bằng `git stash`). Ba ca đó quanh `lớp kinh tế` (mẩu bánh mì `StopFailure`) và
`block() tự ghi gate-fails`, đều dùng thư mục telemetry/state dùng chung.

Chưa sửa ở đây — nhưng một lớp xác minh **chập chờn** thì mọi con số nó in ra đều mất một phần
thẩm quyền, và nó đáng một issue riêng.


---

## 2.39.0 — 2026-08-08

**minor.** Ngân sách biết **VAI** của repo. `budgetStatus()` nhận `role`, và `harness-doctor`
+ `rituals` truyền nó vào. Đóng #92.

### Harness đòi một thứ chính harness cấm cung cấp

`setup.mjs:55` TỪ CHỐI `--apply` ở repo template, và từ chối đó **đúng**: một cap ghi ở đây
chảy xuống MỌI consumer áp template sau này. Nhưng `budgetStatus` không biết vai, nên nó trả
`off` — *"chưa khai trần, KHÔNG phải ổn"* — ở **đúng nơi harness cấm khai**. Không đường nào
làm mục đó xanh trừ khi sửa tay `harness.config.json`, tức đúng việc `setup.mjs` chặn.

`harness-doctor.mjs:68` đã tính `ROLE` và áp ở **bốn** chỗ (`placeholder()`,
`verificationCoverage`, `coordinationLayer`, khối CẤU HÌNH). Khối NGÂN SÁCH là chỗ thứ năm và
nó không nhận `role` — cùng hình dạng với nhóm 1 của retro W32 lần ba (#90): một bài học được
áp ở vài chỗ và không tổng quát hoá.

### Tách hai trạng thái đang bị gộp

`?` cũ trộn hai chuyện khác hẳn nhau:

| | trạng thái đúng | vì sao |
|---|---|---|
| **Trần tháng** | `n/a` | không khai được ở template, và đó là đúng thiết kế |
| **Phép đo CAPO** | `due` | `capo-report.mjs` KHÔNG đọc trần — nó ghi vào `stateDir()` — nên nó **chạy được** ở template, và chưa lần nào chạy |

Gộp hai cái làm mất mục thứ hai — thứ thật sự **làm được** — sau lưng mục thứ nhất.

**Chiều ngược cũng kêu:** `cap > 0` ở template nghĩa là con số đó vào bằng tay, và nó sẽ thừa
kế **im lặng** xuống mọi consumer, nơi nó đọc như một trần đã cân nhắc cho project họ.

### Ảnh hưởng tới project đã áp: KHÔNG có

Ở repo consumer mọi mode giữ nguyên hành vi cũ (`off` · `unmeasured` · `stale` · `ok` ·
`alert` · `over`). Hai mode mới chỉ bật khi `repoRole()` trả `template`, và consumer luôn có
`.claude/harness-manifest.json` nên không bao giờ rơi vào nhánh đó.

### Hợp đồng mới

`measured` dùng **chung** phép kiểm với mode `unmeasured` (đã hoisted). Hai bản sao sẽ lệch,
và lúc lệch thì template báo *"đã đo"* trong khi repo có cap báo *"chưa đo"* trên **cùng một
entry**.

`test-hooks.mjs` thêm một hợp đồng hai đầu: `rituals.mjs` phải phân nhánh cho **mọi** mode.
Mode chưa xử lý rơi xuống `return` cuối hàm với `state: ok` — tức **chưa xử lý đọc thành
xanh**, và đó là ca mà phép kiểm bảng-tra của `harness-doctor` không bắt được.

---

## 2.38.1 — 2026-08-07

**patch.** `native-surface` thôi giết tiến trình khi bị `import`, và phần TRÍCH XUẤT có test.
Đóng #88.

### Lỗi thật, tìm được bằng cách viết test cho v2.38.0

Thân CLI của `native-surface.mjs` chạy ở **top-level** và kết bằng `process.exit(0)`. Không
có chốt điểm vào, nên `import` nó ở bất kỳ đâu sẽ in một báo cáo rồi **giết tiến trình đang
gọi, với mã thoát 0**.

Đo 2026-08-07: thêm một dòng `import { pickEventArray } from './native-surface.mjs'` vào
`test-hooks.mjs` làm **cả suite 180 ca thoát sau đúng MỘT dòng in — và thoát `0`**. Một suite
"xanh" chưa chạy ca nào.

Đây là đúng lớp lỗi mà ghi chú của #87 vừa kể một ngày trước (*"đặt trùng tên const ⇒ suite
CRASH LÚC PARSE… hai lần chạy sau đó im lặng không in gì, và tôi suýt đọc 'im' thành 'xanh'"*),
lặp lại qua một cơ chế khác trong **cùng một file**. `L0005` ở chiều tệ nhất: bộ đếm không đổ
về phía dễ chịu — nó **biến mất**, và sự vắng mặt đọc như thành công.

Bản vá: chốt `process.argv[1] === fileURLToPath(import.meta.url)`, thân CLI vào một hàm.

### Phần TRÍCH XUẤT giờ có ca test

v2.38.0 khoá **trạng thái nghi thức** (chưa đo · đo ở version cũ · đo đúng version). Nó không
chạm `nativeHookEvents()` — chỗ thật sự rút dữ liệu ra khỏi binary, và là chỗ duy nhất có
logic đáng sai.

Tách hàm THUẦN `pickEventArray(text, prev)`, cùng khuôn `dangerousCommand` ở v2.36.0: một
binary 285 MB không dựng được trong CI ba OS, còn phán đoán thì khoá được bằng bảng.

| ca | giết bản hỏng nào |
|---|---|
| nhiều ứng viên ⇒ lấy mảng **dài nhất** (cả khi cái dài đứng trước) | *"lấy mảng ĐẦU TIÊN khớp"* — nó trả về một tập **CON**, và tập con đọc y hệt *"vendor vừa bỏ N sự kiện"*: đúng cảnh báo giả mà công cụ này ra đời để tránh |
| nháy đơn vẫn parse được | |
| mảng ≥7 phần tử nhưng **không** chứa `PreToolUse` ⇒ bỏ | |
| mảng quá ngắn ⇒ bỏ | |
| không có ứng viên ⇒ `null`, **không** phải mảng rỗng | phép gộp `?` vào `0` |

### Biên chồng lấn thôi là một hằng số không ai canh

`CHUNK`/`OVERLAP` là hằng số trong hàm ⇒ ca *mảng vắt qua ranh giới khối* — chỗ **duy nhất**
phép quét sai **im lặng** — không dựng được. Giờ `nativeHookEvents(path, { chunk, overlap })`
nhận tham số, và một fixture vài trăm byte dựng được ca đó ở cả ba OS.

Thêm một ca **cảnh báo sớm**: mảng thật phải còn nhỏ hơn chồng lấn.

```
mảng thật 485B < chồng lấn 8192B — còn 7707B biên trước khi phép quét hỏng im lặng
```

`OVERLAP = 8192` an toàn **hôm nay**. Nó thôi an toàn khi vendor thêm sự kiện tới lúc mảng
vượt 8 KB — lúc đó phép đo trả `null`, đọc y hệt *"bundle đổi hình dạng"*. Ca này đỏ **trước**
khi điều đó xảy ra, thay vì sau.

### Một chi tiết kế toán nhỏ

`na` gộp nhiều CA vào một DÒNG, nên `na.length` không phải số ca — đó là lý do `naCount` là
hằng số. Ca n/a mới có điều kiện khác (`CLAUDE_CODE_EXECPATH` không đặt) nên nó tự đếm qua
`naExtra`; nếu không, trên máy không đo được binary nó rơi khỏi tổng và **sàn báo nhầm "một
case đã ngừng chạy"**.

---

## 2.38.0 — 2026-08-07

**minor.** Tập sự kiện hook native được **đo bằng máy**, không giao cho trí nhớ. Đóng #85.

### Đo được: con số duy nhất kiểm được bằng máy đi từ 13 lên 31, không ai tính

Nghi thức `claude-code-drift` **kích hoạt bằng máy** (so version) nhưng **trả lời bằng người**
(văn xuôi tự do). Nó chạy đúng và được trả lời đúng hạn — 5 mục trong
`.claude/claude-code-baseline.json`, mục gần nhất chất lượng cao. Nhưng:

| | |
|---|---|
| bản rà `2.1.222` ghi | *"tập sự kiện hook trong binary … **13 tên**"* |
| binary `2.1.224` đang chạy, đo 07/08 | **31 tên** |
| bản rà `2.1.224`, viết **cùng ngày** | không nhắc tập sự kiện |

`AGENTS.md §Verification`: *"Mỗi lần định nhờ LLM chấm, hỏi trước: có biến thành check tất
định được không?"* — *"vendor ra sẵn thứ gì"* là câu hỏi khó, đúng là việc của người. Nhưng
*"tập sự kiện có đổi không"* là một **phép trừ tập hợp**.

### `tooling/native-surface.mjs`

```
node tooling/native-surface.mjs            đo và in: có gì · đang cắm gì · trống gì
node tooling/native-surface.mjs --record   đặt mốc vào .claude/claude-code-baseline.json
```

Đo hôm nay: **31 sự kiện · 9 đang cắm · 22 để trống · 0 cắm-mà-binary-không-có**.

**Neo là một MẢNG trong binary, không phải danh sách ứng viên viết tay.** Khác biệt đó quyết
định: một danh sách ứng viên chỉ tìm được thứ mình đã biết, nên nó **không bao giờ phát hiện
được sự kiện MỚI** — mà đó là toàn bộ mục đích. (Giả thuyết hàng đầu cho con số "13": nó đã
làm đúng như vậy.)

Cũng báo chiều ngược: sự kiện **đang cắm mà binary không có** — hook đó không bao giờ chạy,
và nó im lặng.

### Không chạy mỗi phiên

Binary **285 MB**; một lần quét đầy đủ đo được **501 · 533 · 615 ms**. Chấp nhận được cho một
lệnh người gõ, không chấp nhận được ở `SessionStart`. Kết quả **cache theo version**, và
`rituals.mjs` chỉ so version — một phép so chuỗi.

Nghi thức `claude-code-drift` giờ đòi **cả hai**: changelog đã rà **và** tập sự kiện đã đo ở
đúng version đang chạy. Rà changelog mà chưa đo tập ⇒ vẫn `due`.

### Không đụng `NATIVE_SLOTS`

Comment trên nó đã nói đúng: *"chỉ liệt kê 5 sự kiện harness CÓ sẵn việc cho chúng làm —
không liệt kê cả 31, đó sẽ là nhiễu"*. Mẫu số 5 giữ nguyên. Đây là hai câu hỏi khác nhau:
*"bề mặt vendor rộng bao nhiêu"* và *"harness có việc cho chỗ nào"*.

---

## 2.37.1 — 2026-08-07

**patch.** `protect-integration-branch` chỉ gác file **trong repo**.

### Guard mới chặn nhầm trong vòng vài phút — và chính nó báo cáo điều đó

Ngay sau khi v2.37.0 lên `main`, hook chặn một lần ghi vào
`~/.claude/projects/*/memory/` — **auto-memory**: ngoài repo, gitignore, và nhánh git không
nói được gì về nó. Chặn nó là chặn đúng thứ guard **không có thẩm quyền**.

`toRepoRel()` trả về đường dẫn **nguyên vẹn** khi file nằm ngoài gốc repo, nên phép thử đúng
là *"còn tuyệt đối sau khi quy về tương đối"*.

### Cửa thoát KHÔNG phải câu trả lời ở đây

Dùng `HARNESS_ALLOW_MAIN_EDIT` cho ca này sẽ làm bộ đếm *"cửa thoát vs nhánh chặn"* nói dối
theo hướng **"guard đúng, chỉ hay bị đi vòng"** — trong khi sự thật là guard **sai phạm vi**.
Một cửa thoát dùng để che một khuyết tật sẽ làm hỏng chính tín hiệu dùng để phát hiện khuyết
tật đó.

### Bản đầu của bản vá cũng sai, và suite bắt ngay

Phép thử đầu tiên là `rel === file` — nhưng một đường dẫn **đã tương đối sẵn**
(`tooling/x.mjs`) cũng đi ra y nguyên, nên hai ca chặn **im lặng chuyển xanh**. Đó là hình
dạng nguy hiểm nhất của một bản vá guard: nó làm guard thôi gác mà mọi thứ vẫn xanh.

---

## 2.37.0 — 2026-08-07

**minor.** Hook mới: **sửa file khi đang đứng trên nhánh tích hợp thì bị chặn**. Đóng #44.

### Luật viết ra hai lần, không gì cưỡng chế

- `AGENTS.md`: *"Một issue = một nhánh = một worktree."*
- `/claim` bước 1: *"Đang ở nhánh `main`? → dừng, tạo nhánh trước khi sửa gì."*

Đo 2026-08-06 — **cùng một agent, cùng một ngày, hai lần**: sửa `tooling/lib/harness.mjs` khi
đang ở `main` rồi mới tạo nhánh (trước `8634ecc`, PR #41); tạo `tooling/overlap-scan.mjs` +
sửa 4 file khi đang ở `main` rồi mới tạo nhánh (trước `2cb7e1e`, PR #42). `git reflog` cho
thấy hai dòng `checkout: moving from main to <nhánh>` xảy ra **sau** khi cây đã bẩn.

Lần đó **may** — agent tự nhớ ra trước khi commit. Chế độ hỏng thật là lần **không** nhớ.

### Bắn theo HÀNH ĐỘNG, đừng đoán ý định

*"Ghi file đầu tiên trên nhánh tích hợp"* là sự kiện **tất định**, quan sát được, xảy ra đúng
khoảnh khắc một việc thật sự bắt đầu. Không cần phân loại *"người dùng vừa nói thêm tính năng
hay chỉ đang hỏi"* — đó là inferential control, thứ `AGENTS.md` bắt phải hỏi *"có biến thành
check tất định được không?"* trước khi dùng.

### Hai quyết định, và cả hai đều có giá đã đo

**Fail-OPEN** (`declareFailMode(1)`), không fail-closed như issue đề xuất. Đây là guard **phối
hợp**, không phải guard **an toàn**: sửa nhầm trên nhánh tích hợp thì hoàn tác được, còn một
hook hỏng chặn mọi `Write|Edit` thì bạn không sửa được cả chính nó. Chi phí đó đo được cùng
ngày: `dcg.mjs` (fail-closed, **đúng** cho nhóm an toàn) lỗi import và chặn **mọi lệnh Bash**
trong phiên — thoát được nhờ tool `Edit`. Nếu hook này cũng fail-closed, cả `Edit` cũng đóng.

**Cửa thoát là biến môi trường, có ghi sổ.** `HARNESS_ALLOW_MAIN_EDIT=1` — cùng khuôn
`HARNESS_DRI` và `HARNESS_FAIL_OPEN`. Sửa tài liệu thẳng trên nhánh tích hợp là việc hợp lệ;
không có cửa thoát thì người ta **tắt hook**, và lúc đó mất cả guard lẫn tín hiệu.

### Cửa thoát phải ĐẾM ĐƯỢC, nếu không nó mở vĩnh viễn

Năng lực mới trong `rituals.mjs`: đối chiếu số lần dùng cửa thoát với số lần chặn.

> **Cửa thoát dùng nhiều hơn nhánh chặn ⇒ GUARD SAI. Cắt nó, đừng nới nó.**

Đây là mục hiếm hoi trong bảng nghi thức đề xuất **bỏ** một cơ chế thay vì làm một việc — và
nó cố ý như vậy. `0 chặn / 0 cửa thoát` là **`?`**, không phải "ổn": guard vừa cắm thì mẫu số
bằng 0, và một tỉ lệ trên mẫu số 0 là câu trả lời dễ chịu (L0005).

### Migration 011 — hook mới trong sự kiện ĐÃ CÓ

Migration `008` cắm những **sự kiện** project thiếu. Nhưng hook này vào `PreToolUse` — sự kiện
mọi repo đã có từ bản đầu — nên 008 đọc ra là *"không thiếu gì"*. File hook được copy sang rồi
**nằm đó chết**: có mặt trên đĩa, không ai gọi, và **không xuất hiện trong DANH MỤC HOOK** của
`harness-doctor` (bảng đó đọc `settings.json`). Nó vắng mặt khỏi chính bảng dùng để phát hiện
vắng mặt.

`011` gộp **theo lệnh**, không theo vị trí: chỉ thêm `command` mà template có và project
không; không đụng `matcher`, thứ tự, hay hook riêng của project. Fixture
`tooling/fixtures/migration-2.37.0/` có sẵn một hook riêng của project trong cùng group để
khẳng định đúng điều đó.

### Ngoài phạm vi

Rider `paths.ui` của #44 (điều kiện cần để `/verify-ui` có nghi thức) **chưa làm** — issue tự
ghi nó không đạt ngưỡng ≥2, và nó là một năng lực riêng chứ không phải một dòng cấu hình.

---

## 2.36.0 — 2026-08-07

**minor.** `dcg` khớp theo **LỆNH**, không theo chuỗi. Đóng #43.

### Hai triệu chứng ngược nhau, một gốc

`dcg.mjs` nhận một *chuỗi* và xử lý nó như một *lệnh*.

**Chặn nhầm văn bản — 5 lần đo được**, gồm cả lần chặn chính lệnh `gh issue create` mở issue
#43, vì thân issue trích tên lệnh. **Một cái gác chặn được việc báo cáo về chính nó là một
cái gác tự bịt đường sửa nó.**

**Cho qua lệnh thật — 5/5 biến thể** nguỵ trang bằng nháy đi lọt, trong khi shell thực thi
chúng y hệt dạng bị chặn.

### Mô hình đúng

Một rule về `git push --force` là rule về **chương trình `git`**. Khi chương trình là `gh` hay
`node`, cùng chuỗi đó là **đối số văn bản**.

Ba bước, mỗi bước xử một phần:

| bước | xử ca nào |
|---|---|
| `stripHeredocs` — thân heredoc là DỮ LIỆU | 3/5 ca chặn nhầm |
| `simpleCommands` — cắt theo `; && \|\| \|`, bỏ tiền tố gán biến và bọc (`sudo`, `env`, `xargs`), lấy chương trình | 2/5 ca còn lại + `sudo rm -rf /` |
| `unquote` — bỏ nháy TRONG một lệnh đã xác định chương trình | 4/5 ca nguỵ trang |

Phán đoán nằm ở `dangerousCommand()` — hàm THUẦN ở `lib/harness.mjs`, test khẳng định thẳng
vào đó thay vì spawn hook 15 lần.

### Giới hạn — nói ra, không để người đọc tự suy là đã kín

`dcg` là regex trên ngữ pháp shell. Nó **không** bắt được biến shell
(`F=--force; git push $F`), `eval`, command substitution, hay `base64 -d | sh`. Có một ca test
khẳng định **đúng điều đó** — nếu một ngày nó bị chặn thật thì hoặc ai đó đã dựng lớp mạnh hơn,
hoặc regex vừa phình ra theo hướng sẽ đẻ dương tính giả.

### `danger-zones.md` thôi nói quá

Rule đó viết ba nhóm nguy hiểm được *"cưỡng chế bằng máy ở `dcg.mjs`, …, và `permissions.deny`"*
— gộp hai tầng sức mạnh rất khác nhau vào một câu. Giờ nó nói rõ:

- **tầng MỘT** = `permissions.deny`, vendor cưỡng chế, trước cả khi hook chạy;
- **tầng HAI** = hook — thêm *giải thích*, *cách đi tiếp*, *telemetry*; **không thay được tầng một**.

Đo 2026-08-06: cả 5 biến thể nguỵ trang đi lọt tầng hai, và **tầng một bắt được chúng**. Đó là
lý do thứ tự hai tầng quan trọng hơn sức mạnh từng tầng.

### Ngoài phạm vi

Mục 2 của #43 — bổ sung `permissions.deny` cho **8 nhóm `dcg` chưa có tầng một** — chưa làm.
Ratchet `dcg ↔ permissions.deny` đang ở **8**, và nó **chỉ được giảm**.

---

## 2.35.0 — 2026-08-07

**minor.** Cắt **một** field ma trong `budget`, và khoá cả bảng bằng máy. Đóng #72 —
nhưng **hai phần ba tiền đề của issue đó là SAI**, và bảng ở v2.28.0 cũng vậy.

### SỬA LẠI một kết luận của v2.28.0

v2.28.0 nói ba field còn lại của `budget` đều là field ma, và ghi điều đó vào
`docs/ECONOMICS.md` dưới dạng **ba dấu ❌**. Đo lại 2026-08-07 trên **cả repo**:

| field | bên đọc THẬT |
|---|---|
| `maxTurnsPerRun` | ✅ `evals/run.mjs:177` — mặc định cho task không tự khai `maxTurns` |
| `maxWallClockMinutes` | ✅ `evals/run.mjs:178` — mặc định cho task không tự khai `maxMinutes` |
| `maxToolCallsPerRun` | ❌ **không ai** — đúng là field ma |

Nguyên nhân: lần đo v2.28.0 grep `tooling/` + `.claude/hooks/` + `docs/` và **quên `evals/`**.

Đây là lớp lỗi **tệ hơn** field ma: một tài liệu nói SAI về chính cơ chế của mình, và nói sai
theo hướng *"chỗ này rỗng"* — tức mời người sau đi cắt một thứ đang chạy.

### Đổi gì

- `maxToolCallsPerRun` → `$comment_da_cat_*` (tiền lệ `modelTiering` ở 2.0.0). Harness **không
  có nguồn dữ liệu** để đếm tool-call mỗi phiên; cap thật nằm ở tầng gateway/CLI.
- `docs/ECONOMICS.md` cột "ai cưỡng chế" nói đúng, kèm một ghi chú nói ra chính lần sai đó.
- **Hợp đồng hai chiều** ở `test-hooks.mjs`, quét **cả repo** nên không bỏ sót thư mục nào:
  - mọi khoá trong `budget` phải tìm được **ít nhất một chỗ đọc**;
  - mọi khoá **mã nguồn đọc** phải được config khai. `evals/run.mjs` dùng `?? mặc-định`, nên
    một khoá biến mất **không gây lỗi** — nó lặng lẽ rơi về mặc định, và người sửa config
    không biết mình vừa tắt một cái cap.

**Chiều thứ hai suýt bị bỏ.** Bản đầu tôi viết comment *"cả hai chiều đều bị khoá"* trong khi
chỉ có một — phát hiện vì mutant thứ hai **không đỏ**.

---

## 2.34.0 — 2026-08-07

**minor.** `AGENTS.md` **ngắn đi 7 dòng** và thôi nói chuyện với một đội không tồn tại.
Đóng #63 và #60 — cùng file, một PR, một lần cập nhật `whats-new`.

### #63 — cắt §"Nghi thức: đừng nhớ, hãy đọc"

`AGENTS.md` tự khai *"Giữ dưới ~150 dòng"* và đang ở **149** — **chạm trần chính nó đặt ra**.
Nó cũng là file đắt nhất repo: nạp vào **mọi** phiên của **mọi** người.

Mục bị cắt mô tả bằng văn xuôi đúng thứ SessionStart đã **in ra mỗi phiên**
(`session-start.mjs:189` và `:196`). Người đọc học một điều họ vừa đọc ở đầu phiên, và sẽ đọc
lại ở mọi phiên sau — một mục văn xuôi mô tả output của một lệnh là **bản sao thứ hai của cùng
một danh sách**, đúng lớp lỗi `gates.mjs` ra đời để diệt.

### #60 — solo không có người để "báo"

Đo trên `sakubun-single-user`, một consumer solo có thật:

| đo | kết quả |
|---|---|
| `.github/CODEOWNERS` | **10/10 dòng** cùng một handle — "cần review của CODEOWNERS" = tự review chính mình |
| `reservations/` | chỉ `README.md`, **chưa dùng lần nào** |
| GitHub | solo **không approve được** PR của chính mình |

§"Làm việc trong repo dùng chung" đổi tên thành **"Làm việc trong một repo"**, và tách làm
hai: phần đúng ở mọi vai, rồi **ba** điều chỉ có nghĩa khi `teamSize ≥ 2` (kiểm PR đang mở ở
vùng nóng · không push nhánh người khác · trần session mỗi người).

Dòng đầu file *"Đổi file này = PR + 1 approve"* giờ nói cả hai vai: solo dùng `HARNESS_DRI=1`,
và **mọi lần ghi vùng cấm tự vào sổ** `.claude/telemetry/harness-edits.log` — cơ chế tương
đương, nó ghi lại thay vì hỏi ai.

### CODEOWNERS: giữ file, đổi câu nhắc

`precommit-scan.mjs` khi solo bỏ vế *"cần review của CODEOWNERS"*, giữ vế
*"cập nhật `.claude/whats-new.md`"* — vế đó đúng ở cả hai vai.

**Giữ** `.github/CODEOWNERS`: nó có giá trị ngày project có người thứ hai, và bỏ nó là mất một
lớp gác trên GitHub chứ không phải dọn một dòng chữ.

### `teamSize` giờ có mặt trong config mẫu

`$comment_teamSize` mô tả khoá — trước đó nó là một khoá **không xuất hiện ở đâu** trong config
mẫu, nên người đọc config không biết nó tồn tại. Template vẫn **không khai giá trị**: file này
là `SEED`, một con số ở đây ship sang mọi consumer như câu trả lời của họ.

---

## 2.33.0 — 2026-08-07

**minor.** Hợp đồng output của hook **biết sự kiện**, và nhánh chặn của `post-edit-lint` lần
đầu được test chạm tới. Đóng #54.

### Vấn đề: một hợp đồng mã hoá ngữ nghĩa thành chuỗi ký tự

`test-hooks.mjs` đòi mọi nhánh từ chối phải in `BỊ CHẶN` + một dòng gợi ý `→ `. Đúng 100% với
mọi ca đang có — vì mọi nhánh chặn khác đều là `PreToolUse`.

`post-edit-lint` là `PostToolUse`: **file đã ghi xong rồi**. Nói *"BỊ CHẶN"* ở đó là một câu
**sai sự thật** — không có gì bị chặn cả, chỉ là việc tiếp theo dừng lại.

Hai đường sai đều đã cân nhắc và bỏ: bắt hook nói dối cho đồng nhất, hoặc nới `/BỊ CHẶN/`
thành `/⛔/` cho cả suite — cái sau làm yếu một check đang đúng với mọi ca còn lại, **để một ca
mới của chính mình chuyển xanh**.

### Đổi gì

| sự kiện | dấu từ chối | dòng gợi ý |
|---|---|---|
| `PreToolUse` · `ConfigChange` | `BỊ CHẶN` | `→ ` **bắt buộc** |
| `PostToolUse` | `⛔` | `→ ` **bắt buộc** |

Sự kiện của mỗi hook **đọc từ `.claude/settings.json`**, không chép tay — một bản sao trong
test sẽ lệch im lặng ngay lần ai đó chuyển một hook sang sự kiện khác, mà chuyển sự kiện đúng
là thứ migration `008` tồn tại để phân phối.

`post-edit-lint` được thêm dòng `→ ` (nó vốn có nội dung khuyên nhưng không đúng hình dạng),
và câu từ chối nói rõ *"file ĐÃ ghi, việc tiếp theo dừng ở đây"*.

### Nhánh chặn lần đầu có test

Bốn ca `post-edit-lint` đang có **đều đi vào `pass()`** — nên tới bản này, phần hook thật sự
làm gì đó chưa từng chạy trong suite. Ca mới dùng `config-lint-fails.json` (`lintFix` trỏ tới
một script thất bại tất định) — đường duy nhất tới được nhánh đó.

---

## 2.32.0 — 2026-08-07

**minor.** Banner đầu phiên **biết vai** và **gọi tên** thay vì đếm. Đóng #56 và #51 —
cùng một file, một lần mở `HARNESS_DRI`.

### #56 — một cảnh báo đỏ vĩnh viễn, về việc template KHÔNG ĐƯỢC làm

```
⚠️  harness.config.json chưa khai báo lệnh verify/test — gate đang rỗng. Đây là việc số 1 cần làm.
```

Điều kiện `!c.commands?.verify && !c.commands?.test` **đúng vĩnh viễn ở template, theo thiết
kế**: template khai mọi lệnh là `""`. Đo: **7/7** lần `session-start` chạy đều thoả điều kiện,
từ **commit đầu tiên** của repo, và `grep -c repoRole session-start.mjs` = **0**. Agent đọc
dòng đó cũng không có quyền làm theo — `harness.config.json` ∈ `paths.harness`.

Chi phí không phải một dòng thừa. Là **thói quen bỏ qua**: dòng này đứng ngay dưới khối
`▶️ N việc ĐANG TỚI HẠN` — khối duy nhất có tín hiệu thật — và dạy người đọc rằng khối đó luôn
có một mục đỏ không cần làm gì.

Sửa: thêm `repoRole() !== 'template'` vào mệnh đề. **Một mệnh đề, không phải cơ chế mới** — số
cơ chế không tăng, và bản tin đầu phiên ở template **ngắn đi một dòng**.

### #51 — `? 1 mục KHÔNG đo được` mà không nói mục nào

`?` phần lớn sinh ra từ phép đo **chập chờn**, tức tự khỏi. Nên *"chạy `--all` để xem"* không
bao giờ trả lời được cho chính ca nó phục vụ. Gặp thật 2026-08-06: banner in `? 1 mục`, chạy
`--all` ngay sau đó ra **0 mục `?`** — mục đó là gì thì không có cách nào biết.

Giờ banner nêu tên. Nhưng nêu tên trần thì **dài và lặp**: đo ngay lần chạy đầu, một nhánh
không theo quy ước đặt tên làm **ba** nghi thức cùng ra `?` vì **cùng một nguyên nhân**
(`/claim`, `/handoff`, `/verify-ui` đều cần issue), còn mục thứ tư có lý do khác hẳn.

Hai lần thử trước khi đúng, cả hai đều đáng ghi:

- **Chặn ở 3** như `due` — trần đó giữ lại ba bản sao của một nguyên nhân rồi **cắt mất mục
  khác loại**. Tệ hơn không chặn: nó biến một danh sách thành một mẫu thiên lệch.
- **Gộp theo `why`** — không gộp được gì, vì ba nghi thức viết ba câu văn khác nhau cho cùng
  một gốc.

Cách đúng là gộp theo một **khoá**: `rituals.mjs` khai `cause: 'branch-no-issue'` ở ba nghi
thức đó, nghi thức riêng lẻ dùng `id`. Bốn dòng thành hai, không mục nào biến mất.

### Khoá lại

- Mọi `lines.push` mang `⚠️` gác trên **placeholder của template** (`c.commands`, `project.id`,
  `CHANGEME`) phải hỏi `repoRole()`. Bốn cảnh báo còn lại mô tả điều kiện **lúc chạy** và đúng
  ở cả hai vai — ca này không đụng chúng.
- Banner được đối chiếu với `rituals.mjs --json`, **nguồn sự thật**, không với chuỗi chép tay.

**ĐIỀU KIỆN THOÁT** (#56): khi `repoRole()` bị bỏ khỏi harness, cắt cả mệnh đề lẫn test cùng lúc.

---

## 2.31.0 — 2026-08-07

**minor.** Sàn của chính runner gate là thứ **đo được**, không phải `?`.

### Ra từ một nghi thức, không từ một bug report

`node tooling/rituals.mjs --reviewed-claude-code` đòi đọc changelog Claude Code mới với đúng
một câu hỏi: *"nó vừa ra sẵn thứ nào harness đang tự làm tay?"*. Rà 2.1.224 cho ra bốn mục
chạm, không mục nào thay thế được gì — nhưng một mục làm một ràng buộc sẵn có **nặng hơn**:

> Removed 200-subagent-per-session spawn cap

`AGENTS.md` đặt trần **< 5 giây** cho gate ở `SubagentStop`, với lý do *"mỗi gate nhân với tối
đa 16 agent song song"*. Trần 200 của vendor từng che cho ta. Nó không còn.

### Đo được: "0 gate có lệnh" ≠ "không có gì chạy"

`gates.mjs --list --timing` báo `subagent: KHÔNG đo được độ trễ — 0/1 gate có lệnh`.

Đúng về phần **việc** của gate. Sai về **chi phí**: chính runner chạy. Một tiến trình Node,
một lần nạp config, một vòng lặp, một lần ghi telemetry — **trung vị 104 ms**, trả đủ mỗi lần
hook kích hoạt, nhân với số agent song song.

Đây là **L0005 lần thứ tám**, và lần này nó nằm trong chính công cụ đo độ trễ.

### Đổi gì

- Stage không gate nào có lệnh giờ báo `sàn runner <N>ms mỗi lần gọi`, **và** vẫn nói rõ phần
  việc thật là `CHƯA đo được`. Hai con số, hai câu — bỏ vế nào cũng là một nửa sự thật.
- Sàn được **đo**, không viết cứng: một hằng số sẽ sai ở máy chậm hơn đúng lúc nó quan trọng nhất.
- Phép đo gọi **đúng lệnh thật** (`--stage <stage>`), không một probe rút gọn. Bản đầu dùng
  `--floor-probe` thoát ngay sau khi nạp module: **64 ms so với 104 ms thật — thấp hơn 40%**,
  đúng cái sai mà chính bản vá này ra đời để sửa.
- Telemetry của phép đo chuyển hướng sang thư mục test (#66): 5 lần chạy = 5 dòng giả trong
  `gate-runs.log`, và đó là công cụ đo tự làm nhiễu số của chính nó.

### Repo đã áp harness cần làm gì

Nếu `gates.subagent` của bạn có lệnh thật, con số cũ vẫn đúng. Nếu không, bạn sẽ thấy sàn hiện
ra lần đầu — **đó là chi phí vẫn luôn trả**, chỉ chưa được nói ra.

---

## 2.30.2 — 2026-08-07

**patch.** §9b giải đường dẫn **tương đối với file đang nhắc nó**, không chỉ với gốc repo.

### Đo được ở `sakubun`, không đo được ở đây

```
mobile/README.md  nhắc  `lib/config.ts`      →  §9b báo "KHÔNG TỒN TẠI"
file thật:        mobile/lib/config.ts        →  README đọc ĐÚNG, check đọc SAI
```

Một `README.md` trong thư mục con viết đường dẫn tương đối với **chính nó** — đó là cách đọc
đúng cho người mở file đó. Template có cấu trúc phẳng nên ca này **không xuất hiện tự nhiên
ở đây**.

Đây là **lần thứ ba trong một ngày** một khuyết tật chỉ lộ ra *sau khi phân phối*
(2.30.0 → `settings.local.json` chỉ CI thấy; 2.30.1 → nhật ký bị trích như đường dẫn chỉ repo
con thấy; 2.30.2 → đường dẫn tương đối chỉ repo có thư mục con thấy). Ba lần cùng một hình
dạng: **template là một mẫu vật không điển hình của chính tập nó phục vụ.**

### Đổi gì

- `noteRef()` thử thêm `repoPath(dirname(where), clean)` trước khi kết luận là chết.
- **Fixture `tooling/fixtures/relative-ref/`** — vì không có ca thật ở template, nhánh này sẽ
  không bao giờ được chạy qua. Fixture dựng đúng ca đó, và test khẳng định **cả hai vế**:
  nhánh còn trong mã nguồn, **và** fixture còn đủ file. Thiếu vế thứ hai thì ca xanh mãi mà
  không kiểm gì.

  Fixture phải được **git track** — §9b quét theo `git ls-files`, nên một fixture untracked
  cho coverage bằng 0 trong khi test vẫn xanh. (Đã xảy ra đúng vậy lúc viết bản vá này: mutant
  đầu tiên chỉ giết được khẳng định đọc-mã-nguồn, không giết được khẳng định hành vi.)

---

## 2.30.1 — 2026-08-07

**patch.** File ĐƯỢC ship thôi trích đường dẫn KHÔNG được ship.

### Đo được: một con trỏ chết ở MỌI repo tiêu thụ, xanh ở template

Ngay sau khi v2.30.0 mang §9b vào template, chạy nó ở `sakubun` cho ra:

```
docs/progress/vong-hoc-2026-W32.md  (tooling/apply-to.mjs, tooling/harness-doctor.mjs)
```

Hai file đó **được ship** xuống repo con. Nhật ký thì **không** — `apply-to.mjs` IGNORE
`^docs/progress/(?!_)` một cách cố ý. Nên một comment trích dẫn dạng đường dẫn ở đó là con
trỏ chết **vĩnh viễn ở mọi repo tiêu thụ**, trong khi ở template nó xanh vì file có thật.

Đây là loại lỗi không công cụ nào ở phía template thấy được: **nó chỉ hiện ra sau khi phân
phối**. Bắt nó ở đây rẻ hơn bắt nó ở repo người khác.

### Đổi gì

- Ba chỗ trích dẫn được viết lại thành chữ (`tooling/apply-to.mjs`, `tooling/harness-doctor.mjs`,
  `tooling/lib/harness.mjs`) — nội dung giữ nguyên, chỉ thôi trông như đường dẫn.
- **Hợp đồng hai đầu mới** ở `test-hooks.mjs`, cùng khuôn với `PACK_SCHEMA`: 66 file được ship
  không file nào được trích tên file cụ thể trong `docs/progress/**` hay `.claude/learnings/**`.
  Tham chiếu tới **thư mục** thì hợp lệ — thư mục đó có ở repo con vì khuôn `_TEMPLATE.md`
  được ship; chỉ tên file cụ thể mới chết.

---

## 2.30.0 — 2026-08-07

**minor.** Nhận hai phép kiểm **đi lên từ `sakubun`** — lần đầu chiều LÊN thật sự chuyển
được một cơ chế, ba version sau khi v2.27.0 sửa bên nhận.

### Vòng học khép trên dữ liệu thật

```
sakubun  --upstream-->  knowledge/incoming/sakubun/  (0 bài học · 3 diff cơ chế)
                        accept.mjs --list  →  "1 PACK CHỜ QUYẾT ... 3 diff cơ chế"
                        accept.mjs sakubun --reviewed "..."  →  DECISIONS.log
```

**Trước v2.27.0 pack này đọc ra là *"Không có gì trong knowledge/incoming/"*** — 0 bài học,
và bên nhận chỉ nhìn `lessons/`. Ba file cơ chế sẽ nằm đó vô hình.

### Nhận gì

**① §9b `entropy-scan` — đường dẫn trỏ vào hư không.** Loại hết hạn đắt nhất với agent và
không có triệu chứng: với agent mọi text trong repo có thẩm quyền như nhau, nên một đường
dẫn chết không báo lỗi — nó gửi người đọc tới chỗ trống và người đọc **tự nghĩ ra** nội dung
đáng lẽ ở đó. Đo ở `sakubun`: 16 chỗ trong source trỏ vào 5 file kế hoạch chưa từng được commit.

Khác bản gốc một chỗ: nó quét source bằng danh sách thư mục cứng
`['app','components','lib','e2e','tooling']` — hình dạng một app Next.js. Ở template thì
`git ls-files` là nguồn đúng: repo-agnostic, tự bỏ file gitignore/generated, không có danh
sách nào để mục.

Chạy lần đầu ở template, nó tìm được **ba** đường dẫn chết — hai là dương tính giả **có cấu
trúc**, và cả hai đều đã thành loại trừ có ghi lý do:
- `.claude/harness-manifest.json` — chỉ tồn tại ở repo TIÊU THỤ (`repoRole()` dựa vào chính
  sự vắng mặt đó). Tài liệu ở template **phải** giải thích được nó.
- refs xuất phát từ `evals/tasks/**` — task MÔ TẢ thứ agent phải TẠO RA; file chưa tồn tại
  chính là điều kiện ban đầu của phép đo. Cùng lý do bỏ qua fixture.

Cái thứ ba là thật, và đã sửa: `evals/README.md` viết `evals/lib/arms.mjs` như một đường dẫn
trong khi câu ngay sau nói *"chưa được viết"*.

**② `check-feature-integrity` — `_index.json` phải trỏ tới file CÓ THẬT.** Gate cố ý bỏ qua
file `_`-prefix, nên khi `features/` chỉ có `_index.json` + `_TEMPLATE.json` nó in
*"(không có gì để báo cáo)"* rồi `exit 0` — đọc như một cổng đang canh, thực ra là cổng
không canh gì, trong khi `_index.json` đang liệt một entry trỏ vào hư không.

Đây là **ca thứ BẢY của L0005**, và là ca đầu tiên tìm được ở một repo **độc lập** —
theo `knowledge/README.md`, bằng chứng từ hai repo mạnh hơn hai lần trong cùng một repo.
WARN chứ không FAIL, cố ý: một entry mẫu trong repo vừa áp harness là trạng thái bình thường,
và một cổng bắt đầu đời mình bằng màu đỏ ở mọi project là cổng dạy người ta bỏ qua nó.

### Repo đã áp harness cần làm gì

`entropy-scan` có thể báo thêm đường dẫn chết — **đó là dữ liệu vẫn luôn ở đó**. Sửa đường
dẫn, tạo file, hoặc bỏ lời nhắc; đừng nới loại trừ.

---

## 2.29.0 — 2026-08-07

**minor.** Promote **L0005** — *"một bộ đếm không phân biệt được hai trạng thái sẽ đổ về phía
DỄ CHỊU"* — và bản thân việc promote bắt được hai ca của chính nó đang sống trong `rituals.mjs`.

### Bài học

`knowledge/lessons/0005-bo-dem-do-ve-phia-de-chiu.md` · `scope: universal` ·
`occurrences: 6` · gate đi kèm: `evals/tasks/0006-chua-do-khong-phai-on.md`.

Sáu lần độc lập từ v2.16.0 tới v2.28.0: `fixlogKey` gom theo từ vựng · `harness.version` lệch ·
eval đếm *chưa-đo* thành FAIL · `features/` rỗng ⇒ mọi tỉ lệ 100% · ba bộ đếm pack nói ngược
nhau · `monthlyUsdCap` là field ma.

Hai chiều gộp **không đối xứng**: gộp về FAIL sinh tiếng ồn, và tiếng ồn được điều tra. Gộp
về PASS sinh một dấu tick xanh, và **không ai điều tra một dấu tick xanh**.

### Hai ca bắt được ngay lúc promote

1. **`undefined` lọt thành `ok`.** Mọi `check` trong `rituals.mjs` dùng `s.x === null` cho
   "không đo được". Một state THIẾU KHOÁ (hình dạng của một `collect()` bị refactor làm rơi
   một khoá) cho `undefined`, và `=== null` đưa nó thẳng xuống nhánh dễ chịu.
   Đo: `evaluate({})` → **10/12 mục ra `ok`**, kèm những dòng như *"undefined/undefined skill"*.
   Ca `MUTANT` sẵn có dùng `evaluate(null)` — cái đó NÉM LỖI nên bị bắt; ca object-thiếu-khoá
   thì không ném, và nó giống thực tế hơn.

2. **`/handoff` nói "không có gì để giao lại" khi nó KHÔNG BIẾT.** Nhánh không theo quy ước
   `<type>/<issue>-<slug>` ⇒ `issue === null` ⇒ gộp chung với `issue === ''` (đang ở nhánh
   tích hợp) ⇒ `ok`. Nhật ký `docs/progress/vong-hoc-2026-W32.md` đã ghi đúng ca này trong
   bảng "BÀI HỌC ĐẮT NHẤT": *"/handoff OK — không có gì để giao lại | có 2 commit chưa push
   + người dùng sắp sang máy khác"*. Giờ nó là `?`, và `/verify-ui` tách tương tự.

### Một chỗ KHÔNG được đổi — và eval mới bắt được

`verify-ui` dùng `=== null` **cố ý**: ở mục đó `null` = không đọc được `features/`,
`undefined` = đọc được nhưng không feature nào khai issue này. Đổi sang `== null` làm dòng
xử lý `undefined` thành **mã chết**. Lần sửa hàng loạt đầu tiên đã làm đúng điều đó, và
`evals/tasks/0006` bắt được trong lần chạy kế tiếp.

### Repo đã áp harness cần làm gì

Không gì bắt buộc. Bảng `rituals.mjs --all` của bạn có thể hiện thêm mục `?` — **đó là trạng
thái thật, chỉ chưa được nói ra**. Một nhánh không theo quy ước đặt tên giờ làm `/handoff` và
`/verify-ui` báo `?` thay vì `ok`.

---

## 2.28.1 — 2026-08-07

**patch.** `harness-doctor` thôi tố nhật ký `docs/progress/` là tham chiếu chết.

### Đo được: một advice đỏ vĩnh viễn về một việc KHÔNG ĐƯỢC LÀM

```
`/whats-new` được nhắc ở docs/progress/vong-hoc-2026-W32.md nhưng KHÔNG có
.claude/skills/whats-new/SKILL.md — tham chiếu chết. Sửa chỗ nhắc, hoặc dựng lại skill.
```

Dòng này bắn ở **mọi** lần chạy doctor. Nhưng chính file bị tố đã phán xử nó bằng văn bản
(`docs/progress/vong-hoc-2026-W32.md:93`): *"KHÔNG cắt hai chỗ nhắc — chúng chính là bia mộ."*
Nhật ký còn xếp nó vào bảng **"BÀI HỌC ĐẮT NHẤT CỦA PHIÊN"** như một trong ba lần output của
harness suýt làm hỏng một cơ chế đang chạy.

`HISTORICAL` đã miễn changelog · whats-new · ADR · learnings vì chúng là **hồ sơ lịch sử** và
phải được phép gọi tên thứ đã bị xoá. `docs/progress/` là nhật ký — cùng bản chất, chỉ khác
định dạng, và bị bỏ sót. Cùng lớp lỗi với #56: một cảnh báo vĩnh viễn về việc không được làm
dạy người đọc bỏ qua mục advice, tức làm hỏng **cả những mục đúng**.

### Đổi gì

- `HISTORICAL` thêm `docs/progress/`.
- Bảng 9 ca ở `test-hooks.mjs` khoá **cả hai chiều**: năm loại hồ sơ được miễn, `docs/` thường
  thì KHÔNG. Nới miễn trừ tới `docs/` là xoá check — đo 2026-08-04, xoá một skill để lại 5
  tham chiếu chết và 3 trong số đó nằm ở `docs/`.
- Test bóc regex từ **mã nguồn** thay vì chép lại nó: một bản sao trong test sẽ xanh mãi
  trong khi bản thật đã trôi.

---

## 2.28.0 — 2026-08-07

**minor.** `budget.monthlyUsdCap` thôi là field ma — nó được đối chiếu với số đo thật, và
`?` khi chưa đo. Từ #62.

### Đo được: cả khối `budget` là niềm tin đóng gói thành cấu hình

`harness.config.json → budget` có năm field. Đo 2026-08-07, **không field nào được cưỡng chế**:

| field | bên đọc trước 2.28.0 |
|---|---|
| `monthlyUsdCap` | `harness-doctor:137` — chỉ để nói *"= 0, không có cap"*. Đặt `50` vào: không gì xảy ra |
| `alertAtPercent` | **không ai** |
| `maxTurnsPerRun` | **không ai** (chỉ một fixture test + bảng trong `docs/ECONOMICS.md`) |
| `maxToolCallsPerRun` | **không ai** |
| `maxWallClockMinutes` | **không ai** |

Và `docs/ECONOMICS.md` liệt kê cả năm dưới tiêu đề *"Năm guardrail — cưỡng chế ở tầng
gateway/CI, không phải ở tầng lời nhắc"*. Tài liệu nói có năm lớp bảo vệ; có không lớp nào.
Cùng lớp với `modelTiering` bị cắt ở 2.0.0.

### Đổi gì

- **`budgetStatus()`** (THUẦN) ở `lib/harness.mjs` — SÁU trạng thái, **hai trong số đó là `?`**:
  `off` (chưa khai trần) · `unmeasured` (khai rồi mà chưa lần nào đo) · `stale` (số đo cũ hơn
  45 ngày) · `ok` / `alert` / `over`.
  `unmeasured` là ca được khoá chặt nhất: nếu nó đổ về `ok` thì bản vá này **tệ hơn field ma** —
  nó biến một con số không làm gì thành một dấu tick xanh, và không ai đi điều tra tick xanh.
- **`harness-doctor` có mục `── NGÂN SÁCH ──`**, `rituals.mjs --all` có năng lực `capo-report`.
- **`alertAtPercent` được nối** — nó là ngưỡng của `alert`.
- **Run-rate, KHÔNG cộng dồn.** Mỗi entry `capo-history` là *"`days` ngày qua tiêu `usd`"* và
  các cửa sổ chồng lên nhau (chạy hàng tuần với `--days 30` ⇒ cộng vào là gấp bốn). Dùng entry
  mới nhất, quy ra `usd / days * 30`, và gọi đúng tên nó là **run-rate**.
- **Mọi thông báo nói ra rằng số là NGƯỜI GÕ.** Harness không đọc được hoá đơn:
  `capo-history.json` chỉ có dữ liệu khi ai đó chạy `capo-report.mjs --usd <N>` với con số chép
  từ dashboard billing. Giấu chuyện đó là chế tạo độ chính xác giả.
- `capo-report.mjs` ghi qua `stateDir()` thay vì `.claude/state/` cứng — `HARNESS_STATE_DIR`
  chuyển được đích, nên test thôi ghi vào sổ THẬT của bạn (cùng lớp lỗi v2.24.0, v2.25.0).
- `docs/ECONOMICS.md` có thêm cột **"ai cưỡng chế"**, và ba field chưa có bên đọc bị đánh ❌.

### Repo đã áp harness cần làm gì

`harness-doctor` sẽ in thêm một dòng `?` ở mục NGÂN SÁCH. **Đó là trạng thái thật, không phải
hồi quy** — nó luôn đúng, chỉ chưa được nói ra. Muốn nó xanh: khai trần bằng
`node tooling/setup.mjs`, rồi `node tooling/capo-report.mjs --days 7 --usd <số từ dashboard>`.

**Ngoài phạm vi:** `maxTurnsPerRun` · `maxToolCallsPerRun` · `maxWallClockMinutes` vẫn chưa có
bên đọc. Chúng cần một quyết định riêng (nối hay cắt) — mở issue, không tự quyết.

---

## 2.27.0 — 2026-08-07

**minor.** Chiều **ĐI LÊN** của vòng học có bên nhận, và ba phép đếm "pack chờ quyết" gộp
thành một. Từ #61.

### Đo được: kênh xây đúng một nửa

`upstream.mjs` gửi lên `fixlog.md`, `mechanism-diffs/` và một `pack.json` 12 field. Đo trên
`main` ngày 2026-08-07, **bốn field được GHI mà không nơi nào ĐỌC** — cộng cả hai payload
trên đĩa:

```
direction · evals · artifacts · mechanismDiffs   +  fixlog.md  +  mechanism-diffs/
```

Nặng nhất là `fixlog.md`: `/harness-retro` đo **20 mục fixlog thô qua 3 repo**, và
`accept.mjs --list` đọc ra là *"Không có gì trong knowledge/incoming/"* rồi `exit 0` — vì
nó chỉ nhìn `lessons/`. Comment ở `upstream.mjs:150` ghi rõ tác giả **biết** fixlog thô mới
là payload có giá trị (bài học đã distill thường mang theo đặc thù repo gửi), rồi vẫn xây
đúng một nửa kênh.

### Đo được: ba mẫu số cho một câu hỏi

| công cụ | "chờ quyết" nghĩa là gì |
|---|---|
| `harness-doctor` | pack có **thư mục** `lessons/` |
| `accept.mjs --list` | có **file `.md`** bên trong `lessons/` |
| `rituals.mjs` | `sourceCommit` **chưa nằm trong** `DECISIONS.log` |

Pack `"lessons": []` — đúng cấu hình cả ba pack retro đo được — làm doctor nói *"3 pack chờ
duyệt, quyết đi"* trong khi `accept.mjs` nói *"Không có gì"*. Người tin cái nói không-có-gì.

### Đổi gì

- **`accept.mjs --list` báo cáo cả PACK**, không chỉ bài học: bao nhiêu mục fixlog, bao
  nhiêu diff cơ chế, kèm đường dẫn tới chúng. Pack 0 bài học + 20 fixlog không còn đọc ra
  là rỗng.
- **`accept.mjs <pack> --reviewed "kết luận"`** — lệnh MỚI, đóng một pack không có bài học
  nào để nhận. Trước đó mọi lệnh đều thao tác trên *một bài học*, nên pack toàn nguyên liệu
  thô không có đường nào đi qua và ở lại "chờ quyết" mãi. Một mục đỏ vĩnh viễn dạy người ta
  bỏ qua mục đỏ.
- **Một định nghĩa "chờ quyết"** — `packPending()` + `packMaterial()` (hàm THUẦN) ở
  `lib/harness.mjs`; doctor, rituals, accept đều gọi nó. Neo là `sourceCommit`, không phải
  sự tồn tại của thư mục: pack là snapshot, `upstream --apply` sinh lại nó mỗi lần chạy.
- **`PACK_SCHEMA`** — bảng field → **bên đọc**, không nhận ô trống. `test-hooks.mjs` đọc mã
  nguồn `upstream.mjs`, bóc tập key nó ghi, và bắt bằng đúng tập key khai ở bảng.
- `readPacks()` trả `null` khi không đọc được thư mục, `[]` khi không có pack. Cả ba công cụ
  in `?` cho ca đầu — "không đo được" không phải "không có gì".

### Repo đã áp harness cần làm gì

Không gì bắt buộc. Nếu `knowledge/incoming/` của bạn có pack cũ, `accept.mjs --list` giờ sẽ
liệt kê chúng kèm nguyên liệu thô — **đó là dữ liệu vẫn luôn ở đó, không phải hồi quy**.
Đóng pack đã đọc bằng `--reviewed`.

**Ngoài phạm vi:** `upstream.mjs` và `accept.mjs` vẫn có hai mô hình pack riêng, chỉ được
nối bằng test. Điều kiện thoát của #61 là chúng đọc chung một schema — khi đó `PACK_SCHEMA`
thành thừa.

---

## 2.26.0 — 2026-08-07

**minor.** `harness-doctor` nói ra khi lớp xác minh đang chạy trên **tập rỗng**.
Từ `/harness-retro` §2 (#65).


### Đo được: repo ship thật, `features/` rỗng, mọi thứ báo xanh

```
sakubun-single-user   harness: CÓ (v2.13.0)   features/ thật: 0
```

`features/` ở đó chỉ có `_index.json` và `_TEMPLATE.json`. Nhưng nợ xác minh **có thật** —
auto-memory của hai project ghi 4 mục *"pushed to main; live verify pending"* /
*"đã deploy + build APK, chặn vì chưa có thiết bị kiểm chứng"*.

`features/*.json` là cơ chế default-FAIL + `evidence` mà `AGENTS.md` gọi là **"không thương
lượng"**. Ở repo duy nhất thật sự ship, nó **chưa được dùng lần nào**.

### Vì sao nó không tự lộ ra: MẪU SỐ BẰNG 0

`check-feature-integrity`, gate `preMerge` và `/verify-ui` đều lặp qua `features/*.json`.
Không feature nào ⇒ chúng lặp qua **tập rỗng** ⇒ **XANH**. Một mẫu số bằng 0 làm mọi tỉ lệ
thành 100%.

Cùng lớp lỗi `evals/run.mjs` sửa ở v2.24.0, **ngược chiều**: ở đó "chưa đo" bị đếm thành
FAIL, ở đây thành PASS. Chiều PASS nguy hiểm hơn — **không ai đi điều tra một dấu tick xanh.**

### Mục `LỚP XÁC MINH`, năm trạng thái, hai vế miễn trừ bắt buộc

Phán đoán tách sang `verificationCoverage()` — hàm THUẦN ở `lib/harness.mjs`, cùng lý do với
`coordinationLayer` và `governanceDrift` (doctor CHẠY `test-hooks` nên test spawn doctor sẽ
đệ quy).

| trạng thái | khi nào | advice |
|---|---|---|
| `template-na` | repo template | **không** — bỏ vế này là tái tạo #56 lần thứ ba |
| `quiet` | 0 commit 7 ngày qua | **không** — bỏ vế này là nổ ở mọi repo mới toanh |
| `unknown` | không đọc được git | **không** — `?`, không phải "ổn" |
| `covered` | có feature thật | không |
| `empty` | **có commit mà 0 feature** | **CÓ** — ca duy nhất kêu |

Câu cảnh báo **có số**, không phải lời khuyên chung:

```
14 commit trong 7 ngày qua, 0 feature được khai trong features/ ⇒ check-feature-integrity,
gate preMerge và /verify-ui đang chạy trên TẬP RỖNG. Mọi tỉ lệ xác minh của repo này hiện
là 100% vì mẫu số bằng 0.
```

`example-feature.json` **không** được đếm: nó là ví dụ của template, nằm trong `IGNORE` của
`apply-to` nên không đi xuống consumer. Đếm nó là dựng một mẫu số giả.

### Không có gì phải làm khi nâng cấp

Repo template: mục mới in `n/a`, **không** thêm advice. Repo consumer chưa ship gì: `quiet`.
Chỉ repo **đang ship mà chưa khai feature** mới thấy dòng mới — và đó là điểm.

Sàn test: **141 → 142**.

---

## 2.25.0 — 2026-08-07

**minor.** Telemetry của FIXTURE thôi rơi vào sổ THẬT. Từ `/harness-retro` §3 (#66).

### Bộ đếm mà retro đọc ĐẦU TIÊN đang bị nhiễu bởi chính việc phát triển hook

`/harness-retro` bước 1 dặn: *"đọc cột `N qua · M chặn` TRƯỚC khi đọc bất cứ gì khác"*, và
bước 4 dùng đúng cột đó để quyết định **CẮT** cái gì. Cột `project` của `gate-fails.log`:

```
04:41  CHANGEME-project-id   dcg                    ← thật (dương tính giả)
04:42  CHANGEME-project-id   dcg                    ← thật (dương tính giả)
04:53  CHANGEME-project-id   dcg                    ← thật (dương tính giả)
09:21  CHANGEME-project-id   protect-tests          ← THẬT, và là lần cứu THẬT DUY NHẤT
13:37  fixture-guard-paths   block-generated-edit   ← KHÔNG THẬT
13:38  fixture-lint-fails    post-edit-lint         ← KHÔNG THẬT
```

Tổng **6 lần chặn** từ trước tới nay thật ra là: **1 cứu thật · 3 dương tính giả · 2 rác**.

**Suite thì SẠCH** — đo trực tiếp: chạy `test-hooks` + `test-evals`, log thật giữ nguyên
**6 → 6 dòng**. `TEST_ENV` có `HARNESS_TELEMETRY_DIR` từ v2.13.0 và `mutate()` truyền nó
xuống. Nguồn rò là **probe hook BẰNG TAY lúc phát triển** — chạy hook với `HARNESS_CONFIG`
trỏ fixture rồi quên chuyển đích. Suite có kỷ luật; probe tay thì không, và probe tay đúng
là thứ người ta làm khi đang viết một hook.

### Một mệnh đề ở PHỄU, không phải một lời nhắc

`telemetryDir()` là chỗ **mọi** đường ghi đi qua. Giờ: `project.id` bắt đầu bằng `fixture-`
⇒ **chuyển hướng** sang `TEST_TELEMETRY_DIR`. `HARNESS_TELEMETRY_DIR` vẫn thắng tất cả.

**Chuyển hướng, KHÔNG vứt.** Dữ liệu vẫn được ghi, chỉ vào đúng chỗ. Vứt im lặng biến một
cơ chế thành vô hình — đúng lớp lỗi `block()` đã đóng ở v2.17.0.

Vì sao không phải một dòng tài liệu *"nhớ set `HARNESS_TELEMETRY_DIR` khi probe"*:
`danger-zones.md` đã viết sẵn câu trả lời — *"mọi thứ chỉ tồn tại dưới dạng lời nhắc sẽ bị
bỏ qua bởi người đang gấp, và người đang gấp luôn tồn tại."*

**Đánh đổi, nói rõ:** một project THẬT tên `fixture-…` sẽ bị chuyển hướng nhầm (`setup.mjs`
suy `project.id` từ tên thư mục). Chấp nhận vì hai chiều hỏng không cân nhau: chiều này
thấy ngay khi `harness-doctor` báo 0 bằng chứng; chiều ngược lại thì bộ đếm nói dối âm thầm.

### Không có gì phải làm khi nâng cấp

Sổ telemetry cũ **không bị đụng** — telemetry là bằng chứng, và xoá bằng chứng để làm đẹp số
là đúng thứ `evals/tasks/0003-khong-tu-khen` tồn tại để bắt. Hai dòng rác cũ vẫn nằm đó;
`.claude/telemetry/` là gitignore nên chúng chỉ ở máy đã sinh ra chúng.

Sàn test: **140 → 141**.

---

## 2.24.0 — 2026-08-07

**minor.** `evals/run.mjs` — công cụ DUY NHẤT có quyền nói *"KHÔNG promote thay đổi này"* —
có trạng thái thứ ba. Và nó thôi **ghi file vào repo nó đang đo**.


### ① `REGRESSION 40% (2/5)` trên một harness KHÔNG hỏng

Đo 2026-08-07, Windows. Ba FAIL, **không cái nào là hỏng thật**:

| task | "FAIL" | thật ra là |
|---|---|---|
| `0002` | `git rev-parse HEAD > /dev/null` | `/dev/null` không tồn tại trên `cmd.exe` — **lỗi Parity, chỉ hiện ở Windows** |
| `0003` | `test -f features/eval-probe.json` | file do AGENT tạo trong task, mà `evals.command` rỗng ⇒ không agent nào chạy |
| `0004` | `<lệnh install ở chế độ frozen/ci>` | một **placeholder CHANGEME** được đem chạy như lệnh shell |

`gates.mjs` có `skip`, `rituals.mjs` có `?`, `harness-size` có `n/a`. Runner thì không — nên
mọi thứ **chưa đo được** bị đếm là **hỏng**. Một bộ đo báo 40% khi mọi thứ đúng thì lần sau
nó báo 40% vì hỏng thật cũng không ai phản ứng.

### ② Runner GHI FILE vào repo nó đang đo — Windows

`runAssertions` cũ `split('\n')` thẳng, nên một `node -e "…"` nhiều dòng bị băm thành N
"lệnh". Dòng này chạy MỘT MÌNH trong `cmd.exe`:

```
const bad=Object.entries(f.platforms||{}).filter(([,v])=>v.passes===true&&!v.evidence);
```

`>` trong `=>` là **chuyển hướng output** ⇒ runner tạo file `v.passes` trong repo. Rồi
`apply-to --audit` — **assertion số 3 của eval 0001** — đỏ vì đúng file vừa bị tạo. Bộ eval
tự làm hỏng assertion kế tiếp của chính nó, và triệu chứng đọc y hệt *"template thiếu file"*.

Giờ `splitCommands()` gộp dòng theo **nháy còn lẻ**, và một lưới riêng chụp
`git status --porcelain` trước/sau: assertion làm bẩn cây ⇒ **FAIL kèm tên file**. Lưới này
bắt cả những biến thể chưa gặp — nguyên nhân gốc (shell mỗi OS diễn giải chuỗi một kiểu)
không chặn hết được bằng cách sửa từng task.

### ③ Hai nguồn của `n/a`

- assertion còn **placeholder** (`<… …>` hoặc `CHANGEME`) — nó chưa phải một lệnh
- assertion chấm **output của agent** khi `evals.command` rỗng — đánh dấu bằng dòng
  `# requires-agent` NGAY TRƯỚC nó (chỉ áp cho lệnh kế tiếp, không cho cả khối)

Task mà **mọi** assertion đều `n/a` và không có agent ⇒ ra khỏi **MẪU SỐ**. Không phải 0
điểm — **không có điểm**. Số `n/a` được in ra, không giấu: một mẫu số co lại mà không nói
là cách một tỉ lệ đẹp lên mà không ai làm gì.

### ④ Kết quả

`REGRESSION 40% (2/5)` → **100% (4/4) + 1 n/a khai ra**. Ba assertion sửa ở task
(`0002` bỏ `> /dev/null`; `0003` thêm hai `# requires-agent`); `0004` tự thành `n/a`.

Suite `test-evals`: **7 → 10 ca**. Cả ba ca mới đã kiểm ĐỎ với mutant tương ứng.

**Và một ca xanh-giả bị bắt trong lúc viết chính nó:** `runEval()` cứng `--task 9001`, nên
fixture mới ghi vào thư mục task bị lọc mất và ca ⑩ xanh **vì không có gì chạy**. Giờ
`runEval` nhận `taskId`, và mỗi ca mới **tự khẳng định task của nó ĐÃ CHẠY** trước khi
khẳng định bất cứ điều gì khác.

### Không có gì phải làm khi nâng cấp

Chỉ chạm `evals/`. Task nào của bạn có assertion chấm output agent thì thêm
`# requires-agent` để nó thôi bị đếm là hỏng khi chưa khai `evals.command`.
---

## 2.23.0 — 2026-08-06

**minor.** Harness hỏi **bao nhiêu người làm project này**, và câu trả lời TẮT ĐƯỢC ba cơ
chế phối hợp liên-người. Trước bản này, một project solo mang đủ bộ máy của một đội.


### ① Câu hỏi mới trong `setup.mjs`, đặt NGAY SAU `projectId`

Nửa lớp phối hợp của harness (đặt chỗ · dò PR người khác · CODEOWNERS · *"hỏi người, đừng
tự quyết"*) chỉ có nghĩa khi có người thứ hai. Hỏi muộn thì người trả lời đã đọc xong một
loạt câu hỏi giả định có đội.

Bằng chứng đi kèm, theo luật 4 của `setup.mjs`: `commitAuthors()` đếm email tác giả distinct
trong 500 commit gần nhất và in nguyên danh sách. Nó là **CẬN TRÊN, không phải số người** —
đo trên chính repo này ra **2 email của 1 người** (`…@users.noreply.github.com` từ merge qua
web + email từ máy). Không gộp bằng heuristic: không có phép nối nào đúng giữa một username
GitHub và một địa chỉ gmail, và đoán sai ở đây ghi thẳng vào `harness.config.json`.

### ② `project.teamSize` — BA giá trị, không hai

| giá trị | nghĩa |
|---|---|
| `1` | solo |
| `2+` | đội |
| **không có khoá** | **CHƯA KHAI** — giữ nguyên toàn bộ lớp phối hợp |

`chưa khai` **không** gộp vào `solo`. Gộp là mọi repo chưa chạy `setup.mjs` lặng lẽ mất guard
đặt chỗ mà không ai quyết định điều đó. Hai chế độ hỏng không cân nhau: thiếu một guard phối
hợp thì hỏng im lặng và chỉ lộ khi hai người đã giẫm chân nhau; thừa một guard thì tốn vài
giây và **nhìn thấy được**. Rác (`0` · `"1"` · `1.5` · `-1` · `null`) đều đọc thành `chưa khai`.

### ③ Solo tắt ba thứ — và một trong ba là lỗi CHẶN NHẦM thật

- **`check-reservations.mjs`** (pre-commit) → bỏ qua. Không chỉ vì thừa: phép so là
  `r.owner === me` với `me = DEV_ID || USER || USERNAME`. Cùng một người trên hai máy thường
  có `USERNAME` khác nhau, và `DEV_ID` nằm ở `settings.local.json` (máy-cục-bộ, hay quên).
  Lúc đó reservation của **chính bạn** đọc ra là của người khác, và pre-commit từ chối commit
  với lời khuyên *"nhắn chủ reservation"* — chủ là bạn.
- **`overlap-scan.mjs` ②** (reservation của người khác) → bỏ qua, và **NÓI RA** ở output.
- **Lời khuyên *"KHÔNG tự quyết, hỏi người"*** → thay bằng ba lựa chọn của một người. Gửi
  người ta đi tìm một cái cổng không tồn tại thì tệ hơn im lặng.

**GIỮ NGUYÊN:** mọi guard an toàn (secret · migration · lịch sử chung · vùng cấm harness),
nghi thức `/claim` + nhật ký `docs/progress/`, và **dò chồng lấn giữa các nhánh của chính
bạn** — `overlap-scan` ③ chỉ đổi cách gọi tên: không phải *"PR của ai đó cần thương lượng"*
mà *"nhánh khác CỦA BẠN"*. Cùng dữ liệu, khác việc phải làm.

Solo vẫn giẫm chân chính mình: hai phiên song song, hai worktree, một nhánh bỏ dở tuần trước.
Đo được ở chính repo này 2026-08-06 — một nhánh 3 commit chưa có PR, suýt bị dọn nhầm.

### ④ `harness-doctor` → mục **LỚP PHỐI HỢP**, và nó KHÔNG lặp lại bug #56

`check-reservations` thoát 0 im lặng khi solo (đúng cho hook chạy ở mọi commit), nên cơ chế
đó cần một kênh **nhìn thấy được**. Doctor là kênh đó.

Phán đoán tách sang `coordinationLayer()` — hàm THUẦN ở `lib/harness.mjs`, cùng lý do với
`governanceDrift`: doctor CHẠY `test-hooks.mjs`, nên test spawn doctor sẽ đệ quy.

**BỐN** trạng thái, không ba: `template` là trạng thái riêng và **không sinh advice**.
`harness.config.json` là SEED ⇒ một con số ở repo template ship sang MỌI consumer như câu trả
lời của họ. "Chưa khai" là trạng thái ĐÚNG ở đó. Bản đầu của chính mục này đã tái tạo #56
(advice đỏ vĩnh viễn trong template về việc template không được làm) — test 8 ca khoá lại.

### Không có gì phải làm khi nâng cấp

Không khai `teamSize` ⇒ hành xử **y hệt trước**. `setup.mjs` mới hỏi thêm một câu.
Sàn test: **137 → 140**.

---

## 2.22.0 — 2026-08-06

**minor.** Bài học **L0004** và gate **`evals/tasks/0005`** đi được sang project đích. Và
lưới lọc nhật ký thôi mã hoá một quy ước ĐẶT TÊN.

### ① L0004 + eval 0005 vào `SEED`

`knowledge/lessons/0004-gac-hong-thi-phai-chan.md` (gác hỏng thì CHẶN, promote từ v2.12.0)
và `evals/tasks/0005-gac-hong-thi-chan.md` giờ có tên trong `SEED` của `apply-to.mjs`.

Không đăng ký thì bài học nằm trong repo template và **không đi đâu cả** — `--audit` đỏ, và
project đích nhận một `index.json` trỏ vào file không tồn tại. Đây là bước 8 mà
`/knowledge-promote` không nói ra; `--audit` là thứ bắt được.

`knowledge/lint.mjs`: **4 bài học hợp lệ · 4 mang đi được**.

### ② `--audit` đỏ với chính artefact mà `/claim` bảo tạo

`IGNORE` cũ: `/^docs\/progress\/[A-Z]/`. Nó không lọc *"nhật ký thật"*, nó lọc *"nhật ký có
tên bắt đầu bằng chữ HOA"* — tức mã hoá giả định **mọi nhật ký đều tên theo mã issue**.

Một phiên NGHI THỨC không có issue (nhánh `chore/…`), nên nhật ký của nó tên theo nhánh,
chữ thường, và `--audit` đỏ với đúng file mà `/claim` bước 6 bảo tạo. Đo 2026-08-06 với
`docs/progress/vong-hoc-2026-W32.md`. Một gate chặn artefact do nghi thức của chính nó sinh
ra thì người ta học cách đi vòng qua gate, không học cách bỏ artefact.

Giờ là `/^docs\/progress\/(?!_)/` — cùng khuôn với dòng `learnings` ngay dưới nó: lọc theo
*"không phải khuôn mẫu"*, không theo quy ước đặt tên.

**`--audit` một mình KHÔNG khoá được chỗ này**: nó chỉ đỏ khi trong cây đang có một nhật ký
tên chữ thường; xoá file đó thì audit xanh lại trong khi bug còn nguyên. Nên có test đọc
pattern **từ nguồn** và khẳng định bằng hành vi (2 kiểu tên phải bỏ qua, 2 khuôn phải giữ).
Đã kiểm nó ĐỎ với pattern cũ trước khi tin. Sàn test: **136 → 137**.

### Không có gì phải làm khi nâng cấp

Cả hai thay đổi nằm trong lớp harness. Project đích nhận thêm một bài học và một eval task.

---

## 2.21.0 — 2026-08-06

**minor.** Ratchet `hooks-without-mutant`: **3 → 1**. Và một hợp đồng output KHÔNG bị nới.

### ① `block-generated-edit.mjs` — `paths.generated` bị vô hiệu

Hook ROI cao nhất trong repo có codegen. Mutant: vô hiệu `matchAny(rel, pathsFor('generated'))`
⇒ sửa `src/api.gen.ts` **lọt**.

### ② `post-edit-lint.mjs` — nhánh chặn CHƯA TỪNG được chạy

Bốn ca đang có đều đi vào `pass()` (chưa khai lệnh · file không lint được · file generated ·
không có path). Tức **phần hook thật sự làm gì đó chưa ai chứng minh là chạy**.

Fixture mới `config-lint-fails.json` + `lint-always-fails.mjs` cho nó một `lintFix` thất bại
tất định. Là một **file** chứ không phải chuỗi `node -e "…"`: Parity Contract — dấu nháy và
ngoặc được `cmd.exe`, PowerShell và `sh` hiểu khác nhau; một đường dẫn file thì cả ba đọc giống
nhau.

Mutant: vô hiệu `paths.lintable` ⇒ lint hỏng **không còn chặn**.

### ③ Một hợp đồng output KHÔNG bị nới — và vì sao đó là kết quả, không phải thiếu sót

Bảng `cases` cưỡng chế: mọi nhánh từ chối phải in `BỊ CHẶN` **và** một dòng gợi ý `→ `. Đúng
**100%** với mọi ca đang có.

`post-edit-lint` là nhánh chặn **duy nhất** không khớp — nó `process.exit(EXIT_BLOCK)` thẳng
thay vì gọi `block()`. Không ai phát hiện, vì **chưa test nào chạm nhánh đó**.

Và nó **có thể đúng khi khác**: đây là `PostToolUse` — file đã ghi xong, nên *"BỊ CHẶN"* là một
câu **sai sự thật**. Hợp đồng kia mã hoá ngữ nghĩa `PreToolUse` vào một chuỗi ký tự.

Nới hợp đồng (`/BỊ CHẶN/` → `/⛔/`) sẽ làm **ca mới của chính tôi** xanh, bằng cách làm yếu một
check đang đúng với tất cả các ca khác. **Không làm.** Quyết định *"hook PostToolUse nói gì khi
từ chối"* là hợp đồng output của harness ⇒ việc của DRI → **issue #54**. Mutant vẫn khẳng định
được phạm vi, nên không mất gì.

### ④ Vì sao mốc dừng ở 1, không phải 0

Còn `session-start.mjs`. Nó **không có phép kiểm nào** để chứng minh — nó chỉ **in**. Mutant trả
lời câu *"phép kiểm này có thật không"*; hook không có phép kiểm thì câu hỏi vô nghĩa, và một
mutant gượng ép chỉ khẳng định được *"đoạn in này chưa chết"*.

Nên mốc này **không về 0 bằng cách viết thêm test**. Nó về 0 khi DRI quyết định mẫu số chỉ gồm
hook **có nhánh chặn**. Ghi ra thay vì nặn một mutant vô nghĩa để lấy con số đẹp.

**Sàn test:** 134 → **136**.

---

## 2.20.0 — 2026-08-06

**minor.** `entropy-scan` nói hai chuyện khác nhau tuỳ hệ điều hành — **Parity Contract**.

### Triệu chứng

Trên Windows 11, mỗi lần chạy `node tooling/entropy-scan.mjs`:

```
WARN \.claude\rules\danger-zones.md: thiếu `paths` — thuế context cho MỌI người ở MỌI request
WARN \.claude\rules\README.md: thiếu `paths` …
WARN \.claude\rules\README.md: thiếu `owner` …
WARN \.claude\rules\README.md: thiếu `expires-review` …
WARN \.claude\rules\README.md: thiếu `why` …
```

Trên Linux/macOS: **im lặng**. Hai file đó **đã nằm trong `GLOBAL_OK`** ngay phía trên vòng lặp,
từ đầu.

### Nguyên nhân

```js
const name = f.split('/').pop();     // f do walk() dựng bằng join()
```

Trên Windows `f` là `...\rules\README.md`, không có ký tự `/` nào — nên `split('/')` trả về
**nguyên đường dẫn**, và `GLOBAL_OK.includes(<cả đường dẫn>)` không bao giờ đúng. Allowlist
tồn tại, đúng nội dung, và **chưa từng chạy** trên một trong ba OS bắt buộc.

Cùng lỗi ở `rel()` (dòng 35) làm mọi đường dẫn in ra thành `\.claude\...` — thừa một dấu gạch,
đúng cái đầu mối lẽ ra phải khiến ai đó nhìn kỹ hơn.

### Vì sao nó tệ hơn "chỉ là nhiễu"

Nó **không làm gì đỏ cả** — nên không ai sửa. Nhưng:

- `harness-doctor` đếm **1** rule không có `paths`; `entropy-scan` trên Windows kể như **2**.
  Hai công cụ, hai sự thật, không gì báo.
- Năm cảnh báo vĩnh viễn dạy người ta bỏ qua **toàn bộ** output của công cụ này — và cảnh báo
  THẬT nằm cạnh chết chung. Đây là `knowledge/lessons/0003` tầng 1, ở một công cụ mà cả tầng
  chống-phình phụ thuộc vào.

### Sửa

`basename()` thay `split('/')`; `relative()` + chuẩn hoá POSIX cho `rel()`. Cùng lỗi ở
`evidenceFor()` (người Windows hay dán đường dẫn có `\`) cũng sửa luôn.

Kiểm lại các chỗ `split('/')` khác trong `tooling/`: **đều đúng** — chúng cắt *glob pattern*
hoặc *hằng chuỗi viết tay*, vốn luôn dùng `/`. `apply-to.mjs` thì đã chuẩn hoá sẵn bằng
`.split(sep).join('/')`. Chỉ `entropy-scan.mjs` cắt đường dẫn thật của hệ thống tệp.

### Test

Đọc `GLOBAL_OK` **từ nguồn** (chép lại là bản sao thứ hai sẽ trôi), chạy `entropy-scan` thật,
và khẳng định **không file nào trong allowlist còn xuất hiện trong output**. Ca này chỉ đỏ trên
Windows — đúng lý do CI chạy cả ba OS.

Đo lại: **5 cảnh báo vĩnh viễn → 0**. **Sàn test:** 133 → **134**.

---

## 2.19.0 — 2026-08-06

**minor.** Ratchet `hooks-without-mutant`: **6 → 3**. Và một trong ba bậc đó là sửa phép đếm.

Một mutant bị giết trả lời câu hỏi *"phép kiểm của cái gác này có THẬT không, hay nó chỉ đang
chạy?"*. Không có mutant thì một cái gác có thể đã thành trang trí từ lâu mà `harness-doctor`
vẫn hiện `✓` và `hookRan()` vẫn ghi `pass` đều đặn.

### ① `protect-tests.mjs` — bảng đếm rỗng

Phạm vi thật của hook này **không** phải bộ lọc `IS_TEST` mà là **hai bảng regex đếm**. Nếu
chúng không khớp gì, mọi phép đếm ra 0, `0 < 0` là false, và hook chạy bình thường mà **không
bao giờ chặn nữa** — cùng hình dạng với `DENY` rỗng ở `dcg`. Mutant chứng minh: xoá sạch test
trong `tooling/fixtures/example.test.js` thì **lọt**.

### ② `protect-migrations.mjs` — `paths.migrations` bị vô hiệu

Mutant cần commit fixture *"đã merge"* dựng ở bước setup, nên `mutate()` giờ nhận `env` với
giá trị **lười tính** (hàm), giống bảng `cases` đã làm từ trước.

### ③ Phép đếm bỏ sót dạng mutant thứ hai — `observe.mjs` bị tính oan

Bộ đếm chỉ nhìn trong khối `const MUTANTS = [...]`. Nhưng có **hai** dạng mutant:

- **dạng bảng** — khai trong mảng, chạy qua `mutate()`;
- **dạng rời** — viết tay khi mutant cần bối cảnh riêng. `observe.mjs` phải xoá mẩu bánh mì rồi
  bắn một sự kiện `StopFailure` trước khi kiểm, thứ bảng không diễn đạt được.

`observe.mjs` **có** một mutant thật đang bị giết mỗi lần chạy suite, nhưng bị đếm là *"chưa
có"* — **vĩnh viễn**. Sai theo chiều an toàn (bi quan), nhưng hậu quả nặng hơn nó nghe: mốc này
**không bao giờ về 0 được**, trong khi chính file khai `ĐIỀU KIỆN THOÁT: một mốc về 0 → xoá dòng
đó`. **Một ratchet không thể về 0 thì không phải ratchet — nó là một dòng trang trí vĩnh viễn.**

Đo lại: `6 → 3`. Ba hook còn lại (`block-generated-edit`, `post-edit-lint`, `session-start`)
là hook **cố vấn**, không phải gác chặn — mutant cho chúng có hình dạng khác, chưa làm.

**Sàn test:** 131 → **133**.

---

## 2.18.0 — 2026-08-06

**minor.** `/verify-ui` thôi vô hình, và mục `?` thôi giấu tên.

### ① `/verify-ui` giờ có nghi thức — và `paths.ui` chưa bao giờ cần thiết

2.15.0 đo được 9 skill `disable-model-invocation: true` (chỉ người gõ được), trong đó **2 cái
không có bất kỳ cơ chế nào nhắc tới**. `/harness-propose` đã được sửa ở 2.15.0. `/verify-ui`
thì bị hoãn với lý do: *"nó cần khai `paths.ui` trong `harness.config.json` (vùng cấm)"*.

**Lý do đó SAI.** Tín hiệu đúng nằm ở `features/<id>.json → platforms.web` — chính artefact mà
skill này đọc ở bước 1 và ghi ở bước 5. Không cần `paths.ui`, không cần chạm vùng cấm nào.

Giả định "cần vùng cấm" đến từ chỗ **triệu chứng** (skill nói về UI, config nói về path), không
từ chỗ **dữ liệu** thật sự nằm. Cùng một lối nghĩ đã làm hỏng nháp đầu của 2.17.0 — hai lần
trong một ngày, nên nó được ghi thành `.claude/learnings/`.

Nghi thức khoá vào **issue của nhánh hiện tại**, không quét cả repo — quét cả repo thì mọi
project luôn có ít nhất một feature chưa xong ⇒ **đỏ vĩnh viễn**, và một mục đỏ vĩnh viễn dạy
người ta bỏ qua màu đỏ (`knowledge/lessons/0003` tầng 1). Khoá vào issue thì nó **tự tắt** khi
bạn xong.

Sáu trạng thái phân biệt được, và ca quan trọng nhất là `n/a`: project không làm web mà bị nhắc
chụp ảnh mỗi phiên sẽ tắt nghi thức — **mục đỏ sai làm hỏng mục đỏ đúng nằm cạnh nó**.

Không trùng `check-feature-integrity.mjs`: gate đó bắt chiều *"khai `passes: true` mà không có
bằng chứng"*. Nó im ở chiều ngược lại — *"còn nợ một tấm ảnh"* — và chiều đó mới cần NHẮC, vì
nó **không có triệu chứng nào khi bị bỏ qua**.

### ② Mục `?` nêu TÊN, không nêu số lượng

Bản ngắn in `? 2 nghi thức KHÔNG đo được` rồi bảo chạy `--all` để biết thêm.

Gặp thật 2026-08-06: một mục `?` hiện ở đầu phiên rồi **biến mất** trước khi kịp chạy `--all`.
Trạng thái `?` thường sinh ra từ một phép đo chập chờn (git bận, đường dẫn chưa sẵn) — tức đúng
loại hay tự khỏi. Nên *"chạy lại để xem"* là lời khuyên **không bao giờ trả lời được cho chính
ca nó được sinh ra để phục vụ**. Một cái tên tại chỗ rẻ hơn, và còn nguyên giá trị sau khi
triệu chứng đã qua.

> **CHƯA XONG MỘT NỬA, nói ra thay vì lặng lẽ.** `.claude/hooks/session-start.mjs:195` tự dựng
> dòng `?` của nó (nó `import` `evaluate()` chứ không gọi CLI), nên **banner đầu phiên vẫn chỉ
> đếm**. File đó thuộc `paths.harness`. Đây là ca DRI thật — khác hai ca ở trên, và lần này đã
> kiểm chứ không giả định.

### ③ `harness.version` thôi trôi khỏi changelog — một lỗi của chính hai bản vừa rồi

`harness.version` **không** phải một dòng trang trí. Nó là con số `apply-to.mjs` **đóng dấu**
vào `.claude/harness-manifest.json` của repo con, là mốc `consumers.mjs` so để biết ai đang tụt
lại, và là thứ `upstream.mjs` gắn vào mọi pack đi lên.

**2.16.0 và 2.17.0 bump changelog + tag mà QUÊN file này.** Nó vẫn ghi `2.15.0`. Hậu quả không
phải "một số hiển thị sai":

- repo con áp template hôm nay bị **đóng dấu 2.15.0** trong khi nhận code 2.18.0;
- `consumers.mjs` báo độ lệch **nhỏ hơn sự thật** — nó nói dối về đúng thứ nó tồn tại để đo;
- và cả hai đều **im lặng**, vì không có gì đối chiếu hai nguồn.

Ba nguồn version (file · changelog · git tag) mà không có ràng buộc nào giữa chúng thì chúng
**sẽ** trôi. `harness-doctor` đã đối chiếu file ↔ tag từ trước; đây là cạnh còn thiếu.
Test template-only (`HARNESS-CHANGELOG.md` nằm trong `NOT_FOR_CONSUMER` từ 2.14.0).

Đo lại sau khi sửa: `consumers.mjs` từ `SAU template (2.15.0)` → `SAU template (2.18.0)`.

**Sàn test:** 128 → **131**.

---

## 2.17.0 — 2026-08-06

**minor.** Không còn cách nào viết ra một **gác câm**.

Một gác CHẶN mà không để lại dòng nào tệ hơn một gác không chạy, và tệ theo hướng khó thấy: nó
chặn đúng, không ai phàn nàn, còn mọi bảng đo đọc nó là *chưa bao giờ bắt được gì*.

`/harness-retro` bước 4 **bắt buộc đề xuất cắt bỏ**, và nguyên liệu nó dùng là telemetry:

> **Gác càng đúng mà càng im thì càng dễ bị cắt.** Chọn lọc ngược — cơ chế dọn rác của harness
> ăn đúng những cái gác đang lặng lẽ làm việc.

Quét 2026-08-06: **9 lời gọi `block()`, 8 tự ghi sổ, 1 quên** — `protect-feature-files.mjs`
nhánh `features/_index.json`, tức gác single-writer của DRI. Nhánh còn lại của chính file đó thì
nhớ. Đó là hook DUY NHẤT bị `harness-doctor` đọc là `? chưa đo`.

### ① `block()` tự ghi sổ

`tooling/lib/harness.mjs` → `block()` giờ ghi `telemetry('gate-fails', [<tên hook>, <lý do>])`
trước khi exit 2. Tên hook suy từ `argv[1]`; không suy được thì ghi `(hook)` chứ **không đoán** —
một cái tên bịa trong sổ còn tệ hơn không có tên, vì nó gộp nhầm hai gác khi đếm.

### ② KHÔNG đếm hai lần

8/9 hook đã tự ghi kèm chi tiết mà chỉ chúng biết (issue nào, nhánh nào). `block()` **im** nếu
tiến trình đã ghi `gate-fails` rồi. Ngược lại thì mọi con số *"n lần chặn"* tăng gấp đôi — bản
vá sinh ra để cứu bộ đếm lại làm hỏng đúng bộ đếm đó.

### ③ Vì sao KHÔNG phải một ratchet

Nháp đầu là một test quét văn bản + `RATCHET = 1` cho chỗ đang trượt, với lập luận
*"`.claude/hooks/**` thuộc `paths.harness` nên phải để DRI sửa"*. Lập luận ấy đúng về vùng cấm
nhưng **sai về chỗ hỏng**: quy ước "nhớ ghi sổ trước khi chặn" trượt vì nó là *một thứ phải nhớ*,
và một ratchet đếm số lần quên không làm ai bớt quên.

Nguyên nhân nằm ở `tooling/lib/`, **không** thuộc `paths.harness`. Giả định "phải là DRI" đến từ
chỗ **triệu chứng** xuất hiện, không từ chỗ **nguyên nhân** nằm.

### ④ Test khẳng định HÀNH VI, không quét văn bản

Quét văn bản chỉ đo được *"ai nhớ gọi"* — sau bản vá thì không còn ai cần nhớ. Ba test mới:
`block()` một mình ⇒ đúng 1 dòng có tên gác · chỗ gọi đã tự ghi ⇒ `block()` im, giữ chi tiết
riêng · ca thật `features/_index.json` ⇒ exit 2 **và** có dòng mang tên nó.

**Đo lại:** `protect-feature-files.mjs` từ `? chưa đo` → `suite ✓`. Mục "Nên làm" của
`harness-doctor`: **3 → 2** (hai mục còn lại là lựa chọn cấu hình của project, không phải lỗi).
**Sàn test:** 125 → **128**.

---

## 2.16.0 — 2026-08-06

**minor.** Bước 1 của vòng học đếm SAI, và nó sai về phía dễ chịu.

`fixlog` gom các dòng bằng **6 từ đầu dài hơn 3 ký tự** — một phép nhóm *từ vựng* áp lên văn bản
người viết *tự do*. Nó chỉ gom được khi người viết tình cờ mở đầu giống nhau. Đo trên chính repo
này 2026-08-06:

```
5 mục fixlog  ⇒  5 nhóm đơn lẻ  ⇒  0 nhóm ★  ⇒  /harness-retro XANH
```

Trong khi **4/5 mục là cùng một gác** (`dcg` — hai triệu chứng ngược nhau, một gốc rễ), và
`.claude/learnings/2026-W32-dcg-khop-chuoi-khong-khop-lenh.md` **đã ghi rõ** chúng là một.
Ngưỡng promote ≥2 đã bị vượt từ lâu; bảng nghi thức báo "chưa nhóm nào đạt ngưỡng".

Hỏng theo **chiều nguy hiểm**: câu trả lời sai lại đúng là câu trả lời khiến không ai phải làm
gì. Cùng lớp với `hookRan()` ở 2.12.0 — *"không đo được"* tự thu về *"ổn"*.

### ① `--group`: người khai, máy áp dụng

```
node tooling/fixlog.mjs --group "<tên-nhóm>" "<vài chữ chung>"
```

Luật ghi vào `.claude/telemetry/fixlog-groups.log` (TSV, máy-này, không commit), áp cho **cả
dòng cũ lẫn dòng mới** — nên đường ghi fixlog vẫn là một câu tiếng Việt trong 3 giây, đúng thứ
làm nó được dùng thật. Luật **đầu tiên** khớp thì thắng ⇒ tất định.

**KHÔNG sửa bằng heuristic thông minh hơn** (stemming, trùng token, khoảng cách chuỗi). Gom nhầm
hai lỗi khác nhau thì **bịa ra** một nhóm ≥2 chưa từng có — nó *chế tạo bằng chứng*, hỏng theo
chiều tệ hơn hẳn chiều đang có. Phép gom là một **phán đoán**; bắt regex đoán hộ đúng là thứ
`AGENTS.md` dặn đổi từ *inferential* sang *computational control*.

### ② Gom thì được, gom LÉN thì không

`--top` đánh dấu nhóm thủ công bằng `⊕` và in **hết** các văn bản khác nhau nó đã gom. Một luật
quá rộng nuốt nhầm một lỗi khác sẽ **nhìn thấy được**, không im lặng. `--group` với từ khoá khớp
0 dòng thì **từ chối** — gõ nhầm mà ghi im lặng là một nút bấm không có tác dụng và không báo.

### ③ Hai bảng, một sự thật

`fixlog --top` và `rituals.mjs` trả lời cùng một câu hỏi *"nhóm nào đã ≥2 lần"*. Cả hai giờ đọc
cùng một tập luật, và `test-hooks.mjs` **chặn tại nguồn** mọi lời gọi `fixlogKey()` không truyền
luật — đúng lỗi mà comment ở `lib/harness.mjs` đã tiên đoán cho "bản sao thứ ba".

### ④ Một dòng xanh nói quá

`/harness-retro` khi xanh giờ nói rõ phép nhóm là **từ vựng**, thay vì để `"chưa nhóm nào đạt
ngưỡng ≥2"` đọc như *"không có gì lặp lại"*.

Và `/knowledge-promote` thôi nói `.claude/learnings/` là **"chỉ-máy-này-thấy"** — nó được
**commit** (`git ls-files` xác nhận). Cái thật sự mất là tính **mang đi được** sang repo khác.
Một lý do sai hướng vẫn khiến người ta hành động, nhưng vì một nguy cơ không có thật.

**Sàn test:** 122 → **125**.

---

## 2.15.0 — 2026-08-06

**minor.** Một quy trình chỉ chạy khi có người nhớ ra nó tồn tại thì nó **không tồn tại**.

Đo 2026-08-06: 9 skill có `disable-model-invocation: true` — tức **chỉ người gõ được**, agent
gọi thì vendor từ chối (2.1.222 còn siết thêm: Claude được bảo *"nhờ người chạy"* thay vì tự
diễn lại workflow). Trong 9 skill đó, **7 có nghi thức tự nhắc**, và **2 không có gì cả**:
`/harness-propose` và `/verify-ui`. Chưa skill nào trong nhóm này từng chạy kể từ khi harness
ra đời.

`/harness-propose` là con đường **hợp pháp duy nhất** để đổi vùng cấm (`.claude/hooks/`,
`settings.json`, `AGENTS.md`, `harness.config.json`). Một cánh cửa duy nhất, không biển chỉ dẫn.

### ① Nghi thức cho `/harness-propose` — tín hiệu đã có sẵn, không thêm cờ nào

Mỗi lần `protect-harness` chặn một lần sửa vùng cấm, nó **đã** ghi một dòng vào `gate-fails.log`.
Bị chặn **≥2 lần** nghĩa là *có thứ trong harness đang cản một việc thật* — đúng điều kiện mà
chính skill đó đòi ("agent làm sai cùng một thứ ≥2 lần, hoặc bị hook chặn mà bạn nghĩ hook sai").

Ngưỡng 2 khớp ngưỡng của skill: một lần là ngẫu nhiên, hai lần là một hình dạng. Hạ xuống 1 là
biến nó thành tiếng ồn ở **mỗi lần guard làm đúng việc của guard**.

`gate-fails.log` không đọc được ⇒ `?`, **không** phải "chưa lần nào bị chặn" — có test khoá,
vì gộp hai cái đó là làm câm nghi thức canh cánh cửa duy nhất vào vùng cấm.

Còn lại đúng `/verify-ui` chưa có cơ chế: nó cần khai `paths.ui` trong `harness.config.json`,
mà file đó **thuộc vùng cấm**. Nói ra thay vì lặng lẽ bỏ.

### ② `tooling/overlap-scan.mjs` — phần MÁY LÀM ĐƯỢC của `/claim` bước 3

`/claim` phải do người gõ, vì bước 3 của nó kết bằng *"KHÔNG tự quyết. Hỏi người."* — đó là
phán đoán phối hợp giữa người, không phải phép tính. Nhưng phần **đi tìm** thì thuần cơ học:
đọc PR đang mở, đối chiếu `paths.hot`, đọc `reservations/`. AGENTS.md đã nói đúng hướng từ đầu:
*"Phần máy làm được thì máy đã làm; `/claim` giữ lại đúng phần cần phán đoán."*

Tách thành script để **agent chạy được phần dò** rồi đưa người kết quả — thay vì người phải nhớ
gõ `/claim` mới biết mình đang giẫm chân ai. Đo được: `/claim` chưa chạy lần nào, nên bước 3
trên thực tế **chưa từng được thực hiện**.

Khác `check-reservations.mjs`: cái kia là guard ở **pre-commit** — bạn đã viết code rồi nó mới
chặn. Cái này chạy **trước khi viết**, và nhìn rộng hơn (PR đang mở + vùng nóng, không chỉ
reservation). Hai đầu của cùng một việc.

**Nó không chặn gì bao giờ**, và có test khoá đúng bất biến đó: một công cụ cố vấn exit khác 0
là quả mìn — nó không nằm trong `gates`, nên ngày nào đó ai đó cắm nó vào pre-commit hay CI thì
một "cảnh báo" thành một lần chặn, và cách sửa nhanh nhất lúc ấy là gỡ nó ra.

Ba giá trị được giữ: `gh` chưa cài / chưa `auth login` / repo không có remote GitHub ⇒
**`?` KHÔNG ĐO ĐƯỢC**, không phải "đường quang". Đó là nhánh chồng lấn hay gặp nhất, và báo
xanh khi chưa hề nhìn thì nguy hiểm hơn là không có công cụ.

### Kết quả đo

| | trước | sau |
|---|---|---|
| skill người-gọi có cơ chế nhắc | 7/9 | **8/9** (còn `/verify-ui`, bị chặn bởi vùng cấm) |
| phần dò chồng lấn của `/claim` | chỉ chạy khi người gõ | **agent chạy được** |
| `test-hooks.mjs` | 116, sàn 116 | **121, sàn 121** (+5) |

---

## 2.14.0 — 2026-08-06

**minor.** Ba mục, một câu hỏi: *cái gì nên đi xuống repo con?*

Tiêu chí đúng **không phải** "cái này có liên quan tới việc phát triển harness không" — theo
tiêu chí đó thì `tooling/test-hooks.mjs` (86 KB, thuần phát triển harness) phải ở lại, trong
khi repo con **chạy** nó mỗi lần `harness-doctor`. Tiêu chí đúng là: **ở repo con, có thứ gì
ĐỌC hoặc CHẠY nó không?**

`apply-to.mjs` đã áp tiêu chí đó khá kỹ — `IGNORE` có ~15 mục, mỗi mục kèm lý do viết ra, và
mấy mục hay nhất là những mục mà "tinh tuý" lại là lý do **không** ship: `claude-code-baseline.json`
bị giữ lại vì ship nó đi thì repo mới khởi đầu với *"đã rà xong"* cho một version họ không
chạy, tức nghi thức im đúng lúc cần kêu.

Nhưng hai file lọt lưới — và chúng là hai file **to nhất** trong toàn bộ payload.

### ① 210 KB lịch sử phát triển harness ở mỗi repo con, không ai đọc

Đo trên một repo con thật (v2.12.0, 2026-08-06):

| ship xuống repo con | kích thước | ai đọc ở đó |
|---|---|---|
| `HARNESS-CHANGELOG.md` | **120 KB** | **không ai** |
| `harness-migrations/` | **92 KB** | **không ai** |

Bằng chứng nằm trong `upgrade.mjs`, không phải suy luận:

```js
const changelogPath = join(TPL, 'HARNESS-CHANGELOG.md');   // dòng 123
const migDir        = join(TPL, 'harness-migrations');     // dòng 182
```

`TPL` là bản template người dùng trỏ tới bằng `--from`, **không** phải cây đang chạy. Hướng
dẫn cuối `upgrade.mjs` cũng viết *"đọc `HARNESS-CHANGELOG.md` **của template**"*. Cả hai nằm
trong `MECHANISM_PATHS` nên bị **ghi đè lại ở mỗi lần nâng cấp** — cập nhật đều đặn, phục vụ
không cơ chế nào phía nhận.

Cả hai chuyển sang `NOT_FOR_CONSUMER`, và vào `REMOVED_PATHS` để bia mộ (2.11.0) dọn chúng
khỏi repo đã áp. `tooling/test-migrations.mjs` **vẫn ship**: nó đã tự khai `n/a — không có
migration nào để test` khi thư mục vắng, nên bỏ thư mục không sinh ra dấu xanh rỗng nào.

Repo con muốn biết harness đổi gì: `.claude/whats-new.md` — SEED sinh ra đúng cho việc đó.

### ② Dấu hiệu nhận vai lại chính là thứ được ship

**Mục này nghiêm trọng hơn mục ①, và nó là hệ quả của ①.**

```js
if (exists('HARNESS-CHANGELOG.md') && exists('tooling/apply-to.mjs')) return 'template';
```

Cả hai vế **đều đi xuống repo con**. Nghĩa là mọi repo tiêu thụ đều mang đủ giấy tờ để bị
nhận nhầm là template; thứ duy nhất ngăn điều đó là `.claude/harness-manifest.json` được xét
**trước**. Một phép nhận dạng mà bằng chứng dương tính của nó có mặt ở cả hai phía thì không
phân biệt được gì — nó đang được cứu bởi thứ tự câu lệnh.

Và "có harness mà không có manifest" **không phải giả thuyết**: `harness-migrations/010` có
hẳn một nhánh cho nó (*"repo áp bằng đường khác ⇒ không có manifest ⇒ không xoá gì"*). Rơi
vào đó thì repo con tự nhận là template, và **mọi thứ hạ cấp theo vai template sẽ im** — kể
cả dòng CHẶN `commands rỗng ⇒ GATE KHÔNG TỒN TẠI`, ở đúng nơi nó cần kêu nhất. 2.13.0 còn
làm nó **êm hơn**: placeholder ở template giờ in dấu `✓` thay vì xuống "Nên làm".

Dấu hiệu mới là `tooling/cli.mjs` — điểm vào `npx github:…` của template, nằm trong `IGNORE`
với lý do viết sẵn (*"ở project đích nó không có việc gì làm"*), nên **không thể** xuất hiện
ở repo con qua đường chính thức. Đó là điều kiện cần của một dấu hiệu nhận vai: **chỉ tồn tại
ở đúng một phía**. Mất nó ⇒ `unknown` ⇒ `harness-doctor` CHẶN kèm thông báo, chứ không nhận
nhầm vai trong im lặng.

Bất biến đó giờ là **check tất định**, không phải trí nhớ: một test đối chiếu mọi đường dẫn
mà `repoRole()` dùng làm dấu hiệu "template" với `MECHANISM_PATHS`, và đỏ nếu có giao nhau.
Nó bắt được lỗi ngay trong lần chạy đầu tiên — bản vá đầu vẫn để `cli.mjs && apply-to.mjs`
cho "chắc ăn", mà `apply-to.mjs` thì được ship, nên vế đó đúng ở cả hai phía và không bảo vệ
gì. Còn một test nữa đối chiếu `NOT_FOR_CONSUMER` với `MECHANISM_PATHS`: hai danh sách nói
ngược nhau thì `MECHANISM_PATHS` là cái thắng, và không ai biết.

### ③ Bia mộ thêm sau 2.11.0 chưa từng có một dòng test nào

Phát hiện khi viết mục ①. Hai ca test của `migration 010` gọi `up()` **không truyền `tplPath`**,
nên migration rơi về **danh sách NHÚNG** (`[whats-new]`) — tức mọi bia mộ thêm về sau chạy qua
suite mà **không được khẳng định gì**. Thêm hai bia mộ ở bản này, suite vẫn xanh, và chưa từng
chạy chúng lần nào.

Ca thứ ba truyền `tplPath` để migration đọc `REMOVED_PATHS` **thật**, và khẳng định ba hình
dạng — vì đây là migration DUY NHẤT được phép xoá file ở repo người khác:

| | khẳng định |
|---|---|
| `HARNESS-CHANGELOG.md` | xoá được một **file lẻ ở gốc repo** |
| `harness-migrations/` | xoá được **cả một thư mục** |
| `docs/cua-project.md` | và **DỪNG TAY** ở file của project (không có trong manifest) |

Fixture đi kèm được sinh bằng `tooling/fixtures/make-fixture-2.14.0.mjs`, **có commit**. Fixture
này neo vào `sha` trong manifest: sai một ký tự thì migration coi là *"người dùng đã sửa"* ⇒
không xoá ⇒ **fixture xanh mà không kiểm được gì**. Fixture 2.11.0 đã giải đúng rủi ro đó bằng
một script — nhưng script đó nằm trong `scratchpad/`, không được commit, nên không ai dựng lại
được. Cái này nằm trong repo.

### Với repo đã áp template

Nâng lên 2.14.0 sẽ **xoá** `HARNESS-CHANGELOG.md` và `harness-migrations/` khỏi repo bạn —
chỉ khi chúng còn **nguyên như harness đặt** (so `sha` với manifest). Bạn có sửa ⇒ giữ lại và
báo. Không mất gì đọc được: changelog đầy đủ luôn nằm ở bản template.

### Kết quả đo

| | trước | sau |
|---|---|---|
| payload xuống repo con | — | **−210 KB, −13 file** |
| dấu hiệu "template" bị ship | 2/2 | **0/1** |
| `test-hooks.mjs` | 113, sàn 113 | **116, sàn 116** (+3) |

---

## 2.13.0 — 2026-08-06

**minor.** Sáu mục, một chủ đề: **công cụ đo nói sai về chính nó**. Không mục nào là cơ chế
mới — tất cả là những chỗ mà một cái gác đang làm việc bị báo cáo là im lặng, một cái gác đang
im lặng được báo cáo là ổn, hoặc một lời khẳng định đứng ở chỗ đáng lẽ phải có một phép đo.
Cả sáu đều đo được trên chính repo này ngày 2026-08-06, với `harness-doctor` mở đầu bằng
**19 dòng "Nên làm"** mà **15 dòng không ai được phép làm**.

### ① `$comment_*` bị đếm là LỆNH — nên cảnh báo to nhất của cả hệ bị câm

**ĐÂY LÀ MỤC ĐÁNG ĐỌC, và nó chạm MỌI repo đã áp template.**

`init.mjs` và `harness-doctor.mjs` cùng hỏi *"đã khai lệnh nào chưa?"* và cùng trả lời bằng
`Object.entries(cfg.commands).filter(([, v]) => v.trim())`. Trong `harness.config.json` của
template, mọi lệnh thật là `""` và **đúng một key có giá trị**: `$comment_a11y_perf` — một
dòng chú thích dài.

Hệ quả, với cấu hình mặc định **không ai điền gì**:

| công cụ | in ra | đáng lẽ |
|---|---|---|
| `init.mjs` | `OK 1 lệnh đã khai: $comment_a11y_perf` | `FAIL commands rỗng — việc SỐ 1` |
| `harness-doctor` | `✓ 1 lệnh đã khai: $comment_a11y_perf` | `CHẶN — GATE KHÔNG TỒN TẠI` |

Nhánh `!length` **chưa từng chạy ở bất kỳ repo nào**, nên dòng cảnh báo to nhất trong cả
harness — *"Harness này đang chỉ là trang trí, và BẠN là verification loop"* — im lặng từ
phút đầu tiên của mọi lần áp template. Cửa thoát nguy hiểm nhất không phải cửa ai đó mở,
mà cửa không ai biết mình đã đi qua.

Quy ước `$comment_*` đã dùng khắp `harness.config.json`; chỗ này là nơi duy nhất quên tôn
trọng nó. Phép đếm giờ nằm ở **một chỗ**: `declaredCommands(cfg)` trong `lib/harness.mjs`.

> **Với repo đã áp template:** sau khi nâng lên 2.13.0, nếu bạn chưa khai lệnh nào thật,
> `harness-doctor` sẽ **CHẶN** ở chỗ trước đây nó cho ✓. Đó không phải hồi quy — đó là
> câu trả lời đúng, lần đầu tiên.

### ② "Chạy `test-hooks.mjs` để lấy bằng chứng" là một NGÕ CỤT

`harness-doctor` báo *"hook này chưa có BẰNG CHỨNG nó chạy — chạy `node tooling/test-hooks.mjs`"*
cho **7/10 hook** ở mỗi lần chạy. Nhưng suite **cố ý** chuyển telemetry sang thư mục tạm
(2.9.0 — không chuyển thì suite tự bơm số vào bộ đếm mà `/harness-retro` bước 4 dùng để đề
xuất **cắt bỏ**). Nên làm đúng lời khuyên, kết quả **không đổi**, mãi mãi.

Bằng chứng vẫn luôn tồn tại — chỉ nằm ở thư mục kia. Và `harness-doctor` **chạy chính suite
đó** như bước đầu của nó, nên khi tới mục này, dấu vết spawn thật của các hook vừa được ghi
xong. Doctor giờ đọc cả hai nguồn, và **không gộp chúng**:

| cột | nghĩa |
|---|---|
| `N qua · M chặn` | hook đã **gặp ca của nó** trong việc thật |
| `suite ✓ · ca thật chưa tới` | hook **chạy được**, không crash im lặng |
| `? chưa đo` | không có gì ở **cả hai** nơi — lúc này im lặng mới là câu hỏi |

Đường dẫn thư mục là **một hằng số ở `lib`** (`TEST_TELEMETRY_DIR`), không phải chuỗi viết
tay hai nơi, và có test chặn việc quay lại viết tay.

**Và bằng chứng phải MỚI.** `tmpdir()` sống dai hơn một lần chạy, nên nếu chỉ đọc thư mục đó
mà không hỏi *"dòng này từ bao giờ"*, thì một lần chạy suite **hôm qua** vẫn đọc là `suite ✓`
hôm nay — kể cả khi hôm nay suite crash, bị gỡ khỏi danh sách check, hay ai đó đảo thứ tự hai
bước. Đó lại đúng lớp lỗi mà cả mục này sinh ra để diệt, chỉ đổi chỗ đứng. `tallyLines()` chỉ
đếm dòng sinh ra **sau mốc bắt đầu của chính tiến trình đang hỏi**, nên `suite ✓` có nghĩa hẹp
và kiểm được: *hook này đã spawn thành công TRONG lần chạy này*. Mất bằng chứng thì tụt về `?`,
không tụt thành một lời khẳng định sai. Dấu thời gian không đọc được cũng **không** được đếm —
`?` không được cộng vào một con số.

**Nó tìm ra ngay một cái thật:** `protect-feature-files.mjs` không để lại dòng nào ở **cả
hai** nơi. Nhánh chặn `features/_index.json` — guard chống single-writer — gọi `block()`
mà **không** gọi `telemetry('gate-fails')` trước đó, và `block()` không tự ghi sổ. Nó chặn
thật, nhưng chặn **vô hình**: `/harness-retro` bước 4 nhìn vào sẽ thấy một cái gác chưa bắt
gì bao giờ và đề xuất cắt nó. `.claude/hooks/**` là vùng cấm sửa nên mục này đi đường
`/harness-propose`, chưa vá ở bản này — đã ghi fixlog.

### ③ Nghi thức `claude-code-drift` đứng `?` vĩnh viễn trên mọi máy cài bằng npm

`claudeCodeVersion()` chỉ đọc được layout có version nằm trong đường dẫn
(`…/versions/2.1.221`). Cài bằng npm thì `CLAUDE_CODE_EXECPATH` trỏ vào
`…/node_modules/@anthropic-ai/claude-code/bin/claude.exe` — đoạn cuối là **tên file**.

"Không đoán" là đúng; nhưng nó đã bị hiểu thành "không đo", và lời giải thích đi kèm còn
**sai sự thật**: *"cách cài không đặt biến này"* — trong khi biến **có** được đặt. Một mục
`?` kèm lý do nghe-đã-xong thì không ai đi tìm tiếp.

Thêm **nguồn thứ hai, vẫn là bằng chứng trên đĩa**: `version` trong `package.json` của đúng
gói `@anthropic-ai/claude-code` chứa binary đó. Không thấy gói ⇒ vẫn `null`, vẫn `?` — và
lý do giờ nói rõ **đã thử nguồn nào**. Chỗ ĐỌC và chỗ GHI baseline dùng chung một phép đo.

*Đo ngay sau khi vá: máy này chạy 2.1.222, baseline ghi 2.1.221 ⇒ nghi thức chuyển từ `?`
sang **tới hạn**. Một việc thật đã bị một phép đo hỏng giấu đi.*

### ③b `/pre-merge` in một lý do mô tả phép đo CHƯA TỪNG XẢY RA

Nghi thức `/pre-merge` in *"N commit đi trước, và **chưa thấy dấu gate preMerge chạy ở phiên
này**"*. Nhưng `collect()` **không đi tìm dấu nào cả** — và không thể tìm, vì `gates.mjs` chỉ
ghi telemetry khi **HỎNG**. Một lần chạy xanh không để lại gì.

Nên nghi thức đỏ theo đúng `ahead > 0` và **ở đỏ mãi**: chạy gate bao nhiêu lần cũng vậy. Câu
chữ thì nói rằng nó đã nhìn. Đây là cùng lớp lỗi với ①/② — một lời khẳng định đứng ở chỗ đáng
lẽ phải có một phép đo — và nó dạy đúng thứ nguy hiểm nhất: **mục này đỏ cũng không sao**.

Hai đầu cùng sửa:

- `gates.mjs` ghi `gate-runs` **kể cả khi xanh** (`pass`/`fail`, kèm `ok= skip= ms=`). Đây đúng
  ba trạng thái mà `hookRan()` đã tách cho hook từ 2.12.0, chỉ là gate chưa được hưởng: *gate
  chạy suốt và luôn xanh · gate chưa từng chạy · gate chạy hỏng*. Cái ở giữa là cái nguy hiểm.
- Nghi thức so **HAI mốc**, không phải một: lần chạy gate gần nhất so với **commit mới nhất**.
  Chạy gate rồi commit thêm ⇒ lần chạy đó không còn nói gì về cây hiện tại ⇒ vẫn tới hạn, kèm
  số phút lệch. Thiếu một trong hai mốc ⇒ `?`, **không** phải `ok`.

### ④ `init.mjs` gọi placeholder của template là FAIL — `harness-doctor` gọi nó là ĐÚNG

Hai công cụ, một repo, hai phán quyết ngược nhau về **cùng một dòng**. `node tooling/init.mjs`
— lệnh ngày đầu trong `AGENTS.md` — kết thúc bằng *"Chưa sẵn sàng"* và một dòng FAIL **không
ai được phép sửa**, ở chính repo dạy người khác rằng gác phải nói thật.

`init.mjs` giờ biết `repoRole()`. Và ở `harness-doctor`, placeholder không còn bị **hạ cấp**
xuống "Nên làm" ở template — nó **biến mất**: một danh sách việc chứa việc *không được phép
làm* dạy người đọc bỏ qua cả danh sách, mà đó là danh sách duy nhất ở đây có quyền đòi hành động.

### ⑤ Bia mộ bị chính check "tham chiếu chết" báo đỏ

Check tham chiếu chết loại trừ changelog · whats-new · ADR · learnings vì chúng là **hồ sơ
lịch sử** — nhắc tên thứ đã xoá là việc của chúng. Cơ chế bia mộ (2.11.0) thêm hai hồ sơ lịch
sử nữa, chỉ khác là chúng viết bằng **code**: `REMOVED_PATHS` và migration thi hành việc xoá.
Từ 2.11.0 check báo đỏ vĩnh viễn về hai file đang làm đúng việc của mình — 2/2 tham chiếu còn
lại đều thuộc nhóm này, tức mục advice đó **100% dương tính giả**.

`isRecordedRemoval(name, file)` loại trừ theo **cả tên lẫn file**. Bỏ điều kiện file thì
`docs/TEAM.md` nhắc skill đã xoá cũng lọt — đúng ca check này sinh ra để bắt. Bỏ điều kiện
tên thì migration nhắc tên bịa nào cũng lọt.

### Kết quả đo

| | trước | sau |
|---|---|---|
| `harness-doctor` → "Nên làm" | 19 | **4** (mọi mục còn lại đều hành động được) |
| trong đó dương tính giả | 15 | **0** |
| `rituals --all` → mục `?` | 1 (không đo được) | **0** — và lộ ra 1 việc thật |
| `test-hooks.mjs` | sàn 101 | **113 khẳng định, sàn 113** (+12) |

Không có file nào trong `.claude/hooks/**` bị sửa ở bản này.

---

## 2.12.0 — 2026-08-05

**minor.** Ba mục, tất cả lấy từ đợt nghiên cứu repo `fleet` bên cạnh. Mục ① là **lỗ hổng
bảo mật đo được**, không phải cải tiến.

### ① Một cái gác ném lỗi giờ CHẶN, thay vì im lặng cho qua

**ĐÂY LÀ MỤC ĐÁNG ĐỌC.** Một ngoại lệ ở bất cứ đâu trong hook làm tiến trình thoát mã **1**,
và Claude Code đọc mọi mã khác 0/2 là *"lỗi không chặn"* ⇒ **tool call ĐI QUA**. Đo trên
harness 2026-08-05 bằng cách tiêm lỗi ngay sau `import`, trước mọi phép kiểm:

| hook | payload | sạch | ném lỗi |
|---|---|---|---|
| `block-secrets` | `sk-ant-…` thật vào `config.ts` | `exit=2` | `exit=1` ⇒ **LỌT** |
| `dcg` | `git push --force origin main` | `exit=2` | `exit=1` ⇒ **LỌT** |
| `dcg` | `rm -rf /` | `exit=2` | `exit=1` ⇒ **LỌT** |
| `protect-harness` | ghi `.claude/settings.json` | `exit=2` | `exit=1` ⇒ **LỌT** |

Cả bốn cái gác của **ba nhóm nguy hiểm** đều fail-OPEN. Và nó im theo một cách riêng:
`hookRan()` nằm ở CUỐI hook nên crash không ghi gì, và `harness-doctor` đếm 0 — đọc y hệt
*"gác này chạy suốt mà chưa bắt gì"*. Ba tình huống gộp thành một: gác đang làm việc · gác
không được cắm · gác đang crash.

`declareFailMode(code, why)` ở `lib/harness.mjs` biến việc đó thành **lựa chọn có viết ra**:

- **mode 2 — fail-CLOSED** (6 hook): `block-secrets` · `dcg` · `protect-migrations` ·
  `protect-harness` · `protect-tests` · `protect-feature-files`.
- **mode 1 — fail-open NHƯNG HIỆN RA** (4 hook): `block-generated-edit` · `post-edit-lint` ·
  `observe` · `session-start`. Với hook cố vấn, exit 1 vốn ĐÃ đúng: tool đi qua *và* lỗi hiện
  ra. Ép chúng về 0 là giấu crash đi.
- Crash được ghi vào `hook-runs.log` với outcome `crash` — không còn đọc thành "chưa bắt gì".
- **Cửa thoát `HARNESS_FAIL_OPEN=1`**, được ghi log. Mọi hook import cùng một lib, nên một lỗi
  trong lib làm MỌI hook fail-closed cùng lúc (config sai cú pháp là ca thực tế nhất). Một lỗ
  hổng được khai báo thì cãi lại được; một vụ khoá cứng im lặng thì không.

### ② Nghi thức thứ 9: Claude Code lên bản mới ⇒ hỏi MỘT câu

`claude-code-drift` so version đang chạy (`CLAUDE_CODE_EXECPATH`) với `.claude/claude-code-baseline.json`.
Khác ⇒ tới hạn, kèm cả hai số. Câu hỏi: *bản mới có ra sẵn thứ harness đang tự viết không?*

`fleet` bỏ ~6 phiên xây "auto-pilot" tháng 6/2026 — nó chạy được — rồi **xoá sạch** ngày
2026-07-28 vì Claude Code đã ra sẵn scheduled agents. Không bước nào trong quy trình đi kiểm
lại tiền đề. Harness tự viết rất nhiều nên phơi ra đúng rủi ro đó.

Đây là **nghi thức, không phải hook mới** — một hook mới cần sửa `settings.json` ở mọi repo đã
áp, tức một migration đăng ký, tức ba bước có thể hỏng để mua một câu hỏi. `rituals.mjs` đã
được SessionStart gọi sẵn.

```
node tooling/rituals.mjs --reviewed-claude-code "<thấy gì>"
```

Lý do BẮT BUỘC: một baseline bị bump lặng lẽ không phân biệt được với việc chưa ai đọc.
**File baseline KHÔNG được ship** — bản rà của template không nói gì về máy của project khác,
nên repo mới thấy mục này `due`, và đó là câu trả lời đúng.

### ③ Điều CẤM viết ra phải khớp điều guard CƯỠNG CHẾ

`harness-doctor` đối chiếu `paths.harness` với dòng **KHÔNG sửa** trong `AGENTS.md`, hai chiều.
Đo được ngay lần chạy đầu: guard cưỡng chế **8** lớp, văn bản nêu **5**. Ba lớp —
`.claude/rules/**`, `CLAUDE.md`, `.github/CODEOWNERS` — bị chặn mà **chưa từng được nói ra**;
người đọc `AGENTS.md` tưởng sửa được rồi bị chặn bởi một luật chưa đọc. Đã bổ sung cả ba.

`fleet` đo cùng hình dạng 2026-08-01: `CLAUDE.md` ghi 7, gate giữ 12, và `.claude/agents/**`
không có ở **cả hai** — system prompt của subagent, không ai gác, suốt thời gian nó tồn tại.
Lớp đó là mutant của test này.

### Xác minh

`test-hooks` **101/101, sàn 89 → 101** · `test-migrations` exit 0 · `test-evals` exit 0 ·
`apply-to --audit` 153 file được phủ. Ratchet `hooks-without-mutant` hạ **7 → 6** cùng commit.
Mục ① được kiểm bằng **tiêm lỗi thật vào bản sao của hook**, không bằng cách quét mã nguồn —
`declareFailMode` có xuất hiện hay không là sự CÓ MẶT của một dòng chữ, không phải HÀNH VI.

---

## 2.11.0 — 2026-08-05

**minor.** Lớp phân phối biết **XOÁ**, và fixlog biết **ĐÓNG**. Hai lỗ hổng cùng một hình
dạng: cơ chế chỉ đồng bộ **một chiều**, nên trạng thái *"đã xong"* không bao giờ tới nơi.

### ① Thứ template đã bỏ vẫn nằm ở project — sáu version

`/whats-new` bị cắt khỏi template ở **v2.4.0** (commit `21834ca`) và vẫn có ở **cả ba** repo
tiêu thụ. Nó đẩy cả ba lên **13 skill trên trần 12**, nên `entropy-scan` báo đỏ ở mọi phiên về
một thứ mà project **không gây ra và không sửa được bằng cách nâng cấp**. Đó là dạng đỏ tệ
nhất: đỏ **đúng**, nhưng không ai sửa được từ phía mình.

Chiều ngược của lỗ hổng đã sửa ở 2.8.0 (sự kiện hook mới không tới được repo cũ) — cùng nguyên
nhân: lớp phân phối chỉ biết **thêm** và **sửa**.

`REMOVED_PATHS` trong `lib/harness.mjs` là **bia mộ**: mỗi dòng ghi rõ version nào đã bỏ và vì
sao. `harness-migrations/010` xoá chúng ở project — và đây là migration **duy nhất xoá file**,
nên nó có **hai điều kiện an toàn**:

1. **Chỉ xoá thứ có tên trong bia mộ.** Không suy luận *"có ở đích mà không có ở template"* —
   phép đó không phân biệt được *harness đã bỏ* với *project tự thêm* và *công cụ khác cài
   vào* (`prisma init` đổ 9 skill vào `.claude/skills/`, có thật trong fixlog của `warehouse`).
   Suy luận ở đây nghĩa là xoá nhầm file của người dùng.
2. **Chỉ xoá khi file còn nguyên** — so `sha` với manifest. Người dùng đã sửa ⇒ **giữ lại** và
   nói ra. Một migration xoá đè lên chỉnh sửa của người dùng làm cả cơ chế nâng cấp mất tín
   nhiệm, và mất tín nhiệm thì lần sau không ai nâng nữa.

Hợp đồng của `test-migrations` không nói được điều quan trọng nhất ở đây — `expect` khẳng định
được nội dung một file **còn tồn tại**, không khẳng định được **sự vắng mặt**, mà vắng mặt mới
là hành vi của migration này. Nên nó có test riêng cho **cả hai nhánh**: xoá đúng thứ + giữ
skill của project; và file đã bị sửa ⇒ giữ lại kèm cảnh báo.

### ② Một nhóm fixlog ≥2 lần đỏ VĨNH VIỄN

fixlog chỉ biết **ghi thêm**, không biết việc đã được xử. Đo ở `sakubun`: nhóm *"gen-clean chẩn
đoán sai"* đạt 2 lần và **đã được sửa ở template v2.10.0** — nhưng fixlog cục bộ không biết,
nên `rituals` sẽ nhắc `/harness-retro` **mãi mãi**.

Cùng hình dạng với bug đếm pack vừa sửa ở 2.10.4: **đếm cái TỒN TẠI thay vì cái CHƯA XỬ**.

```
node tooling/fixlog.mjs --close "<vài chữ trong mục>" "<đã xử lý thế nào>"
```

Khớp theo **văn bản**, không theo số thứ tự — thứ tự trong `--top` đổi mỗi lần có dòng mới, nên
`--close 2` hôm nay và ngày mai là hai nhóm khác nhau. Khớp 0 hoặc >1 nhóm thì **từ chối** kèm
danh sách ứng viên: đóng nhầm nhóm là làm tắt một cảnh báo đang đúng. Lý do là **bắt buộc** —
một nhóm bị đóng mà không ghi vì sao thì lần sau không ai dựng lại được quyết định. `--top` in
`✔` cho nhóm đã đóng kèm ngày và lý do; mục fixlog **vẫn giữ nguyên** làm bằng chứng.

### ③ Phép nhóm fixlog: ba bản sao → một nguồn

`fixlogKey()` chuyển vào `lib/harness.mjs`. Ba nơi dùng nó: `--top` (hiển thị), `rituals`
(đếm), `--close` (đóng). Ba bản sao là ba cơ hội lệch nhau — và khi lệch thì `--close` đóng một
khoá mà `--top` không bao giờ sinh ra: **nút "đã xử lý" bấm vào không có tác dụng, và không có
gì báo**. Bản sao thứ hai đã tồn tại từ 2.10.0 kèm một comment tiên đoán đúng chuyện này;
comment không ngăn được bản sao thứ ba, gộp lại thì ngăn được.

`RATCHET` 87 → **89**.

## 2.10.4 — 2026-08-05

**patch.** `rituals.mjs` đếm pack **CHƯA ĐƯỢC QUYẾT**, không đếm pack **tồn tại**.

Pack là **snapshot** — `upstream --apply` sinh lại nó mỗi lần chạy. Bản 2.10.0 đếm số thư mục
trong `knowledge/incoming/`, nên ngay sau khi quyết xong và dọn, lần chạy `upstream` kế tiếp
dựng lại pack cũ và mục này **đỏ lại**.

Một mục đỏ vĩnh viễn dạy đúng thứ `rituals.mjs` ra đời để diệt: người đọc học rằng bảng này có
một dòng đỏ *"bình thường"*, và sau đó một dòng đỏ **thật** lẫn vào giữa mà không ai thấy. Đây
là tầng 1 của `knowledge/lessons/0003` (*"đỏ giả làm người ta bỏ qua màu đỏ"*), lần này ở chính
cái bảng vừa được xây để chống nó.

Neo là **`sourceCommit`** của pack — commit của repo GỬI. Repo đó không đổi thì commit không
đổi, nên *"đã quyết"* là trạng thái **bền**. Repo đó có fixlog mới ⇒ commit mới ⇒ mục đỏ lại,
và lần đó thì nó **đúng**. Không đọc được commit ⇒ coi là **chưa quyết**: thà nhắc thừa một lần
còn hơn im lặng bỏ qua nguyên liệu đi lên, vì chiều LÊN là chiều dễ tắt nhất của vòng học.

Ba pack hiện tại đã được ghi `REVIEWED` kèm commit trong `knowledge/DECISIONS.log`, nên bảng
nghi thức ở template giờ **không còn mục nào tới hạn** — trạng thái đúng, không phải trạng thái
được làm cho im.

## 2.10.3 — 2026-08-05

**patch.** Bỏ **proxy**, đo **trực tiếp**. Guard chống nghịch lý bootstrap không còn quét
`import` trong nguồn.

Bản 2.10.1 kiểm bằng cách quét `import` tương đối. Nó bắn nhầm **hai lần liền**:

| Lần | Khớp phải cái gì |
|---|---|
| 2.10.1 | đoạn **comment** giải thích chính nó, nêu ví dụ một đường dẫn tương đối |
| 2.10.2 | **chuỗi trong fixture test** — `"import a from './that.mjs'"` |

Lần thứ hai **không sửa được bằng cách bỏ comment**: một regex trên văn bản nguồn **không phân
biệt được** `import` thật với một string trông giống nó, và ở đây không có parser nào để phân
biệt. Cố lọc thêm chỉ là thêm một lớp đoán lên một phép đoán.

Câu hỏi thật không phải *"có `import` nào treo không"* mà là ***"file cơ chế nào lẽ ra phải sang
mà chưa sang"*** — và câu đó có câu trả lời **chính xác**: so danh sách file cơ chế ở template
với cây ở đích. Không parser, không regex, không false positive.

Phép trực tiếp còn **mạnh hơn** proxy theo cả hai chiều: nó bắt file thiếu **kể cả khi chưa ai
import nó** (proxy mù hoàn toàn với ca đó), và nó không có gì để mà lọc.

> Bài học chung: khi một check phải lọc false positive **lần thứ hai**, vấn đề thường không nằm
> ở bộ lọc mà ở chỗ nó **đang đo một thứ khác** với thứ cần biết. Ba lần sửa bộ lọc thì đắt hơn
> một lần đổi phép đo.

`RATCHET` 88 → **87** (test của proxy bị bỏ cùng proxy — giữ lại là giữ một test cho code không
còn tồn tại).

## 2.10.2 — 2026-08-05

**patch.** Guard `import` mới của 2.10.1 **bắn nhầm vào comment của chính nó**.

Nó quét cả văn xuôi, và đoạn comment giải thích check đó có nêu ví dụ một đường dẫn tương đối
(`'./x.mjs'`) — nên ở lần chạy thật đầu tiên nó tố chính `tooling/upgrade.mjs` import một file
không tồn tại, ở cả ba repo tiêu thụ.

**Neo vào CODE, đừng neo vào comment GIẢI THÍCH code.** Đây là lần thứ **ba** của cùng bài học
trong repo này — engine mutant của `test-migrations` (v2.1.0), check CODEOWNERS của
`harness-doctor` (v2.0.0), và bây giờ. Lần này nó được một **test** với 4 ca (comment cả dòng,
block comment, `import()` động thật, package name), không phải một comment nữa: hai lần trước
đều đã có comment cảnh báo, và comment không ngăn được lần thứ ba.

Phép lọc bỏ block comment và comment **cả dòng**; **không** bỏ `//` giữa dòng — làm vậy sẽ cắt
cả URL trong chuỗi, và `import` không bao giờ nằm sau một `//` giữa dòng.

`RATCHET` 87 → **88**.

### Ghi nhận: guard NUL tìm ra một ca THẬT trong code sản phẩm

Ở `sakubun`, `lib/import-schema.ts:210` dùng NUL làm separator (`itemKey`) và viết nó thành
**byte thật** — đúng cùng lỗi mà harness vừa mắc. Comment ngay trên đó ghi *"NUL-joined so it
can't collide"*, nên separator là **cố ý**; chỉ cách viết là sai, và cái giá giống hệt: file đó
`git diff` in *"Binary files differ"* nên **không review được**, `rg`/`grep` bỏ qua nó.

Bản sửa giữ nguyên hành vi 100% (`\u0000` trong template literal cho ra đúng ký tự đó). Không
sửa từ đây: đó là code sản phẩm của repo khác và repo đó đang có một phiên làm việc với file đã
staged.

## 2.10.1 — 2026-08-05

**patch.** Nghịch lý bootstrap, hình dạng thứ hai: điều kiện nổ pha 2 neo vào **file không
chứa thông tin quyết định**.

`v2.10.0` thêm `tooling/rituals.mjs` (file mới) và sửa `tooling/test-hooks.mjs` để `import` nó.
`tooling/upgrade.mjs` **không đổi**. Hệ quả ở cả **ba** repo tiêu thụ: `test-hooks.mjs` bản mới
sang được, `rituals.mjs` thì **không** ⇒ `ERR_MODULE_NOT_FOUND`, suite vỡ ngay sau khi nâng cấp.

Lý do: bản 2.7.2 cho pha 2 nổ khi **`tooling/upgrade.mjs`** được cập nhật — nhưng danh sách file
cơ chế (`MECHANISM_PATHS`) sống trong **`tooling/lib/harness.mjs`**. Hai file khác nhau, nên một
bản phát hành thêm file cơ chế mà không chạm `upgrade.mjs` thì pha 2 im lặng không chạy. Cái neo
cũ trỏ vào file **không chứa** thông tin quyết định điều kiện.

Nay điều kiện là *"danh sách đã đổi"*: pha 2 nổ khi `upgrade.mjs` **hoặc** `lib/harness.mjs`
được cập nhật.

### Và một guard cho CẢ LỚP, không riêng ca đã gặp

Con trỏ trong `settings.json` không phải loại con trỏ duy nhất — file cơ chế `import` lẫn nhau.
Sau nâng cấp, `upgrade.mjs` giờ kiểm **mọi `import` tương đối** trong `tooling/`,
`.claude/hooks/`, `evals/` và **FAIL** nếu có cái trỏ vào hư không, kèm câu sửa (chạy lại
upgrade một lần nữa — bản mới đã nằm trong project).

### Điều đáng ghi về phép xác minh

`v2.10.0` đã được kiểm ở **cả hai vai** (template 87/87 · bản sao consumer 86/86) và vẫn ship
lỗi này. Vì bản sao vai-consumer là một **bản copy đầy đủ** — nó có `rituals.mjs`. Nghĩa là
phép kiểm hai-vai chứng minh **LOGIC** chạy đúng ở cả hai vai; nó **không** chứng minh được
**PHÂN PHỐI**. Thứ duy nhất chứng minh phân phối là chạy `upgrade` thật lên một repo thật đang
đứng ở version cũ — và đó đúng là thứ đã bắt được lỗi này.

## 2.10.0 — 2026-08-05

**minor.** Năng lực của harness **tự hiện ra khi tới hạn**, thay vì chờ người nhớ. Cộng một
byte NUL đã ship ở 2.9.0 và một chẩn đoán sai do consumer báo lên.

### Vấn đề: một năng lực phải NHỚ mới dùng được thì nằm im

Đo trên repo này: `reservations/` chỉ có `README.md`, `docs/progress/` chỉ có hai file khuôn —
`/claim` và `/handoff` **chưa chạy lần nào** kể từ khi harness ra đời, dù `session-start.mjs`
in đúng dòng *"bắt đầu bằng /claim · kết thúc bằng /handoff"* ở **mọi** phiên.

Dòng đó không sai. Nó nói **mọi thứ ở mọi lúc**, nên nó không nói gì ở lúc nào cả. Cùng lớp
với `harness-doctor` in *"5/5 điểm mở rộng native còn TRỐNG"* suốt nhiều version mà không ai
đóng, và với 22 nhóm fixlog trên 4 repo mà 0 bài học được promote.

Và cái giá không phải lý thuyết: cùng ngày, hai phiên song song commit lên một nhánh ở
`sakubun` và một `git add -A` cuốn theo file sản phẩm của phiên kia.

### `tooling/rituals.mjs` — suy ra việc tới hạn từ TRẠNG THÁI

```
node tooling/rituals.mjs         chỉ việc ĐANG tới hạn (SessionStart gọi bản này)
node tooling/rituals.mjs --all   mọi năng lực + trạng thái + VÌ SAO
```

Ba luật:

1. **Tự động trước, nhắc sau.** `session-start.mjs` ghi sự có mặt của phiên **tự động** ⇒
   chồng lấn hai phiên trên cùng máy được phát hiện **không cần ai gõ `/claim`**. `/claim` giữ
   phần cần phán đoán (đọc nhật ký cũ, đặt chỗ cho cả đội, quyết phạm vi).
   Liveness bằng `process.kill(ppid, 0)`, **không** bằng TTL: bản đầu dùng TTL 120 phút và
   cảnh báo **sai** ngay khi thử — khởi động lại phiên trong cửa sổ đó thì bản ghi cũ vẫn
   "còn tươi". Một cảnh báo sai mỗi lần restart là đúng loại nhiễu tính năng này diệt.
   Ghi vào `stateDir()` (không commit), **không** vào `reservations/`: một hook tự ghi file
   được commit sẽ làm cây bẩn ở mọi phiên.
2. **Nhắc phải có SỐ ĐO.** *"Nên chạy /harness-retro"* là lời khuyên; *"3 nhóm fixlog đã ≥2
   lần"* là một việc. Test khẳng định **mọi** mục tới hạn có chữ số trong `why`.
3. **Ba giá trị.** `due` / `ok` / `?`. `null` (không đo được) ⇒ `?` ở cả 6 nghi thức đo bằng
   số — gộp "chưa nhìn" vào "ổn" là cách một bảng điều khiển nói dối theo hướng dễ chịu.

`evaluate()` là **hàm thuần** tách khỏi `collect()`, nên test khẳng định logic bằng trạng thái
dựng sẵn thay vì dựng repo giả — điều kiện để suite chạy được ở project đích (`lessons/0003`).
Một `check` throw ⇒ `?`, **không** làm sập bảng: nó được gọi từ SessionStart.

### Byte NUL đã ship ở 2.9.0 — hỏng theo cách mọi cái máy nói "ổn"

Một separator viết thành **byte NUL thật** trong `tooling/harness-doctor.mjs` đi qua PR #27,
qua **7 job CI trên 3 OS**, ra tag **v2.9.0**, rồi sang **cả ba repo tiêu thụ**.

| Lớp kiểm | Kết quả |
|---|---|
| `node --check` | **xanh** — NUL nằm trong template literal, JS hợp lệ |
| `test-hooks` · `test-migrations` · `entropy-scan` · `apply-to --audit` | **xanh** |
| `precommit-scan` | **xanh** — dòng `includes(NUL) → continue` coi nó là "binary, bỏ qua" |

Thứ nó phá là kênh **không cái máy nào đo**: `git diff` in *"Binary files differ"* ⇒ file
**không review được**; `grep`/`rg` bỏ qua ⇒ file **vô hình** với mọi lần tìm code. Phát hiện
được chỉ vì `rg` trả rỗng bất thường trên một file 650 dòng.

Nay `precommit-scan` **FAIL** khi file có **đuôi nguồn** chứa NUL (phân biệt bằng ĐUÔI FILE,
không bằng nội dung — *"trông như binary"* chính là triệu chứng). Chạy cả ở pre-commit và ở CI
qua `--all`. Guard bắt lại tôi **lần thứ hai trong cùng một giờ**, khi chính bản vá viết một
NUL nữa vào `test-hooks.mjs` — nên nó đã được chứng minh bằng hai ca thật, không phải bằng
fixture.

### `gen-clean` thôi chẩn đoán sai — 2 lần độc lập, do consumer báo lên

`sakubun` ghi fixlog **hai lần trong hai ngày**: cây bẩn vì một đợt nâng harness nằm dở, rồi
vì một session song song đang áp template. Cả hai lần gate nói *"bạn quên chạy gen sau khi sửa
nguồn"*, và cả hai lần người dùng đi tìm ở generator — chỗ không có gì sai. **Một chẩn đoán
sai đắt hơn không chẩn đoán:** nó gửi người ta đi sai hướng với sự tự tin của một cái máy.

Nay gate đo cây **trước** khi chạy `gen` và chỉ khẳng định *"quên chạy gen"* cho những file mà
**chính `gen`** làm bẩn (phép **DELTA**, không phải phép đếm). Cây bẩn từ trước ⇒ **PASS** kèm
phân loại lớp (`harness` / `generated` / `khác`) và một câu nói rõ *đây KHÔNG phải "quên chạy
gen"*. Ba test hộp đen trên một cây tối thiểu, gồm ca chứng minh phép so là delta.

### Sổ quyết định của vòng học chưa từng được commit

`accept.mjs` ghi `DECISIONS.log` vào **`knowledge/incoming/`** — thư mục nằm trong
`REQUIRED_IGNORE` (đúng: pack là snapshot, `upstream --apply` sinh lại mỗi lần). Nên sổ thừa
hưởng luôn cái ignore. Đo: `git ls-files knowledge/incoming/DECISIONS.log` → **0**.

Toàn bộ lịch sử MERGE / ACCEPT / RETURN / REJECT của vòng học chỉ tồn tại trên **một máy**,
không đi qua review, và mất khi đổi máy. Sổ đó là thứ trả lời *"pack này đã bị từ chối chưa, vì
sao?"* — không trả lời được thì cùng một pack được duyệt lại mãi, tức **bước quyết định của
vòng học không có bộ nhớ**.

Không sửa được bằng `!knowledge/incoming/DECISIONS.log`: git **không** re-include được file mà
thư mục cha đã bị loại — cùng phép đo sinh ra `REQUIRED_UNIGNORE` ở 2.5.0. Một dòng `!` như vậy
trông như đã sửa và không sửa gì cả. Nên sổ **đổi chỗ**: `knowledge/DECISIONS.log`, được commit.
`harness-migrations/009` chuyển sổ cũ sang và **gộp** thay vì ghi đè. Nó nằm trong `IGNORE` của
`apply-to` — ship lịch sử quyết định của repo này sang repo khác thì bên nhận đọc như thể mình
đã từ chối những thứ chưa từng thấy.

### Và một bug fail-đóng lộ ra khi thêm kênh `note`

Nhánh fail-đóng cho phiên không người khoá vào `warn.length`, nhưng **ý** nó là *"gate bị BỎ
QUA"*. Hai thứ đó đã lệch: cảnh báo **vượt ngân sách độ trễ** cũng vào `warn`, nên một phiên
không người chỉ **chậm** (mọi gate PASS) vẫn `exit 2` kèm thông báo nói rằng gate bị bỏ qua —
và nó dạy đúng thứ tệ nhất: đặt `HARNESS_ALLOW_SKIPPED_GATES=1` vì một lý do không liên quan.
Nay khoá vào số gate bị bỏ qua, có test.

`RATCHET` 78 → **87**. Kiểm ở cả hai vai: template 87/87 · consumer 86/86 + 1 n/a.

## 2.9.0 — 2026-08-05

**minor.** Ba khoảng trống xác minh bị đóng. Không đổi hành vi runtime nào.

### `settings.local.json` không còn là điểm mù

`harness-doctor` và `entropy-scan` chưa từng đọc **nội dung** file này — doctor chỉ kiểm nó có
bị track không. Điểm mù được **consumer báo lên** (chiều LÊN của vòng học, không phải tôi đọc
code), với hai hệ quả đo được ở repo đó:

- Hai deny rule sống trong `settings.local.json`, doctor vẫn báo **"thiếu"**. Người đọc đã
  thêm chúng rồi, nên bài học họ nhận được là *"doctor nói sai"* — đúng cách một kênh chẩn
  đoán mất uy tín.
- Bốn hook cắm ở đó thì **vô hình**, nên một canary đăng ký **TRÙNG** với `settings.json`
  chạy gate **hai lần** mà không gì phát hiện. Ở `SubagentStop` con số đó nhân với **tối đa
  16 agent song song** — tức trần 5 giây của `AGENTS.md` thực tế là 2.5 giây.

Nay doctor đọc nó, và:

- *"thiếu deny rule X"* trở thành hai câu khác nhau. Khi rule chỉ có ở bản local, câu đúng
  không phải *"đã có"* mà là **"nó bảo vệ MÁY NÀY, cả đội KHÔNG có nó"** — nói được câu đó
  thì mới sửa được.
- Check mới: **đăng ký trùng** giữa hai file. Claude Code **hợp nhất** chúng chứ không cho
  bản local ghi đè, nên hook chạy hai lần và **cả hai đăng ký đều hợp lệ** — không có gì báo.

**Không bao giờ là gate.** File này là máy-cục-bộ, không commit (Parity Contract). Một check
đọc nó cho kết quả khác nhau trên mỗi máy, và một gate khác nhau trên mỗi máy thì không phải
gate — nó là chỗ để tranh luận *"trên máy tôi xanh mà"*. Mọi phát hiện từ đây vào `advice`,
luôn kèm chữ **MÁY NÀY**, không bao giờ vào `blockers`.

### Mutant cho hai hook ít bằng chứng nhất: 3/10 → 5/10

- **`observe.mjs`** — LỚP KINH TẾ, lớp duy nhất gây thiệt hại tài chính trực tiếp, và cho tới
  hôm nay là hook **không có mutant nào**: ba khẳng định về mẩu bánh mì chưa từng được chứng
  minh là có hiệu lực. `mutate()` dùng không được ở đây vì nó giết bằng *"không còn CHẶN"*,
  mà observe là advisory — exit 0 mọi trường hợp, vendor còn bỏ qua output. Nên tiêu chí giết
  là **hiệu quả**: rỗng hoá bảng `MONEY` ⇒ `rate_limit` không còn ghi mẩu bánh mì.
- **`protect-feature-files.mjs`** — hook mà doctor báo *"chưa có BẰNG CHỨNG nó chạy"*. Đo ra
  lý do: `issueFromBranch('main')` trả `null` nên hook `pass()` **ngay**, và nhánh so-issue
  **không tới được từ `main`**. Mutant vì thế neo vào nhánh `_index.json` — phần chặn độc lập
  với tên nhánh. Phần so-issue **vẫn là khoảng trống**, và nói ra thì hơn là neo vào một ca
  không bao giờ chạy rồi tưởng đã phủ.

`RATCHET` 76 → **78**, kiểm ở **cả hai vai** trước khi phát hành (template 78/78 · consumer
77/77 + 1 n/a).

### 8/8 migration có fixture — hết `WARN`

`001` (v1.3.0) và `002` (v1.4.0) là hai migration cuối chỉ kiểm được nhánh *"đã ở trạng thái
đích"*. Cả hai giờ có fixture CŨ→MỚI và khai `expect`, và chỗ `expect` neo vào là điều đáng
nói:

- `001` vá **TEXT** bằng regex, nên `expect` neo vào những thứ nằm **ngay cạnh** vùng bị sửa
  (`__generated__`, `"id"`, `$comment_*`) chứ không neo vào thứ nó thêm. Một `expect` chỉ
  khẳng định *"cái mới có mặt"* thì im lặng đúng lúc regex đã ăn mất phần khác. Fixture của
  nó có cả `.claude/settings.json` để bước **tự đăng ký hook** được chạy thật — chính bước mà
  bài học v2.8.0 nói về.
- `002` neo vào **BÀI HỌC**, không vào file được seed: seed thành công thì thấy ngay, còn lời
  hứa *"không đụng vào bài học của project"* thì **vỡ im lặng**. `mustNotContain: '\nevals:'`
  đã được kiểm bằng positive control (thêm `evals:` vào frontmatter ⇒ bắt được).

## 2.8.1 — 2026-08-05

**patch.** Sàn `RATCHET` của `test-hooks` cộng cả case **bỏ qua có chủ ý**.

`2.8.0` thêm sàn 76 và một case chỉ chạy ở repo template (kiểm đường phân phối của sự kiện
hook). Ở project đích, case đó đúng là không chạy ⇒ tổng 75 < sàn 76 ⇒ **FAIL, exit 1 ở cả ba
repo tiêu thụ**, ngay trong lần phát hành.

Đây là `knowledge/lessons/0003` — *self-test của template assert thứ chỉ đúng trong repo
template* — và nó xảy ra **bên trong bản vá viết ra để chống đúng lớp lỗi đó**. Bằng chứng thứ
11 của bài học đó, và là bằng chứng mạnh nhất: biết luật, viết luật ra ở dòng ngay trên, vẫn
vi phạm.

Bài học cụ thể hơn luật cũ: **một sàn phải cộng ĐỦ BA giá trị** — *đã chạy* + *bỏ qua có chủ
ý*. Không cộng thì `n/a` bị gộp vào `0`, đúng phép gộp mà `AGENTS.md` cấm ở mọi nơi khác. Cách
sửa là một biến `skipped` tường minh, **không** phải một hằng số thứ hai cho mỗi vai (hai hằng
số thì cả hai đều phải nhớ nâng, và cái ít chạy hơn sẽ trôi).

Kiểm ở **cả hai vai** trước khi phát hành, không chỉ ở template:

```
                       template → 76/76, sàn 76, exit 0
bản sao có manifest → consumer →  75/75 · 1 n/a, sàn 76, exit 0
nâng sàn lên 78                 →  ĐỎ ở cả hai vai (sàn vẫn còn răng)
```

## 2.8.0 — 2026-08-05

**minor.** Sự kiện hook mới **tới được** repo đã áp template. Trước bản này thì không.

### Đo được: 5 trên 9 sự kiện chưa từng tới bất cứ đâu

`settings.json` ở cả **ba** repo tiêu thụ có ĐÚNG 4 sự kiện — `SessionStart`, `PreToolUse`,
`PostToolUse`, `Stop` — trong khi template có 9. Thiếu ở cả ba, **kể cả repo chỉ đứng sau
template một version**:

| Thiếu | Nghĩa là gì ở repo đó |
|---|---|
| `StopFailure` | **LỚP KINH TẾ chưa từng bật.** `observe.mjs` được copy sang rồi nằm đó chết. Dòng *"PHIÊN TRƯỚC DỪNG VÌ: rate_limit"* mà template in mỗi phiên không tồn tại — một agent chạy sai 4 giờ lúc 3h sáng không có gì dừng lại. |
| `SubagentStop` | Gate của subagent không chạy. Output agent con không bị kiểm gì. |
| `ConfigChange` | Mất lớp hai của `protect-harness`: cấu hình đổi bằng đường KHÁC `Write\|Edit` đi qua tự do. |
| `InstructionsLoaded` | Không có thiết bị đo thuế context — quay về ƯỚC LƯỢNG bằng grep. |
| `Setup` | `init.mjs` trở lại thành một dòng trong README mà người ta phải nhớ. |

**Nguyên nhân là một phép SAI, không phải một sự cẩu thả.** `.claude/settings.json` thuộc lớp
SEED — `upgrade.mjs` không bao giờ ghi đè, và đó là quyết định đúng: project sửa
`permissions`, `worktree`, thêm hook riêng vào đó. Nhưng cây con `hooks` do **harness** sở hữu
và nó **lớn dần**. Với một file như vậy, *copy-nếu-chưa-có* là phép sai theo đúng cách
`.gitignore` từng sai ở 2.5.0: file nào cũng đã tồn tại ⇒ nội dung mới không bao giờ tới. Đây
là lần thứ ba của cùng bài học, hình dạng mới: **MERGE THEO KHOÁ**.

**Vì sao nó sống được lâu:** cả hai lớp phát hiện đều đã có và đều nói đúng.
`harness-migrations/README.md` ghi *"Thêm hook mới → CÓ, migration phải TỰ ĐĂNG KÝ"*, và
`harness-doctor` in *"N/5 điểm mở rộng native còn TRỐNG"* suốt nhiều version. Cái thiếu không
phải hiểu biết — là **một migration**. Một luật chỉ tồn tại dưới dạng văn xuôi thì bị bỏ qua
bởi người đang gấp.

### Ba lớp, để nó không tái diễn

- **`harness-migrations/008`** — merge theo khoá: chỉ thêm sự kiện THIẾU, không chạm entry đã
  có, không chạm `permissions`/`worktree`, và **copy trước** mọi script mà sự kiện mới trỏ vào
  (luật migration số 1). Điều kiện ⑤ khẳng định `ThisIsALocalPermissionTheProjectAdded` còn
  sống sót qua lần ghi lại JSON.
- **`test-hooks.mjs`** — check tất định thay cho văn xuôi: mọi sự kiện trong `settings.json`
  ngoài 4 sự kiện baseline **phải có đường phân phối** (migration nào đó cắm nó). Kiểm bằng
  mutant: bỏ mọi migration ra thì check liệt kê đúng 5 sự kiện đã thiếu. Chỉ chạy ở repo
  TEMPLATE — ở project đích, `settings.json` là của họ.
- **`harness-doctor`** — dòng "5/5 slot trống" giờ **nói cách sửa** (`upgrade.mjs`, và tại sao
  chỉ migration đi qua được). Một dòng chẩn đoán không kèm lệnh sửa là dòng sẽ được đọc rồi bỏ
  qua — bằng chứng là nó đã in đúng suốt nhiều version mà không ai đóng.

### Ba lỗi tự-đo khác, cùng một họ

- **`harness-doctor` chặn SAI cả ba repo đã cấu hình.** Điều kiện là `!manifest.profile` — dấu
  của một QUY TRÌNH chưa chạy, không phải của một KẾT QUẢ còn thiếu. Cả ba đều đã có
  `commands.verify` thật, chỉ là điền tay. Kèm một câu sai: *"mọi dòng CHANGEME/lệnh rỗng bên
  dưới là triệu chứng"*, trong khi bên dưới không có dòng nào như vậy. Mục `CHẶN — sửa trước
  mọi việc khác` có giá trị bằng đúng độ tin cậy của nó. Nay: **chặn theo KẾT QUẢ, nhắc theo
  QUY TRÌNH.**
- **`test-hooks` in `75/72`** — tử số lớn hơn mẫu số. Mẫu số là phép cộng viết tay
  (`cases + MUTANTS + GATE_CASES + 3`) đã trôi. Nó tồn tại để trả lời *"có case nào NGỪNG CHẠY
  không"*, và một mẫu số đã trôi thì không trả lời được gì. Nay hai con số hai việc: tổng thật
  `ok+fail` (mô tả) và **RATCHET** (cưỡng chế, nâng khi thêm case).
- **`precommit-scan`** — commit chạm `harness.version` mà mang theo file ngoài lớp harness thì
  WARN. Xảy ra thật hôm nay: `git add -A` để nâng `sakubun` cuốn theo `e2e/_shots.spec.ts` của
  một **phiên khác đang viết**; file chưa tồn tại lúc đọc `git status` và đã tồn tại lúc
  `git add`. Vài giây là đủ. AGENTS.md đã dặn *"một PR một mục đích"* — giờ có cơ chế.

## 2.7.10 — 2026-08-05

**patch.** Bỏ `paths` filter khỏi `pull_request` của `harness-parity.yml`.

Các job trong đó là **required status check**. Một workflow bị `paths` lọc ra thì **không
chạy**, và GitHub **treo PR** ở *"Expected — waiting for status"* vĩnh viễn — không phải bỏ
qua, mà TREO. Đo **hai lần trong một ngày**: PR chỉ sửa `harness-migrations/` (v2.7.5) và PR
chỉ sửa `knowledge/consumers.json` (sổ consumer) đều bị chặn.

Cách sửa sai là thêm path mới mỗi lần bị chặn — đập chuột, và mỗi lần đập là một PR đã bị treo
trước đó. **Required check và bộ lọc path là hai thứ không tương thích**: cái thứ nhất đòi
*"luôn có kết quả"*, cái thứ hai nói *"có khi không chạy"*.

Giá phải trả: matrix 3 OS chạy cả trên PR chỉ đổi tài liệu, khoảng một phút. Giá của phương án
kia: một gate treo PR — và một gate treo PR dạy người ta đi tìm đường vòng, đúng thứ mà cả lớp
harness này tồn tại để tránh.

## 2.7.9 — 2026-08-05

**minor.** Template biết consumer của nó tồn tại — và biết bản vá đã tới ai chưa.

### Sổ đăng ký: `tooling/knowledge/consumers.mjs`

Template **không biết consumer của nó tồn tại**. Đo 2026-08-05: ba repo đã dùng harness này
từ 08-03, **hai trong ba đứng ở v1.4.0 — sáu version sau lưng**, và chúng chưa từng có
`tooling/gates.mjs` (runner ra đời ở 2.0.0). Hai project chạy một harness mà lớp cưỡng chế
của nó chưa tồn tại — và cách duy nhất phát hiện là liệt kê thư mục bằng tay.

Một hệ phân phối mà bên phát hành không biết mình đã phát hành cho ai thì không trả lời được
câu rẻ nhất và quan trọng nhất: *"bản vá hôm nay đã tới ai chưa?"*

Nguồn dữ liệu là `knowledge/incoming/<id>/pack.json` — **project TỰ báo danh** khi chạy
`upstream`. Không quét filesystem, không đoán: vào sổ vì đã báo danh, không vì tình cờ nằm
cạnh. `--record` là hành động của NGƯỜI; sổ được commit nên nó đi qua review như mọi dữ liệu.

Sổ trống báo `n/a`, **không báo "không có consumer"** — hai thứ đó khác nhau, và gộp chúng là
đúng lỗi mà cả loạt 2.5–2.7 này đi sửa.

### Tag trỏ vào commit TRƯỚC rebase — im lặng và khó gỡ

Rebase-merge của GitHub **viết lại SHA**. Tag một commit trước rebase thì tag đó trỏ vào commit
**không nằm trên main** — và không gì báo: `git tag` vẫn liệt kê, `git show` vẫn mở được, chỉ
có điều `upgrade.mjs --ref <tag>` sẽ kéo về một cây **không ai review**. Với một kênh phân phối
thì đó là lỗ supply-chain, không phải lỗi tiện lợi.

Gặp thật hôm nay với `v2.7.7`. Nay `harness-doctor` kiểm mọi tag `vX.Y.Z` là tổ tiên của `main`,
và nhắc khi `harness.version` trên main chưa có tag (consumer không pin được version đó).

### Mọi `.mjs` phải parse được — kiểm trong CI

Một file `.mjs` **chưa từng được CI chạy** vẫn có thể ship lỗi cú pháp. Gặp **ba lần trong một
ngày**: một glob (`**` + `/` hoặc `../*` + `/`) nằm trong block comment tạo ra chuỗi đóng comment
và **kết thúc comment sớm**. Lỗi đó không lộ ra cho tới khi có người chạy đúng file đó — và
người đó có thể là người dùng, ở project của họ. `node --check` mọi file được track là kiểm rẻ
nhất cho cả lớp lỗi.

## 2.7.8 — 2026-08-05

**minor về hành vi, breaking cho `evals.command`.** Runner eval có ~40 dòng **chưa bao giờ
chạy ở đâu** — đo được: `evals.command` rỗng ở cả bốn repo. Nay có `tooling/test-evals.mjs`
kiểm nó bằng **agent GIẢ**: tất định, miễn phí, chạy 3 OS. Suite bắt được **ba bug thật** ngay
lần đầu.

### ① `JSON.stringify` không phải shell escaping — prompt nhiều dòng bị bóp méo IM LẶNG

`{prompt}` được nội suy bằng `JSON.stringify(prompt)` rồi dán vào một lệnh đi qua shell. Dấu
nháy đôi qua đúng, nhưng **`\n` tới agent dưới dạng HAI ký tự literal** (`\` và `n`) chứ không
phải một dòng mới. Mọi prompt eval thật đều nhiều dòng ⇒ **mọi prompt đều bị bóp méo**.

Và nó bóp méo im lặng: agent vẫn chạy, vẫn trả kết quả, chỉ là nó đọc một prompt khác với
prompt trong file task. Điểm eval sai theo hướng **không ai truy được** — nó đọc y hệt
*"model vừa tụt hạng"*. Một bug computational được che bởi lớp inferential đắt nhất trong repo.

**`{prompt}` bị BỎ. Prompt đi qua STDIN** — không có tầng escaping nào để sai, và là đường duy
nhất đúng trên cả ba OS (`cmd.exe` xử lý `"` và `%` khác `sh`). Lệnh còn `{prompt}` bị **TỪ
CHỐI kèm cách sửa**, không chạy tiếp: bóp méo im lặng tệ hơn một lỗi nói ra. `{promptFile}`
cho tool không đọc được stdin.

### ② Transcript của agent bị NÉM ĐI

`runAgent` bắt toàn bộ output, dùng nó DUY NHẤT để đếm retry, rồi bỏ. Eval đỏ mà không có
transcript thì người đọc chỉ có một dòng *"task 0003 fail"* và không có cách nào biết agent đã
làm gì. `features/*.json` đòi `evidence` cho mọi `passes: true` — không lý gì lớp eval, lớp
ĐẮT nhất và mờ nhất, lại được miễn. Nay `spill()` giữ transcript và runner in đường dẫn.

### ③ `error` được tạo ra rồi bị bỏ đi

`runAgent` trả `{ok:false, error}` cho những ca nó TỪ CHỐI chạy — và runner **không bao giờ in
`error`**. Task hiện ra là đỏ mà không có lý do, nên người đọc đi tìm ở model trong khi lỗi
nằm ở cấu hình. Một thông báo lỗi đã trả chi phí để tạo ra mà không ai đọc thì tệ hơn không tạo.

### Suite: 9 case, có mutant

Prompt fixture cố ý chứa nháy đôi, nháy đơn, xuống dòng thật và `%` — bốn thứ hay chết khi đi
qua shell, và `%` là ca riêng của `cmd.exe`. Case ⑥ là **mutant**: viết sai tên placeholder
phải làm hợp đồng ① ĐỎ, không làm nó `n/a`. `EVAL_TASKS_DIR` là override CHỈ-TEST, cùng lý do
với `HARNESS_CONFIG`.

## 2.7.7 — 2026-08-05

**patch.** `repoRole()` — một nguồn cho câu hỏi *"tôi là template hay repo đã áp?"*.

Câu hỏi đó được hỏi ở **5 chỗ với 3 định nghĩa khác nhau**: `apply-to` chỉ xét manifest;
`harness-doctor` và `setup.mjs` xét 3 điều kiện; `entropy-scan` tính **cả** `IS_TEMPLATE`
**lẫn** `IS_CONSUMER` riêng rẽ trong cùng một file — và hai biến đó **không bù nhau**.

Một repo không có cả manifest lẫn changelog thì **cả hai đều `false`**. Trạng thái đó có
thật (ai đó copy `.claude/` bằng tay, hoặc manifest bị xoá) và **chưa từng được đặt tên**,
nên mỗi tool âm thầm chọn một mặc định khác nhau cho nó. Đúng phép gộp `0` với `n/a` mà repo
này cấm ở mọi nơi khác — chỉ có điều nó nằm trong phép **tự nhận diện** của chính harness.

Nay ba giá trị: `template` · `consumer` · `unknown`. Và `unknown` **được nói ra** —
`harness-doctor` báo CHẶN kèm lý do thật: harness tới đây bằng đường không ai theo dõi được,
nên `upgrade` sau này sẽ ghi đè MÙ vì không có hash nào để so.

Gần như mọi lỗi của bốn bản 2.5.x–2.7.x đều mọc từ chỗ này: cửa thoát CI, audit tự tắt,
ngưỡng PR, `test-hooks` đo config sống, cảnh báo upstream nổ ở template. Tám lỗi, một gốc.

## 2.7.6 — 2026-08-05

**patch.** Kết quả của lần DISTILL đầu tiên trên nguyên liệu THẬT từ ba repo tiêu thụ.

### `L0003` lên 10 lần, thấy ở 4 repo độc lập

17 mục fixlog chia thành ba lớp lặp, và **cả ba là cùng một meta-pattern** — chính `L0003`
(*"self-test của template phải assert LOGIC, không assert cấu hình của project đích"*):
`apply-to --audit` đỏ ở đích · `test-hooks` bám config mặc định · `paths.secrets` chặn
`.env.example`. Mỗi lớp ≥2 repo độc lập.

Bằng chứng đắt nhất, nay đã vào lesson: `warehouse` ghi biến thể `paths.migrations`
**ngày 2026-08-03**, template phát hiện lại **ngày 2026-08-05** và tự gọi là *"lần thứ tư"*.
Hai ngày, và bằng chứng đã nằm sẵn trên đĩa. Nếu chiều LÊN chạy hôm 08-03 thì ngưỡng
"2 lần độc lập" đã đạt và bản sửa hạ cánh sớm hơn hai ngày. `seen-in` giờ có 4 repo.

### `harness-doctor` nói AI đã tiêu trần skill

Đo ở `warehouse`: `prisma init` tự đổ **9 skill** của Prisma vào `.claude/skills/` cùng
`skills-lock.json`, `.agents/`, `.windsurf/`. Trần là 12 — một lệnh `init` của bên thứ ba
vừa ăn gần hết ngân sách discovery, và dòng duy nhất người dùng thấy là `skill: 21 (trần 12)`.
Con số đó không nói nguyên nhân, nên nó dẫn tới kết luận SAI: *"harness của mình phình"*
thay vì *"một tool vừa ghi vào .claude/ của mình"*.

Tín hiệu sẵn có, không cần danh sách phải bảo trì: `.claude/harness-manifest.json → files`
liệt kê mọi `SKILL.md` template đã ship. Skill có trên đĩa mà không có trong manifest là
skill project/tool thêm vào — doctor gọi tên chúng, và nói luôn dấu vết tool nếu thấy.

Đây là **computational control**, không phải bài học: một mục fixlog trở thành một check,
không thành một dòng văn xuôi ai đó sẽ bỏ qua.

### Phân công của vòng học đang chạy ĐÚNG

6 mục còn lại là `stack:nextjs`/`prisma`, mỗi mục **một lần** — dưới ngưỡng. Và khi kiểm thì
**5/6 đã nằm sẵn trong `AGENTS.md §Gotchas` của chính warehouse**: project tự giữ bài học
stack ở tầng biểu diễn rẻ nhất, template chỉ cần nửa `universal`. Thứ thiếu suốt từ đầu chỉ
là **vận chuyển của nửa universal đó**.

Quyết định của cả bốn nhóm ghi ở `knowledge/incoming/DECISIONS.log` — kèm một dòng
`CORRECTION` cho mục tôi tưởng phải trả về mà project đã làm xong.

## 2.7.5 — 2026-08-05

**patch.** Migration `007` hỏi BỘ SO KHỚP THẬT thay vì suy từ hình dạng chuỗi.

Bản đầu neo vào dòng `.env.*` và báo `→ CẦN NGƯỜI` khi không thấy nó. Nhưng một project có
thể đã tự sửa bằng cách **thu hẹp** pattern (`.env.local`, `.env.production`… thay cho một
catch-all) — khi đó `.env.example` vốn đã đi qua và không có gì để phủ định. Gặp thật ở
`warehouse`: migration báo động cho đúng repo **đã sửa đúng**.

Một cảnh báo sai gửi tới người làm đúng là cách nhanh nhất dạy người ta bỏ qua cảnh báo.
Nay nó gọi `matchAny('.env.example', secrets)` — cùng hàm mà hook thật dùng — rồi mới quyết.

## 2.7.4 — 2026-08-05

**patch.** Migration `007`: bản sửa của **1.5.0 chưa bao giờ tới đích**.

1.5.0 dạy `matchAny` hiểu phủ định và thêm một dòng phủ định cho `.env.example` vào
`paths.secrets` của template — nhưng `harness.config.json` là NỘI DUNG của project,
`upgrade.mjs` không bao giờ đụng vào, và **không ai viết migration**. Nên bản sửa chỉ tới
project áp SAU 1.5.0.

Đo trên ba repo tiêu thụ thật: **2/3 vẫn thiếu phủ định** — tức là suốt từ 1.5.0 tới nay
chúng vẫn dính đúng bug mà changelog tuyên bố đã sửa. Triệu chứng đúng như 1.5.0 mô tả:
`pre-commit` chặn `.env.example`, tức là chặn **commit đầu tiên** của project mới, vì
`tooling/init.mjs` copy chính file đó thành `.env`.

Migration neo vào DÒNG khai `.env.*`, không neo vào mảng `secrets` nói chung: phủ định phải
nằm **sau** pattern nó phủ định (luật .gitignore). Đặt nhầm thứ tự thì dòng có mặt mà vô
tác dụng — một bản vá trông như đã sửa và không sửa gì.

> **Luật, và ca này là bằng chứng:** đổi ngữ nghĩa một field trong `harness.config.json` thì
> PHẢI có migration. Sửa ở template mà không có migration là sửa cho project TƯƠNG LAI và
> bỏ rơi project đang chạy — đúng nhóm cần bản sửa nhất.

## 2.7.3 — 2026-08-05

**patch.** `setup.mjs` chỉ điền chỗ TRỐNG, không ghi đè lệnh người đã khai.

Lệnh đã có trong config là lệnh NGƯỜI viết — có thể kèm cờ, biến môi trường, hoặc một
wrapper mà không phép phát hiện nào đoán ra. Ghi đè nó là lấy một giá trị ĐÚNG thay bằng
một giá trị SUY RA. Đo trên `warehouse`: phát hiện đề xuất `npm run gen`, còn thứ đang chạy
thật là `npx prisma generate` — hai thứ khác nhau, và bản cũ sẽ âm thầm thay cái sau bằng
cái trước.

Ca này không hiếm mà là ca THƯỜNG: cả ba repo tiêu thụ hiện có đều đã khai tay 8–9 lệnh
**trước khi** `setup.mjs` tồn tại. Một công cụ chỉ an toàn với repo trống là công cụ không
dùng được ở đúng nơi cần nó. Chênh lệch giữa "đang khai" và "phát hiện được" nay hiện dưới
dạng `WARN ... GIỮ \`x\` (phát hiện ra \`y\`)` — người đọc rồi tự quyết.

## 2.7.2 — 2026-08-05

**patch, nhưng là bản vá QUAN TRỌNG NHẤT của 2.x.** Nâng cấp từ version cũ để lại repo
**HỎNG**, không phải "cũ". Phát hiện bằng cách chạy thật trên `warehouse` (v1.4.0 → v2.7.1),
không phải bằng đọc code.

### Nghịch lý bootstrap: `upgrade.mjs` luôn chạy bằng BẢN CŨ CỦA CHÍNH NÓ

Danh sách file cơ chế nằm **trong** script đang bị thay thế. Thư mục (`.claude/hooks`,
`tooling/lib`) được duyệt đệ quy nên không sao; **file khai theo TÊN thì đóng băng ở version
của project**. Mọi `tooling/*.mjs` ra đời sau đó **không bao giờ tới được** — `gates.mjs`
(2.0.0), `harness-doctor.mjs` (2.0.0), `setup.mjs` (2.6.0).

Ghép với migration `003` — cái đổi Stop hook thành `node tooling/gates.mjs` — kết quả là
`.claude/settings.json` trỏ vào file **không tồn tại**. Đo trên `warehouse`: sau khi nâng,
mọi sự kiện Stop ném `ERR_MODULE_NOT_FOUND`. **Nâng cấp làm repo tệ hơn trước khi nâng** là
chế độ hỏng tệ nhất một hệ migration có thể có.

Ba lớp vá, cố ý chồng nhau:

1. **Migration `003` tự đảm bảo cái đích tồn tại** (`copyFromTemplate` cho `gates.mjs` và
   `harness-doctor.mjs`). Migration chạy từ TEMPLATE nên nó không bị giới hạn của script cũ
   — đây là lớp vá duy nhất có tác dụng với repo đang ở version cũ **ngay hôm nay**.
   **LUẬT: migration nào trỏ một con trỏ vào một file thì phải TỰ đảm bảo file đó tồn tại.**
2. **`upgrade.mjs` chạy lại bằng chính bản MỚI** (`HARNESS_UPGRADE_PHASE2` chặn lặp) sau khi
   bước copy đã thay nó. Vá cho mọi file tương lai — nhưng chỉ có tác dụng từ lần nâng SAU.
3. **Kiểm toàn vẹn sau nâng cấp**: mọi `node <file>.mjs` mà `settings.json` gọi phải tồn
   tại, không thì FAIL kèm lệnh sửa. Bắt cả LỚP lỗi, không riêng ca đã biết.

### Mặt đối xứng: migration cũng không được giả định API của `ctx`

`ctx` do **`upgrade.mjs` của PROJECT** dựng, không phải của template. `ctx.moveFile` thêm ở
2.5.0 ⇒ ở repo v1.4.0 nó là `undefined`, và migration `006` ném `is not a function` giữa
chừng. Nay nó tự dò và có đường lùi chỉ dùng năng lực có từ v1.4.0.

Đường lùi đầu tiên tôi viết cũng sai — `git mv` fail khi thư mục đích chưa tồn tại, đúng
điều comment của chính nó nói mà code không làm. Chỉ lộ ra ở lần chạy thật thứ hai.

### `run()` nhận `env`

Nó vốn **im lặng bỏ qua** tham số đó. Nơi gọi tin rằng biến đã được đặt — và một cờ
chống-lặp không được đặt thì thành vòng lặp vô hạn. Thêm theo kiểu DENYLIST
(`{...process.env, ...env}`), không allowlist: allowlist từng làm rớt `PATHEXT` (xem 1.6.0).

## 2.7.1 — 2026-08-05

**patch.** Hai cảnh báo **đỏ-do-cấu-trúc** ở project đích — cả hai đều nổ vì HOÀN CẢNH chứ
không vì vấn đề, và một cái do chính 2.7.0 tạo ra.

- **Cảnh báo "chưa gửi bài học lên template" nổ ở MỌI project vừa áp xong.** Nó đếm bài học
  `universal`, mà 3 bài SEED đi kèm template đều là `universal` — nên nó nhắc bạn gửi lên
  template đúng những bài vừa TỪ template đi xuống. Cảnh báo ĐẦU TIÊN bạn thấy mà sai là
  cảnh báo dạy bạn bỏ qua những cảnh báo sau.

  Ngày tháng **không** giải được: bài seed `0003` có `added` đúng bằng ngày áp template, nên
  mọi phép so ngày phải chọn giữa *bỏ sót bài tự viết cùng ngày* và *tố giác một bài seed*.
  Nay `apply-to` ghi thẳng `seededLessons` vào manifest — chính xác, không đoán. Project áp
  trước 2.7.1 lùi về so ngày và chọn hướng **im lặng**: bỏ sót một lần nhắc chỉ làm chậm một
  đóng góp, nhắc sai làm hỏng lòng tin vào cả bảng.

- **`/dedupe-scan` bị báo "ứng viên GỠ BỎ" ở mọi project đích.** Nó chỉ được nhắc tới trong
  `README.md`, mà README là của TEMPLATE và **không được ship**. Nên một skill hoàn toàn
  bình thường trông như rác ở mọi repo tiêu thụ. Nay `docs/ARCHITECTURE.md` (được ship) nối
  nó vào đúng chỗ nó thuộc về: phần *dọn dẹp* sau khi đã chặn boilerplate ở nguồn.

Đo lại trên project áp mới hoàn toàn: `apply → setup → init` cho **0 cảnh báo entropy**, chỉ
còn `AGENTS.md` còn CHANGEME — đúng, đó là việc của người và là bước 4 trong danh sách in ra.

## 2.7.0 — 2026-08-05

**minor.** Không cần migration. Áp và nâng cấp **không cần bản harness trên máy**; chiều
LÊN của vòng học chạy được giữa hai máy khác nhau.

### `npx github:thiengthb/harness init`

`package.json` ở gốc tồn tại **chỉ** để lệnh này chạy được: không dependency, không publish,
**không có field `version`** (`harness.version` là nguồn duy nhất — hai chỗ ghi version là
hai chỗ để chúng lệch nhau). Nó **không** được ship sang project đích: repo nào cũng có
`package.json` của riêng nó, và một cái rỗng nằm trong repo Go là rác gây nhầm.

`tooling/cli.mjs` cố ý mỏng — nó gọi `apply-to.mjs`, cùng đường đi mà người có repo local
vẫn dùng. Hai đường vào với hai logic thì đường ít chạy hơn sẽ hỏng mà không ai biết.

### `upgrade.mjs <URL> --ref <tag>` — nếu thiếu, bootstrap từ xa là cái bẫy

Bootstrap từ xa mà không dạy `upgrade` cùng trick thì mọi project **mắc kẹt vĩnh viễn ở
version khai sinh**: `upgrade` đòi một thư mục template local mà project đó chưa bao giờ có,
và `manifest.source` ghi một đường dẫn tạm đã bị xoá. Nay manifest ghi `url@ref` + `sourceSha`.

**Từ xa thì `--ref` là bắt buộc** (exit 1 nếu thiếu, cửa thoát `--allow-unpinned`). Và
`--ref main` — kỹ thuật là "có pin" nhưng thực chất là mục tiêu di động — bị **cảnh báo kèm
sha hiện tại**, không chặn: hai project nâng cấp cách nhau một ngày sẽ nhận hai bản khác
nhau trong khi manifest của chúng ghi cùng một `source`.

### Chiều LÊN chạy được giữa hai máy

`import.mjs` nhận URL từ lâu; `upstream.mjs` thì **chỉ nhận đường dẫn filesystem** — nghĩa
là trí tuệ đi XUỐNG được mà không đi LÊN được, và đó đúng là chiều mà `knowledge/README.md`
gọi là *"chiều làm template tốt lên"*. Nay nó clone template (vào `.harness-pack/`, đã nằm
trong `REQUIRED_IGNORE`), ghi pack vào đó, rồi **IN RA** ba lệnh push + `gh pr create`.

Nó **không push và không mở PR** — cố ý. Ghi vào template là đường supply-chain vào MỌI
project khác; cổng đó phải có NGƯỜI, và review PR chính là cổng đó.

### Cảnh báo "quên gửi lên" — đối xứng với cảnh báo đã có

`entropy-scan` nhắc khi pack nạp về chờ duyệt >30 ngày. Chiều ngược lại **không có gì
nhắc**, và nó là chiều bị bỏ quên hơn hẳn: pack chờ duyệt thì NHÌN THẤY được (nó nằm trong
repo), còn "chưa gửi lên" thì **không có triệu chứng nào ở repo này cả** — hậu quả rơi vào
project TIẾP THEO của bạn, khởi động từ đúng số bài học seed dù repo này đã học 12 thứ.

Hai chi tiết khiến nó không nói dối: nó chỉ chạy ở repo TIÊU THỤ (template LÀ upstream, nhắc
nó gửi lên là vô nghĩa — và một cảnh báo nổ mọi lần dạy người ta bỏ qua cả bảng), và lần
chạy RỖNG **không đóng dấu "đã gửi"** — nếu không, cái đồng hồ 30 ngày tự reset bằng việc
không làm gì.

---

## 2.6.0 — 2026-08-05

**minor.** Không cần migration. `tooling/setup.mjs` — phỏng vấn một lần sau khi áp template.

### Vấn đề: "việc số 1" chỉ là một dòng nhắc

README nói thẳng *"không có lệnh verify thì gate không tồn tại và toàn bộ harness này chỉ
là trang trí"*, nhưng đường tới đó là `$EDITOR harness.config.json` — tức là nó xảy ra khi
có người nhớ. Bằng chứng mạnh nhất nằm ngay trong repo này: chính template in cảnh báo
*"chưa khai lệnh verify/test — gate đang rỗng"* ở **mọi phiên**. Người viết harness còn để
rỗng thì người áp harness cũng vậy.

`setup.mjs` đọc `package.json` / `pyproject.toml` / `go.mod` / `Cargo.toml` + lockfile, đề
xuất từng lệnh **kèm bằng chứng** (`← package.json → scripts.build`), hỏi những gì không
đọc được, rồi ghi `harness.config.json` + `docs/adr/0001-<id>-stack-va-quy-trinh.md`.

Bốn luật của nó, viết trong file:

1. **Mỗi câu hỏi ghi vào một field MÁY đọc, hoặc không hỏi.** Phần không biểu diễn được
   thành config (sản phẩm cho ai, gu thiết kế, deploy đi đâu) vào ADR 0001 — và thứ được
   kiểm là *có ADR hay không*, không phải nội dung.
2. **Không bao giờ bịa một lệnh.** Không đọc được thì để rỗng và nói ra. Đoán sai không tạo
   ra một gate sai — nó tạo ra MỘT GATE ÍT HƠN, vì cách sửa nhanh nhất mà người đang gấp
   tìm ra là xoá tên gate khỏi `gates`. (Ví dụ đã xử lý: script `test` mặc định của
   `npm init` chỉ để `exit 1` — nhận nó là nhận một gate đỏ vô nghĩa.)
3. **Không cài gì.** Chọn stack là quyết định kiến trúc: agent ĐỀ XUẤT, người PROMOTE.
4. **`--apply` TỪ CHỐI kết thúc khi `commands.verify` rỗng** (exit 2, không ghi gì).
   Cửa thoát `--allow-empty-verify` có, và nó **nằm lại trong manifest** để `harness-doctor`
   báo CHẶN — một ngoại lệ không có dấu vết là một ngoại lệ vĩnh viễn.

Đo trên 4 repo giả: Next+pnpm+prisma · Python(uv/ruff/mypy/pytest) · npm trống · Vite.
Repo Next đi từ 0 gate → **10 gate chạy thật**, một lệnh.

### Ba lỗi lộ ra khi thử đường đi thật — cả ba đều im lặng

- **`apply-to --update` XOÁ `profile` khỏi manifest.** Manifest là hồ sơ TÍCH LUỸ, nhưng cả
  `apply-to` và `upgrade` ghi đè cả object. Triệu chứng: doctor báo *"chưa chạy setup"* cho
  project vừa chạy setup — một lời buộc tội sai, đúng loại làm người ta ngừng tin bảng chẩn
  đoán. Nay hợp nhất, không thay thế.
- **`upgrade.mjs → MECHANISM` thiếu `tooling/gates.mjs`.** Runner gate — file mà cả ba stage
  và CI đều gọi — **chưa bao giờ được cập nhật qua đường nâng cấp**. Project chạy bản 2.0.0
  của nó trong khi manifest ghi 2.4.1, và không gì báo. Hai danh sách cho một khái niệm
  ("lớp cơ chế") lệch đúng như mọi lần: `--audit` chỉ soi một trong hai. Nay **một hằng số**
  `MECHANISM_PATHS` cho cả hai nơi.
- **Project áp MỚI nhận cửa thoát CI.** `HARNESS_ALLOW_SKIPPED_GATES` chỉ đúng ở repo
  template; migration `004` gỡ nó, nhưng migration chỉ chạy ở đường `upgrade`. Nên mọi
  project áp mới nhận cửa thoát **và** một dòng CHẶN của doctor ngay phút đầu — công cụ tự
  tạo lỗi rồi tự báo lỗi đó. `apply-to` nay gỡ lúc copy, dùng chung regex `CI_ESCAPE_HATCH`.

### Làm đúng "việc số 1" từng làm ĐỎ chính test suite của harness

`test-hooks.mjs` khẳng định `db/migrations/0001_init.sql` bị chặn — đúng với `paths.migrations`
MẶC ĐỊNH của template (`**/migrations/**`). `setup.mjs` thu hẹp nó về thư mục migration CÓ
THẬT (`prisma/migrations/**`), sau đó đường dẫn kia không khớp, hook không chặn, và suite
đỏ ở **mọi project cấu hình đúng**. Tương tự, thông điệp của `block-generated-edit` đổi khi
`commands.gen` được khai.

Lần thứ tư của lớp lỗi `knowledge/lessons/0003` (self-test giả định repo của chính nó). Cơ
chế sửa đã có sẵn từ trước — `HARNESS_CONFIG` — chỉ là các case này chưa được nối vào nó.
Nay chúng chạy trên `tooling/fixtures/config-guard-paths.json`. Đã kiểm: suite xanh ở CẢ
repo template LẪN project đã cấu hình đầy đủ.

### Đường đi đầy đủ, đo được

`apply-to` → `setup --apply` → `init` trên một repo Vite trống: **0 dòng CHẶN** ở
`harness-doctor`. Trước 2.6.0 cùng đường đi đó cho 3 dòng CHẶN + 8 dòng nhắc.

---

## 2.5.0 — 2026-08-05

**minor.** Migration `006` bắt buộc. Áp template lên project THẬT có ba lỗ, và cả ba đều
im lặng ở đúng nhóm project mà harness nhắm tới.

### `.gitignore` dùng SAI PHÉP TOÁN — cơ chế chỉ chạy ở ca không cần nó

`.gitignore` và `.gitattributes` nằm trong `SEED`, và `SEED` **không bao giờ ghi đè file
đã tồn tại**. Mọi project thật đều đã có `.gitignore` ⇒ các dòng của harness **chưa từng
tới**. Chỉ thư mục trống nhận được chúng.

Hậu quả không phải lý thuyết: project commit `.claude/settings.local.json` (van xả áp CÁ
NHÂN thành cấu hình của cả đội) và `.claude/telemetry/` (log máy-cục-bộ vào lịch sử chung,
conflict ở mọi PR). Và `* text=auto eol=lf` — **điều số 8 trong "mười hai điều"** của README
— cũng không tới, nên lớp conflict GIẢ mà nó xoá được vẫn còn nguyên. **Không check nào
phát hiện**: không có một dòng nào về `.gitignore` trong `harness-doctor` trước bản này.

Nay có **phép thứ ba**: `MERGE` — thêm dòng THIẾU, không copy, không bỏ qua. Danh sách tối
thiểu ở `REQUIRED_IGNORE` / `REQUIRED_ATTRIBUTES` (`tooling/lib/harness.mjs`), một nguồn cho
cả hai tầng dùng: `apply-to` thêm, `harness-doctor` kiểm.

### Ca phổ biến nhất lại là ca hỏng nặng nhất: `.claude/` đã bị ignore từ trước

Rất nhiều repo có `.claude/` trong `.gitignore` **trước khi** áp harness — đó là lời khuyên
phổ biến cho cấu hình agent cá nhân. Áp harness vào đó mà không sửa nghĩa là
`.claude/hooks/` và `.claude/settings.json` **không bao giờ được commit**: cả đội tưởng
mình có harness, còn thật ra chỉ MỘT người có — người đã chạy `apply-to`.

Đo bằng `git check-ignore` (2026-08-05): sau một dòng loại cả thư mục, **mọi phủ định cho
FILE bên trong đều vô tác dụng** — git không re-include file có thư mục cha bị loại. Nên
`!.claude/settings.json` trông như đã sửa và **không sửa gì cả**; dòng đúng là `!.claude/`.
`apply-to` chỉ thêm nó khi ĐO THẤY có file bị chôn, và nó **nói ra** — nó đảo một quyết
định tường minh của project nên nó phải có bằng chứng.

`harness-doctor` giờ kiểm **cả hai chiều** bằng chính `git check-ignore`, không so chuỗi:
đường dẫn cá nhân có bị ignore không, và file harness của team có bị ignore không. So chuỗi
trả lời *"file ignore có chứa dòng X"*; câu hỏi thật là *"git có ignore đường dẫn này"* —
và hai câu đó khác nhau đúng ở ca làm người ta mất cả buổi.

### ADR của lớp harness chiếm số 0001/0002 của SẢN PHẨM

`docs/adr/0001-harness-baseline.md` + `0002-tai-phan-vai-native.md` hạ cánh thẳng vào
`docs/adr/` của project, nên ADR **đầu tiên** của đội buộc phải là `0003` — quyết định đầu
tiên của sản phẩm được đánh số như thể nó là quyết định thứ ba. Nay chúng ở
`docs/adr/harness/`. Migration chỉ dời file có ĐÚNG tên template đã ship; ADR do đội tự
viết không bị đụng (fixture có một `0003` của sản phẩm để chứng minh).

### `ctx.moveFile` — "đổi cấu trúc thư mục" trước đây chỉ tồn tại trên giấy

`harness-migrations/README.md` liệt kê *"đổi cấu trúc thư mục"* là việc BẮT BUỘC có
migration, nhưng `ctx` không có cách nào **di chuyển** một file: migration phải tự `import`
node:fs (không migration nào làm) hoặc gọi `git mv` (fail ở test vì thư mục fixture không
phải git repo). Thêm `moveFile` vào **cả** `upgrade.mjs` và `test-migrations.mjs` — hai
`ctx` lệch nhau thì suite đo sai thứ, và comment trong `test-migrations` đã nói vậy.

### Dọn hai dấu vết của 2.3.0

- `verify-ui` khoá **điều kiện thoát** vào một field tên `visual` — field mà
  `harness.config.json` nói thẳng là KHÔNG được thêm. Một điều kiện thoát trỏ vào thứ không
  bao giờ tồn tại là điều kiện thoát không bao giờ đến. Nay khoá vào `e2e`, nơi runner ảnh
  thật sự sống.
- `verify-ui` là skill **mồ côi** (không nơi nào trỏ tới). Nay `/ship-feature` bước 5,
  `docs/DESIGN.md`, và README trỏ tới nó — sửa bằng cách nối vào vòng lặp, không phải xoá.

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
