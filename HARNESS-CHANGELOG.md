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
